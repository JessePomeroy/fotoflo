<script lang="ts">
  /**
   * FotoFlo Main Page
   * 
   * This is the single-page application entry point. It coordinates:
   * - The sidebar (filters and utilities)
   * - The photo grid (main display)
   * - The toolbar (actions for selected photos)
   * - The viewer (single photo detail view)
   * - The store (all application data)
   * 
   * Key design patterns:
   * - UI state (modals, selections) lives here in $state
   * - Data state lives in the fotoflo store (shared)
   * - Components communicate via callbacks (onXxx props)
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import PhotoGrid from '$lib/components/PhotoGrid.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Viewer from '$lib/components/Viewer.svelte';
  import { fotoflo } from '$lib/stores/fotoflo.svelte';
  import type { Photo } from '$lib/stores/fotoflo.svelte';
  import { readEXIF } from '$lib/utils/exif';

  // UI state only
  let mounted = $state(false);
  let showCollectionModal = $state(false);
  let showBulkMetaModal = $state(false);
  let showImportModal = $state(false);
  let viewerPhoto = $state<Photo | null>(null);
  let mobileFilter = $state('all'); // 'all', 'favorites', or filtered view

  // Bulk metadata state
  let bulkFilmStock = $state('');
  let bulkCamera = $state('');
  let bulkSubject = $state('');
  let bulkMetaIds = $state<string[]>([]);

  // Local reactive state that updates from store
  let photos = $state<Photo[]>([]);
  let photoCount = $state(0);
  let selectedIds = $state<Set<string>>(new Set());
  let thumbnailUrls = $state<Record<string, string>>({});
  let sidebarRefresh = $state(0);

  onMount(async () => {
    mounted = true;
    // Initial load
    await updateFromStore();
    // Load thumbnails for existing photos
    await loadAllThumbnails();
  });

  async function loadAllThumbnails() {
    const urls: Record<string, string> = {};
    for (const photo of photos) {
      const url = await fotoflo.getThumbnail(photo.id);
      if (url) {
        urls[photo.id] = url;
      }
    }
    thumbnailUrls = urls;
  }

  async function updateFromStore() {
    if (!mounted) return;
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
    const newPhotos: { id: string; fileName: string; filePath: string; dateTaken: string; fileSize: number; file: File; iso?: number; aperture?: number; shutterSpeed?: string; lens?: string; flash?: boolean; whiteBalance?: string; }[] = [];
    const existingFiles = new Set(
      fotoflo.state.photos.map(p => `${p.fileName.toLowerCase()}-${p.fileSize || 0}`)
    );
    
    for (const file of Array.from(files)) {
      if (!file.type.match(/^image\/(jpeg|png|gif|webp|tiff?)$/i)) continue;
      
      const key = `${file.name.toLowerCase()}-${file.size}`;
      if (existingFiles.has(key)) continue;
      
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      let dateTaken = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();
      
      // Read EXIF data
      let iso: number | undefined;
      let aperture: number | undefined;
      let shutterSpeed: string | undefined;
      let lens: string | undefined;
      let flash: boolean | undefined;
      let whiteBalance: string | undefined;
      
      try {
        const exif = await readEXIF(file);
        if (exif?.dateTaken) dateTaken = exif.dateTaken;
        if (exif?.camera) fotoflo.setCamera(exif.camera);
        iso = exif?.iso;
        aperture = exif?.aperture;
        shutterSpeed = exif?.shutterSpeed;
        lens = exif?.lens;
        flash = exif?.flash;
        whiteBalance = exif?.whiteBalance;
      } catch (e) {
        console.warn('EXIF read failed:', e);
      }
      
      newPhotos.push({
        id,
        fileName: file.name,
        filePath: file.name,
        fileSize: file.size,
        dateTaken,
        file,
        iso,
        aperture,
        shutterSpeed,
        lens,
        flash,
        whiteBalance
      });
      existingFiles.add(key);
    }
    
    if (newPhotos.length > 0) {
      fotoflo.importPhotos(newPhotos);
      for (const photo of newPhotos) {
        await fotoflo.generateThumbnail(photo.id, photo.file);
      }
      await updateFromStore();
      await loadAllThumbnails();
      
      if (newPhotos.length >= 5) {
        bulkMetaIds = newPhotos.map(p => p.id);
        showBulkMetaModal = true;
      }
    }
  }

  async function importFromFolder(dirHandle: any) {
    const newPhotos: { id: string; fileName: string; filePath: string; dateTaken: string; fileSize: number; file: File; handle: FileSystemFileHandle }[] = [];
      
    // Get existing files by name+size combo for better duplicate detection
    const existingFiles = new Set(
      fotoflo.state.photos.map(p => `${p.fileName.toLowerCase()}-${p.fileSize || 0}`)
    );
    let skippedCount = 0;

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.match(/\.(jpg|jpeg|png|gif|webp|tiff?)$/i)) {
        const file = await entry.getFile();
        
        // Check for duplicate by filename + file size
        const key = `${entry.name.toLowerCase()}-${file.size}`;
        if (existingFiles.has(key)) {
          skippedCount++;
          continue;
        }
        
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        let dateTaken = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();
        
        // Read EXIF data
        let iso: number | undefined;
        let aperture: number | undefined;
        let shutterSpeed: string | undefined;
        let lens: string | undefined;
        let flash: boolean | undefined;
        let whiteBalance: string | undefined;
        
        try {
          const exif = await readEXIF(file);
          if (exif?.dateTaken) dateTaken = exif.dateTaken;
          if (exif?.camera) fotoflo.setCamera(exif.camera); // Auto-learn camera
          iso = exif?.iso;
          aperture = exif?.aperture;
          shutterSpeed = exif?.shutterSpeed;
          lens = exif?.lens;
          flash = exif?.flash;
          whiteBalance = exif?.whiteBalance;
        } catch (e) {
          console.warn('EXIF read failed:', e);
        }

        newPhotos.push({
          id,
          fileName: entry.name,
          filePath: entry.name,
          fileSize: file.size,
          dateTaken,
          file,
          handle: entry as FileSystemFileHandle,
          iso,
          aperture,
          shutterSpeed,
          lens,
          flash,
          whiteBalance
        });
        
        existingFiles.add(key);
      }
    }

    if (newPhotos.length > 0) {
      fotoflo.importPhotos(newPhotos);
      for (const photo of newPhotos) {
        await fotoflo.generateThumbnail(photo.id, photo.file);
      }
      await updateFromStore();
      await loadAllThumbnails();

      if (newPhotos.length >= 5) {
        bulkMetaIds = newPhotos.map(p => p.id);
        showBulkMetaModal = true;
      }
    }
    
    if (skippedCount > 0) {
      alert(`imported ${newPhotos.length} photos (skipped ${skippedCount} duplicates)`);
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
      
      const newPhotos: { id: string; fileName: string; filePath: string; dateTaken: string; fileSize: number; file: File; handle?: FileSystemFileHandle }[] = [];
      const existingFiles = new Set(
        fotoflo.state.photos.map(p => `${p.fileName.toLowerCase()}-${p.fileSize || 0}`)
      );
      
      for (const file of Array.from(files)) {
        if (!file.type.match(/^image\/(jpeg|png|gif|webp|tiff?)$/i)) continue;
        
        const key = `${file.name.toLowerCase()}-${file.size}`;
        if (existingFiles.has(key)) continue;
        
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        let dateTaken = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();
        
        newPhotos.push({
          id,
          fileName: file.name,
          filePath: file.name,
          fileSize: file.size,
          dateTaken,
          file
        });
        existingFiles.add(key);
      }
      
      if (newPhotos.length > 0) {
        fotoflo.importPhotos(newPhotos);
        for (const photo of newPhotos) {
          await fotoflo.generateThumbnail(photo.id, photo.file);
        }
        await updateFromStore();
        await loadAllThumbnails();
        
        if (newPhotos.length >= 5) {
          bulkMetaIds = newPhotos.map(p => p.id);
          showBulkMetaModal = true;
        }
        
        if (newPhotos.length < files.length) {
          alert(`imported ${newPhotos.length} photos`);
        }
      }
    };
    
    input.click();
  }

  function openViewer(photo: Photo) {
    viewerPhoto = photo;
  }

  function closeViewer() {
    viewerPhoto = null;
  }

  function applyBulkMetadata() {
    fotoflo.applyBulkMetadata({
      filmStock: bulkFilmStock || undefined,
      camera: bulkCamera || undefined,
      subject: bulkSubject || undefined
    }, bulkMetaIds);
    bulkFilmStock = '';
    bulkCamera = '';
    bulkSubject = '';
    bulkMetaIds = [];
    showBulkMetaModal = false;
    updateFromStore();
    sidebarRefresh++; // Force sidebar to refresh
  }

  function toggleBulkMetaModal() {
    showBulkMetaModal = !showBulkMetaModal;
    if (showBulkMetaModal) {
      // Use current selection if no bulkMetaIds set (i.e., opened from toolbar)
      if (bulkMetaIds.length === 0) {
        bulkMetaIds = Array.from(selectedIds);
      }
    } else {
      bulkFilmStock = '';
      bulkCamera = '';
      bulkSubject = '';
      bulkMetaIds = [];
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
  async function exportSelected() {
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
            await writable.write(originalFile);
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
      <select bind:value={mobileFilter} onchange={(e) => {
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
      <button class="btn primary" onclick={() => showImportModal = true}>import</button>
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
      onExport={exportSelected}
      onClear={clearSelection}
    />
  {/if}

  {#if showImportModal}
    <div class="modal-overlay" onclick={() => showImportModal = false}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h2>import photos</h2>
        <div class="import-choices">
          <button class="import-choice" onclick={() => { showImportModal = false; importFiles(); }}>
            <span class="icon">📁</span>
            <span>select files</span>
          </button>
          <button class="import-choice" onclick={() => { showImportModal = false; tryFolderImport(); }}>
            <span class="icon">📂</span>
            <span>select folder</span>
          </button>
        </div>
        <div class="actions">
          <button onclick={() => showImportModal = false}>cancel</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showBulkMetaModal}
    <div class="modal-overlay" onclick={() => showBulkMetaModal = false}>
      <div class="modal compact" onclick={(e) => e.stopPropagation()}>
        <h2>add metadata to {bulkMetaIds.length} photos</h2>

        <div class="field">
          <label>film stock</label>
          <input
            type="text"
            placeholder="e.g. Portra 400"
            bind:value={bulkFilmStock}
          />
        </div>

        <div class="field">
          <label>camera</label>
          <input
            type="text"
            placeholder="e.g. Leica M6"
            bind:value={bulkCamera}
          />
        </div>

        <div class="field">
          <label>subject (optional)</label>
          <input
            type="text"
            placeholder="e.g. Rollercoaster"
            bind:value={bulkSubject}
          />
        </div>

        <div class="actions">
          <button onclick={() => showBulkMetaModal = false}>skip</button>
          <button class="primary" onclick={applyBulkMetadata}>apply</button>
        </div>
      </div>
    </div>
  {/if}

  <Viewer photo={viewerPhoto} onclose={closeViewer} onNavigate={(photo) => viewerPhoto = photo} />
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

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border-radius: 16px;
    padding: 20px 24px;
    min-width: 320px;
    max-width: 90vw;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(200, 200, 200, 0.3);
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
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 12px;
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
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(93, 123, 140, 0.2);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .import-choice:hover {
    background: rgba(255, 255, 255, 0.8);
    border-color: rgba(93, 123, 140, 0.4);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .import-choice .icon {
    font-size: 1.5rem;
  }

  .import-choice span:last-child {
    font-size: 1rem;
    font-weight: 500;
    color: #2E3338;
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
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: rgba(93, 123, 140, 0.15);
    color: #2E3338;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .actions button:hover {
    background: rgba(93, 123, 140, 0.25);
  }

  .actions button.primary {
    background: #5D7B8C;
    color: white;
  }

  .actions button.primary:hover {
    background: #4A6572;
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
</style>
