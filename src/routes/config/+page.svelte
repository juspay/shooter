<script lang="ts">
  import type {
    ConfigPageData,
    DeviceListItem,
    NativeBridgeConfig,
    ShooterConfig,
  } from '$lib/types';

  import { browser } from '$app/environment';
  import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw';
  import CheckCircleSvg from '$lib/assets/icons/check-circle.svg?raw';
  import PlaySvg from '$lib/assets/icons/play.svg?raw';
  import XCircleSvg from '$lib/assets/icons/x-circle.svg?raw';
  import { hasScanner, isShooterConfig, scanQR, toErrorMessage } from '$lib/modules/client/common';
  import { PROVIDERS } from '$lib/modules/client/neurolink/provider-config';
  import { Banner, Button, Card, Icon, Input, Stepper } from '@juspay/svelte-ui-components';
  import { onMount } from 'svelte';

  const { data }: { data: ConfigPageData } = $props();

  let serverUrl = $state('');
  let apiKey = $state('');
  let registeredDevices = $state<DeviceListItem[]>([]);
  let loadingDevices = $state(false);
  let loadDevicesError = $state('');
  let thisDeviceId = $state('');
  let result = $state('');
  let loading = $state(false);
  let statusType = $state<'' | 'error' | 'success' | 'warning'>('');
  let qrDataUrl = $state('');
  let qrServerUrl = $state('');
  let qrLoading = $state(false);
  let qrError = $state('');
  let canScan = $state(false);
  let _bridgeCheckDone = $state(false);
  let bridgeHydrated = false;
  let scanLoading = $state(false);

  async function fetchQrCode(): Promise<void> {
    if (!apiKey.trim()) {
      qrError = 'Save an API key first to generate a QR code';
      return;
    }

    qrLoading = true;
    qrError = '';
    qrDataUrl = '';
    qrServerUrl = '';

    try {
      const response = await fetch('/api/qr-config', {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        qrError = data.error || 'Failed to generate QR code';
        return;
      }

      const data = (await response.json()) as { dataUrl: string; serverUrl: string };
      qrDataUrl = data.dataUrl;
      qrServerUrl = data.serverUrl;
    } catch (error) {
      qrError = `Network error: ${toErrorMessage(error)}`;
    } finally {
      qrLoading = false;
    }
  }

  async function handleScanQR(): Promise<void> {
    scanLoading = true;
    result = '';
    statusType = '';

    try {
      // scanQR() returns the raw scanned string (JSON with serverUrl + apiKey)
      // Throws on cancel or error
      const scannedData = await scanQR();
      try {
        const config = JSON.parse(scannedData) as Record<string, unknown>;
        if (typeof config.serverUrl === 'string' && config.serverUrl) {
          serverUrl = config.serverUrl;
        }
        if (typeof config.apiKey === 'string' && config.apiKey) {
          apiKey = config.apiKey;
        }
        await saveConfiguration();
        // Only show QR success if saveConfiguration() didn't set an error/warning
        const savedStatus: string = statusType;
        if (savedStatus !== 'error' && savedStatus !== 'warning') {
          result = 'Configuration updated from QR code';
          statusType = 'success';
        }
      } catch {
        result = 'Invalid QR code data';
        statusType = 'error';
      }
    } catch (error) {
      const msg = toErrorMessage(error);
      if (msg !== 'cancelled') {
        result = `Scanner error: ${msg}`;
        statusType = 'error';
      }
    } finally {
      scanLoading = false;
    }
  }

  function getNativeBridge(): null | typeof window.ShooterBridge {
    if (typeof window === 'undefined') {
      return null;
    }
    // iOS injects window.ShooterBridge, Android injects window.ShooterNativeBridge
    if (window.ShooterBridge) {
      return window.ShooterBridge;
    }
    if (window.ShooterNativeBridge) {
      return window.ShooterNativeBridge;
    }
    return null;
  }

  function getDefaultServerUrl(): string {
    return window.location.origin;
  }

  /** Attempt to read config from the native bridge and hydrate state.
   *  Only performs the full hydration (overwriting form fields) once.
   *  Subsequent calls only refresh the `canScan` flag so re-polling
   *  for a late-injected bridge does not clobber user edits. */
  function hydrateBridge(): void {
    const bridge = getNativeBridge();
    if (bridge && !bridgeHydrated) {
      try {
        const nativeConfig = JSON.parse(
          bridge.getConfig?.() ?? '{}'
        ) as Partial<NativeBridgeConfig>;
        // If native has config, use it (native is source of truth for credentials).
        // Native serverUrl always overrides — it is set before the browser
        // fallback (window.location.origin) so the native value wins.
        if (nativeConfig.serverUrl) {
          serverUrl = nativeConfig.serverUrl;
        }
        if (nativeConfig.apiKey) {
          apiKey = nativeConfig.apiKey;
        }
        // Capture this device's stable id so the registered-devices list can
        // highlight "this device". The app registers its own push token
        // directly via /api/device-token — no manual token entry here.
        const bridgeDeviceId = bridge.getDeviceId?.();
        if (bridgeDeviceId) {
          thisDeviceId = bridgeDeviceId;
        }
        // Mark hydrated only after native reads succeeded
        bridgeHydrated = true;
      } catch {
        // Bridge communication failed — leave bridgeHydrated false so
        // a subsequent poll can retry once the bridge is ready.
      }
    }
    canScan = hasScanner();
  }

  onMount(() => {
    if (browser) {
      // Auto-configure from URL fragment (#key=...&url=...) to avoid
      // exposing secrets in the request URL, browser history, or referrer headers.
      const hash = window.location.hash.slice(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        const paramKey = params.get('key');
        const paramUrl = params.get('url');
        if (paramKey) {
          apiKey = paramKey;
          if (paramUrl) {
            serverUrl = paramUrl;
          }
          void saveConfiguration();
          // Clean fragment so the key doesn't linger
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
      if (!apiKey) {
        try {
          const saved = localStorage.getItem('shooter_config');
          if (saved) {
            const parsed: unknown = JSON.parse(saved);
            if (isShooterConfig(parsed)) {
              if (parsed.apiKey) {
                apiKey = parsed.apiKey;
              }
              if (parsed.serverUrl) {
                serverUrl = parsed.serverUrl;
              }
              // Migration: drop the legacy single deviceToken from stored config —
              // devices are now managed server-side via the registry.
              if (parsed.deviceToken) {
                localStorage.setItem(
                  'shooter_config',
                  JSON.stringify({ ...parsed, deviceToken: null } satisfies ShooterConfig)
                );
              }
            } else {
              localStorage.removeItem('shooter_config');
            }
          }
        } catch {
          // No saved configuration — expected on first visit
        }
      }

      // Hydrate from native bridge BEFORE applying the browser default.
      // This lets native-provided serverUrl take precedence over
      // window.location.origin.
      hydrateBridge();
      if (!serverUrl) {
        serverUrl = getDefaultServerUrl();
      }
      _bridgeCheckDone = true;
      void loadDevices();

      // The native bridge may be injected after SvelteKit hydration.
      // Re-check periodically for a short window to catch late injection.
      if (!canScan) {
        const recheckInterval = setInterval(() => {
          hydrateBridge();
          if (canScan) {
            clearInterval(recheckInterval);
          }
        }, 200);
        // Stop checking after 3 seconds
        const recheckTimeout = setTimeout(() => {
          clearInterval(recheckInterval);
        }, 3000);

        // Cancel both timers if the component unmounts before they fire,
        // so hydrateBridge() never writes to a destroyed component.
        return (): void => {
          clearInterval(recheckInterval);
          clearTimeout(recheckTimeout);
        };
      }
    }
    return undefined;
  });

  async function saveConfiguration(): Promise<void> {
    loading = true;
    result = '';
    statusType = '';

    try {
      const trimmedUrl = serverUrl.trim().replace(/\/+$/, '');
      localStorage.setItem(
        'shooter_config',
        JSON.stringify({
          apiKey: apiKey.trim(),
          deviceToken: null,
          lastUpdated: Date.now(),
          serverUrl: trimmedUrl || getDefaultServerUrl(),
        } satisfies ShooterConfig)
      );

      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveConfig?.(
          JSON.stringify({
            apiKey: apiKey.trim(),
            serverUrl: trimmedUrl || getDefaultServerUrl(),
          })
        );
      }

      const response = await fetch('/api/health');

      if (response.ok) {
        result = 'Configuration saved successfully';
        statusType = 'success';
      } else {
        result = 'Configuration saved but system health check failed';
        statusType = 'warning';
      }

      void loadDevices();
    } catch (error) {
      result = `Configuration failed: ${toErrorMessage(error)}`;
      statusType = 'error';
    }

    loading = false;
  }

  async function testConfiguration(): Promise<void> {
    if (!apiKey.trim()) {
      result = 'API key is required for testing';
      statusType = 'error';
      return;
    }

    loading = true;
    result = '';
    statusType = '';

    try {
      // No deviceToken override — the test now fans out to every registered
      // device, exactly like a real notification.
      const testPayload = {
        data: { source: 'config-test', timestamp: Date.now() },
        message: `Configuration test at ${new Date().toLocaleTimeString()}`,
        title: 'Configuration Test',
      };

      const response = await fetch('/api/notify', {
        body: JSON.stringify(testPayload),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      const data = (await response.json()) as Record<string, unknown>;

      if (response.ok) {
        result = 'Test notification sent successfully';
        statusType = 'success';
      } else {
        result = `Test failed: ${typeof data.error === 'string' ? data.error : 'Unknown error'}`;
        statusType = 'error';
      }
    } catch (error) {
      result = `Network error: ${toErrorMessage(error)}`;
      statusType = 'error';
    }

    loading = false;
  }

  function clearConfiguration(): void {
    if (browser) {
      localStorage.removeItem('shooter_config');
      serverUrl = typeof window !== 'undefined' ? window.location.origin : '';
      apiKey = '';
      registeredDevices = [];
      result = 'Configuration cleared';
      statusType = 'success';

      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveConfig?.(JSON.stringify({ apiKey: '', serverUrl: '' }));
      }
    }
  }

  /** Load the registered-devices list from the server registry. */
  async function loadDevices(): Promise<void> {
    if (!apiKey.trim()) {
      registeredDevices = [];
      loadDevicesError = '';
      return;
    }
    loadingDevices = true;
    try {
      const response = await fetch('/api/device-token', {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (response.ok) {
        const data = (await response.json()) as { devices?: DeviceListItem[] };
        registeredDevices = Array.isArray(data.devices) ? data.devices : [];
        loadDevicesError = '';
      } else {
        // Distinguish a load failure from a genuinely empty list — otherwise a
        // 401 (wrong key) shows the misleading "No devices registered yet".
        registeredDevices = [];
        loadDevicesError =
          response.status === 401
            ? 'Could not load devices: the API key was rejected (401). Check the key above.'
            : `Could not load devices (HTTP ${response.status}).`;
      }
    } catch (error) {
      registeredDevices = [];
      loadDevicesError = `Could not load devices: ${toErrorMessage(error)}`;
    }
    loadingDevices = false;
  }

  /** Remove a device from the registry, then refresh the list. */
  async function removeDevice(id: string): Promise<void> {
    result = '';
    statusType = '';
    try {
      const response = await fetch('/api/device-token', {
        body: JSON.stringify({ id }),
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        result = `Failed to remove device: ${data.error ?? response.statusText}`;
        statusType = 'error';
        return;
      }
    } catch (error) {
      result = `Failed to remove device: ${toErrorMessage(error)}`;
      statusType = 'error';
      return;
    }
    await loadDevices();
  }
</script>

<svelte:head>
  <title>Settings - Shooter</title>
  <meta name="description" content="Configure notification system settings" />
</svelte:head>

<main class="main">
  <div class="settings-container">
    <div style="margin-bottom: var(--space-4);">
      <a href="/" class="back-link">← Back to Projects</a>
    </div>
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-description">Configure your API credentials and notification preferences</p>
    </div>

    <div class="settings-grid">
      <section class="settings-section">
        <Card
          title="Server Configuration"
          description="Configure server connection and credentials"
        >
          <Input
            name="serverUrl"
            label="Server URL"
            bind:value={serverUrl}
            dataType="text"
            placeholder="https://shooter.breezehq.dev"
            infoMessage="Base URL of your Shooter server. Apps will reload with this URL on next launch."
          />

          <Input
            name="apiKey"
            label="API Key"
            bind:value={apiKey}
            dataType="password"
            placeholder="Enter your API key"
            infoMessage="Required for sending notifications"
          />
          <p class="input-help">
            Find this in your <code>~/.shooter/.env</code> file. Run <code>shooter setup</code> to generate
            one.
          </p>
        </Card>

        <Card title="Registered Devices" description="Phones that receive push notifications">
          {#if loadingDevices}
            <p class="input-help">Loading…</p>
          {:else if loadDevicesError}
            <p class="input-help" style="color: var(--color-error, #f87171);">{loadDevicesError}</p>
          {:else if registeredDevices.length === 0}
            <p class="input-help">
              No devices registered yet. Open the Shooter app on your phone with this server's URL +
              API key — it registers automatically. Every notification fans out to all devices here.
            </p>
          {:else}
            <ul class="device-list">
              {#each registeredDevices as device (device.id)}
                <li class="device-row">
                  <div class="device-meta">
                    <span class="device-name">
                      {device.friendlyName || device.deviceId || 'Unknown device'}
                      {#if device.deviceId && device.deviceId === thisDeviceId}
                        <span class="device-badge">this device</span>
                      {/if}
                    </span>
                    <span class="device-sub"
                      >{device.platform} · {device.appEnv} · {device.tokenMasked}</span
                    >
                  </div>
                  <Button
                    classes="btn-secondary"
                    onclick={(): void => void removeDevice(device.id)}
                    text="Remove"
                  />
                </li>
              {/each}
            </ul>
          {/if}
        </Card>

        {#if result}
          {@const bannerSvg =
            statusType === 'success'
              ? CheckCircleSvg
              : statusType === 'error'
                ? XCircleSvg
                : AlertTriangleSvg}
          <Banner text={result} classes="banner-{statusType || 'info'}">
            {#snippet icon()}
              <Icon svg={bannerSvg} classes="icon-16" />
            {/snippet}
          </Banner>
        {/if}

        <div class="button-group">
          <Button
            classes="btn-secondary"
            onclick={testConfiguration}
            disabled={loading || !apiKey.trim()}
          >
            {#if !loading}
              <Icon svg={PlaySvg} classes="icon-14" />
            {/if}
            Test Connection
          </Button>
          <Button
            classes="btn-primary"
            onclick={saveConfiguration}
            disabled={loading || !apiKey.trim()}
            showLoader={loading}
            text="Save Changes"
          />
        </div>
      </section>

      <aside class="settings-sidebar">
        <Card title="Setup Guide">
          <Stepper
            steps={[
              { label: 'Get API Key' },
              { label: 'Register a Device' },
              { label: 'Test Connection' },
            ]}
            currentStepIndex={apiKey.trim() && registeredDevices.length > 0
              ? 2
              : apiKey.trim()
                ? 1
                : 0}
            classes="setup-stepper"
          />
        </Card>

        <Card
          title="Mobile App Setup"
          description={canScan ? 'Scan a QR code to connect' : 'Scan to connect your mobile app'}
        >
          <div class="qr-section">
            {#if canScan}
              <p class="qr-description">
                Scan the QR code shown on your server's settings page to auto-configure the
                connection.
              </p>
              <Button
                classes="btn-secondary btn-sm"
                onclick={handleScanQR}
                disabled={scanLoading}
                text={scanLoading ? 'Scanning...' : 'Scan QR Code'}
              />
            {:else}
              {#if qrDataUrl}
                <div class="qr-container">
                  <img src={qrDataUrl} alt="QR code for mobile app pairing" class="qr-image" />
                </div>
                <p class="qr-hint">
                  Scan this QR code with the Shooter iOS or Android app to connect.
                </p>
                {#if qrServerUrl}
                  <p class="qr-server-url">
                    Server: <code>{qrServerUrl}</code>
                  </p>
                {/if}
              {:else if qrLoading}
                <div class="qr-placeholder">
                  <p class="qr-loading-text">Generating QR code...</p>
                </div>
              {:else if qrError}
                <p class="qr-error">{qrError}</p>
              {:else}
                <p class="qr-description">
                  Generate a QR code containing your server URL and API key. Your mobile app can
                  scan it to auto-configure the connection.
                </p>
              {/if}
              <Button
                classes="btn-secondary btn-sm"
                onclick={fetchQrCode}
                disabled={qrLoading || !apiKey.trim()}
                text={qrDataUrl ? 'Regenerate QR Code' : 'Generate QR Code'}
              />
            {/if}
          </div>
        </Card>

        <Card title="AI Providers" description="NeuroLink-powered summaries and AI features">
          <div class="ai-providers">
            {#each PROVIDERS as provider (provider.id)}
              <div class="provider-row">
                <Icon
                  svg={data.aiProviders[provider.id] ? CheckCircleSvg : XCircleSvg}
                  classes="icon-14"
                />
                <span class="provider-label">{provider.label}</span>
                <span class="provider-status" class:configured={data.aiProviders[provider.id]}>
                  {data.aiProviders[provider.id] ? 'configured' : 'not configured'}
                </span>
              </div>
            {/each}

            {#if data.activeProvider}
              <div class="active-provider">
                Active: <strong>{data.activeProvider}</strong>
              </div>
            {:else if Object.values(data.aiProviders).some(Boolean)}
              <div class="active-provider">Auto-detected from configured keys</div>
            {:else}
              <p class="ai-help">
                Run <code>shooter setup</code> to configure AI providers for summaries.
              </p>
            {/if}
          </div>
        </Card>

        <Card title="Danger Zone">
          <p class="danger-description">Clear all saved configuration data from this device.</p>
          <Button
            classes="btn-danger btn-sm"
            onclick={clearConfiguration}
            text="Clear Configuration"
          />
        </Card>
      </aside>
    </div>
  </div>
</main>

<style>
  .settings-container {
    max-width: 900px;
    margin: 0 auto;
    padding-bottom: var(--space-6);
  }

  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: var(--space-6);
    align-items: start;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .settings-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .button-group {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
  }

  :global(.setup-stepper) {
    --container-flex-direction: column;
    --step-flex-direction: row;
    --step-index-container-height: 24px;
    --step-index-container-width: 24px;
    --step-index-font-size: var(--text-xs);
    --step-text-font-size: var(--text-sm);
    --step-text-margin: 0 0 0 var(--space-3);
    --separator-display: none;
    --step-text-active-color: var(--text-primary);
    --step-text-completed-color: var(--ds-green-900);
    --step-index-container-active-background-color: var(--component-bg-active);
    --step-index-container-completed-background-color: var(--ds-green-700);
    --step-index-container-background-color: var(--component-bg-active);
    --step-index-color: var(--text-secondary);
    align-items: flex-start;
    gap: var(--space-3);
  }

  .qr-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .qr-section :global(.button-container) {
    align-self: center;
  }

  .qr-container {
    display: flex;
    justify-content: center;
    padding: var(--space-3);
    background: var(--ds-background-200);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .qr-image {
    width: 200px;
    height: 200px;
    border-radius: var(--radius-sm);
    image-rendering: pixelated;
  }

  .qr-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    background: var(--ds-background-200);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
  }

  .qr-loading-text {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .qr-hint {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: var(--leading-relaxed);
    text-align: center;
  }

  .qr-server-url {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-align: center;
  }

  .qr-server-url code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    background: var(--component-bg);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
  }

  .qr-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: var(--leading-relaxed);
  }

  .qr-error {
    font-size: var(--text-sm);
    color: var(--ds-red-900);
    line-height: var(--leading-relaxed);
  }

  .settings-sidebar :global(.card):last-child {
    border-color: color-mix(in srgb, var(--ds-red-700) 30%, transparent);
  }

  .ai-providers {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .provider-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  .provider-label {
    flex: 1;
    color: var(--text-primary);
  }
  .provider-status {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .provider-status.configured {
    color: var(--ds-green-900);
  }
  .active-provider {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }
  .ai-help {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    margin-top: var(--space-2);
  }
  .ai-help code {
    background: var(--ds-gray-200, #1a1a1a);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .danger-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-bottom: var(--space-4);
    line-height: var(--leading-relaxed);
    padding-left: var(--space-3);
    border-left: 3px solid color-mix(in srgb, var(--ds-red-700) 50%, transparent);
  }

  .input-help {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    margin-top: var(--space-1);
    margin-bottom: 0;
  }
  .input-help code {
    background: var(--ds-gray-200, #1a1a1a);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .device-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .device-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--ds-gray-200, #1a1a1a);
  }
  .device-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .device-name {
    font-size: var(--text-sm);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .device-badge {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--ds-green-900, #16a34a);
    border: 1px solid var(--ds-green-700, #16a34a);
    border-radius: var(--radius-sm);
    padding: 0 6px;
  }
  .device-sub {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
  }

  @media (max-width: 768px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }

    .button-group {
      flex-direction: column;
    }

    .button-group :global(button),
    .button-group :global(.button-container) {
      width: 100%;
    }
  }
</style>
