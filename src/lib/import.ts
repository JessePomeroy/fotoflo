/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                                                              ║
 * ║   FotoFlo Import Module                                      ║
 * ║   Unified photo import from files and folders               ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * This module handles all photo imports into the FotoFlo library.
 * It abstracts the differences between:
 * - File picker imports (individual files)
 * - Folder imports (directory with FileSystemAccess API)
 * - Drag-and-drop imports
 * 
 * IMPORT FLOW:
 * 1. Receive File objects or FileSystemDirectoryHandle
 * 2. Filter for valid image types
 * 3. Check for duplicates (filename + size)
 * 4. Extract EXIF metadata
 * 5. Create ImportedPhoto objects
 * 6. Return to caller for storage
 */

// ═══════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════

import { browser } from '$app/environment';
import { readEXIF } from '$lib/utils/exif';
import type { ImportedPhoto, EXIFData } from '$lib/types';

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a unique ID for a new photo
 * 
 * FORMAT: {timestamp}-{random9chars}
 * 
 * WHY THIS FORMAT?
 * - Timestamp provides rough ordering (earlier imports = smaller IDs)
 * - Random suffix prevents collisions if multiple imports happen same ms
 * - String format works in URLs and storage
 * 
 * EXAMPLE: "1708361234567-abc123def"
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate that a file is an image type we support
 * 
 * SUPPORTED FORMATS:
 * - JPEG/JPG (most common photo format)
 * - PNG (common for edited/exported images)
 * - GIF (supported but rare for photos)
 * - WebP (modern, efficient format)
 * - TIFF (high-quality, large files)
 * 
 * REJECTED FORMATS:
 * - HEIC/HEIF (iPhone default, requires conversion)
 * - AVIF (too new, limited support)
 * - Video formats
 * - Documents, archives, etc.
 */
function isImageFile(file: File): boolean {
  return /^image\/(jpeg|png|gif|webp|tiff?)$/i.test(file.type);
}

/**
 * Create a duplicate-detection key from filename and size
 * 
 * KEY FORMAT: {lowercase-filename}-{filesize}
 * 
 * WHY BOTH NAME AND SIZE?
 * - Same filename but different size = different photo
 * - Same photo renamed = same size, different name
 * - Both together = high confidence duplicate detection
 * 
 * EXAMPLE:
 * - "photo.jpg-1024000"
 * - "PHOTO.JPG-1024000" → same key (case-insensitive)
 */
