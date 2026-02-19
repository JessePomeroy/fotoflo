# FotoFlo

A local-first film photography organizer that runs entirely in your browser. No cloud, no subscription, no tracking — your photos and metadata stay on your device.

## Features

- **Local-first**: All data stored in browser — your photos never leave your device
- **Dual-layer storage**: LocalStorage for metadata, Cache API + IndexedDB for thumbnails
- **Bulk import**: Import entire folders of film scans at once
- **Bulk metadata**: Add film stock, camera, and subject to multiple photos
- **Smart export**: Export renamed files based on metadata
- **EXIF support**: Read and write EXIF data automatically
- **Offline-first**: Works without internet connection
- **Progressive loading**: Photos show instantly, thumbnails load in background
- **Web Worker thumbnails**: Thumbnail generation off main thread for responsiveness

## Getting Started

### Prerequisites

- Node.js 18+
- A modern browser (Chrome, Firefox, Safari, Edge)

### Running Locally

```bash
cd fotoflo
npm install
npm run dev
```

Open http://localhost:5173

### Building

```bash
npm run build      # Production build
npm run preview    # Preview build
npm run test       # Run tests
```

### Deploying

Works on Vercel, Netlify, or any static host:

```bash
git push origin main
# Import in Vercel/Netlify
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FotoFlo App                       │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Sidebar  │  │ PhotoGrid │  │ Toolbar  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │              │              │                 │
│       └──────────────┼──────────────┘                 │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  +page.svelte │                       │
│              │  (coordination)│                       │
│              └───────┬────────┘                       │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │ fotoflo.svelte.ts │                   │
│              │    (store)      │                       │
│              └───────┬────────┘                       │
│                      │                                │
│  ┌─────────────────┼─────────────────┐               │
│  │                 │                 │               │
│  ▼                 ▼                 ▼               │
│ ┌────────┐  ┌────────────┐  ┌────────────────┐   │
│ │LocalStorage│ │ IndexedDB │  │   Cache API   │   │
│ │(metadata) │ │(blobs)    │  │  (thumbnails)│   │
│ └────────┘  └────────────┘  └────────────────┘   │
│                                                       │
└─────────────────────────────────────────────────────┘
```

### Storage Strategy

**LocalStorage** (5MB limit, sync)
- Photo metadata
- Settings

**IndexedDB** (large storage, async)
- File handles (for re-export)
- Fallback thumbnail storage
- Blob data

**Cache API** (primary thumbnail storage)
- Native blob support
- Better quota management
- Faster than IndexedDB for blobs

### Key Files

```
src/
├── lib/
│   ├── stores/
│   │   ├── fotoflo.svelte.ts     # Main store (~750 lines)
│   │   └── fotoflo.test.ts       # Store tests
│   ├── workers/
│   │   └── thumbnail.worker.ts    # Off-thread thumbnail gen
│   ├── utils/
│   │   └── exif.ts              # EXIF read/write
│   ├── import.ts                 # Unified import module
│   └── types.ts                  # Centralized types
├── components/
│   ├── PhotoGrid.svelte          # Grid display
│   ├── Toolbar.svelte            # Action toolbar
│   ├── Sidebar.svelte            # Filters
│   ├── Viewer.svelte             # Single photo view
│   ├── ImportModal.svelte        # Import dialog
│   └── BulkMetaModal.svelte      # Bulk edit dialog
└── routes/
    └── +page.svelte             # Main app page
```

### Data Flow

```
User Selects Files/Folder
         │
         ▼
┌─────────────────┐
│    import.ts    │  ← Validate, EXIF extract, deduplicate
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ fotoflo.svelte.ts   │  ← Store photos, generate thumbnails
└────────┬────────────┘
         │
    ┌────┴────┬────────────┐
    ▼         ▼            ▼
LocalStorage  IndexedDB    Cache API
(metadata)   (handles)   (thumbnails)
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Svelte 5 + SvelteKit | UI + routing |
| **State** | Svelte 5 $state() | Reactive state |
| **Storage** | LocalStorage + IndexedDB + Cache API | Persistence |
| **EXIF** | exifreader + piexifjs | Metadata |
| **UI** | Custom CSS + NeoDialog | Glass-morphism |
| **Testing** | Vitest | Unit tests |
| **Build** | Vite | Bundler |

## Adding Features

### Add a New Filter

1. Add to `FotoFloState` in `types.ts`:
   ```typescript
   filterNewField: string | null;
   ```

2. Add setter in `fotoflo.svelte.ts`:
   ```typescript
   function setFilterNewField(value: string | null) {
     state.filterNewField = value;
   }
   ```

3. Add to `getFilteredPhotos()`:
   ```typescript
   if (state.filterNewField) {
     result = result.filter(p => p.field === state.filterNewField);
   }
   ```

4. Export from store return object

### Add a Metadata Field

1. Add to `Photo` interface in `types.ts`:
   ```typescript
   newField?: string;
   ```

2. Update metadata modal
3. Update EXIF export if needed

## Testing

```bash
npm run test          # Run all tests
npm run test:watch   # Watch mode
```

Tests cover:
- Store logic (filtering, sorting, collections)
- Import module (deduplication, ID generation)
- Type validation

## Privacy

- No analytics, tracking, or cookies
- All data stays local
- No server communication

## License

MIT

---

Built with ❤️ using Svelte 5
