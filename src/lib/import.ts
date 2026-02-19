/**
 * Unified photo import module
 * Handles file imports from various sources (file picker, folder, drag-drop)
 */

import { browser } from '$app/environment';
import { readEXIF } from '$lib/utils/exif';
import type { ImportedPhoto, EXIFData } from '$lib/types';

/**
 * Generate a unique ID for a photo
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if file is a supported image type
 */
function isImageFile(file: File): boolean {
  return /^image\/(jpeg|png|gif|webp|tiff?)$/i.test(file.type);
}

/**
 * Create a duplicate detection key from file name and size
 */
function getFileKey(name: string, size: number): string {
  return `${name.toLowerCase()}-${size}`;
}

/**
 * Process a single file into an ImportedPhoto
 */
async function processFile(
  file: File, 
  handle?: FileSystemFileHandle
): Promise<ImportedPhoto | null> {
  if (!isImageFile(file)) return null;
  
  const id = generateId();
  let dateTaken = file.lastModified 
    ? new Date(file.lastModified).toISOString() 
    : new Date().toISOString();
  
  let exifData: EXIFData = {};
  
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
    // EXIF read failed, continue without it
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
 * Import photos from a FileList (file picker or drag-drop)
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
    
    if (existingKeys.has(key)) continue;
    
    const photo = await processFile(file);
    if (photo) {
      newPhotos.push(photo);
      existingKeys.add(key);
    }
    
    onProgress?.(i + 1, fileArray.length);
  }
  
  return newPhotos;
}

/**
 * Import photos from a directory handle (folder picker)
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
  
  // First, collect all file entries
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
        // Skip files we can't read
      }
    }
  }
  
  // Then process them
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
 * Get existing file keys from photos for duplicate detection
 */
export function getExistingFileKeys(photos: { fileName: string; fileSize?: number }[]): Set<string> {
  return new Set(
    photos.map(p => getFileKey(p.fileName, p.fileSize || 0))
  );
}
