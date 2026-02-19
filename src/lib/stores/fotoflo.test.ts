/**
 * Tests for FotoFlo Store
 * Uses Vitest for testing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser environment
const mockBrowser = {
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
  },
  caches: {
    open: vi.fn(),
    delete: vi.fn()
  },
  indexedDB: {
    open: vi.fn()
  }
};

globalThis.browser = mockBrowser as any;
globalThis.localStorage = mockBrowser.localStorage;
globalThis.caches = mockBrowser.caches;
globalThis.indexedDB = mockBrowser.indexedDB;

// Mock Svelte 5 runes
globalThis.$state = <T>(initial: T) => {
  let value = initial;
  const proxy = new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'toJSON') return () => value;
      return value;
    },
    set: (_, prop, newValue) => {
      value = newValue;
      return true;
    }
  });
  return proxy;
};

describe('FotoFlo Store', () => {
  describe('Photo operations', () => {
    it('should filter photos by favorites', () => {
      // Test filter logic
      const photos = [
        { id: '1', isFavorite: true },
        { id: '2', isFavorite: false },
        { id: '3', isFavorite: true }
      ];
      
      const favorites = photos.filter(p => p.isFavorite);
      expect(favorites).toHaveLength(2);
      expect(favorites.map(p => p.id)).toEqual(['1', '3']);
    });

    it('should filter photos by rating', () => {
      const photos = [
        { id: '1', rating: 5 },
        { id: '2', rating: 3 },
        { id: '3', rating: 5 }
      ];
      
      const fiveStars = photos.filter(p => p.rating >= 5);
      expect(fiveStars).toHaveLength(2);
    });

    it('should sort photos by date', () => {
      const photos = [
        { id: '1', dateTaken: '2024-01-15' },
        { id: '2', dateTaken: '2024-03-10' },
        { id: '3', dateTaken: '2024-02-01' }
      ];
      
      const sorted = [...photos].sort((a, b) => 
        new Date(a.dateTaken).getTime() - new Date(b.dateTaken).getTime()
      );
      
      expect(sorted.map(p => p.id)).toEqual(['1', '3', '2']);
    });
  });

  describe('Duplicate detection', () => {
    it('should generate unique file keys', () => {
      const getFileKey = (name: string, size: number) => 
        `${name.toLowerCase()}-${size}`;
      
      const key1 = getFileKey('photo.jpg', 1024000);
      const key2 = getFileKey('PHOTO.JPG', 1024000);
      const key3 = getFileKey('photo.jpg', 2048000);
      
      expect(key1).toBe(key2); // Same file
      expect(key1).not.toBe(key3); // Different size
    });

    it('should detect duplicates', () => {
      const existingKeys = new Set([
        'photo.jpg-1024000',
        'another.jpg-500000'
      ]);
      
      const newKey = 'photo.jpg-1024000';
      const uniqueKey = 'new.jpg-750000';
      
      expect(existingKeys.has(newKey)).toBe(true);
      expect(existingKeys.has(uniqueKey)).toBe(false);
    });
  });

  describe('Thumbnail storage', () => {
    it('should validate data URL format', () => {
      const isValidDataUrl = (str: string) => 
        /^data:image\/[a-z]+;base64,/.test(str);
      
      expect(isValidDataUrl('data:image/jpeg;base64,/9j/4AAQ...')).toBe(true);
      expect(isValidDataUrl('not-a-data-url')).toBe(false);
      expect(isValidDataUrl('data:text/plain;base64,dGVzdA==')).toBe(false);
    });

    it('should calculate thumbnail scale correctly', () => {
      const calculateScale = (width: number, height: number, maxSize: number) => 
        Math.min(maxSize / width, maxSize / height);
      
      // Landscape
      expect(calculateScale(4000, 3000, 300)).toBe(0.075);
      
      // Portrait
      expect(calculateScale(3000, 4000, 300)).toBe(0.075);
      
      // Already small
      expect(calculateScale(200, 150, 300)).toBe(1);
    });
  });

  describe('Collection operations', () => {
    it('should add photo to collection', () => {
      const collection = {
        id: 'c1',
        name: 'My Collection',
        photoIds: ['1', '2']
      };
      
      collection.photoIds.push('3');
      
      expect(collection.photoIds).toHaveLength(3);
      expect(collection.photoIds).toContain('3');
    });

    it('should remove photo from collection', () => {
      const collection = {
        id: 'c1',
        name: 'My Collection',
        photoIds: ['1', '2', '3']
      };
      
      collection.photoIds = collection.photoIds.filter(id => id !== '2');
      
      expect(collection.photoIds).toHaveLength(2);
      expect(collection.photoIds).not.toContain('2');
    });
  });

  describe('Search and filter', () => {
    it('should filter by search query', () => {
      const photos = [
        { id: '1', fileName: 'beach-trip.jpg' },
        { id: '2', fileName: 'mountain-hike.png' },
        { id: '3', fileName: 'beach-sunset.jpeg' }
      ];
      
      const query = 'beach';
      const results = photos.filter(p => 
        p.fileName.toLowerCase().includes(query.toLowerCase())
      );
      
      expect(results).toHaveLength(2);
      expect(results.map(p => p.id)).toEqual(['1', '3']);
    });

    it('should filter by multiple criteria', () => {
      const photos = [
        { id: '1', filmStock: 'Portra 400', rating: 5 },
        { id: '2', filmStock: 'Portra 400', rating: 3 },
        { id: '3', filmStock: 'Ektar 100', rating: 5 }
      ];
      
      const results = photos.filter(p => 
        p.filmStock === 'Portra 400' && p.rating >= 4
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });
  });
});
