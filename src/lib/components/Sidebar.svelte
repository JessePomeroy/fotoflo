<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { fotoflo } from '$lib/stores/fotoflo.svelte';

  interface Props {
    onRelinkOriginals?: () => void;
    onFilterChange?: () => void;
    refreshTrigger?: number;
    onBackup?: () => void;
    onRestore?: () => void;
  }

  let { onRelinkOriginals, onFilterChange, refreshTrigger = 0, onBackup, onRestore }: Props = $props();

  let mounted = $state(false);
  let activeCollectionId = $state<string | null>(null);
  let filterRating = $state<number | null>(null);
  let activeFilmStock = $state<string | null>(null);
  let activeSubject = $state<string | null>(null);
  
  // Force refresh when trigger changes - just invalidate the derived values
  $effect(() => {
    const _ = refreshTrigger;
  });

  onMount(() => {
    mounted = true;
    activeCollectionId = fotoflo.state.activeCollectionId;
  });

  // Derived values from store - always fresh
  let ratingDist = $derived(fotoflo.ratingDistribution);
  let filmStocks = $derived(fotoflo.filmStocks);
  let cameras = $derived(fotoflo.cameras);
  let subjects = $derived(fotoflo.subjects);
  let photoCount = $derived(fotoflo.photoCount);
</script>

