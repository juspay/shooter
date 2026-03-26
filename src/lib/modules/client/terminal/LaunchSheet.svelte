<script lang="ts">
  import type { CreateTerminalResponse } from '$generated/types';

  import { Banner, Button, Choicebox, Input, Select } from '@juspay/svelte-ui-components';
  import { onMount } from 'svelte';

  interface Props {
    apiKey: string;
    onClose: () => void;
    onLaunch: (response: CreateTerminalResponse) => void;
    open: boolean;
  }

  interface Preset {
    args: string[];
    command: string;
    label: string;
  }

  const { apiKey, onClose, onLaunch, open }: Props = $props();

  const presets: Preset[] = [
    { args: [], command: 'claude', label: 'Claude Code' },
    { args: [], command: 'opencode', label: 'OpenCode' },
    { args: [], command: 'zsh', label: 'Shell / zsh' },
    { args: [], command: 'bash', label: 'Bash' },
  ];

  let selectedPreset = $state<number>(0);
  let projectPaths = $state<string[]>([]);
  let selectedCwd = $state('');
  let customCwd = $state('');
  let launching = $state(false);
  let launchError = $state('');

  onMount(() => {
    void fetchProjectPaths();
  });

  async function fetchProjectPaths(): Promise<void> {
    try {
      const response = await fetch('/api/sessions?limit=50&offset=0', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        return;
      }
      const data: { projects: { fullPath: string }[] } = await response.json();
      const paths = data.projects
        .map((p) => p.fullPath)
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
      projectPaths = [...new Set(paths)];
      if (projectPaths.length > 0 && !selectedCwd) {
        selectedCwd = projectPaths[0];
      }
    } catch {
      // Silently ignore — paths are optional
    }
  }

  function selectPreset(index: number): void {
    selectedPreset = index;
  }

  function getCommand(): string {
    return presets[selectedPreset].command;
  }

  function getArgs(): string[] {
    return presets[selectedPreset].args;
  }

  function getEffectiveCwd(): string {
    const custom = customCwd.trim();
    if (custom) {
      return custom;
    }
    if (selectedCwd) {
      return selectedCwd;
    }
    return '/tmp';
  }

  async function handleLaunch(): Promise<void> {
    const command = getCommand();
    if (!command) {
      return;
    }

    launching = true;
    launchError = '';
    try {
      const response = await fetch('/api/terminals', {
        body: JSON.stringify({
          args: getArgs(),
          command,
          cwd: getEffectiveCwd() || undefined,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        launchError = data.error || `Failed to launch (${response.status})`;
        return;
      }

      const result: CreateTerminalResponse = await response.json();
      onLaunch(result);
    } catch {
      launchError = 'Network error — is the server running?';
    } finally {
      launching = false;
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) {
      return;
    }
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="overlay" role="presentation" onclick={handleBackdropClick}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="New Terminal">
      <div class="handle-bar">
        <div class="handle"></div>
      </div>

      <h2 class="sheet-title">New Terminal</h2>

      <div class="section">
        <span class="section-label">Quick Launch</span>
        <div class="preset-grid">
          {#each presets as preset, i (preset.label)}
            <Choicebox
              mode="radio"
              selected={selectedPreset === i}
              onclick={() => {
                selectPreset(i);
              }}
              classes="preset-choice"
            >
              {preset.label}
            </Choicebox>
          {/each}
        </div>
      </div>

      <div class="section">
        <span class="section-label">Working Directory</span>
        <Select
          items={projectPaths.length > 0
            ? projectPaths.map((p) => ({ id: p, label: p }))
            : [{ id: '', label: 'No recent projects' }]}
          value={selectedCwd ? [selectedCwd] : projectPaths.length > 0 ? [projectPaths[0]] : ['']}
          placeholder="Select a project"
          onchange={(value) => {
            selectedCwd = value[0] || '';
          }}
          classes="launch-select"
        />
        <div class="custom-cwd-group">
          <Input
            label="Or enter a custom path"
            bind:value={customCwd}
            dataType="text"
            placeholder="/path/to/project"
            classes="input-mono launch-input"
          />
        </div>
      </div>

      <Button
        classes="btn-launch"
        disabled={launching}
        onclick={handleLaunch}
        showLoader={launching}
        text={launching ? 'Launching...' : 'Launch Terminal'}
      />

      {#if launchError}
        <Banner text={launchError} classes="banner-error launch-error-banner" />
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .sheet {
    background: var(--ds-gray-100);
    border-top-left-radius: var(--radius-xl);
    border-top-right-radius: var(--radius-xl);
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5)
      calc(var(--space-8, 32px) + env(safe-area-inset-bottom, 0px));
    animation: slideUp 0.25s ease;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  /* Desktop: centered modal */
  @media (min-width: 768px) {
    .overlay {
      align-items: center;
    }

    .sheet {
      max-width: 480px;
      border-radius: var(--radius-xl);
      animation: fadeScale 0.2s ease;
    }

    @keyframes fadeScale {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  }

  .handle-bar {
    display: flex;
    justify-content: center;
    padding-bottom: var(--space-3);
  }

  .handle {
    width: 36px;
    height: 4px;
    border-radius: var(--radius-full);
    background: var(--ds-gray-500);
  }

  /* Hide handle bar on desktop */
  @media (min-width: 768px) {
    .handle-bar {
      display: none;
    }
  }

  .sheet-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-5);
    letter-spacing: var(--tracking-tight);
  }

  .section {
    margin-bottom: var(--space-4);
  }

  .section-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-2);
  }

  .preset-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  :global(.preset-choice) {
    --choicebox-padding: var(--space-3) var(--space-2);
    --choicebox-min-height: 48px;
    --choicebox-title-font-size: var(--text-sm);
    --choicebox-title-font-weight: 500;
    --choicebox-indicator-size: 16px;
    --choicebox-radio-inner-size: 8px;
  }

  .custom-cwd-group {
    margin-top: var(--space-2);
  }

  :global(.launch-select) {
    --select-height: 44px;
    --select-trigger-background: var(--component-bg);
    --select-trigger-border: 1px solid var(--border);
    --select-trigger-hover-border-color: var(--border-hover);
    --select-color: var(--text-primary);
    --select-placeholder-color: var(--text-tertiary);
    --select-arrow-color: var(--text-secondary);
    --select-dropdown-background: var(--component-bg);
    --select-dropdown-border: 1px solid var(--border);
    --select-dropdown-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    --select-option-color: var(--text-primary);
    --select-option-hover-background: var(--component-bg-hover);
    --select-option-selected-background: var(--component-bg-active);
    margin-bottom: var(--space-2);
  }

  :global(.launch-input) {
    --input-container-margin: 0;
  }

  :global(.btn-launch) {
    --button-color: var(--ds-green-700);
    --button-text-color: #fff;
    --button-hover-color: var(--ds-green-900);
    --button-hover-text-color: #fff;
    --button-border-radius: var(--radius-lg);
    --button-height: 48px;
    --button-width: 100%;
    margin-top: var(--space-2);
  }

  :global(.launch-error-banner) {
    margin-top: var(--space-3);
  }
</style>
