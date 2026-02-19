# FotoFlo

A local-first film photography organizer that runs entirely in your browser. No cloud, no subscription, no tracking — your photos and metadata stay on your device.

## Features

- **Local-first**: All data stored in browser IndexedDB — your photos never leave your device
- **Bulk import**: Import entire folders of film scans at once
- **Bulk metadata**: Add film stock, camera, and subject to multiple photos at once
- **Smart export**: Export photos with renamed files based on metadata (e.g., `portra400-leicam6-rollercoaster-001.jpg`)
- **Filtering**: Filter by film stock, camera, subject, or rating
- **Favorites**: Mark your favorite photos
- **Backup & restore**: Export metadata as JSON for safekeeping, import later if needed

## Getting Started

### Prerequisites

- A modern browser (Chrome, Firefox, Safari, Edge)
- No server required — runs entirely in the browser

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Deploying

This app works great on Vercel, Netlify, or any static host:

1. Push to GitHub
2. Import in Vercel (or your host of choice)
3. Deploy — it's that simple!

## How It Works

### Data Storage

FotoFlo uses **IndexedDB** (a browser database) to store:
- Photo thumbnails (compressed images for display)
- File handles (references to original files)
- Metadata (film stock, camera, subject, rating, etc.)

This means your data persists across browser sessions but stays entirely local.

### File System Access

The app uses the **File System Access API** to:
- Read photos from folders you select
- Export renamed photos to a destination folder
- Re-link originals if you re-import from a different folder

### Metadata Schema

Each photo stores:
```typescript
{
  id: string;           // Unique identifier
  fileName: string;     // Original filename
  filePath: string;     // Path within source folder
  fileSize: number;     // File size in bytes
  dateTaken: string;    // EXIF date or file modification date
  importedAt: string;   // When imported to FotoFlo
  rating: number;        // 0-5 star rating
  isFavorite: boolean;   // Favorite flag
  tags: string[];        // Tags (future feature)
  filmStock?: string;    // e.g., "Portra 400"
  camera?: string;       // e.g., "Leica M6"
  subject?: string;      // e.g., "rollercoaster"
  frameNumber?: string;  // e.g., "001"
}
```

## Tech Stack

- **Svelte 5** with runes for reactive state management
- **IndexedDB** for local data persistence
- **File System Access API** for reading/writing files
- **SvelteKit** for routing and build
- **PWA** ready with service worker

## Privacy

FotoFlo is designed with privacy first:
- No analytics, no tracking, no cookies
- All data stays in your browser
- No server communication (except for hosting the app itself)

## License

MIT
