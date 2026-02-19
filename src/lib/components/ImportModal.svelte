<script lang="ts">
  import { browser } from '$app/environment';
  import type { Snippet } from 'svelte';

  // Modal title
  let { title = 'import photos' }: { title?: string } = $props();

  // Modal state
  let open = $state(false);

  // Expose open/close to parent
  function show() { open = true; }
  function hide() { open = false; }
  function toggle() { open = !open; }

  // File input ref
  let fileInput: HTMLInputElement;

  // Handlers
  function onFiles() {
    fileInput?.click();
  }

  function onFolder() {
    // Parent handles this - emit event or call callback
  }

  // Expose via context or just return state
  if (browser) {
    // @ts-ignore - extending window for modal access
    window.__importModal = { open: () => open = true, close: () => open = false };
  }
</script>

{#if open}
  <!-- @ts-ignore - NeoDialog -->
  <NeoDialog {open} onclose={hide} blur={40} elevation={20} style="border-radius: 24px; border: none;">
    <div class="modal-content">
      <h2>{title}</h2>
      
      <div class="import-choices">
        <button class="import-choice" onclick={onFiles}>
          <span class="icon">📁</span>
          <span>select files</span>
        </button>
        <button class="import-choice" onclick={onFolder}>
          <span class="icon">📂</span>
          <span>select folder</span>
        </button>
      </div>

      <input
        bind:this={fileInput}
        type="file"
        multiple
        accept="image/*"
        style="display: none"
        onchange={(e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files) {
            // @ts-ignore
            window.__importFiles?.(files);
          }
          hide();
        }}
      />

      <div class="actions">
        <button onclick={hide}>cancel</button>
      </div>
    </div>
  </NeoDialog>
{/if}

<style>
  .modal-content {
    background: transparent;
    padding: 0;
    min-width: 340px;
  }

  h2 {
    margin-bottom: 16px;
  }

  .import-choices {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .import-choice {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 16px;
    background: rgba(255, 255, 255, 0.8);
    border: 2px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .import-choice:hover {
    background: rgba(255, 255, 255, 0.95);
    border-color: #2E7D32;
  }

  .import-choice .icon {
    font-size: 32px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.7);
    color: #333;
    font-size: 14px;
  }

  button:hover {
    background: rgba(255, 255, 255, 0.9);
  }
</style>
