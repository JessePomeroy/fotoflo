/**
 * Core types for FotoFlo
 */

export interface Photo {
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

export interface Collection {
  id: string;
  name: string;
  photoIds: string[];
  createdAt: string;
}

export interface FotoFloState {
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

export interface ImportedPhoto {
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
}

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
