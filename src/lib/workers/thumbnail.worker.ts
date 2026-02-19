/**
 * Thumbnail Worker - Off-main-thread thumbnail generation
 * 
 * This worker handles thumbnail generation to keep the main thread responsive
 * during large imports. It receives file data and returns thumbnail data URLs.
 */

// Handle incoming messages
self.onmessage = async (event: MessageEvent) => {
  const { id, fileData, fileType, maxSize = 300, quality = 0.7 } = event.data;

  try {
    // Convert ArrayBuffer to Blob
    const blob = new Blob([fileData], { type: fileType });
    
    // Create bitmap from blob
    const bitmap = await createImageBitmap(blob);
    
    // Calculate scaling
    const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height);
    const width = Math.floor(bitmap.width * scale);
    const height = Math.floor(bitmap.height * scale);
    
    // Create offscreen canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    // Draw and resize
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    
    // Convert to data URL
    const dataUrl = canvas.convertToBlob({
      type: 'image/jpeg',
      quality
    }).then(blob => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    });
    
    const result = await dataUrl;
    
    self.postMessage({ id, success: true, dataUrl: result });
  } catch (error) {
    self.postMessage({ 
      id, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

export {};
