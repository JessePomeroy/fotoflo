import type { Photo } from '$lib/stores/fotoflo.svelte';
import ExifReader from 'exifreader';
import piexif from 'piexifjs';

/**
 * Read EXIF metadata from an image file
 * Uses exifreader library for comprehensive EXIF/XMP/IPTC support
 */
export async function readEXIF(file: File): Promise<Partial<Photo>> {
  const result: Partial<Photo> = {};

  try {
    const tags = await ExifReader.load(file);

    // Date taken
    if (tags['DateTimeOriginal']) {
      const dateStr = tags['DateTimeOriginal'].description;
      if (dateStr && dateStr.includes(':')) {
        // Format: "YYYY:MM:DD HH:MM:SS"
        const [date, time] = dateStr.split(' ');
        const [y, m, d] = date.split(':');
        const [h, min, s] = time.split(':');
        result.dateTaken = new Date(+y, +m - 1, +d, +h, +min, +s).toISOString();
      }
    }

    // Camera
    if (tags['Model']) {
      result.camera = tags['Model'].description || tags['Model'].value;
    }

    // ISO
    if (tags['ISOSpeedRatings']) {
      result.iso = parseInt(tags['ISOSpeedRatings'].description || tags['ISOSpeedRatings'].value);
    }

    // Aperture (f-number)
    if (tags['FNumber']) {
      const val = tags['FNumber'].description || tags['FNumber'].value;
      result.aperture = parseFloat(val);
    }

    // Shutter speed (exposure time)
    if (tags['ExposureTime']) {
      result.shutterSpeed = tags['ExposureTime'].description || String(tags['ExposureTime'].value);
    }

    // Lens model
    if (tags['LensModel']) {
      result.lens = tags['LensModel'].description || tags['LensModel'].value;
    }

    // Flash
    if (tags['Flash']) {
      const flashDesc = tags['Flash'].description || '';
      result.flash = flashDesc.toLowerCase().includes('fired');
    }

    // White balance
    if (tags['WhiteBalance']) {
      result.whiteBalance = tags['WhiteBalance'].description || tags['WhiteBalance'].value;
    }

  } catch (e) {
    // EXIF parsing failed, ignore
    console.warn('EXIF read failed:', e);
  }

  return result;
}

/**
 * Write EXIF metadata to a JPEG file
 * Uses piexifjs to embed EXIF data into JPEGs
 */
export async function writeEXIF(file: File, photo: Photo): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  // Build EXIF object
  const exifObj: any = {
    '0th': {},
    'Exif': {},
    'GPS': {},
    '1st': {},
    'thumbnail': null
  };

  // Camera
  if (photo.camera) {
    exifObj['0th'][piexif.ImageIFD.Make] = photo.camera.split(' ')[0] || '';
    exifObj['0th'][piexif.ImageIFD.Model] = photo.camera;
  }

  // Date taken
  if (photo.dateTaken) {
    const date = new Date(photo.dateTaken);
    const exifDate = date.toISOString().replace(/[-:]/g, ':').split('.')[0];
    exifObj['0th'][piexif.ImageIFD.DateTime] = exifDate;
    exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = exifDate;
  }

  // Film stock - write as ImageDescription or UserComment
  if (photo.filmStock) {
    exifObj['0th'][piexif.ImageIFD.ImageDescription] = photo.filmStock;
  }

  // Subject - write as XPComment or Artist
  if (photo.subject) {
    exifObj['0th'][piexif.ImageIFD.Artist] = photo.subject;
  }

  // Rating - XMP rating (piexif doesn't support XMP, so use Rating tag)
  if (photo.rating > 0) {
    exifObj['0th'][piexif.ImageIFD.Rating] = photo.rating;
  }

  // Insert EXIF into JPEG
  const exifStr = piexif.dump(exifObj);
  const newJpeg = piexif.insert(exifStr, base64);

  return base64ToBlob(newJpeg, 'image/jpeg');
}

// Helper functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
