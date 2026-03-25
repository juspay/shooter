<script lang="ts">
  import { Banner, Button, Choicebox, Input, Select, Sheet } from '@juspay/svelte-ui-components';
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
    command: string;
    label: string;
  }

  let { apiKey, onClose, onLaunch, open = $bindable() }: Props = $props();

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

  function getCommand(): string {
    return presets[selectedPreset].command;
  }

  function getArgs(): string[] {
    return presets[selectedPreset].args;
  }

  function getEffectiveCwd(): string {
    const custom = customCwd.trim();
    if (custom) {return custom;}
    if (selectedCwd) {return selectedCwd;}
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
    } catch {
      launchError = 'Network error — is the server running?';
    } finally {
      launching = false;
    }
  }
</script>

<Sheet
  bind:open
  title="New Terminal"
  side="bottom"
  onclose={onClose}
  classes="launch-sheet"
>
  {#snippet content()}
    <div class="launch-form">
      <div class="section">
        <span class="section-label">Quick Launch</span>
        <div class="preset-grid">
          {#each presets as preset, i (preset.label)}
            <Choicebox
              mode="radio"
              selected={selectedPreset === i}
              onclick={() => selectPreset(i)}
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
          items={projectPaths.length > 0 ? projectPaths.map((p) => ({ id: p, label: p })) : [{ id: '', label: 'No recent projects' }]}
          value={selectedCwd ? [selectedCwd] : (projectPaths.length > 0 ? [projectPaths[0]] : [''])}
          placeholder="Select a project"
          onchange={(value) => { selectedCwd = value[0] || ''; }}
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
  {/snippet}
</Sheet>

<style>
  :global(.launch-sheet) {
    --sheet-background: var(--ds-gray-100);
    --sheet-overlay-background: rgba(0, 0, 0, 0.6);
    --sheet-overlay-z-index: 200;
    --sheet-z-index: 201;
    --sheet-height: auto;
    --sheet-max-height: 90vh;
    --sheet-box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
    --sheet-header-padding: var(--space-4) var(--space-5);
    --sheet-header-background: var(--ds-gray-100);
    --sheet-header-border-bottom: none;
    --sheet-title-font-size: var(--text-xl);
    --sheet-title-font-weight: 600;
    --sheet-title-color: var(--text-primary);
    --sheet-content-padding: 0 var(--space-5) calc(var(--space-8, 32px) + env(safe-area-inset-bottom, 0px));
    --sheet-close-button-color: var(--text-secondary);
    --sheet-close-button-hover-background: var(--component-bg-hover);
    --sheet-border: none;
  }

  /* Desktop: max width */
  @media (min-width: 768px) {
    :global(.launch-sheet) {
      --sheet-max-width: 480px;
    }
  }

  .launch-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
