<script lang="ts">
  /**
   * Toolbar - Bottom action bar for selected photos
   * 
   * Appears when photos are selected. Provides:
   * - Selection count display
   * - Quick rating (click stars to rate all selected)
   * - Bulk metadata editing
   * - Export selected
   * - Delete selected
   * - Clear selection
   * 
   * Actions are passed as callback props to keep this
   * component purely presentational.
   */
  import { fotoflo } from '$lib/stores/fotoflo.svelte';

  interface Props {
    selectedCount: number;
    onOpenBulkMeta?: () => void;
    onDelete?: () => void;
    onExport?: () => void;
    onClear?: () => void;
  }

  let { 
    selectedCount = 0, 
    onOpenBulkMeta,
    onDelete,
    onExport,
    onClear
  }: Props = $props();

  function bulkRate(rating: number) {
    fotoflo.bulkRate(rating);
  }
</script>

<div class="toolbar">
  <span class="count">{selectedCount} selected</span>
  
  <div class="rating-buttons">
    <span>rate:</span>
    {#each [1, 2, 3, 4, 5] as star}
      <button class="rate-btn" onclick={() => bulkRate(star)}>{'★'.repeat(star)}</button>
    {/each}
  </div>
  
  <div class="actions">
    <button onclick={onOpenBulkMeta}>metadata</button>
    <button onclick={onExport}>export</button>
    <button class="danger" onclick={onDelete}>delete</button>
    <button onclick={onClear}>cancel</button>
  </div>
</div>

<style>
  .toolbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 32px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255, 255, 255, 0.4);
    color: #2E3338;
    z-index: 50;
  }

  .count {
    font-weight: 600;
    min-width: 100px;
  }

  .rating-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .rating-buttons span {
    font-size: 0.8rem;
    color: #5D7B8C;
    margin-right: 4px;
  }

  .rate-btn {
    padding: 4px 8px !important;
    font-size: 0.7rem !important;
    background: rgba(93, 123, 140, 0.2) !important;
    color: #5D7B8C !important;
  }

  .rate-btn:hover {
    background: rgba(93, 123, 140, 0.4) !important;
  }

  .actions {
    display: flex;
    gap: 12px;
    margin-left: auto;
  }

  .toolbar button,
  .toolbar select {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: rgba(93, 123, 140, 0.9);
    color: white;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .toolbar button:hover {
    background: rgba(74, 101, 114, 1);
  }

  .toolbar button.danger {
    background: rgba(192, 57, 43, 0.8);
  }

  .toolbar button.danger:hover {
    background: rgba(192, 57, 43, 1);
  }

  .toolbar select {
    min-width: 160px;
  }

  .toolbar select option {
    background: #4A6572;
    color: white;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .toolbar {
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 16px;
    }
    
    .count {
      min-width: auto;
      font-size: 0.85rem;
    }
    
    .rating-buttons span {
      display: none;
    }
    
    .toolbar button,
    .toolbar select {
      padding: 6px 12px;
      font-size: 0.8rem;
    }
    
    .toolbar select {
      min-width: 140px;
    }
  }

  @media (max-width: 480px) {
    .toolbar {
      justify-content: center;
    }
    
    .rating-buttons {
      display: none;
    }
    
    .actions {
      width: 100%;
      justify-content: center;
      flex-wrap: wrap;
    }
  }
</style>