function getFileKey(name: string, size: number): string {
  return `${name.toLowerCase()}-${size}`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN IMPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Process a single file into an ImportedPhoto
 * 
 * This function:
 * 1. Validates the file is an image
 * 2. Generates a unique ID
 * 3. Extracts EXIF data
 * 4. Returns an ImportedPhoto object
 * 
 * NOTE: The File object is NOT stored - it's used during import
 * to generate a thumbnail, then discarded. The actual file data
 * is accessed via FileSystemFileHandle for folder imports.
 */
async function processFile(
  file: File, 
  handle?: FileSystemFileHandle
): Promise<ImportedPhoto | null> {
  // Skip non-image files
  if (!isImageFile(file)) return null;
  
  const id = generateId();
  
  // Use EXIF date if available, fall back to file modification time
  let dateTaken = file.lastModified 
    ? new Date(file.lastModified).toISOString() 
    : new Date().toISOString();
  
  let exifData: EXIFData = {};
  
  // Extract EXIF metadata
  try {
    const exif = await readEXIF(file);
    if (exif?.dateTaken) dateTaken = exif.dateTaken;
    exifData = {
      iso: exif?.iso,
      aperture: exif?.aperture,
      shutterSpeed: exif?.shutterSpeed,
      lens: exif?.lens,
      flash: exif?.flash,
      whiteBalance: exif?.whiteBalance,
      camera: exif?.camera
    };
  } catch (e) {
    // EXIF reading failed - not all images have EXIF data
    // This is normal, so we silently continue
  }
  
  return {
    id,
    fileName: file.name,
    filePath: file.name,
    fileSize: file.size,
    dateTaken,
    file,
    handle,
    ...exifData
  };
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  importFromFiles                                           ║
 * ║  Import photos from a FileList (file picker or drag-drop)   ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * @param files - FileList or array of File objects
 * @param existingKeys - Set of already-imported file keys for duplicate detection
 * @param onProgress - Optional callback for progress updates (current, total)
 * 
 * @returns Array of ImportedPhoto objects ready for storage
 * 
 * DUPLICATE HANDLING:
 * Files are checked against existingKeys (created from getExistingFileKeys).
 * Duplicates are silently skipped - the user isn't notified since they
 * already have this photo in their library.
 */
export async function importFromFiles(
  files: FileList | File[],
  existingKeys: Set<string>,
  onProgress?: (current: number, total: number) => void
): Promise<ImportedPhoto[]> {
  if (!browser) return [];
  
  const fileArray = Array.from(files);
  const newPhotos: ImportedPhoto[] = [];
  
  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    const key = getFileKey(file.name, file.size);
    
    // Skip duplicates
    if (existingKeys.has(key)) continue;
    
    const photo = await processFile(file);
    if (photo) {
      newPhotos.push(photo);
      existingKeys.add(key);
    }
    
    // Report progress (useful for UI loading indicators)
    onProgress?.(i + 1, fileArray.length);
  }
  
  return newPhotos;
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  importFromFolder                                          ║
 * ║  Import photos from a directory using FileSystemAccess API   ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * This uses the browser's FileSystemDirectoryHandle API which:
 * - Lets users pick a folder once
 * - Stores the handle for future access (with permission)
 * - Enables re-export with original quality
 * 
 * @param dirHandle - FileSystemDirectoryHandle from showDirectoryPicker
 * @param existingKeys - Set of already-imported file keys
 * @param onProgress - Optional progress callback
 * 
 * @returns Object with:
 *   - photos: Array of ImportedPhoto objects
 *   - skipped: Number of duplicate files found
 * 
 * PERMISSIONS:
 * The handle is stored in IndexedDB but re-validated on each use.
 * The browser will prompt for permission if needed.
 */
export async function importFromFolder(
  dirHandle: FileSystemDirectoryHandle,
  existingKeys: Set<string>,
  onProgress?: (current: number, total: number) => void
): Promise<{ photos: ImportedPhoto[]; skipped: number }> {
  if (!browser) return { photos: [], skipped: 0 };
  
  const newPhotos: ImportedPhoto[] = [];
  let skipped = 0;
  let processed = 0;
  
  // First pass: collect all file entries
  // We need to know total count for progress reporting
  const entries: { file: File; handle: FileSystemFileHandle }[] = [];
  
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const handle = entry as FileSystemFileHandle;
      try {
        const file = await handle.getFile();
        if (isImageFile(file)) {
          entries.push({ file, handle });
        }
      } catch (e) {
        // Skip files we can't read (permission issues, corrupted files, etc.)
      }
    }
  }
  
  // Second pass: process each file
  for (const { file, handle } of entries) {
    const key = getFileKey(file.name, file.size);
    
    if (existingKeys.has(key)) {
      skipped++;
      processed++;
      onProgress?.(processed, entries.length);
      continue;
    }
    
    const photo = await processFile(file, handle);
    if (photo) {
      newPhotos.push(photo);
      existingKeys.add(key);
    }
    
    processed++;
    onProgress?.(processed, entries.length);
  }
  
  return { photos: newPhotos, skipped };
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  getExistingFileKeys                                       ║
 * ║  Build duplicate-detection keys from existing photos         ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * Creates a Set of file keys for all photos currently in the library.
 * Used to detect duplicates when importing new photos.
 * 
 * @param photos - Array of photo objects with fileName and fileSize
 * @returns Set of file keys (format: "filename-size")
 */
export function getExistingFileKeys(photos: { fileName: string; fileSize?: number }[]): Set<string> {
  return new Set(
    photos.map(p => getFileKey(p.fileName, p.fileSize || 0))
  );
}
