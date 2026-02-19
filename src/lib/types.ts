/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                                                              ║
 * ║   FotoFlo Type Definitions                                   ║
 * ║   Centralized type definitions for the entire application   ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * This file serves as the single source of truth for all TypeScript
 * interfaces used throughout the application. Using centralized types
 * ensures consistency and makes refactoring easier.
 * 
 * WHY CENTRALIZE TYPES?
 * - Single source of truth across all modules
 * - Easier to find and fix type-related bugs
 * - IDE autocomplete works better
 * - Refactoring is safer and faster
 */

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Photo                                                      ║
 * ║  Represents a single photo in the library                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * A Photo is the core entity in FotoFlo. It contains:
 * - Metadata (filename, dates, ratings)
 * - Categorization (film stock, camera, subject)
 * - EXIF data (ISO, aperture, shutter speed, etc.)
 * 
 * Design decisions:
 * - Optional EXIF fields because not all images have EXIF data
 * - Tags as string array for flexible categorization
 * - Separate importedAt vs dateTaken (import time vs capture time)
 */
export interface Photo {
  /** Unique identifier - generated as timestamp + random string */
  id: string;
  
  /** Original filename from the source file */
  fileName: string;
  
  /** 
   * File path or identifier
   * For folder imports: relative path from import directory
   * For file imports: just the filename
   */
  filePath: string;
  
  /** File size in bytes - used for duplicate detection */
  fileSize?: number;
  
  /** 
   * When the photo was captured
   * From EXIF DateTimeOriginal if available, 
   * otherwise falls back to file modification time
   */
  dateTaken: string;
  
  /** When the photo was added to the library */
  importedAt: string;
  
  /** 
   * User rating from 0-5 stars
   * 0 means unrated
   */
  rating: number;
  
  /** Quick-access favorite flag */
  isFavorite: boolean;
  
  /** 
   * Flexible tagging system
   * Can be used for any categorization
   */
  tags: string[];
  
  // ═══════════════════════════════════════════════════════════
  // FILM & CAMERA METADATA
  // These are manual entries or auto-extracted from EXIF
  // ═══════════════════════════════════════════════════════════
  
  /** Film stock name (e.g., "Portra 400", "Ektar 100") */
  filmStock?: string;
  
  /** Camera model (e.g., "Leica M6", "Hasselblad 500CM") */
  camera?: string;
  
  /** 
   * Subject/tags for this specific photo
   * Unlike the tags array, this is a single subject line
   */
  subject?: string;
  
  /** Frame number on roll (for film photography) */
  frameNumber?: string;
  
  // ═══════════════════════════════════════════════════════════
  // EXIF DATA
  // Technical metadata from the image file itself
  // ═══════════════════════════════════════════════════════════
  
  /** ISO sensitivity (e.g., 100, 400, 1600) */
  iso?: number;
  
  /** Aperture as f-number (e.g., 2.8, 5.6, 11) */
  aperture?: number;
  
  /** Shutter speed as string (e.g., "1/250", "2\"") */
  shutterSpeed?: string;
  
  /** Lens model or description */
  lens?: string;
  
  /** Whether flash was fired */
  flash?: boolean;
  
  /** White balance setting */
  whiteBalance?: string;
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Collection                                               ║
 * ║  A group of photos organized by the user                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * Collections are user-created groups of photos. Unlike tags,
 * they're explicitly created and named.
 * 
 * Examples:
 * - "Summer 2024"
 * - "Portfolio: Landscapes"
 * - "To Develop"
 */
export interface Collection {
  id: string;
  name: string;
  photoIds: string[];
  createdAt: string;
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FotoFloState                                             ║
 * ║  The complete application state                            ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * This interface defines the shape of the entire application state.
 * It's used by the store to manage all reactive data.
 * 
 * STATE DESIGN PRINCIPLES:
 * - Derived data lives in computed properties, not state
 * - Filters are nullable (null = no filter applied)
 * - Search and filters are separate (search text vs category filters)
 */
export interface FotoFloState {
  /** All photos in the library */
  photos: Photo[];
  
  /** User-created collections */
  collections: Collection[];
  
  /** 
   * Currently selected photo IDs
   * Stored as Set for O(1) lookups and easy additions/removals
   */
  selectedIds: Set<string>;
  
  /** 
   * Current view mode
   * - 'all': Show all photos
   * - 'favorites': Show only favorited photos
   * - 'collection': Show photos in activeCollectionId
   */
  activeView: 'all' | 'favorites' | 'collection';
  
  /** ID of collection being viewed (null if not in collection view) */
  activeCollectionId: string | null;
  
  /** 
   * Full-text search query
   * Searches across filename, subject, film stock, camera
   */
  searchQuery: string;
  
  /** Sort order for the photo grid */
  sortBy: 'date' | 'rating' | 'name';
  
  // ═══════════════════════════════════════════════════════════
  // FILTERS
  // Each filter is nullable - null means "show all"
  // ═══════════════════════════════════════════════════════════
  
  filterFilmStock: string | null;
  filterCamera: string | null;
  filterRating: number | null;
  filterSubject: string | null;
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ImportedPhoto                                            ║
 * ║  Temporary type for photos being imported                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * This is a "transit" type used only during the import process.
 * It includes the File object and optional FileSystemFileHandle,
 * which aren't needed after import completes.
 * 
 * After import, photos become plain Photo objects stored in the state.
 */
export interface ImportedPhoto {
  id: string;
  fileName: string;
  filePath: string;
  dateTaken: string;
  fileSize?: number;
  file: File;
  
  /**
   * Optional file handle for folder imports
   * 
   * WHY STORE THE HANDLE?
   * - Enables re-export with original quality
   * - User doesn't need to re-select files
   * - Stored in IndexedDB for persistence across sessions
   */
  handle?: FileSystemFileHandle;
  
  // EXIF fields (same as Photo)
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  lens?: string;
  flash?: boolean;
  whiteBalance?: string;
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  EXIFData                                                 ║
 * ║  Raw EXIF metadata extracted from image files              ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * EXIF (Exchangeable Image File Format) is metadata embedded
 * in image files by cameras and editing software.
 * 
 * COMMON EXIF USES:
 * - Automatic date sorting (by dateTaken)
 * - Learning camera preferences (which cameras you use most)
 * - Backing up shot data (ISO, aperture, shutter speed)
 * 
 * NOTE: Not all images have EXIF data, especially:
 * - Screenshots
 * - Web images
 * - Images edited and exported without EXIF preservation
 */
export interface EXIFData {
  dateTaken?: string;
  camera?: string;
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  lens?: string;
  flash?: boolean;
  whiteBalance?: string;
}
