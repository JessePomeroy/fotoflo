/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║                                                              ║
 * ║   FotoFlo Store                                               ║
 * ║   The heart of the application                              ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 * 
 * ════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE OVERVIEW
 * ════════════════════════════════════════════════════════════════════════
 * 
 * This store manages all application state using Svelte 5's reactive system.
 * It uses a dual-layer approach for data persistence:
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      APPLICATION STATE                          │
 * │  ┌──────────────────────┐    ┌──────────────────────────────┐  │
 * │  │   LocalStorage       │    │      IndexedDB              │  │
 * │  │  (Metadata only)     │    │  (Thumbnails + Handles)     │  │
 * │  │  - Photo metadata    │    │  - JPEG blobs              │  │
 * │  │  - Collections       │    │  - FileSystemFileHandles    │  │
 * │  │  - Settings         │    │                            │  │
 * │  └──────────────────────┘    └──────────────────────────────┘  │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * WHY TWO STORES?
 * - LocalStorage: Fast, synchronous, 5MB limit (perfect for metadata)
 * - IndexedDB: Large storage, async, can store blobs (thumbnails)
 * 
 * ════════════════════════════════════════════════════════════════════════
 * SVELTE 5 REACTIVITY
 * ════════════════════════════════════════════════════════════════════════
 * 
 * We use Svelte 5's $state() for reactivity:
 * - $state() creates reactive proxies
 * - Derived values are computed automatically
 * - Components update when state changes
 * 
 * EXAMPLE:
 *   let count = $state(0);
 *   let double = $derived(count * 2);
 *   // When count changes, double updates automatically
 * 
 * @module fotoflo
 */

// ════════════════════════════════════════════════════════════════════════
// IMPORTS
// ════════════════════════════════════════════════════════════════════════

import { browser } from '$app/environment';
import { writeEXIF } from '$lib/utils/exif';
import type { Photo, Collection, FotoFloState } from '$lib/types';

// ════════════════════════════════════════════════════════════════════════
// STORE INITIALIZATION
// ════════════════════════════════════════════════════════════════════════

/**
 * Creates the FotoFlo store with reactive state
 * 
 * This is the main export - it creates and returns the store object
 * with all getters and actions.
 * 
 * @returns The store with getters and actions
 */
