<script lang="ts">
  /**
   * PhotoGrid - Main display component for photo thumbnails
   * 
   * Renders a responsive grid of photo cards with:
   * - Thumbnail image (from IndexedDB)
   * - Filename
   * - Star rating (clickable)
   * - Favorite heart (clickable)
   * - Metadata badges (film stock, camera, subject)
   * 
   * Uses CSS Grid for responsive layout - auto-fill with minmax
   * means it adapts to any screen size without media queries.
   */
  import type { Photo } from '$lib/stores/fotoflo.svelte';
  import { fotoflo } from '$lib/stores/fotoflo.svelte';

  interface Props {
    photos: Photo[];
    selectedIds: Set<string>;
    thumbnailUrls?: Record<string, string>;
    ondetail?: (photo: Photo) => void;
    onselect?: (photo: Photo) => void;
    onchange?: () => void;
  }

  let { photos = [], selectedIds = new Set(), thumbnailUrls = {}, ondetail, onselect, onchange }: Props = $props();
  
  function handleClick(photo: Photo) {
    if (ondetail) ondetail(photo);
  }

  function handleSelect(photo: Photo, e: MouseEvent) {
    e.stopPropagation();
    if (onselect) onselect(photo);
  }

  function toggleFavorite(photo: Photo, e: MouseEvent) {
    e.stopPropagation();
    fotoflo.toggleFavorite(photo.id);
    onchange?.();
  }
</script>

<div class="grid-container">
  {#if photos.length === 0}
    <div class="empty">
      <span class="icon">photo</span>
      <h3>No photos</h3>
      <p>Import some photos to get started</p>
    </div>
  {:else}
    <div class="grid">
      {#each photos as photo (photo.id)}
        {@const isSelected = selectedIds.has(photo.id)}
        {@const thumbUrl = thumbnailUrls[photo.id]}
        
        <div 
          class="card"
          class:selected={isSelected}
          onclick={() => handleClick(photo)}
          onkeydown={(e) => e.key === 'Enter' && handleClick(photo)}
          role="button"
          tabindex="0"
        >
          <div class="thumb">
            {#if thumbUrl}
              <img src={thumbUrl} alt={photo.fileName} />
            {:else}
              <div class="placeholder">photo</div>
            {/if}
            <button 
              class="favorite-btn" 
              class:active={photo.isFavorite}
              onclick={(e) => toggleFavorite(photo, e)}
              aria-label="Toggle favorite"
            >
              {photo.isFavorite ? '♥' : '♡'}
            </button>
          </div>
          
          <div class="info">
            <div class="info-row">
              <div class="name">{photo.fileName}</div>
              <button 
                class="checkbox" 
                class:checked={isSelected}
                onclick={(e) => handleSelect(photo, e)}
                aria-label="Select photo"
              >
                {#if isSelected}✓{/if}
              </button>
            </div>
            <div class="stars">
              {#each [1, 2, 3, 4, 5] as star}
                <button 
                  class="star-btn"
                  class:filled={photo.rating >= star}
                  onclick={(e) => { e.stopPropagation(); fotoflo.setRating(photo.id, star); onchange?.(); }}
                >
                  {photo.rating >= star ? '★' : '☆'}
                </button>
              {/each}
            </div>
            <div class="badges">
              {#if photo.filmStock}
                <span class="badge film">{photo.filmStock}</span>
              {/if}
              {#if photo.camera}
                <span class="badge camera">{photo.camera}</span>
              {/if}
              {#if photo.subject}
                <span class="badge subject">{photo.subject}</span>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .grid-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 20px;
  }
  
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #747F8D;
    text-align: center;
  }
  
  .empty .icon {
    font-size: 4rem;
    opacity: 0.5;
  }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
    padding-bottom: 100px;
  }
  
  .card {
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 16px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  }
  
  .card:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: 0 12px 32px rgba(59, 165, 93, 0.2);
  }
  
  .card.selected {
    border-color: #5D7B8C;
    box-shadow: 0 0 0 3px rgba(93, 123, 140, 0.3);
  }
  
  .thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    background: linear-gradient(135deg, #B8CEDC 0%, #DCE7EE 100%);
    overflow: hidden;
  }
  
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }
  
  .card:hover .thumb img {
    transform: scale(1.05);
  }

  .favorite-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.8);
    color: #999;
    font-size: 1.1rem;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card:hover .favorite-btn {
    opacity: 1;
  }

  .favorite-btn:hover {
    background: white;
    transform: scale(1.1);
  }

  .favorite-btn.active {
    opacity: 1;
    color: #e74c3c;
    background: rgba(255, 255, 255, 0.95);
  }
  
  .placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    color: #747F8D;
  }
  
  .info {
    padding: 14px;
    background: rgba(255, 255, 255, 0.15);
  }

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  
  .checkbox {
    width: 24px;
    height: 24px;
    min-width: 24px;
    border: 2px solid #5D7B8C;
    border-radius: 6px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .checkbox:hover {
    background: rgba(93, 123, 140, 0.2);
  }

  .checkbox.checked {
    background: #5D7B8C;
  }
  
  .name {
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #2E3338;
  }
  
  .stars {
    display: flex;
    gap: 1px;
  }

  .star-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.9rem;
    color: #ccc;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .star-btn:hover {
    transform: scale(1.2);
    color: #f39c12;
  }

  .star-btn.filled {
    color: #f39c12;
  }
  
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }
  
  .badges .badge {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.6rem;
    font-weight: 500;
    background: rgba(93, 123, 140, 0.15);
    color: #4A6572;
  }
  
  .badges .badge.film,
  .badges .badge.camera,
  .badges .badge.subject {
    background: rgba(93, 123, 140, 0.15);
    color: #4A6572;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
      padding-bottom: 120px;
    }
    
    .card {
      border-radius: 12px;
    }
    
    .info {
      padding: 10px;
    }
    
    .name {
      font-size: 0.75rem;
    }
    
    .stars {
      font-size: 0.8rem;
    }
  }

  @media (max-width: 480px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    
    .info {
      padding: 8px;
    }
  }
</style>
