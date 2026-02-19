<script lang="ts">
  interface Props {
    count: number;
    filmStock?: string;
    camera?: string;
    subject?: string;
    onapply: (filmStock: string, camera: string, subject: string) => void;
    onskip: () => void;
  }

  let { count = 0, filmStock = '', camera = '', subject = '', onapply, onskip }: Props = $props();
</script>

{#if count > 0}
  <!-- @ts-ignore -->
  <NeoDialog open={count > 0} onclose={onskip} blur={40} elevation={20} style="border-radius: 16px; border: none;">
    <div class="modal-content compact" onkeydown={(e) => e.key === 'Enter' && onapply(filmStock, camera, subject)}>
      <h2>add metadata to {count} photos</h2>

      <div class="field">
        <label>film stock</label>
        <input
          type="text"
          placeholder="e.g. Portra 400"
          bind:value={filmStock}
        />
      </div>

      <div class="field">
        <label>camera</label>
        <input
          type="text"
          placeholder="e.g. Leica M6"
          bind:value={camera}
        />
      </div>

      <div class="field">
        <label>subject (optional)</label>
        <input
          type="text"
          placeholder="e.g. Rollercoaster"
          bind:value={subject}
        />
      </div>

      <div class="actions">
        <button onclick={onskip}>skip</button>
        <button class="primary" onclick={() => onapply(filmStock, camera, subject)}>apply</button>
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

  .modal-content.compact {
    min-width: 280px;
  }

  h2 {
    font-size: 0.95rem;
    margin-bottom: 12px;
  }

  .field {
    margin-bottom: 4px;
  }

  .field label {
    display: block;
    font-size: 12px;
    color: #666;
    margin-bottom: 4px;
  }

  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.8);
    font-size: 14px;
  }

  input:focus {
    outline: none;
    border-color: #2E7D32;
    background: white;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
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

  button.primary {
    background: #2E7D32;
    color: white;
  }

  button.primary:hover {
    background: #1B5E20;
  }
</style>