function createFotoFloStore() {
  // ═══════════════════════════════════════════════════════════════════
  // INITIAL STATE
  // ═══════════════════════════════════════════════════════════════════
  // Define the starting state - all fields with their default values
  const initialState: FotoFloState = {
    photos: [],           // All photos in the library
    collections: [],      // User-created collections
    selectedIds: new Set(), // IDs of currently-selected photos
    activeView: 'all',   // Current view mode
    activeCollectionId: null, // Collection being viewed (if any)
    searchQuery: '',     // Full-text search
    sortBy: 'date',      // Sort order
    filterFilmStock: null, // Film stock filter
    filterCamera: null,  // Camera filter
    filterRating: null,   // Minimum rating filter
    filterSubject: null  // Subject filter
  };

  // Create reactive state
  let state = $state(initialState);
  
  // IndexedDB connection (lazy initialized)
  let db: IDBDatabase | null = null;
  
  // Web Worker for thumbnail generation (lazy initialized)
  let worker: Worker | null = null;

  // ═══════════════════════════════════════════════════════════════════
  // STORAGE CONSTANTS
  // ═══════════════════════════════════════════════════════════════════
  
  const CACHE_NAME = 'fotoflo-thumbnails-v1';
  const THUMBNAIL_STORE = 'thumbnails';      // Thumbnail blobs
  const FILEHANDLE_STORE = 'filehandles';    // Original file handles

  // ═══════════════════════════════════════════════════════════════════
  // STORAGE STRATEGY
  // ═══════════════════════════════════════════════════════════════════
  //
  // THUMBNAIL STORAGE (tiered):
  // 1. Cache API (primary) - Native blob storage, fast, good quotas
  // 2. IndexedDB (fallback) - Universal support, data URLs
  //
  // FILE HANDLES:
  // - IndexedDB only (Cache API doesn't support FileSystemFileHandle)
  //
  // WHY CACHE API?
  // - Designed for HTTP responses and blobs
  // - Better quota management than IndexedDB
  // - Automatic cleanup with cache expiration
  // - Works great with service workers
  //

  // ═══════════════════════════════════════════════════════════════════
  // BROWSER CAPABILITY CHECK
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Check if Cache API is available
   * 
   * Cache API is supported in most modern browsers but may be
   * unavailable in some contexts (private browsing, certain browsers).
   */
  function hasCacheAPI(): boolean {
    return browser && 'caches' in window;
  }

  // ═══════════════════════════════════════════════════════════════════
  // INDEXEDDB SETUP
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Initialize IndexedDB connection
   * 
   * This is lazy-initialized - the connection is only opened when first needed.
   * This avoids unnecessary database connections on server-side rendering.
   * 
   * DATABASE STRUCTURE:
   * - Version: 2
   * - Stores:
   *   - 'thumbnails': { id, data } - Thumbnail blobs
   *   - 'filehandles': { id, handle } - FileSystemFileHandle references
   */
  async function initDB() {
    if (db) return;                    // Already connected
    if (!browser) return;             // Not in browser
    
    return new Promise<void>((resolve) => {
      // Browser check
      if (typeof indexedDB === 'undefined') {
        resolve();
        return;
      }
      
      // Open database
      const request = indexedDB.open('FotoFlo', 2);
      
      request.onerror = () => {
        console.warn('IndexedDB open error');
        resolve();
      };
      
      request.onsuccess = () => {
        db = request.result;
        resolve();
      };
      
      // Create object stores if needed
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

  // ═══════════════════════════════════════════════════════════════════
  // THUMBNAIL WORKER
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get or create thumbnail worker
   * 
   * Web Workers run in a separate thread, keeping the main thread
   * responsive during thumbnail generation.
   */
  function getWorker(): Worker | null {
    if (!worker && browser) {
      worker = new Worker(
        new URL('$lib/workers/thumbnail.worker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return worker;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DATA URL HELPERS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Convert Blob to data URL for storage
   * 
   * IndexedDB stores data URLs more reliably than raw blobs
   * across different browsers.
   */
  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert data URL back to Blob
   * 
   * Used when storing in Cache API which prefers Blob format.
   */
  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  }

  // ═══════════════════════════════════════════════════════════════════
  // THUMBNAIL OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Save a thumbnail with tiered storage (Cache API → IndexedDB)
   * 
   * @param id - Photo ID to associate with thumbnail
   * @param dataUrl - JPEG data URL of the thumbnail
   */
  async function saveThumbnail(id: string, dataUrl: string) {
    if (!browser) return;
    
    // Try Cache API first (preferred)
    if (hasCacheAPI()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const blob = dataUrlToBlob(dataUrl);
        await cache.put(`/thumbnails/${id}`, new Response(blob, {
          headers: { 'Content-Type': blob.type }
        }));
        return;
      } catch (e) {
        // Fall through to IndexedDB
      }
    }
    
    // Fallback to IndexedDB
    if (!db) await initDB();
    if (!db) return;
    
    return new Promise<void>((resolve) => {
      const transaction = db!.transaction([THUMBNAIL_STORE], 'readwrite');
      const store = transaction.objectStore(THUMBNAIL_STORE);
      const request = store.put({ id, data: dataUrl });
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  /**
   * Get a thumbnail from tiered storage (Cache API → IndexedDB)
   * 
   * @param id - Photo ID to look up
   * @returns Data URL string or null if not found
   */
  async function getThumbnail(id: string): Promise<string | null> {
    if (!browser) return null;
    
    // Try Cache API first
    if (hasCacheAPI()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(`/thumbnails/${id}`);
        if (response) {
          const blob = await response.blob();
          return await blobToDataUrl(blob);
        }
      } catch (e) {
        // Fall through to IndexedDB
      }
    }
    
    // Fallback to IndexedDB
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

  /**
   * Delete thumbnails from both storage layers
   */
  async function deleteThumbnails(ids: string[]) {
    if (!browser) return;
    
    // Delete from Cache API
    if (hasCacheAPI()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(ids.map(id => cache.delete(`/thumbnails/${id}`)));
      } catch (e) {
        // Ignore errors
      }
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

  // ═══════════════════════════════════════════════════════════════════
  // THUMBNAIL GENERATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Generate a thumbnail using Web Worker for performance
   * 
   * Uses a worker to keep the UI responsive during large imports.
   * Falls back to main thread if worker fails.
   * 
   * @param id - Photo ID
   * @param file - Original File object
   */
  async function generateThumbnail(id: string, file: File): Promise<void> {
    if (!browser || !file || !(file instanceof File)) return;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const w = getWorker();
      if (!w) throw new Error('Worker not available');
      
      await new Promise<void>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          if (event.data.id === id) {
            w.removeEventListener('message', handler);
            if (event.data.success) {
              saveThumbnail(id, event.data.dataUrl);
              resolve();
            } else {
              reject(new Error(event.data.error));
            }
          }
        };
        
        w.addEventListener('message', handler);
        w.postMessage({
          id,
          fileData: arrayBuffer,
          fileType: file.type,
          maxSize: 300,
          quality: 0.7
        });
        
        // 30 second timeout
        setTimeout(() => {
          w.removeEventListener('message', handler);
          reject(new Error('Thumbnail generation timeout'));
        }, 30000);
      });
    } catch (err) {
      console.warn('Worker failed, using main thread:', err);
      await generateThumbnailMainThread(id, file);
    }
  }

  /**
   * Fallback: Generate thumbnail on main thread
   */
  async function generateThumbnailMainThread(id: string, file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const maxSize = 300;
    const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height);
    canvas.width = Math.floor(bitmap.width * scale);
    canvas.height = Math.floor(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    
    await saveThumbnail(id, canvas.toDataURL('image/jpeg', 0.7));
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHOTO OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Import photos into the library
   * 
   * Takes ImportedPhoto objects (with File references) and stores them
   * as plain Photo objects in state.
   * 
   * @param photoFiles - Array of imported photos with File references
   */
  async function importPhotos(
    photoFiles: Array<{
      id: string;
      fileName: string;
      filePath: string;
      dateTaken: string;
      fileSize?: number;
      file: File;
      handle?: FileSystemFileHandle;
      iso?: number;
      aperture?: number;
      shutterSpeed?: string;
      lens?: string;
      flash?: boolean;
      whiteBalance?: string;
    }>
  ) {
    // Transform to Photo interface (remove File reference)
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
    
    // Add to state
    state.photos = [...state.photos, ...newPhotos];
    saveToStorage();
    
    // Store file handles for full-res export (folder imports only)
    for (const pf of photoFiles) {
      if (pf.handle) {
        await saveFileHandle(pf.id, pf.handle);
      }
    }
  }

  /**
   * Update photo metadata
   */
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
    
    // Clear filters when deleting all
    if (wasAllPhotos || state.photos.length === 0) {
      state.filterFilmStock = null;
      state.filterRating = null;
      state.filterSubject = null;
      state.activeView = 'all';
      state.activeCollectionId = null;
    }
    
    saveToStorage();
  }

  // ═══════════════════════════════════════════════════════════════════
  // SELECTION OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════
  // VIEW & FILTER OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

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

  function setFilterCamera(camera: string | null) {
    state.filterCamera = camera;
  }

  function setFilterRating(rating: number | null) {
    state.filterRating = rating;
  }

  function setFilterSubject(subject: string | null) {
    state.filterSubject = subject;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DERIVED VALUES
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get filtered and sorted photos based on current view and filters
   */
  function getFilteredPhotos(): Photo[] {
    let result = [...state.photos];
    
    // Filter by view
    if (state.activeView === 'favorites') {
      result = result.filter(p => p.isFavorite);
    } else if (state.activeView === 'collection' && state.activeCollectionId) {
      const collection = state.collections.find(c => c.id === state.activeCollectionId);
      if (collection) {
        const idSet = new Set(collection.photoIds);
        result = result.filter(p => idSet.has(p.id));
      }
    }
    
    // Filter by search query
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      result = result.filter(p => 
        p.fileName.toLowerCase().includes(query) ||
        p.subject?.toLowerCase().includes(query) ||
        p.filmStock?.toLowerCase().includes(query) ||
        p.camera?.toLowerCase().includes(query)
      );
    }
    
    // Apply filters
    if (state.filterFilmStock) {
      result = result.filter(p => p.filmStock === state.filterFilmStock);
    }
    if (state.filterCamera) {
      result = result.filter(p => p.camera === state.filterCamera);
    }
    if (state.filterRating !== null) {
      result = result.filter(p => p.rating >= state.filterRating!);
    }
    if (state.filterSubject) {
      result = result.filter(p => p.subject === state.filterSubject);
    }
    
    // Sort
    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'rating':
          return b.rating - a.rating;
        case 'name':
          return a.fileName.localeCompare(b.fileName);
        case 'date':
        default:
          return new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime();
      }
    });
    
    return result;
  }

  function getPhotoCount(): number {
    return state.photos.length;
  }

  function getFilmStocks(): string[] {
    const stocks = new Set(state.photos.map(p => p.filmStock).filter(Boolean));
    return Array.from(stocks).sort();
  }

  function getCameras(): string[] {
    const cameras = new Set(state.photos.map(p => p.camera).filter(Boolean));
    return Array.from(cameras).sort();
  }

  function getSubjects(): string[] {
    const subjects = new Set(state.photos.map(p => p.subject).filter(Boolean));
    return Array.from(subjects).sort();
  }

  function getSelectionMode(): boolean {
    return state.selectedIds.size > 0;
  }

  function getRatingDistribution(): Record<number, number> {
    const dist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const photo of state.photos) {
      dist[photo.rating] = (dist[photo.rating] || 0) + 1;
    }
    return dist;
  }

  // ═══════════════════════════════════════════════════════════════════
  // COLLECTION OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  function createCollection(name: string, photoIds: string[]): string {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    state.collections.push({
      id,
      name,
      photoIds,
      createdAt: new Date().toISOString()
    });
    saveToStorage();
    return id;
  }

  function deleteCollection(id: string) {
    state.collections = state.collections.filter(c => c.id !== id);
    if (state.activeCollectionId === id) {
      state.activeView = 'all';
      state.activeCollectionId = null;
    }
    saveToStorage();
  }

  function addToCollection(collectionId: string, photoId: string) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (collection && !collection.photoIds.includes(photoId)) {
      collection.photoIds.push(photoId);
      saveToStorage();
    }
  }

  function removeFromCollection(collectionId: string, photoId: string) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (collection) {
      collection.photoIds = collection.photoIds.filter(id => id !== photoId);
      saveToStorage();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FILE HANDLE OPERATIONS (IndexedDB only)
  // ═══════════════════════════════════════════════════════════════════

  async function saveFileHandle(id: string, handle: FileSystemFileHandle) {
    if (!browser) return;
    if (!db) await initDB();
    if (!db) return;
    
    return new Promise<void>((resolve) => {
      try {
        const transaction = db!.transaction([FILEHANDLE_STORE], 'readwrite');
        const store = transaction.objectStore(FILEHANDLE_STORE);
        store.put({ id, handle });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async function getFileHandle(id: string): Promise<FileSystemFileHandle | null> {
    if (!browser) return null;
    if (!db) await initDB();
    if (!db) return null;
    
    return new Promise((resolve) => {
      try {
        const transaction = db!.transaction([FILEHANDLE_STORE], 'readonly');
        const store = transaction.objectStore(FILEHANDLE_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result?.handle || null);
        request.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function deleteFileHandles(ids: string[]) {
    if (!browser) return;
    if (!db) await initDB();
    if (!db) return;
    
    return new Promise<void>((resolve) => {
      try {
        const transaction = db!.transaction([FILEHANDLE_STORE], 'readwrite');
        const store = transaction.objectStore(FILEHANDLE_STORE);
        ids.forEach(id => store.delete(id));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async function getOriginalFile(id: string): Promise<File | null> {
    const handle = await getFileHandle(id);
    if (!handle) return null;
    
    try {
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

  // ═══════════════════════════════════════════════════════════════════
  // PERSISTENCE (LocalStorage)
  // ═══════════════════════════════════════════════════════════════════

  function saveToStorage() {
    if (!browser) return;
    try {
      localStorage.setItem('fotoflo', JSON.stringify(state.photos));
      localStorage.setItem('fotoflo-collections', JSON.stringify(state.collections));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  function loadFromStorage() {
    if (!browser) return;
    try {
      const photos = localStorage.getItem('fotoflo');
      const collections = localStorage.getItem('fotoflo-collections');
      
      if (photos) state.photos = JSON.parse(photos);
      if (collections) state.collections = JSON.parse(collections);
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // METADATA BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  function bulkRate(ids: string[], rating: number) {
    state.photos = state.photos.map(p => 
      ids.includes(p.id) ? { ...p, rating } : p
    );
    saveToStorage();
  }

  function bulkSetMetadata(
    ids: string[], 
    metadata: { filmStock?: string; camera?: string; subject?: string }
  ) {
    state.photos = state.photos.map(p => 
      ids.includes(p.id) 
        ? { ...p, ...metadata }
        : p
    );
    saveToStorage();
  }

  function applyBulkMetadata(
    ids: string[], 
    metadata: { filmStock: string; camera: string; subject: string }
  ) {
    bulkSetMetadata(ids, metadata);
  }

  // ═══════════════════════════════════════════════════════════════════
  // EXPORT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  async function exportPhoto(photoId: string): Promise<File | null> {
    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return null;
    
    try {
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
      return matched;
    } catch (e) {
      console.error('Import backup failed:', e);
      return 0;
    }
  }

  async function relinkOriginals(dirHandle: FileSystemDirectoryHandle): Promise<{linked: number; notFound: number}> {
    let linked = 0;
    let notFound = 0;
    
    const fileMap = new Map<string, FileSystemFileHandle>();
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        fileMap.set(entry.name.toLowerCase(), entry as FileSystemFileHandle);
      }
    }
    
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

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-LEARN CAMERAS & FILM STOCKS
  // ═══════════════════════════════════════════════════════════════════

  function setCamera(camera: string) {
    if (!state.filterCamera) {
      state.filterCamera = camera;
    }
  }

  function setFilmStock(filmStock: string) {
    if (!state.filterFilmStock) {
      state.filterFilmStock = filmStock;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  if (browser) {
    loadFromStorage();
    initDB();
  }

  // ═══════════════════════════════════════════════════════════════════
  // STORE EXPORT
  // ═══════════════════════════════════════════════════════════════════

  return {
    // State accessors
    get state() { return state; },
    get filteredPhotos() { return getFilteredPhotos(); },
    getFilteredPhotos,
    get photoCount() { return getPhotoCount(); },
    get filmStocks() { return getFilmStocks(); },
    get cameras() { return getCameras(); },
    get subjects() { return getSubjects(); },
    get selectionMode() { return getSelectionMode(); },
    get ratingDistribution() { return getRatingDistribution(); },
    
    // Import/Export
    importPhotos,
    generateThumbnail,
    bulkRate,
    applyBulkMetadata,
    exportBackup,
    importBackup,
    exportPhoto,
    relinkOriginals,
    
    // Photo operations
    setRating,
    toggleFavorite,
    deletePhotos,
    setCamera,
    setFilmStock,
    
    // Selection
    toggleSelection,
    selectAll,
    clearSelection,
    
    // View & Filter
    setView,
    setSearch,
    setSortBy,
    setFilterFilmStock,
    setFilterCamera,
    setFilterRating,
    setFilterSubject,
    
    // Collections
    createCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection,
    
    // Storage
    getThumbnail,
    getOriginalFile
  };
}

// Create and export the singleton store instance
export const fotoflo = createFotoFloStore();
