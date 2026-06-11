<script lang="ts">
  import type { ShareInfoResponse, ShareMode, ShareSheetProps } from '$lib/types';

  import { getApiKey } from '$lib/modules/client/common';
  import { Button, Input } from '@juspay/svelte-ui-components';

  const { onClose, open = false, shareUrl, terminalId }: ShareSheetProps = $props();

  let active = $state(false);
  let currentMode = $state<null | ShareMode>(null);
  let mode = $state<ShareMode>('view');
  let password = $state('');
  let busy = $state(false);
  let errorMsg = $state<null | string>(null);
  let copied = $state(false);

  // Password characters avoid ambiguous glyphs (0/O, 1/l/I).
  const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

  const canSubmit = $derived(
    active ? password.length === 0 || password.length >= 6 : password.length >= 6
  );

  $effect(() => {
    if (open) {
      void loadInfo();
    }
  });

  async function loadInfo(): Promise<void> {
    errorMsg = null;
    copied = false;
    try {
      const res = await fetch(`/api/terminals/${terminalId}/share`, {
        headers: { Authorization: `Bearer ${getApiKey()}` },
      });
      if (!res.ok) {
        errorMsg = 'Failed to load share state.';
        return;
      }
      const info = (await res.json()) as ShareInfoResponse;
      active = info.active;
      currentMode = info.mode ?? null;
      mode = info.mode ?? 'view';
      password = '';
    } catch {
      errorMsg = 'Failed to reach the server.';
    }
  }

  function generatePassword(): void {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    password = Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
  }

  async function saveShare(): Promise<void> {
    if (busy || !canSubmit) {
      return;
    }
    busy = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/terminals/${terminalId}/share`, {
        body: JSON.stringify({ mode, ...(password ? { password } : {}) }),
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        errorMsg = data.error ?? 'Failed to save share.';
        return;
      }
      const info = (await res.json()) as ShareInfoResponse;
      active = info.active;
      currentMode = info.mode ?? null;
      password = '';
    } catch {
      errorMsg = 'Failed to reach the server.';
    } finally {
      busy = false;
    }
  }

  async function revokeShare(): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/terminals/${terminalId}/share`, {
        headers: { Authorization: `Bearer ${getApiKey()}` },
        method: 'DELETE',
      });
      if (!res.ok) {
        errorMsg = 'Failed to revoke share.';
        return;
      }
      active = false;
      currentMode = null;
      password = '';
    } catch {
      errorMsg = 'Failed to reach the server.';
    } finally {
      busy = false;
    }
  }

  async function copyUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      errorMsg = 'Failed to copy.';
    }
  }
</script>

{#if open}
  <div
    class="share-backdrop"
    onclick={onClose}
    onkeydown={(e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    }}
    role="presentation"
  >
    <div
      class="share-sheet"
      onclick={(e: MouseEvent): void => {
        e.stopPropagation();
      }}
      role="dialog"
      aria-label="Share terminal"
      tabindex="-1"
      onkeydown={(e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div class="share-sheet-header">
        <h2 class="share-sheet-title">Share terminal</h2>
        <button class="share-sheet-close" onclick={onClose} aria-label="Close">&times;</button>
      </div>

      {#if active}
        <div class="share-active-row">
          <span class="share-active-dot"></span>
          <span class="share-active-label">
            Sharing is active ({currentMode === 'control' ? 'full control' : 'view only'})
          </span>
        </div>
        <div class="share-url-row">
          <span class="share-url">{shareUrl}</span>
          <Button
            classes="btn-secondary btn-sm"
            onclick={(): void => {
              void copyUrl();
            }}
            text={copied ? 'Copied' : 'Copy'}
          />
        </div>
      {:else}
        <p class="share-sheet-sub">
          Anyone with this page's link and the password below can access this terminal.
        </p>
      {/if}

      <div class="share-field">
        <span class="share-field-label">Access</span>
        <div class="share-mode-toggle">
          <button
            class="share-mode-btn {mode === 'view' ? 'share-mode-active' : ''}"
            onclick={(): void => {
              mode = 'view';
            }}
          >
            View only
          </button>
          <button
            class="share-mode-btn {mode === 'control' ? 'share-mode-active' : ''}"
            onclick={(): void => {
              mode = 'control';
            }}
          >
            Full control
          </button>
        </div>
      </div>

      <div class="share-field">
        <span class="share-field-label">
          {active ? 'New password (leave empty to keep current)' : 'Password (min 6 chars)'}
        </span>
        <div class="share-password-row">
          <Input
            bind:value={password}
            dataType="text"
            placeholder="Password"
            classes="share-password-input"
          />
          <Button classes="btn-secondary btn-sm" onclick={generatePassword} text="Generate" />
        </div>
      </div>

      {#if errorMsg}
        <p class="share-error">{errorMsg}</p>
      {/if}

      <div class="share-actions">
        {#if active}
          <Button
            classes="btn-danger btn-sm"
            onclick={(): void => {
              void revokeShare();
            }}
            disabled={busy}
            text="Stop sharing"
          />
        {/if}
        <Button
          classes="btn-primary btn-sm"
          onclick={(): void => {
            void saveShare();
          }}
          disabled={busy || !canSubmit}
          showLoader={busy}
          text={active ? 'Update' : 'Start sharing'}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .share-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    padding: var(--space-4);
  }

  .share-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 420px;
    padding: var(--space-5);
    background: var(--ds-background-100);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .share-sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .share-sheet-title {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--text-primary);
  }

  .share-sheet-close {
    background: none;
    border: none;
    color: var(--text-tertiary);
    font-size: 22px;
    cursor: pointer;
    line-height: 1;
    padding: 4px;
  }

  .share-sheet-close:hover {
    color: var(--text-primary);
  }

  .share-sheet-sub {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .share-active-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .share-active-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ds-green-500, #22c55e);
  }

  .share-active-label {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .share-url-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--ds-gray-200);
    border-radius: var(--radius-md);
  }

  .share-url {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .share-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .share-field-label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .share-mode-toggle {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--ds-gray-200);
    border: 1px solid var(--ds-gray-400);
    border-radius: var(--radius-md);
    width: fit-content;
  }

  .share-mode-btn {
    padding: 6px 12px;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .share-mode-active {
    background: var(--ds-background-100);
    color: var(--text-primary);
  }

  .share-password-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .share-password-row :global(.share-password-input) {
    --input-container-margin: 0;
    flex: 1;
  }

  .share-error {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ds-red-700, #ef4444);
  }

  .share-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
