<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fotoflo } from '$lib/stores/fotoflo.svelte';
  import type { Photo } from '$lib/stores/fotoflo.svelte';
  import { browser } from '$app/environment';

  interface Props {
    photo: Photo | null;
    onclose: () => void;
    onNavigate?: (photo: Photo) => void;
  }

  let { photo, onclose, onNavigate }: Props = $props();
  let NeoDialog: any = $state(null);
  let mounted = $state(false);

  // Keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    if (!photo) return;
    
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevPhoto();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextPhoto();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  onMount(async () => {
    // Dynamically import neo-svelte components (they need document)
    if (browser) {
      const mod = await import('@dvcol/neo-svelte');
      NeoDialog = mod.NeoDialog;
      mounted = true;
      
      // Add keyboard listener
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener('keydown', handleKeydown);
    }
  });

  let thumbUrl = $state<string | null>(null);

  $effect(() => {
    if (photo) {
      fotoflo.getThumbnail(photo.id).then(url => { thumbUrl = url; });
    } else {
      thumbUrl = null;
    }
  });

  function getStars(rating: number) {
    return Array(5).fill(0).map((_, i) => i < rating ? '★' : '☆');
  }

  function prevPhoto() {
    if (!photo || !onNavigate) return;
    const photos = fotoflo.filteredPhotos;
    const idx = photos.findIndex(p => p.id === photo.id);
    if (idx > 0) {
      onNavigate(photos[idx - 1]);
    }
  }

  function nextPhoto() {
    if (!photo || !onNavigate) return;
    const photos = fotoflo.filteredPhotos;
    const idx = photos.findIndex(p => p.id === photo.id);
    if (idx < photos.length - 1) {
      onNavigate(photos[idx + 1]);
    }
  }

  function deletePhoto() {
    if (!photo || !confirm('Delete this photo?')) return;
    fotoflo.deletePhotos([photo.id]);
    onclose();
  }
</script>

