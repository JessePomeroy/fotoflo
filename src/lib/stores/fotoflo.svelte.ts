/**
 * FotoFlo Store - The heart of the application
 * 
 * This store manages all application state using Svelte 5's reactive system ($state).
 * It uses a dual-layer approach for data persistence:
 * 
 * 1. **LocalStorage**: Stores photo metadata (lightweight, fast access)
 * 2. **IndexedDB**: Stores larger binary data (thumbnails, file handles)
 * 
 * This separation keeps LocalStorage fast while IndexedDB handles larger data.
 * 
 * @module fotoflo
 */
import { browser } from '$app/environment';
import { writeEXIF } from '$lib/utils/exif';

interface Photo {
  id: string;
  fileName: string;
  filePath: string;
  fileSize?: number;
  dateTaken: string;
  importedAt: string;
  rating: number;
  isFavorite: boolean;
  tags: string[];
  filmStock?: string;
  camera?: string;
  subject?: string;
  frameNumber?: string;
  // EXIF data
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  lens?: string;
  flash?: boolean;
  whiteBalance?: string;
}

interface FotoFloState {
  photos: Photo[];
  collections: Collection[];
  selectedIds: Set<string>;
  activeView: 'all' | 'favorites' | 'collection';
  activeCollectionId: string | null;
  searchQuery: string;
  sortBy: 'date' | 'rating' | 'name';
  filterFilmStock: string | null;
  filterCamera: string | null;
  filterRating: number | null;
  filterSubject: string | null;
}

/**
 * Creates the FotoFlo store with reactive state
 * 
 * Uses Svelte 5's $state() for reactivity - when state changes,
 * any component using derived values will automatically update.
 * 
 * @returns {object} The store with getters and actions
 */
