# FotoFlo Development Guide

A comprehensive guide to building and extending the FotoFlo photo management application.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Getting Started](#getting-started)
5. [Project Structure](#project-structure)
6. [Key Concepts](#key-concepts)
7. [Adding Features](#adding-features)
8. [Testing](#testing)
9. [Deployment](#deployment)

---

## Overview

FotoFlo is a local-first photo management application built with modern web technologies. It runs entirely in the browser, storing photos and metadata locally using the browser's storage APIs (LocalStorage, IndexedDB, Cache API).

### Core Features

- **Photo Import**: Import from file picker or folder selection
- **Metadata Management**: Add film stock, camera, subject, ratings
- **Collections**: Group photos into collections
- **Full-Res Export**: Export with metadata preservation
- **Offline-First**: Works without internet connection

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Svelte 5 + SvelteKit | UI framework and routing |
| **State Management** | Svelte 5 $state() | Reactive state |
| **Styling** | CSS + NeoDialog | Custom glass-morphism UI |
| **Storage** | LocalStorage + IndexedDB + Cache API | Data persistence |
| **EXIF** | exifreader + piexifjs | Metadata extraction/writing |
| **Icons** | Unicode emojis | Lightweight icons |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FotoFlo App                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │   Sidebar   │    │  PhotoGrid  │    │   Toolbar   │   │
│  │  (filters)  │    │   (display) │    │  (actions)  │   │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘   │
│         │                   │                   │            │
│         └───────────────────┼───────────────────┘            │
│                             │                                │
│                    ┌────────▼────────┐                       │
│                    │   +page.svelte │                       │
│                    │  (coordination) │                       │
│                    └────────┬────────┘                       │
│                             │                                │
│                    ┌────────▼────────┐                       │
│                    │ fotoflo.svelte.ts│                      │
│                    │    (store)      │                       │
│                    └────────┬────────┘                       │
│                             │                                │
│  ┌─────────────────────────┼─────────────────────────┐    │
│  │                         │                         │    │
│  ▼                         ▼                         ▼    │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│ │  LocalStorage  │  │   IndexedDB    │  │   Cache API    ││
│ │  (metadata)    │  │  (blobs, etc)  │  │  (thumbnails) ││
│ └────────────────┘  └────────────────┘  └────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User imports photos via file picker or folder
2. Photos are processed (EXIF extraction, thumbnail generation)
3. Metadata stored in LocalStorage
4. Thumbnails stored in Cache API (primary) or IndexedDB (fallback)
5. File handles stored in IndexedDB for re-export

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
cd fotoflo
npm install
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
npm run preview
```

---

## Project Structure

```
fotoflo/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── PhotoGrid.svelte    # Photo grid display
│   │   │   ├── Toolbar.svelte      # Action toolbar
│   │   │   ├── Sidebar.svelte      # Filters and collections
│   │   │   ├── Viewer.svelte       # Single photo view
│   │   │   ├── ImportModal.svelte   # Import modal
│   │   │   └── BulkMetaModal.svelte # Bulk edit modal
│   │   ├── stores/
│   │   │   ├── fotoflo.svelte.ts   # Main store (750+ lines)
│   │   │   └── fotoflo.test.ts      # Store tests
│   │   ├── workers/
│   │   │   └── thumbnail.worker.ts  # Off-thread thumbnail gen
│   │   ├── utils/
│   │   │   └── exif.ts              # EXIF read/write
│   │   ├── import.ts                # Unified import module
│   │   ├── types.ts                 # Centralized types
│   │   └── index.ts
│   ├── routes/
│   │   └── +page.svelte            # Main app page
│   └── app.html
├── static/
├── package.json
├── svelte.config.js
└── tsconfig.json
```

---

## Key Concepts

### 1. State Management with Svelte 5

FotoFlo uses Svelte 5's reactive system:

```typescript
// Create reactive state
let count = $state(0);

// Create derived value
let double = $derived(count * 2);

// Update state (components auto-update)
function increment() {
  count++;
}
```

**Key files:**
- `src/lib/stores/fotoflo.svelte.ts` - Main state management

### 2. Photo Import Flow

```
File Picker / Folder
        │
        ▼
┌───────────────────┐
│   import.ts       │  ← Unified import module
│  - Validate files │     Handles both file and folder imports
│  - Extract EXIF  │
│  - Detect dupes │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ fotoflo.svelte.ts │  ← Store receives photos
│  - Save metadata  │     Stores in LocalStorage
│  - Generate thumb │     Generates thumbnails
│  - Store handles │     Stores file handles
└───────────────────┘
```

**Key files:**
- `src/lib/import.ts` - Import logic
- `src/lib/stores/fotoflo.svelte.ts` - Storage and thumbnail generation

### 3. Thumbnail Storage Strategy

FotoFlo uses a tiered storage approach:

```typescript
// 1. Try Cache API (primary - fast, native blobs)
if (hasCacheAPI()) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(url, new Response(blob));
  return;
}

// 2. Fallback to IndexedDB
await saveToIndexedDB(id, dataUrl);
```

**Benefits:**
- Cache API is faster for blob storage
- Better quota management
- Works with service workers
- IndexedDB fallback ensures compatibility

**Key files:**
- `src/lib/stores/fotoflo.svelte.ts` - Storage logic (search for `saveThumbnail`)
- `src/lib/workers/thumbnail.worker.ts` - Off-thread generation

### 4. EXIF Handling

EXIF data is read during import and written during export:

```typescript
// Reading EXIF
import { readEXIF } from '$lib/utils/exif';
const exif = await readEXIF(file);
// exif = { iso: 400, aperture: 2.8, camera: 'Leica M6', ... }

// Writing EXIF
import { writeEXIF } from '$lib/utils/exif';
const exported = await writeEXIF(file, photo);
```

**Key files:**
- `src/lib/utils/exif.ts` - EXIF utilities

### 5. File System Access API

For folder imports, FotoFlo uses the File System Access API:

```typescript
// Open folder picker
const dirHandle = await showDirectoryPicker();

// Store handle for later access
await saveFileHandle(photoId, dirHandle);

// Later, get the file with permission check
const file = await handle.getFile();
```

**Benefits:**
- User selects folder once
- Persistent access across sessions
- Re-export with original quality

---

## Adding Features

### Adding a New Filter

1. Add the filter field to `FotoFloState` in `types.ts`:
   ```typescript
   export interface FotoFloState {
     filterNewField: string | null;
     // ...
   }
   ```

2. Add the setter in `fotoflo.svelte.ts`:
   ```typescript
   function setFilterNewField(value: string | null) {
     state.filterNewField = value;
   }
   ```

3. Add to exports:
   ```typescript
   return {
     // ...
     setFilterNewField,
     // ...
   };
   ```

4. Add filter logic in `getFilteredPhotos()`:
   ```typescript
   if (state.filterNewField) {
     result = result.filter(p => p.field === state.filterNewField);
   }
   ```

5. Update the Sidebar component to use the filter

### Adding a New Metadata Field

1. Add to `Photo` interface in `types.ts`:
   ```typescript
   export interface Photo {
     // ... existing fields
     newField?: string;
   }
   ```

2. Update the metadata modal (`BulkMetaModal.svelte`)

3. Update export logic in `writeEXIF()` if needed

### Adding a New Collection Type

1. Collections are already extensible via the `tags` array on `Photo`
2. For a completely new grouping system, create a new interface similar to `Collection`

---

## Testing

### Running Tests

```bash
npm run test          # Run all tests
npm run test:watch   # Watch mode
```

### Writing Tests

Tests use Vitest and follow this pattern:

```typescript
// src/lib/stores/fotoflo.test.ts
describe('Photo Operations', () => {
  it('should filter photos correctly', () => {
    const photos = [
      { id: '1', rating: 5 },
      { id: '2', rating: 3 },
    ];
    
    const highRated = photos.filter(p => p.rating >= 5);
    expect(highRated).toHaveLength(1);
  });
});
```

**Key test files:**
- `src/lib/stores/fotoflo.test.ts` - Store logic tests
- `src/lib/import.test.ts` - Import module tests

---

## Deployment

### Build

```bash
npm run build
```

This creates a production build in `.svelte-kit/output`.

### Environment

The app is designed to run in any modern browser. No server-side code is required.

### Browser Requirements

- Chrome 70+ (full support)
- Firefox 71+ (full support)
- Safari 16.4+ (full support)
- Edge 79+ (full support)

Features requiring:
- **File System Access API**: Chrome, Edge (folder import)
- **Cache API**: All modern browsers
- **IndexedDB**: All modern browsers

---

## Common Patterns

### 1. Async Operations with Error Handling

```typescript
async function exampleOperation() {
  try {
    const result = await someAsyncCall();
    return result;
  } catch (err) {
    console.warn('Operation failed:', err);
    // Fallback or rethrow as needed
    return null;
  }
}
```

### 2. Derived State

```typescript
// Computed automatically - no manual updates needed
let photos = $state([]);
let photoCount = $derived(photos.length);

function deletePhoto(id: string) {
  photos = photos.filter(p => p.id !== id);
// photoCount updates automatically!
}
```

### 3. Worker Communication

```typescript
// Main thread
const worker = new Worker(new URL('$lib/workers/thumb.worker.ts', import.meta.url), {
  type: 'module'
});

await new Promise((resolve, reject) => {
  const handler = (e) => {
    if (e.data.id === myId) {
      worker.removeEventListener('message', handler);
      resolve(e.data.result);
    }
  };
  worker.addEventListener('message', handler);
  worker.postMessage({ id: myId, data: ... });
  setTimeout(() => reject(new Error('timeout')), 30000);
});
```

---

## Troubleshooting

### Thumbnails Not Loading

1. Check browser console for errors
2. Verify Cache API is available: `caches` in window
3. Clear application data and reimport

### Import Failures

1. Check file format is supported (JPEG, PNG, GIF, WebP, TIFF)
2. Verify file is readable
3. Check for duplicate files

### Storage Full

1. Clear browser cache/data
2. Delete unused collections
3. Export and reimport photos

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Add tests
5. Run `npm run build` to verify
6. Submit pull request

---

## Resources

- [Svelte 5 Documentation](https://svelte.dev/docs)
- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

---

Built with ❤️ using Svelte 5