{#if mounted}
<aside class="sidebar">
  <nav>
    <button 
      class:active={fotoflo.state.activeView === 'all'} 
      onclick={() => { activeCollectionId = null; activeFilmStock = null; activeSubject = null; fotoflo.setFilterFilmStock(null); fotoflo.setFilterSubject(null); fotoflo.setView('all'); onFilterChange?.(); }}
    >
      all photos
    </button>
    <button 
      class:active={fotoflo.state.activeView === 'favorites'} 
      onclick={() => { activeCollectionId = null; activeSubject = null; fotoflo.setFilterSubject(null); fotoflo.setView('favorites'); onFilterChange?.(); }}
    >
      ♥ favorites
    </button>
  </nav>

  <section>
    <h3>rating distribution</h3>
    <div class="rating-dist">
      {#each [5, 4, 3, 2, 1, 0] as star}
        <button 
          class="dist-row" 
          class:active={filterRating === star} 
          onclick={() => { 
            filterRating = filterRating === star ? null : star; 
            fotoflo.setFilterRating(filterRating);
            onFilterChange?.();
          }}
        >
          <span class="stars-display">{'★'.repeat(star)}{'☆'.repeat(5-star)}</span>
          <div class="bar">
            <div class="fill" style="width: {photoCount ? (ratingDist[star] / photoCount * 100) : 0}%"></div>
          </div>
          <span class="count">{ratingDist[star]}</span>
          {#if filterRating === star}
            <span class="clear-x">×</span>
          {/if}
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3>film stocks</h3>
    {#if filmStocks.length > 0}
      <div class="film-stock-list">
        {#each filmStocks as stock}
          <button 
            class="film-stock-btn"
            class:active={activeFilmStock === stock}
            onclick={() => { 
              activeFilmStock = activeFilmStock === stock ? null : stock;
              activeSubject = null;
              fotoflo.setFilterFilmStock(activeFilmStock);
              fotoflo.setFilterSubject(null);
              onFilterChange?.(); 
            }}
          >
            {stock}
            {#if activeFilmStock === stock}
              <span class="clear-x">×</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty">no film stocks</p>
    {/if}
  </section>

  <section>
    <h3>cameras</h3>
    {#if cameras.length > 0}
      <div class="film-stock-list">
        {#each cameras as cam}
          <button class="film-stock-btn">
            {cam}
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty">no cameras</p>
    {/if}
  </section>

  <section>
    <h3>subjects</h3>
    {#if subjects.length > 0}
      <div class="film-stock-list">
        {#each subjects as subj}
          <button 
            class="film-stock-btn"
            class:active={activeSubject === subj}
            onclick={() => { 
              activeSubject = activeSubject === subj ? null : subj; 
              activeFilmStock = null;
              fotoflo.setFilterSubject(activeSubject);
              fotoflo.setFilterFilmStock(null);
              onFilterChange?.(); 
            }}
          >
            {subj}
            {#if activeSubject === subj}
              <span class="clear-x">×</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty">no subjects</p>
    {/if}
  </section>

  <section class="utilities">
    <h3>utilities</h3>
    <button class="utility-btn" onclick={onRelinkOriginals}>
      relink originals
    </button>
    <button class="utility-btn" onclick={onBackup}>
      export backup
    </button>
    <button class="utility-btn" onclick={onRestore}>
      import backup
    </button>
  </section>
</aside>
{:else}
<aside class="sidebar">
  <p class="loading">loading...</p>
</aside>
{/if}

<style>
  .sidebar {
    width: 260px;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(20px);
    border-right: 1px solid rgba(255, 255, 255, 0.4);
    padding: 20px 16px;
    overflow-y: auto;
  }

  .loading {
    color: #888;
    text-align: center;
    padding: 20px;
  }

  .sidebar nav {
    margin-bottom: 24px;
  }

  .sidebar button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 14px;
    border: none;
    background: rgba(255, 255, 255, 0.4);
    color: #2E3338;
    font-size: 0.875rem;
    cursor: pointer;
    border-radius: 10px;
    text-align: left;
    font-weight: 500;
    margin-bottom: 4px;
    transition: all 0.2s ease;
  }

  .sidebar button:hover {
    background: rgba(255, 255, 255, 0.7);
    transform: translateX(4px);
  }

  .sidebar button.active {
    background: linear-gradient(135deg, #5D7B8C 0%, #4A6572 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(93, 123, 140, 0.3);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    margin-top: 24px;
  }

  .section-header h3,
  .sidebar section > h3 {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #888;
  }

  .sidebar ul {
    list-style: none;
    font-size: 0.875rem;
    color: #aaa;
  }

  .sidebar li {
    margin-bottom: 4px;
  }

  .sidebar .empty {
    color: #666;
    font-style: italic;
    font-size: 0.875rem;
  }

  .badge {
    margin-left: auto;
    font-size: 0.7rem;
    color: #666;
  }

  .collection-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .collection-item .collection-btn {
    flex: 1;
  }

  .delete-collection {
    width: 24px !important;
    min-width: 24px !important;
    height: 24px;
    padding: 0 !important;
    margin: 0 !important;
    background: transparent !important;
    color: #999 !important;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .collection-item:hover .delete-collection {
    opacity: 1;
  }

  .delete-collection:hover {
    color: #c0392b !important;
    background: rgba(192, 57, 43, 0.1) !important;
  }

  .rating-dist {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rating-dist .dist-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: #eee;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .rating-dist .dist-row:hover {
    background: rgba(93, 123, 140, 0.1);
  }

  .rating-dist .dist-row.active {
    background: rgba(93, 123, 140, 0.2);
  }

  .rating-dist .stars-display {
    width: 60px;
    font-size: 0.7rem;
    color: #9CA3AF;
  }

  .rating-dist .bar {
    flex: 1;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
  }

  .rating-dist .fill {
    height: 100%;
    background: #646cff;
    transition: width 0.3s;
  }

  .rating-dist .count {
    width: 24px;
    text-align: right;
    font-size: 0.75rem;
    color: #888;
  }

  .rating-dist .clear-x {
    font-size: 0.9rem;
    color: #c0392b;
    margin-left: 4px;
    font-weight: bold;
  }

  .clear-filter {
    width: 100%;
    margin-top: 8px;
    padding: 6px;
    background: rgba(93, 123, 140, 0.1);
    border: none;
    border-radius: 6px;
    color: #5D7B8C;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .clear-filter:hover {
    background: rgba(93, 123, 140, 0.2);
  }

  .film-stock-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .film-stock-btn {
    padding: 6px 12px !important;
    font-size: 0.75rem !important;
    background: rgba(93, 123, 140, 0.15) !important;
    color: #4A6572 !important;
    border-radius: 6px !important;
    margin-bottom: 0 !important;
    width: auto !important;
  }

  .film-stock-btn:hover {
    background: rgba(93, 123, 140, 0.3) !important;
    transform: none !important;
  }

  .film-stock-btn.active {
    background: #5D7B8C !important;
    color: white !important;
  }

  .dup-btn {
    width: 100%;
    text-align: left;
    padding: 8px;
    background: #2a2a3e;
    border: none;
    border-radius: 6px;
    color: #eee;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .dup-btn:hover {
    background: #3a3a4e;
  }

  .utilities {
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid rgba(93, 123, 140, 0.2);
  }

  .utility-btn {
    width: 100%;
    padding: 8px 12px;
    background: rgba(93, 123, 140, 0.15);
    border: 1px dashed rgba(93, 123, 140, 0.3);
    border-radius: 8px;
    color: #5D7B8C;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .utility-btn:hover {
    background: rgba(93, 123, 140, 0.25);
    border-style: solid;
  }
</style>