{#if mounted && photo && NeoDialog}
  <!-- Nav buttons rendered separately at top z-index -->
  <button class="nav-btn nav-prev" onclick={prevPhoto}>‹</button>
  <button class="nav-btn nav-next" onclick={nextPhoto}>›</button>
  
  <div class="viewer-overlay" onclick={onclose}>
    <NeoDialog open={!!photo} onclose={onclose} blur={20} elevation={20} style="border-radius: 20px; border: none;">
      {#if photo}
        <div class="viewer" onclick={(e) => e.stopPropagation()} onwheel={(e) => e.stopPropagation()}>
        <button class="close" onclick={onclose}>×</button>

        <div class="viewer-img">
          {#if thumbUrl}
            <img src={thumbUrl} alt={photo.fileName} />
          {:else}
            <div class="no-img">photo</div>
          {/if}
        </div>

        <div class="viewer-info" onwheel={(e) => e.stopPropagation()}>
          <h3>{photo.fileName}</h3>

          <div class="meta-badges">
            {#if photo.filmStock}
              <span class="badge film">{photo.filmStock}</span>
            {/if}
            {#if photo.camera}
              <span class="badge camera">{photo.camera}</span>
            {/if}
            {#if photo.subject}
              <span class="badge subject">{photo.subject}</span>
            {/if}
            {#if photo.frameNumber}
              <span class="badge frame">{photo.frameNumber}</span>
            {/if}
          </div>

        <div class="rating-row">
          <div class="stars">
            {#each getStars(photo.rating) as star, i}
              <button onclick={() => fotoflo.setRating(photo!.id, i + 1)}>{star}</button>
            {/each}
          </div>
          <button 
            class="fav-btn" 
            class:active={photo.isFavorite}
            onclick={() => fotoflo.toggleFavorite(photo!.id)}
          >
            {photo.isFavorite ? '♥' : '♡'}
          </button>
        </div>

        <div class="metadata">
          <div class="field">
            <label>film stock</label>
            <input
              type="text"
              placeholder="e.g. Portra 400"
              value={photo.filmStock || ''}
              oninput={(e) => fotoflo.setFilmStock(photo!.id, e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label>camera</label>
            <input
              type="text"
              placeholder="e.g. Leica M6"
              value={photo.camera || ''}
              oninput={(e) => fotoflo.setCamera(photo!.id, e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label>subject</label>
            <input
              type="text"
              placeholder="e.g. Rollercoaster"
              value={photo.subject || ''}
              oninput={(e) => fotoflo.setSubject(photo!.id, e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label>frame</label>
            <input
              type="text"
              placeholder="e.g. 001"
              value={photo.frameNumber || ''}
              oninput={(e) => fotoflo.setFrameNumber(photo!.id, e.currentTarget.value)}
            />
          </div>
        </div>

        <button class="delete" onclick={deletePhoto}>delete photo</button>
      </div>
    </div>
    {/if}
  </NeoDialog>
  </div>
{/if}

<style>
  .viewer-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.3);
  }

  .viewer {
    position: relative;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-radius: 24px;
    max-width: 85vw;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    display: flex;
  }

  .close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(10px);
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    font-size: 1rem;
    color: #1a1a1a;
    cursor: pointer;
    z-index: 10;
    transition: all 0.2s ease;
  }

  .close:hover {
    background: rgba(255, 255, 255, 0.4);
  }

  .nav-btn {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.95);
    border: none;
    border-radius: 50%;
    width: 56px;
    height: 56px;
    font-size: 2rem;
    font-weight: 300;
    color: #333;
    cursor: pointer;
    z-index: 10000;
    transition: all 0.2s ease;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-btn:hover {
    background: white;
    transform: translateY(-50%) scale(1.1);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
  }

  .nav-btn:active {
    transform: translateY(-50%) scale(0.95);
  }

  .nav-prev {
    left: 24px;
  }

  .nav-next {
    right: 24px;
  }

  .viewer-img {
    background: #1a1a2e;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 400px;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
  }

  .viewer-img img {
    max-height: 80vh;
    max-width: 100%;
    object-fit: contain;
  }

  .no-img {
    color: #666;
    font-size: 1.5rem;
  }

  .viewer-info {
    padding: 20px;
    min-width: 280px;
    max-height: 80vh;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.15);
  }

  .viewer-info h3 {
    color: #1a1a1a;
    font-weight: 700;
    margin-bottom: 16px;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }

  .meta-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }

  .badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .badge.film {
    background: rgba(230, 126, 34, 0.2);
    color: #d35400;
  }

  .badge.camera {
    background: rgba(52, 152, 219, 0.2);
    color: #2980b9;
  }

  .badge.subject {
    background: rgba(46, 204, 113, 0.2);
    color: #27ae60;
  }

  .badge.frame {
    background: rgba(155, 89, 182, 0.2);
    color: #8e44ad;
  }

  .rating-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .stars {
    display: flex;
    gap: 4px;
  }

  .stars button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #ccc;
    transition: all 0.15s ease;
  }

  .stars button:hover {
    transform: scale(1.15);
  }

  .fav-btn {
    background: rgba(93, 123, 140, 0.15);
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 1.2rem;
    color: #999;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .fav-btn:hover {
    background: rgba(93, 123, 140, 0.25);
  }

  .fav-btn.active {
    color: #e74c3c;
    background: rgba(231, 76, 60, 0.15);
  }

  .metadata {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .field {
    margin-bottom: 12px;
  }

  .field label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #1a1a1a;
    margin-bottom: 4px;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }

  .field input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.4);
    color: #1a1a1a;
    font-size: 0.95rem;
    transition: all 0.2s ease;
  }

  .field input::placeholder {
    color: #444;
  }

  .field input:focus {
    outline: none;
    border-color: #5D7B8C;
    box-shadow: 0 0 0 3px rgba(93, 123, 140, 0.2);
    background: rgba(255, 255, 255, 0.7);
  }

  .delete {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: #5D7B8C;
    color: white;
    cursor: pointer;
  }

  .delete:hover {
    background: #4A6572;
  }

  @media (max-width: 768px) {
    .viewer {
      flex-direction: column;
      max-height: 95vh;
    }

    .viewer-img {
      min-width: 100%;
      max-height: 50vh;
    }

    .viewer-info {
      min-width: 100%;
      max-height: 45vh;
    }
  }
</style>
