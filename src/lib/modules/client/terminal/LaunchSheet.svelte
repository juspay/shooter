<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    apiKey: string;
    onClose: () => void;
    onLaunch: (response: TerminalResponse) => void;
    open: boolean;
  }

  interface TerminalResponse {
    command: string;
    createdAt: string;
    cwd: string;
    id: string;
    pid: number;
    sessionWs: string;
    ws: string;
  }

  interface Preset {
    args: string[];
    bg: string;
    border: string;
    command: string;
    label: string;
  }

  const { apiKey, onClose, onLaunch, open }: Props = $props();

  const presets: Preset[] = [
    {
      args: [],
      bg: 'rgba(167,139,250,0.1)',
      border: 'rgba(167,139,250,0.5)',
      command: 'claude',
      label: 'Claude Code',
    },
    {
      args: [],
      bg: 'rgba(56,189,248,0.1)',
      border: 'rgba(56,189,248,0.5)',
      command: 'opencode',
      label: 'OpenCode',
    },
    {
      args: [],
      bg: 'rgba(34,197,94,0.1)',
      border: 'rgba(34,197,94,0.5)',
      command: 'zsh',
      label: 'Shell / zsh',
    },
    {
      args: [],
      bg: 'rgba(245,158,11,0.1)',
      border: 'rgba(245,158,11,0.5)',
      command: 'bash',
      label: 'Bash',
    },
  ];

  let selectedPreset = $state<number>(0);
  let customCommand = $state('');
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
      if (!response.ok) {return;}
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

  function isCustom(): boolean {
    return presets[selectedPreset].command === '';
  }

  function getCommand(): string {
    if (isCustom()) {return customCommand.trim().split(/\s+/)[0] || '';}
    return presets[selectedPreset].command;
  }

  function getArgs(): string[] {
    if (isCustom()) {
      const parts = customCommand.trim().split(/\s+/);
      return parts.slice(1);
    }
    return presets[selectedPreset].args;
  }

  function getEffectiveCwd(): string {
    // Custom path takes priority over dropdown selection
    const custom = customCwd.trim();
    if (custom) {return custom;}
    if (selectedCwd) {return selectedCwd;}
    // Safe fallback when no projects exist and no custom path entered
    return '/tmp';
  }

  async function handleLaunch(): Promise<void> {
    const command = getCommand();
    if (!command) {return;}

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

      const result: TerminalResponse = await response.json();
      onLaunch(result);
    } catch (error) {
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
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={handleBackdropClick}>
    <div class="sheet" role="dialog" aria-label="New Terminal">
      <div class="handle-bar">
        <div class="handle"></div>
      </div>

      <h2 class="sheet-title">New Terminal</h2>

      <div class="section">
        <span class="section-label">Quick Launch</span>
        <div class="preset-grid">
          {#each presets as preset, i (preset.label)}
            <button
              class="preset-card"
              class:selected={selectedPreset === i}
              style="--preset-border: {preset.border}; --preset-bg: {preset.bg};"
              onclick={() => { selectPreset(i); }}
            >
              <span class="preset-label">{preset.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="section">
        <label for="launch-cwd" class="section-label">Working Directory</label>
        <select id="launch-cwd" class="select-field" bind:value={selectedCwd}>
          {#if projectPaths.length === 0}
            <option value="">No recent projects</option>
          {:else}
            {#each projectPaths as path (path)}
              <option value={path}>{path}</option>
            {/each}
          {/if}
        </select>
        <div class="custom-cwd-group">
          <label for="launch-custom-cwd" class="section-label-inline">Or enter a custom path</label>
          <input
            id="launch-custom-cwd"
            type="text"
            class="text-field"
            placeholder="/path/to/project"
            bind:value={customCwd}
          />
        </div>
      </div>

      {#if isCustom()}
        <div class="section">
          <label for="launch-custom-cmd" class="section-label">Custom Command</label>
          <input
            id="launch-custom-cmd"
            type="text"
            class="text-field"
            placeholder="e.g. node server.js"
            bind:value={customCommand}
          />
        </div>
      {/if}

      <button
        class="launch-btn"
        disabled={launching || (!isCustom() ? false : !customCommand.trim())}
        onclick={handleLaunch}
      >
        {#if launching}
          Launching...
        {:else}
          Launch Terminal
        {/if}
      </button>

      {#if launchError}
        <div class="launch-error">{launchError}</div>
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
    padding: var(--space-4) var(--space-5) calc(var(--space-8, 32px) + env(safe-area-inset-bottom, 0px));
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

  .preset-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-2);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast);
    min-height: 48px;
  }

  .preset-card:hover:not(.selected) {
    border-color: var(--preset-border);
    background: var(--preset-bg);
  }

  .preset-card.selected {
    border-color: var(--preset-border);
    border-width: 2px;
    background: var(--preset-bg);
    box-shadow: 0 0 0 1px var(--preset-border);
    font-weight: 600;
  }

  .preset-label {
    font-weight: 500;
  }

  .select-field {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--ds-gray-200);
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    cursor: pointer;
    min-height: 44px;
  }

  .select-field:focus {
    outline: none;
    border-color: var(--ds-green-700);
  }

  .custom-cwd-group {
    margin-top: var(--space-2);
  }

  .section-label-inline {
    display: block;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-tertiary);
    margin-bottom: var(--space-1);
  }

  .text-field {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--ds-gray-200);
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    min-height: 44px;
  }

  .text-field::placeholder {
    color: var(--text-tertiary);
  }

  .text-field:focus {
    outline: none;
    border-color: var(--ds-green-700);
  }

  .launch-btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: none;
    background: var(--ds-green-700);
    color: #fff;
    font-size: var(--text-base);
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    min-height: 48px;
    transition:
      opacity var(--transition-fast),
      background var(--transition-fast);
    margin-top: var(--space-2);
  }

  .launch-btn:hover:not(:disabled) {
    background: var(--ds-green-900);
  }

  .launch-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .launch-error {
    margin-top: var(--space-3, 12px);
    padding: var(--space-3, 12px);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md, 8px);
    color: #ef4444;
    font-size: 13px;
    text-align: center;
  }
</style>
