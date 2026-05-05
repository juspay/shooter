<script lang="ts">
  import type { ProviderId } from '$lib/types';

  import { NEUROLINK_CDN_URL } from '$lib/modules/client/neurolink/cdn';
  import { installFetchProxy } from '$lib/modules/client/neurolink/fetch-proxy';
  import { PROVIDERS } from '$lib/modules/client/neurolink/provider-config';
  import { Button, Input, Pill } from '@juspay/svelte-ui-components';
  import { onMount } from 'svelte';

  const { data } = $props<{
    data: {
      litellmBaseUrl: string;
      litellmModel: string;
    };
  }>();

  let NL: null | Record<string, unknown> = $state(null);
  let sdk: null | {
    generate: (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
  } = $state(null);
  let logs = $state<{ text: string; type: string }[]>([]);
  let prompt = $state('');
  let loading = $state(false);
  let loaded = $state(false);
  let activeProvider = $state<ProviderId>('litellm');

  function log(text: string, type = 'info'): void {
    logs = [...logs, { text, type }];
  }

  function injectEnvKeys(): void {
    const p = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process;
    if (!p?.env) {
      return;
    }
    const env = p.env;
    if (data.litellmBaseUrl) {
      env.LITELLM_BASE_URL = data.litellmBaseUrl;
    }
    if (data.litellmModel) {
      env.LITELLM_MODEL = data.litellmModel;
    }

    // All providers go through the server proxy. Inject dummy placeholders so
    // the SDK's env-var validation passes — the fetch proxy strips these and
    // injects real keys server-side.
    const flags = (window as unknown as Record<string, Record<string, boolean>>).__aiProviders;
    if (flags?.['google-ai']) {
      env.GOOGLE_AI_API_KEY = 'proxy-via-server';
    }
    if (flags?.anthropic) {
      env.ANTHROPIC_API_KEY = 'proxy-via-server';
    }
    if (flags?.openai) {
      env.OPENAI_API_KEY = 'proxy-via-server';
    }
    if (flags?.mistral) {
      env.MISTRAL_API_KEY = 'proxy-via-server';
    }
  }

  onMount(async () => {
    installShims();
    installFetchProxy();
    injectEnvKeys();

    log('Loading NeuroLink from CDN...');
    log(NEUROLINK_CDN_URL, 'dim');

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      NL = await import(/* @vite-ignore */ NEUROLINK_CDN_URL);
      log(`Loaded! ${Object.keys(NL ?? {}).length} exports`, 'pass');
      sdk = new (
        NL as Record<
          string,
          new (opts: Record<string, unknown>) => {
            generate: (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
          }
        >
      ).NeuroLink({ provider: activeProvider });
      log(`NeuroLink ready · provider: ${activeProvider}`, 'pass');
      loaded = true;
    } catch (e: unknown) {
      log(`Failed to load: ${e instanceof Error ? e.message : String(e)}`, 'fail');
    }
  });

  function switchProvider(id: ProviderId): void {
    if (!NL || id === activeProvider) {
      return;
    }
    activeProvider = id;
    sdk = new (
      NL as Record<
        string,
        new (opts: Record<string, unknown>) => {
          generate: (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
        }
      >
    ).NeuroLink({ provider: id });
    log(`Switched to provider: ${id}`, 'dim');
  }

  /** Ensure global shims exist — app.html normally installs them,
   *  but guard in case this page loads before the inline script runs. */
  function installShims(): void {
    if (typeof globalThis.process === 'undefined') {
      (globalThis as unknown as { process: Record<string, unknown> }).process = {
        cwd: (): string => '/',
        env: {},
        platform: 'browser',
        version: 'v24.0.0',
      };
    }
    if (typeof globalThis.global === 'undefined') {
      (globalThis as unknown as { global: typeof globalThis }).global = globalThis;
    }
  }

  async function send(): Promise<void> {
    if (!prompt.trim() || !sdk || loading) {
      return;
    }
    const input = prompt.trim();
    prompt = '';
    loading = true;
    log(`> ${input}`, 'user');

    const prov = PROVIDERS.find((p) => p.id === activeProvider);
    if (!prov) {
      loading = false;
      return;
    }
    try {
      const result = await sdk.generate({
        input: { text: input },
        model: prov.model,
        provider: prov.id,
      });
      const content = typeof result.content === 'string' ? result.content : '(empty response)';
      const usage = result.usage as undefined | { total?: number };
      log(content, 'ai');
      log(`${prov.id}/${prov.model} | ${usage?.total ?? '?'} tokens`, 'dim');
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`, 'fail');
    }
    loading = false;
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }
</script>

<div class="page">
  <header>
    <h1>NeuroLink</h1>
    <span class="version">new NeuroLink()</span>
    {#if loaded}
      <Pill text="Connected" classes="pill-connected" />
    {:else}
      <Pill text="Loading..." classes="pill-loading" />
    {/if}
  </header>

  {#if loaded}
    <div class="provider-bar">
      {#each PROVIDERS as p (p.id)}
        <Pill
          text={p.label}
          classes="prov-pill {activeProvider === p.id ? 'prov-pill--active' : ''}"
          onclick={(): void => {
            switchProvider(p.id);
          }}
        />
      {/each}
    </div>
  {/if}

  <div class="log" id="log">
    {#each logs as entry, i (i)}
      <div class="log-entry {entry.type}">{entry.text}</div>
    {/each}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="input-bar" onkeydown={handleKeydown}>
    <Input
      name="prompt"
      bind:value={prompt}
      placeholder={loaded ? `Ask anything... [${activeProvider}]` : 'Loading SDK...'}
      classes="input-prompt"
    />
    <Button
      classes="btn-primary"
      onclick={send}
      disabled={!loaded || loading || !prompt.trim()}
      text={loading ? '...' : 'Send'}
    />
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--background);
    color: var(--text-primary);
    font-family: var(--font-mono);
    padding: 0;
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  h1 {
    font-size: var(--text-lg);
    color: var(--ds-blue-700);
    margin: 0;
  }

  .version {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  :global(.pill-connected) {
    --pill-background: var(--ds-green-100);
    --pill-color: var(--ds-green-700);
    --pill-font-size: var(--text-xs);
  }

  :global(.pill-loading) {
    --pill-background: var(--ds-amber-100);
    --pill-color: var(--ds-amber-700);
    --pill-font-size: var(--text-xs);
  }

  .provider-bar {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  :global(.prov-pill) {
    --pill-background: var(--component-bg);
    --pill-color: var(--text-tertiary);
    --pill-font-size: var(--text-xs);
    --pill-cursor: pointer;
    --pill-border-radius: var(--radius-md);
  }

  :global(.prov-pill:hover) {
    --pill-color: var(--text-primary);
  }

  :global(.prov-pill--active) {
    --pill-background: var(--ds-blue-100);
    --pill-color: var(--ds-blue-700);
  }

  .log {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  .log-entry {
    white-space: pre-wrap;
    margin-bottom: var(--space-1);
  }

  .log-entry.pass {
    color: var(--ds-green-900);
  }

  .log-entry.fail {
    color: var(--ds-red-900);
  }

  .log-entry.dim {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .log-entry.user {
    color: var(--ds-blue-700);
    font-weight: bold;
  }

  .log-entry.ai {
    color: var(--text-primary);
    padding: var(--space-2) var(--space-3);
    background: var(--component-bg);
    border-radius: var(--radius-md);
    margin: var(--space-1) 0;
  }

  .input-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
  }

  .input-bar :global(.input-prompt) {
    flex: 1;
    --input-font-family: var(--font-mono);
    --input-background: var(--component-bg);
    --input-border: 1px solid var(--border-hover);
    --input-focus-border: 1px solid var(--ds-blue-700);
    --input-container-margin: 0;
  }
</style>
