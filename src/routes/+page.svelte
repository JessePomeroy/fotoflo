<script lang="ts">
  /**
   * ╔══════════════════════════════════════════════════════════════════════════╗
   * ║                                                                    ║
   * ║   FotoFlo Main Page                                                  ║
   * ║   Single-page application entry point                            ║
   * ║                                                                    ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   * 
   * ════════════════════════════════════════════════════════════════════════
   * ARCHITECTURE
   * ════════════════════════════════════════════════════════════════════════
   * 
   * This page coordinates all UI components and handles:
   * - The sidebar (filters, collections, utilities)
   * - The photo grid (main display with thumbnails)
   * - The toolbar (actions for selected photos)
   * - The viewer (single photo detail view)
   * - Import modals (file picker, folder picker)
   * - Metadata modal (bulk editing)
   * 
   * STATE SEPARATION:
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │  UI STATE (this file)          │  DATA STATE (fotoflo store)       │
   * │  - Modals open/closed         │  - Photos                        │
   * │  - Selected photo              │  - Collections                    │
   * │  - Loading states              │  - Filters                       │
   * │  - Mobile UI state             │  - Selected IDs                   │
   * └─────────────────────────────────────────────────────────────────────┘
   * 
   * WHY SEPARATE?
   * - UI state changes frequently (open/close modals)
   * - Data state is persisted (LocalStorage/IndexedDB)
   * - Different update patterns (UI = local, Data = shared)
   * 
   * COMPONENT COMMUNICATION:
   * - Parent (this file) → Child: Props and callbacks
   * - Child → Parent: Events and callback props
   * - Sibling components: Through the shared store
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import PhotoGrid from '$lib/components/PhotoGrid.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Viewer from '$lib/components/Viewer.svelte';
  import { fotoflo } from '$lib/stores/fotoflo.svelte';
  import type { Photo } from '$lib/types';
  import { readEXIF } from '$lib/utils/exif';
  import { importFromFiles as importFilesApi, importFromFolder as importFolderApi, getExistingFileKeys } from '$lib/import';

  let NeoDialog: any = $state(null);

  onMount(async () => {
    if (browser) {
      const mod = await import('@dvcol/neo-svelte');
      NeoDialog = mod.NeoDialog;
      ui.mounted = true;
    }
  });

  // UI state - grouped for organization
  let ui = $state({
    mounted: false,
    showCollectionModal: false,
    showBulkMetaModal: false,
    showImportModal: false,
    showExportModal: false,
    viewerPhoto: null as Photo | null,
    mobileFilter: 'all' as 'all' | 'favorites' | string,
    importing: false
  });

  // Bulk metadata state
  let bulk = $state({
    filmStock: '',
    camera: '',
    subject: '',
    metaIds: [] as string[]
  });

  // Local reactive state that updates from store
  let photos = $state<Photo[]>([]);
  let photoCount = $state(0);
  let selectedIds = $state<Set<string>>(new Set());
  let thumbnailUrls = $state<Record<string, string>>({});
  let sidebarRefresh = $state(0);

  onMount(async () => {
    ui.mounted = true;
    // Initial load
    await updateFromStore();
    // Load thumbnails for existing photos
    await loadAllThumbnails();
  });

  async function loadAllThumbnails() {
    // Progressive loading - show first 12 immediately, load rest in background
    const BATCH_SIZE = 12;
    
    // Load first batch synchronously for quick display
    const urls: Record<string, string> = {};
    const remaining: string[] = [];
    
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const url = await fotoflo.getThumbnail(photo.id);
      if (url) {
        urls[photo.id] = url;
      } else if (i >= BATCH_SIZE) {
        remaining.push(photo.id);
      }
    }
    
    thumbnailUrls = urls;
    
    // Load remaining thumbnails in background
    if (remaining.length > 0) {
      Promise.all(remaining.map(async (id) => {
        const url = await fotoflo.getThumbnail(id);
        if (url) {
          thumbnailUrls[id] = url;
        }
      }));
    }
  }

  async function updateFromStore() {
    if (!ui.mounted) return;
    photos = [...fotoflo.filteredPhotos];
    photoCount = fotoflo.photoCount;
    selectedIds = new Set(fotoflo.state.selectedIds);
  }

  /**
   * Import photos from a folder using the File System Access API
   * 
   * This is the main entry point for getting photos into the app.
   * The File System Access API (browser-native) lets users:
   * 1. Pick a folder (showDirectoryPicker)
   * 2. Read files without uploading to a server
   * 3. Get persistent handles for re-accessing files later
   * 
   * Note: We store file handles in IndexedDB so we can re-export
   * with original quality. Handles are re-validated on each use.
   */
  /**
   * Try folder import - separate function for the modal button
   */
  async function tryFolderImport() {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      await importFromFolder(dirHandle);
    } catch (e) {
      console.log('Folder import cancelled');
    }
  }

  /**
   * Main import function - called from modal choice
   */
  async function importPhotos() {
    if (!browser) return;
    
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    
    let filesHandled = false;
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      
      filesHandled = true;
      await processFiles(files);
    };
    
    input.onblur = async () => {
      // Give user time to select files, then try folder if nothing selected
      setTimeout(async () => {
        if (!filesHandled) {
          try {
            const dirHandle = await (window as any).showDirectoryPicker();
            await importFromFolder(dirHandle);
          } catch (e) {
            console.log('Import cancelled');
          }
        }
      }, 500);
    };
    
    input.click();
  }

  async function processFiles(files: FileList) {
    ui.importing = true;
    try {
      const existingKeys = getExistingFileKeys(fotoflo.state.photos);
      const newPhotos = await importFilesApi(files, existingKeys);
      
      if (newPhotos.length > 0) {
        fotoflo.importPhotos(newPhotos);
        await Promise.all(newPhotos.map(p => fotoflo.generateThumbnail(p.id, p.file)));
        await updateFromStore();
        await loadAllThumbnails();
        
        if (newPhotos.length >= 5) {
          bulk.metaIds = newPhotos.map(p => p.id);
          ui.showBulkMetaModal = true;
        }
      }
    } finally {
      ui.importing = false;
    }
  }

  async function importFromFolder(dirHandle: any) {
    ui.importing = true;
    try {
      const existingKeys = getExistingFileKeys(fotoflo.state.photos);
      const { photos, skipped } = await importFolderApi(dirHandle, existingKeys);
      
      if (photos.length > 0) {
        fotoflo.importPhotos(photos);
        await Promise.all(photos.map(p => fotoflo.generateThumbnail(p.id, p.file)));
        await updateFromStore();
        await loadAllThumbnails();
        
        if (photos.length >= 5) {
          bulk.metaIds = photos.map(p => p.id);
          ui.showBulkMetaModal = true;
        }
      }
      
      if (skipped > 0) {
        alert(`imported ${photos.length} photos (skipped ${skipped} duplicates)`);
      }
    } finally {
      ui.importing = false;
    }
  }

  /**
   * Import individual files using standard file input
   * Works on mobile and desktop browsers
   */
  async function importFiles() {
    if (!browser) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      
      ui.importing = true;
      const existingKeys = getExistingFileKeys(fotoflo.state.photos);
      const newPhotos = await importFilesApi(files, existingKeys);
      
      if (newPhotos.length > 0) {
        fotoflo.importPhotos(newPhotos);
        await Promise.all(newPhotos.map(p => fotoflo.generateThumbnail(p.id, p.file)));
        await updateFromStore();
        await loadAllThumbnails();
        
        if (newPhotos.length >= 5) {
          bulk.metaIds = newPhotos.map(p => p.id);
          ui.showBulkMetaModal = true;
        }
      }
      ui.importing = false;
    };
    
    input.click();
  }

  function openViewer(photo: Photo) {
    ui.viewerPhoto = photo;
  }

  function closeViewer() {
    ui.viewerPhoto = null;
  }

  function applyBulkMetadata() {
    fotoflo.applyBulkMetadata(bulk.metaIds, {
      filmStock: bulk.filmStock || undefined,
      camera: bulk.camera || undefined,
      subject: bulk.subject || undefined
    });
    bulk.filmStock = '';
    bulk.camera = '';
    bulk.subject = '';
    bulk.metaIds = [];
    ui.showBulkMetaModal = false;
    updateFromStore();
    sidebarRefresh++; // Force sidebar to refresh
  }

  function toggleBulkMetaModal() {
    ui.showBulkMetaModal = !ui.showBulkMetaModal;
    if (ui.showBulkMetaModal) {
      // Use current selection if no bulk.metaIds set (i.e., opened from toolbar)
      if (bulk.metaIds.length === 0) {
        bulk.metaIds = Array.from(selectedIds);
      }
    } else {
      bulk.filmStock = '';
      bulk.camera = '';
      bulk.subject = '';
      bulk.metaIds = [];
    }
  }

  function selectAll() {
    fotoflo.selectAll();
    updateFromStore();
  }

  function clearSelection() {
    fotoflo.clearSelection();
    updateFromStore();
  }

  function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} photos?`)) return;
    fotoflo.deletePhotos(Array.from(selectedIds));
    updateFromStore();
  }

  /**
   * Export selected photos with metadata-based filenames
   * 
   * Uses the File System Access API to:
   * 1. Let user pick destination folder
   * 2. Try to get original full-res file (requests permission)
   * 3. Fall back to thumbnail if original unavailable
   * 4. Write with new filename based on metadata
   * 
   * Filename format: {filmStock}-{camera}-{subject}-{frame}.{ext}
   * Example: portra400-leicam6-rollercoaster-001.jpg
   */
  async function exportSelected(withMetadata = false) {
    const selected = photos.filter(p => selectedIds.has(p.id));
    
    try {
      // Ask user to pick destination folder
      const destHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      
      let exported = 0;
      let failed = 0;
      let usedFullRes = 0;
      
      for (const p of selected) {
        // Build new filename from metadata
        const filmStock = (p.filmStock || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '');
        const camera = (p.camera || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '');
        const subject = (p.subject || p.fileName.replace(/\.[^/.]+$/, '')).replace(/[^a-zA-Z0-9-_]/g, '');
        const frame = p.frameNumber || String(exported + 1).padStart(3, '0');
        const ext = p.fileName.split('.').pop() || 'jpg';
        const newName = `${filmStock}-${camera}-${subject}-${frame}.${ext}`;
        
        try {
          // Try to get the original full-res file first
          const originalFile = await fotoflo.getOriginalFile(p.id);
          
          if (originalFile) {
            // Use full-res original
            const fileHandle = await destHandle.getFileHandle(newName, { create: true });
            const writable = await fileHandle.createWritable();
            
            if (withMetadata) {
              // Write metadata into the file
              const exportedFile = await fotoflo.exportPhoto(p.id);
              if (exportedFile) {
                await writable.write(exportedFile);
              } else {
                await writable.write(originalFile);
              }
            } else {
              await writable.write(originalFile);
            }
            
            await writable.close();
            exported++;
            usedFullRes++;
          } else {
            // Fall back to thumbnail
            const thumbUrl = await fotoflo.getThumbnail(p.id);
            if (thumbUrl) {
              const response = await fetch(thumbUrl);
              const blob = await response.blob();
              const fileHandle = await destHandle.getFileHandle(newName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              exported++;
            } else {
              failed++;
            }
          }
        } catch (e) {
          console.error(`Failed to export ${p.fileName}:`, e);
          failed++;
        }
      }
      
      let msg = `exported ${exported} photos`;
      if (usedFullRes > 0) msg += ` (${usedFullRes} full-res)`;
      if (failed > 0) msg += ` (${failed} failed)`;
      alert(msg);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Export failed:', e);
        alert('export failed - make sure you grant folder access');
      }
    }
  }

  async function relinkOriginals() {
    if (!browser) return;
    
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      const result = await fotoflo.relinkOriginals(dirHandle);
      alert(`relinked ${result.linked} photos (${result.notFound} not found in folder)`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Relink failed:', e);
      }
    }
  }

  function handleBackup() {
    const json = fotoflo.exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fotoflo-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRestore() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        
        const text = await file.text();
        const result = fotoflo.importBackup(text);
        
        if (result.success) {
          alert(`Restored metadata for ${result.matched} photos`);
          updateFromStore();
          sidebarRefresh++;
        } else {
          alert(`Restore failed: ${result.error}`);
        }
      };
      input.click();
    } catch (e) {
      alert('Failed to read backup file');
    }
  }
</script>

<svelte:head>
  <title>fotoflo</title>
</svelte:head>

<div class="app">
  <header class="glass">
    <div class="logo">
      <h1>fotoflo</h1>
      <span class="count">{photos.length} / {photoCount}</span>
    </div>

    <div class="center">
      <input 
        type="text" 
        placeholder="search photos..." 
        oninput={(e) => { fotoflo.setSearch(e.currentTarget.value); updateFromStore(); }}
      />
      <select onchange={(e) => { fotoflo.setSortBy(e.currentTarget.value as 'date' | 'rating' | 'name'); updateFromStore(); }}>
        <option value="date">sort by date</option>
        <option value="rating">sort by rating</option>
        <option value="name">sort by name</option>
      </select>
    </div>

    <div class="mobile-filters">
      <select bind:value={ui.mobileFilter} onchange={(e) => {
        const v = e.currentTarget.value;
        if (v === 'favorites') {
          fotoflo.setView('favorites');
        } else if (v === 'all') {
          fotoflo.setView('all');
          fotoflo.setFilterFilmStock(null);
          fotoflo.setFilterRating(null);
          fotoflo.setFilterSubject(null);
        } else if (v.startsWith('film:')) {
          fotoflo.setView('all');
          fotoflo.setFilterFilmStock(v.replace('film:', ''));
          fotoflo.setFilterRating(null);
          fotoflo.setFilterSubject(null);
        } else if (v.startsWith('subject:')) {
          fotoflo.setView('all');
          fotoflo.setFilterSubject(v.replace('subject:', ''));
          fotoflo.setFilterFilmStock(null);
          fotoflo.setFilterRating(null);
        } else if (v.startsWith('camera:')) {
          fotoflo.setView('all');
          fotoflo.setFilterCamera(v.replace('camera:', ''));
          fotoflo.setFilterFilmStock(null);
          fotoflo.setFilterSubject(null);
          fotoflo.setFilterRating(null);
        } else if (v.startsWith('rating:')) {
          fotoflo.setView('all');
          fotoflo.setFilterRating(parseInt(v.replace('rating:', '')));
          fotoflo.setFilterFilmStock(null);
          fotoflo.setFilterSubject(null);
        }
        updateFromStore();
      }}>
        <option value="all">all photos</option>
        <option value="favorites">♥ favorites</option>
        <optgroup label="film stock">
          {#each fotoflo.filmStocks as stock}
            <option value="film:{stock}">{stock}</option>
          {/each}
        </optgroup>
        <optgroup label="subject">
          {#each fotoflo.subjects as subj}
            <option value="subject:{subj}">{subj}</option>
          {/each}
        </optgroup>
        <optgroup label="camera">
          {#each fotoflo.cameras as cam}
            <option value="camera:{cam}">{cam}</option>
          {/each}
        </optgroup>
        <optgroup label="rating">
          <option value="rating:5">★★★★★</option>
          <option value="rating:4">★★★★☆</option>
          <option value="rating:3">★★★☆☆</option>
          <option value="rating:2">★★☆☆☆</option>
          <option value="rating:1">★☆☆☆☆</option>
        </optgroup>
      </select>
    </div>

    <div class="header-actions">
      {#if photos.length > 0}
        {#if selectedIds.size > 0}
          <button class="btn" onclick={clearSelection}>deselect all</button>
        {:else}
          <button class="btn" onclick={selectAll}>select all</button>
        {/if}
      {/if}
      <button class="btn primary" onclick={() => ui.showImportModal = true}>import</button>
    </div>
  </header>

  <main>
    <Sidebar onRelinkOriginals={relinkOriginals} onFilterChange={updateFromStore} refreshTrigger={sidebarRefresh} onBackup={handleBackup} onRestore={handleRestore} />

    <div class="content">
      <PhotoGrid
        photos={photos}
        selectedIds={selectedIds}
        thumbnailUrls={thumbnailUrls}
        ondetail={openViewer}
        onselect={(photo) => { fotoflo.toggleSelection(photo.id); updateFromStore(); }}
        onchange={updateFromStore}
      />
    </div>
  </main>

  {#if selectedIds.size > 0}
    <Toolbar
      selectedCount={selectedIds.size}
      onOpenBulkMeta={toggleBulkMetaModal}
      onDelete={deleteSelected}
      onExport={() => ui.showExportModal = true}
      onClear={clearSelection}
    />
  {/if}

  {#if ui.mounted && NeoDialog && ui.showImportModal}
    <NeoDialog open={ui.showImportModal} onclose={() => ui.showImportModal = false} blur={40} elevation={20} style="border-radius: 24px; border: none;">
      <div class="modal-content">
        <h2>import photos</h2>
        <div class="import-choices">
          <button class="import-choice" onclick={() => { ui.showImportModal = false; importFiles(); }}>
            <span class="icon">📁</span>
            <span>select files</span>
          </button>
          <button class="import-choice" onclick={() => { ui.showImportModal = false; tryFolderImport(); }}>
            <span class="icon">📂</span>
            <span>select folder</span>
          </button>
        </div>
        <div class="actions">
          <button onclick={() => ui.showImportModal = false}>cancel</button>
        </div>
      </div>
    </NeoDialog>
  {/if}

  {#if ui.mounted && NeoDialog && ui.importing}
    <NeoDialog open={ui.importing} blur={40} elevation={20} style="border-radius: 24px; border: none;">
      <div class="modal-content loading-modal">
        <div class="spinner"></div>
        <p>importing photos...</p>
      </div>
    </NeoDialog>
  {/if}

  {#if ui.mounted && NeoDialog && ui.showExportModal}
    <NeoDialog open={ui.showExportModal} onclose={() => ui.showExportModal = false} blur={40} elevation={20} style="border-radius: 24px; border: none;">
      <div class="modal-content">
        <h2>export {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''}</h2>
        <div class="export-choices">
          <button class="export-choice" onclick={() => { ui.showExportModal = false; exportSelected(false); }}>
            <span class="icon">📄</span>
            <span>export normally</span>
          </button>
          <button class="export-choice" onclick={() => { ui.showExportModal = false; exportSelected(true); }}>
            <span class="icon">🏷️</span>
            <span>export with metadata</span>
          </button>
        </div>
        <div class="actions">
          <button onclick={() => ui.showExportModal = false}>cancel</button>
        </div>
      </div>
    </NeoDialog>
  {/if}

  {#if ui.mounted && NeoDialog && ui.showBulkMetaModal}
    <NeoDialog open={ui.showBulkMetaModal} onclose={() => ui.showBulkMetaModal = false} blur={40} elevation={20} style="border-radius: 16px; border: none;">
      <div class="modal-content compact" onkeydown={(e) => e.key === 'Enter' && applyBulkMetadata()}>
        <h2>add metadata to {bulk.metaIds.length} photos</h2>

        <div class="field">
          <label>film stock</label>
          <input
            type="text"
            placeholder="e.g. Portra 400"
            bind:value={bulk.filmStock}
          />
        </div>

        <div class="field">
          <label>camera</label>
          <input
            type="text"
            placeholder="e.g. Leica M6"
            bind:value={bulk.camera}
          />
        </div>

        <div class="field">
          <label>subject (optional)</label>
          <input
            type="text"
            placeholder="e.g. Rollercoaster"
            bind:value={bulk.subject}
          />
        </div>

        <div class="actions">
          <button onclick={() => ui.showBulkMetaModal = false}>skip</button>
          <button class="primary" onclick={applyBulkMetadata}>apply</button>
        </div>
      </div>
    </NeoDialog>
  {/if}

  <Viewer photo={ui.viewerPhoto} onclose={closeViewer} onNavigate={(photo) => ui.viewerPhoto = photo} />
</div>

<style>
  :global(*) {
    text-transform: lowercase;
  }

  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(180deg, #DCE7EE 0%, #F2F5F7 100%);
    color: #2E3338;
    overflow: hidden;
    min-height: 100vh;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: transparent;
  }

  .glass {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 8px 32px rgba(31, 38, 135, 0.1);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
  }

  .logo {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }

  .logo h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #2E3338;
    letter-spacing: -0.02em;
  }

  .count {
    font-size: 0.875rem;
    color: #5D7B8C;
    font-weight: 500;
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .center {
    display: flex;
    gap: 12px;
    flex: 1;
    max-width: 500px;
    margin: 0 32px;
  }

  .mobile-filters {
    display: none;
  }

  .mobile-filters select {
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid rgba(93, 123, 140, 0.2);
    background: rgba(255, 255, 255, 0.6);
    color: #2E3338;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .center input {
    flex: 1;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid rgba(93, 123, 140, 0.2);
    background: rgba(255, 255, 255, 0.6);
    color: #2E3338;
    font-size: 0.9rem;
  }

  .center input:focus {
    outline: none;
    border-color: #5D7B8C;
    box-shadow: 0 0 0 3px rgba(93, 123, 140, 0.15);
  }

  .center select {
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid rgba(93, 123, 140, 0.2);
    background: rgba(255, 255, 255, 0.6);
    color: #2E3338;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn.primary {
    background: linear-gradient(135deg, #5D7B8C 0%, #4A6572 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(93, 123, 140, 0.3);
  }

  .btn.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(93, 123, 140, 0.4);
  }

  main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  main :global(aside) {
    display: block;
  }

  @media (max-width: 768px) {
    main {
      flex-direction: column;
    }

    main :global(aside) {
      display: none;
    }
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
  }

  .modal-content {
    background: transparent;
    padding: 0;
    min-width: 340px;
    max-width: 90vw;
  }

  .modal-content.compact {
    min-width: 280px;
  }

  .modal-content.compact h2 {
    font-size: 0.95rem;
    margin-bottom: 12px;
  }

  .modal-content.compact .field {
    margin-bottom: 4px;
  }

  .modal-content.compact .field label {
    font-size: 0.6rem;
    margin-bottom: 1px;
  }

  .modal-content.compact .field input {
    padding: 6px 8px;
    font-size: 0.8rem;
    margin-bottom: 0;
  }

  .modal-content.compact .actions {
    margin-top: 8px;
    gap: 8px;
  }

  .modal-content.compact .actions button {
    padding: 6px 12px;
    font-size: 0.8rem;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-radius: 24px;
    padding: 24px 28px;
    min-width: 340px;
    max-width: 90vw;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .modal.compact {
    padding: 12px 16px;
  }

  .modal.compact h2 {
    font-size: 0.95rem;
    margin-bottom: 8px;
  }

  .modal.compact .field {
    margin-bottom: 4px;
  }

  .modal.compact .field label {
    font-size: 0.6rem;
    margin-bottom: 1px;
  }

  .modal.compact .field input {
    padding: 6px 8px;
    font-size: 0.8rem;
    margin-bottom: 0;
  }

  .modal.compact .actions {
    margin-top: 8px;
    gap: 8px;
  }

  .modal.compact .actions button {
    padding: 6px 12px;
    font-size: 0.8rem;
  }

  .modal h2 {
    font-size: 1.2rem;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 20px;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }

  .import-choices {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
  }

  .import-choice {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 24px;
    background: rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .import-choice:hover {
    background: rgba(255, 255, 255, 0.5);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }

  .import-choice .icon {
    font-size: 1.8rem;
  }

  .import-choice span:last-child {
    font-size: 1.1rem;
    font-weight: 500;
    color: #1a1a1a;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }

  .export-choices {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
  }

  .export-choice {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .export-choice:hover {
    background: rgba(255, 255, 255, 0.5);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }

  .export-choice .icon {
    font-size: 1.8rem;
  }

  .export-choice span:last-child {
    font-size: 1.1rem;
    font-weight: 500;
    color: #1a1a1a;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }

  .modal input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.5);
    color: #1a1a1a;
    font-size: 0.9rem;
    margin-bottom: 10px;
    transition: all 0.2s ease;
  }

  .modal input::placeholder {
    color: #444;
  }

  .modal input:focus {
    outline: none;
    border-color: #5D7B8C;
    box-shadow: 0 0 0 3px rgba(93, 123, 140, 0.2);
    background: rgba(255, 255, 255, 0.8);
  }

  .field {
    margin-bottom: 8px;
  }

  .field:last-of-type {
    margin-bottom: 0;
  }

  .field label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #333;
    margin-bottom: 4px;
    font-weight: 600;
  }

  .field input {
    margin-bottom: 0;
  }

  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .actions button {
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.4);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: #1a1a1a;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .actions button:hover {
    background: rgba(255, 255, 255, 0.6);
    transform: translateY(-1px);
  }

  .actions button.primary {
    background: rgba(93, 123, 140, 0.3);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .actions button.primary:hover {
    background: rgba(93, 123, 140, 0.5);
  }

  @media (max-width: 768px) {
    header {
      flex-direction: column;
      gap: 16px;
      padding: 16px;
    }

    .center {
      margin: 0;
      width: 100%;
    }

    .header-actions {
      width: 100%;
      justify-content: center;
    }

    .logo h1 {
      font-size: 1.25rem;
    }

    .mobile-filters {
      display: block;
      width: 100%;
    }

    .mobile-filters select {
      width: 100%;
    }

    .content {
      padding: 16px;
    }

    .modal {
      padding: 20px;
      min-width: 280px;
      max-width: 95vw;
    }

    .modal.compact {
      padding: 16px;
    }
  }

  @media (max-width: 480px) {
    header {
      padding: 12px;
    }

    .logo {
      flex-direction: column;
      gap: 4px;
      align-items: center;
    }

    .center {
      flex-direction: column;
    }

    .center input,
    .center select {
      width: 100%;
    }

    .content {
      padding: 12px;
    }

    /* Touch-friendly tap targets */
    button, 
    .btn,
    .actions button,
    .toolbar button,
    .toolbar select,
    .star-btn,
    .checkbox,
    .favorite-btn,
    .film-stock-btn {
      min-height: 44px;
      min-width: 44px;
    }

    input, select {
      min-height: 44px;
    }
  }

  .modal-content.loading-modal {
    text-align: center;
    padding: 2rem 3rem;
  }

  .modal-content.loading-modal p {
    margin-top: 1rem;
    color: #666;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e0e0e0;
    border-top-color: #2E7D32;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
