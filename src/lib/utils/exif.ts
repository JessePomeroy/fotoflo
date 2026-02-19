import type { Photo } from '$lib/stores/fotoflo.svelte';

/**
 * Read EXIF metadata from a JPEG file
 * 
 * EXIF (Exchangeable Image File Format) stores metadata directly
 * in the image file - camera make/model, date taken, exposure settings, etc.
 * 
 * This parser handles the most useful fields for film photographers:
 * - Camera model (from IFD0)
 * - DateTimeOriginal (from EXIF IFD)
 * 
 * JPEG Structure (simplified):
 * - SOI (Start of Image): 0xFFD8
 * - APP1 (Application Segment 1): Contains EXIF/TIFF data
 * - Other markers (SOF, DQT, DHT, etc.)
 * - EOI (End of Image): 0xFFD9
 * 
 * @param file - The JPEG file to parse
 * @returns Partial Photo object with extracted EXIF data
 */
export async function readEXIF(file: File): Promise<Partial<Photo>> {
  const result: Partial<Photo> = {};

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // Check for JPEG
    if (view.getUint16(0) !== 0xFFD8) return result;

    let offset = 2;
    while (offset < buffer.byteLength - 2) {
      const marker = view.getUint16(offset);

      // APP1 marker (EXIF)
      if (marker === 0xFFE1) {
        const length = view.getUint16(offset + 2);
        const exifData = new DataView(buffer, offset + 4, length - 2);

        // Check for "Exif\0\0"
        if (exifData.getUint32(0) === 0x45786966 && exifData.getUint16(4) === 0x0000) {
          const tiff = new DataView(buffer, offset + 10);
          const littleEndian = tiff.getUint16(0) === 0x4949;
          const ifdOffset = tiff.getUint32(4, littleEndian);

          // Read IFD0
          const numTags = tiff.getUint16(ifdOffset, littleEndian);
          for (let i = 0; i < numTags; i++) {
            const tagOffset = ifdOffset + 2 + i * 12;
            const tag = tiff.getUint16(tagOffset, littleEndian);

            // Model (camera) - tag 0x0110
            if (tag === 0x0110) {
              const valueOffset = tiff.getUint32(tagOffset + 8, littleEndian);
              const model = readString(tiff, valueOffset);
              if (model) result.camera = model;
            }
          }

          // Try to read EXIF IFD for date
          const exifIFDOffset = tiff.getUint32(ifdOffset + 4, littleEndian);
          if (exifIFDOffset) {
            const exifNumTags = tiff.getUint16(exifIFDOffset, littleEndian);
            for (let i = 0; i < exifNumTags; i++) {
              const tagOffset = exifIFDOffset + 2 + i * 12;
              const tag = tiff.getUint16(tagOffset, littleEndian);

              // DateTimeOriginal - tag 0x9003
              if (tag === 0x9003) {
                const valueOffset = tiff.getUint32(tagOffset + 8, littleEndian);
                const dateStr = readString(tiff, valueOffset);
                if (dateStr) {
                  // Parse "YYYY:MM:DD HH:MM:SS"
                  const [date, time] = dateStr.split(' ');
                  const [y, m, d] = date.split(':');
                  const [h, min, s] = time.split(':');
                  result.dateTaken = new Date(+y, +m - 1, +d, +h, +min, +s).toISOString();
                }
              }
            }
          }
        }
        break;
      }

      if ((marker & 0xFF00) !== 0xFF00) break;
      offset += 2 + view.getUint16(offset + 2);
    }
  } catch (e) {
    // EXIF parsing failed, ignore
  }

  return result;
}

/**
 * Read a null-terminated string from a DataView at the given offset
 */
export function readString(view: DataView, offset: number): string {
  try {
    let end = offset;
    while (view.getUint8(end) !== 0) end++;
    const bytes = new Uint8Array(view.buffer, offset, end - offset);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}