function createFotoFloStore() {
  // Initial state - defines all possible state values
  const initialState: FotoFloState = {
    photos: [],
    collections: [],
    selectedIds: new Set(),
    activeView: 'all',
    activeCollectionId: null,
    searchQuery: '',
    sortBy: 'date',
    filterFilmStock: null,
    filterCamera: null,
    filterRating: null,
    filterSubject: null
  };

  let state = $state(initialState);
  let db: IDBDatabase | null = null;
  
  // IndexedDB object store names
  // We use separate stores for different types of binary data
  const THUMBNAIL_STORE = 'thumbnails';     // Compressed image previews
  const FILEHANDLE_STORE = 'filehandles';    // References to original files

  /**
   * Initialize IndexedDB for storing binary data
   * 
   * IndexedDB is a browser database that can store:
   * - Binary files (blobs)
   * - Structured data objects
   * - File handles (in modern browsers)
   * 
   * We use it instead of LocalStorage because:
   * 1. Can store much larger data (LocalStorage is limited to ~5MB)
   * 2. Supports binary data natively
   * 3. Non-blocking async operations
   */
  async function initDB() {
    if (!browser || db) return;
    
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('FotoFlo', 2); // Bump version for new store
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { db = request.result; resolve(); };
      request.onupgradeneeded = (event: any) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(THUMBNAIL_STORE)) {
          database.createObjectStore(THUMBNAIL_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(FILEHANDLE_STORE)) {
          database.createObjectStore(FILEHANDLE_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  // Thumbnail functions - use Cache API first, fall back to IndexedDB
  async function saveThumbnail(id: string, dataUrl: string) {
    // Try Cache API first (larger quota on most browsers)
    try {
      const cache = await caches.open('fotoflo-thumbnails');
      await cache.put(`thumb-${id}`, new Response(dataUrl, { headers: { 'Content-Type': 'image/jpeg' } }));
      return;
    } catch (cacheErr) {
      console.warn('Cache save failed, trying IndexedDB:', cacheErr);
    }

    // Fall back to IndexedDB
    if (!db) await initDB();
    if (!db) return;
    
    return new Promise<void>((resolve) => {
      const transaction = db!.transaction([THUMBNAIL_STORE], 'readwrite');
      const store = transaction.objectStore(THUMBNAIL_STORE);
      const request = store.put({ id, data: dataUrl });
      request.onsuccess = () => resolve();
      request.onerror = () => { /* ignore quota errors */ resolve(); };
    });
  }

  async function getThumbnail(id: string): Promise<string | null> {
    // Try Cache API first
    try {
      const cache = await caches.open('fotoflo-thumbnails');
      const response = await cache.match(`thumb-${id}`);
      if (response) {
        const blob = await response.blob();
        return await blob.text();
      }
    } catch (cacheErr) {
      // Continue to IndexedDB
    }

    // Fall back to IndexedDB
    if (!db) await initDB();
    if (!db) return null;
    
    return new Promise((resolve) => {
      const transaction = db!.transaction([THUMBNAIL_STORE], 'readonly');
      const store = transaction.objectStore(THUMBNAIL_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => resolve(null);
    });
  }

  async function deleteThumbnails(ids: string[]) {
    // Delete from Cache API
    try {
      const cache = await caches.open('fotoflo-thumbnails');
      for (const id of ids) {
        await cache.delete(`thumb-${id}`);
      }
    } catch (e) {
      // Continue to IndexedDB
    }

    // Delete from IndexedDB
    if (!db) await initDB();
    if (!db) return;
    
    return new Promise<void>((resolve) => {
      const transaction = db!.transaction([THUMBNAIL_STORE], 'readwrite');
      const store = transaction.objectStore(THUMBNAIL_STORE);
      ids.forEach(id => store.delete(id));
      transaction.oncomplete = () => resolve();
    });
  }

  // File handle functions for full-res export
  async function saveFileHandle(id: string, handle: FileSystemFileHandle) {
    if (!db) await initDB();
    if (!db) return;
    
    return new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction([FILEHANDLE_STORE], 'readwrite');
      const store = transaction.objectStore(FILEHANDLE_STORE);
      const request = store.put({ id, handle });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function getFileHandle(id: string): Promise<FileSystemFileHandle | null> {
    if (!db) await initDB();
    if (!db) return null;
    
    return new Promise((resolve, reject) => {
      const transaction = db!.transaction([FILEHANDLE_STORE], 'readonly');
      const store = transaction.objectStore(FILEHANDLE_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result?.handle || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteFileHandles(ids: string[]) {
    if (!db) await initDB();
    if (!db) return;
    
    return new Promise<void>((resolve) => {
      const transaction = db!.transaction([FILEHANDLE_STORE], 'readwrite');
      const store = transaction.objectStore(FILEHANDLE_STORE);
      ids.forEach(id => store.delete(id));
      transaction.oncomplete = () => resolve();
    });
  }

  /**
   * Get the original full-resolution file for export
   * 
   * Since we only store thumbnails for display, we need to
   * re-read the original file when exporting. This function:
   * 1. Gets the stored FileSystemFileHandle
   * 2. Requests permission from the browser (user may need to approve)
   * 3. Returns the File object for reading/writing
   * 
   * The File System Access API requires this two-step process
   * for security - the browser won't let us access files without
   * explicit user permission each session.
   */
  async function getOriginalFile(id: string): Promise<File | null> {
    const handle = await getFileHandle(id);
    if (!handle) return null;
    
    try {
      // Request permission to read (user may need to grant again)
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        const requested = await handle.requestPermission({ mode: 'read' });
        if (requested !== 'granted') return null;
      }
      return await handle.getFile();
    } catch (e) {
      console.warn('Could not access original file:', e);
      return null;
    }
  }

  // Persistence
  function loadFromStorage() {
    if (!browser) return;
    try {
      const stored = localStorage.getItem('fotoflo-photos');
      if (stored) state.photos = JSON.parse(stored);
      const coll = localStorage.getItem('fotoflo-collections');
      if (coll) state.collections = JSON.parse(coll);
    } catch (e) {
      console.warn('Load failed:', e);
    }
  }

  function saveToStorage() {
    if (!browser) return;
    localStorage.setItem('fotoflo-photos', JSON.stringify(state.photos));
    localStorage.setItem('fotoflo-collections', JSON.stringify(state.collections));
  }

  // Actions
  async function importPhotos(photoFiles: Array<{id: string; fileName: string; filePath: string; dateTaken: string; fileSize?: number; file: File; handle?: FileSystemFileHandle; iso?: number; aperture?: number; shutterSpeed?: string; lens?: string; flash?: boolean; whiteBalance?: string;}>) {
    const newPhotos = photoFiles.map(pf => ({
      id: pf.id,
      fileName: pf.fileName,
      filePath: pf.filePath,
      fileSize: pf.fileSize,
      dateTaken: pf.dateTaken,
      importedAt: new Date().toISOString(),
      rating: 0,
      isFavorite: false,
      tags: [],
      iso: pf.iso,
      aperture: pf.aperture,
      shutterSpeed: pf.shutterSpeed,
      lens: pf.lens,
      flash: pf.flash,
      whiteBalance: pf.whiteBalance
    }));
    state.photos = [...state.photos, ...newPhotos];
    saveToStorage();
    
    // Store file handles for full-res export
    for (const pf of photoFiles) {
      if (pf.handle) {
        await saveFileHandle(pf.id, pf.handle);
      }
    }
  }

  /**
   * Generate a compressed thumbnail for a photo
   * 
   * This creates a small (300px max) JPEG preview that displays
   * quickly in the grid. The original full-res image is stored
   * as a file handle reference for export.
   * 
   * Uses canvas API to resize - createsImageBitmap() is faster
   * than loading the full image into memory.
   * 
   * @param id - Photo ID to associate with thumbnail
   * @param file - Original File object from import
   */
  function generateThumbnail(id: string, file: File) {
    if (!browser) return Promise.resolve();
    
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const maxSize = 300;
          const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height);
          canvas.width = Math.floor(bitmap.width * scale);
          canvas.height = Math.floor(bitmap.height * scale);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          try {
            await saveThumbnail(id, dataUrl);
          } catch (err) {
            console.warn('Thumbnail save failed (quota exceeded?):', err);
          }
        } catch (err) {
          console.warn('Thumbnail failed:', err);
        }
        resolve();
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function setRating(id: string, rating: number) {
    const photo = state.photos.find(p => p.id === id);
    if (photo) {
      photo.rating = rating;
      saveToStorage();
    }
  }

  function toggleFavorite(id: string) {
    const photo = state.photos.find(p => p.id === id);
    if (photo) {
      photo.isFavorite = !photo.isFavorite;
      saveToStorage();
    }
  }

  function deletePhotos(ids: string[]) {
    const wasAllPhotos = state.photos.length === ids.length;
    
    state.photos = state.photos.filter(p => !ids.includes(p.id));
    state.collections.forEach(c => {
      c.photoIds = c.photoIds.filter(pid => !ids.includes(pid));
    });
    deleteThumbnails(ids);
    deleteFileHandles(ids);
    state.selectedIds = new Set([...state.selectedIds].filter(id => !ids.includes(id)));
    
    // Clear filters when all photos are deleted
    if (wasAllPhotos || state.photos.length === 0) {
      state.filterFilmStock = null;
      state.filterRating = null;
      state.filterSubject = null;
      state.activeView = 'all';
      state.activeCollectionId = null;
    }
    
    saveToStorage();
  }

  function toggleSelection(id: string) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
  }

  function selectAll() {
    const filtered = getFilteredPhotos();
    state.selectedIds = new Set(filtered.map(p => p.id));
  }

  function clearSelection() {
    state.selectedIds.clear();
  }

  function setView(view: 'all' | 'favorites' | 'collection', collectionId?: string) {
    state.activeView = view;
    state.activeCollectionId = view === 'collection' ? collectionId || null : null;
  }

  function setSearch(query: string) {
    state.searchQuery = query;
  }

  function setSortBy(sort: 'date' | 'rating' | 'name') {
    state.sortBy = sort;
  }

  function setFilterFilmStock(filmStock: string | null) {
    state.filterFilmStock = filmStock;
  }

  function setFilterRating(rating: number | null) {
    state.filterRating = rating;
  }

  function setFilterSubject(subject: string | null) {
    state.filterSubject = subject;
  }

  function setFilterCamera(camera: string | null) {
    state.filterCamera = camera;
  }

  // Derived
  function getFilteredPhotos() {
    let result = state.photos;

    // View filter
    if (state.activeView === 'favorites') {
      result = result.filter(p => p.isFavorite);
    } else if (state.activeView === 'collection' && state.activeCollectionId) {
      const collection = state.collections.find(c => c.id === state.activeCollectionId);
      if (collection) {
        result = result.filter(p => collection.photoIds.includes(p.id));
      }
    }

    // Film stock filter
    if (state.filterFilmStock) {
      result = result.filter(p => p.filmStock === state.filterFilmStock);
    }

    // Rating filter
    if (state.filterRating !== null) {
      result = result.filter(p => p.rating === state.filterRating);
    }

    // Subject filter
    if (state.filterSubject) {
      result = result.filter(p => p.subject === state.filterSubject);
    }

    // Camera filter
    if (state.filterCamera) {
      result = result.filter(p => p.camera === state.filterCamera);
    }

    // Search (includes metadata fields)
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(p =>
        p.fileName.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        (p.filmStock && p.filmStock.toLowerCase().includes(q)) ||
        (p.camera && p.camera.toLowerCase().includes(q)) ||
        (p.subject && p.subject.toLowerCase().includes(q))
      );
    }

    // Sort
    switch (state.sortBy) {
      case 'date':
        result.sort((a, b) => new Date(b.dateTaken || b.importedAt).getTime() - new Date(a.dateTaken || a.importedAt).getTime());
        break;
      case 'rating':
        result.sort((a, b) => b.rating - a.rating || new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
        break;
      case 'name':
        result.sort((a, b) => a.fileName.localeCompare(b.fileName));
        break;
    }
    
    return result;
  }

  function getPhotoCount() {
    return state.photos.length;
  }

  function getFilmStocks() {
    const stocks = new Set(state.photos.map(p => p.filmStock).filter(Boolean));
    return Array.from(stocks).sort();
  }

  function getCameras() {
    const cameras = new Set(state.photos.map(p => p.camera).filter(Boolean));
    return Array.from(cameras).sort();
  }

  function getSubjects() {
    const subjects = new Set(state.photos.map(p => p.subject).filter(Boolean));
    return Array.from(subjects).sort();
  }

  function setFilmStock(id: string, filmStock: string) {
    state.photos = state.photos.map(p => {
      if (p.id === id) {
        return { ...p, filmStock: filmStock || undefined };
      }
      return p;
    });
    saveToStorage();
  }

  function setCamera(id: string, camera: string) {
    state.photos = state.photos.map(p => {
      if (p.id === id) {
        return { ...p, camera: camera || undefined };
      }
      return p;
    });
    saveToStorage();
  }

  function setSubject(id: string, subject: string) {
    state.photos = state.photos.map(p => {
      if (p.id === id) {
        return { ...p, subject: subject || undefined };
      }
      return p;
    });
    saveToStorage();
  }

  function setFrameNumber(id: string, frameNumber: string) {
    state.photos = state.photos.map(p => {
      if (p.id === id) {
        return { ...p, frameNumber: frameNumber || undefined };
      }
      return p;
    });
    saveToStorage();
  }

  function getSelectionMode() {
    return state.selectedIds.size > 0;
  }

  function getRatingDistribution() {
    const dist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    state.photos.forEach(p => {
      dist[p.rating] = (dist[p.rating] || 0) + 1;
    });
    return dist;
  }

  function bulkRate(rating: number) {
    const ids = Array.from(state.selectedIds);
    state.photos = state.photos.map(p => {
      if (ids.includes(p.id)) {
        return { ...p, rating };
      }
      return p;
    });
    saveToStorage();
  }

  function applyBulkMetadata(updates: {filmStock?: string; camera?: string; subject?: string}, targetIds?: string[]) {
    const ids = targetIds || Array.from(state.selectedIds);
    state.photos = state.photos.map(p => {
      if (ids.includes(p.id)) {
        return { ...p, ...updates };
      }
      return p;
    });
    saveToStorage();
  }

  // Relink original files by matching filenames from a selected folder
  async function relinkOriginals(dirHandle: FileSystemDirectoryHandle): Promise<{linked: number; notFound: number}> {
    let linked = 0;
    let notFound = 0;
    
    // Build a map of filename -> file handle from the selected folder
    const fileMap = new Map<string, FileSystemFileHandle>();
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        fileMap.set(entry.name.toLowerCase(), entry as FileSystemFileHandle);
      }
    }
    
    // Try to match each photo by filename
    for (const photo of state.photos) {
      const handle = fileMap.get(photo.fileName.toLowerCase());
      if (handle) {
        await saveFileHandle(photo.id, handle);
        linked++;
      } else {
        notFound++;
      }
    }
    
    return { linked, notFound };
  }

  // Export all metadata as JSON backup
  function exportBackup() {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      photos: state.photos.map(p => ({
        fileName: p.fileName,
        filmStock: p.filmStock,
        camera: p.camera,
        subject: p.subject,
        frameNumber: p.frameNumber,
        rating: p.rating,
        isFavorite: p.isFavorite
      }))
    };
    return JSON.stringify(backup, null, 2);
  }

  // Import metadata from JSON backup
  function importBackup(json: string) {
    try {
      const backup = JSON.parse(json);
      if (!backup.version || !backup.photos) {
        throw new Error('Invalid backup file');
      }
      
      let matched = 0;
      const fileNameMap = new Map(backup.photos.map((p: any) => [p.fileName.toLowerCase(), p]));
      
      state.photos = state.photos.map(p => {
        const backupData = fileNameMap.get(p.fileName.toLowerCase());
        if (backupData) {
          matched++;
          return {
            ...p,
            filmStock: backupData.filmStock || p.filmStock,
            camera: backupData.camera || p.camera,
            subject: backupData.subject || p.subject,
            frameNumber: backupData.frameNumber || p.frameNumber,
            rating: backupData.rating ?? p.rating,
            isFavorite: backupData.isFavorite ?? p.isFavorite
          };
        }
        return p;
      });
      
      saveToStorage();
      return { success: true, matched };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Export a photo with embedded metadata
   * Writes film stock, camera, subject, and rating into the EXIF data
   */
  async function exportPhoto(photoId: string): Promise<Blob | null> {
    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return null;

    try {
      // Get original file
      const file = await getOriginalFile(photoId);
      if (!file) return null;

      // Write metadata to file
      const exported = await writeEXIF(file, photo);
      return exported;
    } catch (e) {
      console.error('Export failed:', e);
      return null;
    }
  }

  // Initialize
  if (browser) {
    loadFromStorage();
    initDB();
  }

  return {
    get state() { return state; },
    get filteredPhotos() { return getFilteredPhotos(); },
    getFilteredPhotos,
    get photoCount() { return getPhotoCount(); },
    get filmStocks() { return getFilmStocks(); },
    get cameras() { return getCameras(); },
    get subjects() { return getSubjects(); },
    get selectionMode() { return getSelectionMode(); },
    get ratingDistribution() { return getRatingDistribution(); },
    importPhotos,
    generateThumbnail,
    setRating,
    toggleFavorite,
    deletePhotos,
    toggleSelection,
    selectAll,
    clearSelection,
    setView,
    setSearch,
    setSortBy,
    setFilterFilmStock,
    setFilterCamera,
    setFilterRating,
    setFilterSubject,
    getThumbnail,
    getOriginalFile,
    setFilmStock,
    setCamera,
    setSubject,
    setFrameNumber,
    bulkRate,
    applyBulkMetadata,
    relinkOriginals,
    exportBackup,
    importBackup,
    exportPhoto
  };
}

export const fotoflo = createFotoFloStore();
