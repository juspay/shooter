<script lang="ts">
  import type { ShareGateProps } from '$lib/types';

  import { Button, Input } from '@juspay/svelte-ui-components';

  const { onSubmit }: ShareGateProps = $props();

  let password = $state('');
  let errorMsg = $state<null | string>(null);
  let submitting = $state(false);

  async function submit(): Promise<void> {
    if (!password || submitting) {
      return;
    }
    submitting = true;
    errorMsg = null;
    errorMsg = await onSubmit(password);
    submitting = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  }
</script>

<div class="share-gate">
  <div class="share-gate-card">
    <h2 class="share-gate-title">Shared terminal</h2>
    <p class="share-gate-sub">
      This terminal is password protected. Enter the password to view it.
    </p>
    <Input
      bind:value={password}
      dataType="password"
      placeholder="Password"
      classes="share-gate-input"
      onKeyDown={onKeydown}
    />
    {#if errorMsg}
      <p class="share-gate-error">{errorMsg}</p>
    {/if}
    <Button
      classes="btn-primary share-gate-btn"
      onclick={(): void => {
        void submit();
      }}
      disabled={!password || submitting}
      showLoader={submitting}
      text="Unlock"
    />
  </div>
</div>

<style>
  .share-gate {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: var(--space-4);
  }

  .share-gate-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 360px;
    padding: var(--space-5);
    background: var(--ds-background-100);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .share-gate-title {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--text-primary);
  }

  .share-gate-sub {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .share-gate-error {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ds-red-700, #ef4444);
  }
</style>
