<script lang="ts">
  import type { ShooterConfig } from '$lib/types/config';

  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Banner, Button, Input } from '@juspay/svelte-ui-components';
  import { Card, hasScanner, Icon, isShooterConfig, scanQR } from '$lib/modules/client/common';
  import { onMount } from 'svelte';

  let serverUrl = $state('');
  let apiKey = $state('');
  let deviceToken = $state('');
  let result = $state('');
  let loading = $state(false);
  let statusType = $state<'' | 'error' | 'success' | 'warning'>('');
  let isNativeApp = $state(false);
  let qrDataUrl = $state('');
  let qrServerUrl = $state('');
  let qrLoading = $state(false);
  let qrError = $state('');
  let canScan = $state(false);
  let bridgeCheckDone = $state(false);
  let scanLoading = $state(false);

  async function fetchQrCode(): Promise<void> {
    if (!apiKey.trim()) {
      qrError = 'Save an API key first to generate a QR code';
      return;
    }

    qrLoading = true;
    qrError = '';

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
      const err = error as Error;
      qrError = `Network error: ${err.message}`;
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
        result = 'Configuration updated from QR code';
        statusType = 'success';
      } catch {
        result = 'Invalid QR code data';
        statusType = 'error';
      }
    } catch (error) {
      const err = error as Error;
      if (err.message !== 'cancelled') {
        result = `Scanner error: ${err.message}`;
        statusType = 'error';
      }
    } finally {
      scanLoading = false;
    }
  }

  function getNativeBridge(): {
    getConfig(): string;
    saveConfig(json: string): void;
    getFcmToken(): string;
    getPlatform(): string;
  } | null {
    if (typeof window !== 'undefined' && 'ShooterBridge' in window) {
      return (window as Record<string, unknown>).ShooterBridge as {
        getConfig(): string;
        saveConfig(json: string): void;
        getFcmToken(): string;
        getPlatform(): string;
      };
    }
    return null;
  }

  function getDefaultServerUrl(): string {
    return window.location.origin;
  }

  onMount(() => {
    if (browser) {
      try {
        serverUrl = getDefaultServerUrl();
        const saved = localStorage.getItem('shooter_config');
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (isShooterConfig(parsed)) {
            if (parsed.apiKey) {
              apiKey = parsed.apiKey;
            }
            if (parsed.deviceToken) {
              deviceToken = parsed.deviceToken;
            }
            if (parsed.serverUrl) {
              serverUrl = parsed.serverUrl;
            }
          } else {
            localStorage.removeItem('shooter_config');
          }
        }
      } catch {
        // No saved configuration — expected on first visit
      }

      const bridge = getNativeBridge();
      if (bridge) {
        isNativeApp = true;
        try {
          const nativeConfig = JSON.parse(bridge.getConfig());
          // If native has config, use it (native is source of truth for credentials)
          if (nativeConfig.serverUrl && !serverUrl) {
            serverUrl = nativeConfig.serverUrl;
          }
          if (nativeConfig.apiKey) {
            apiKey = nativeConfig.apiKey;
          }
          // Auto-populate device token with FCM token
          const fcmToken = bridge.getFcmToken();
          if (fcmToken) {
            deviceToken = fcmToken;
          }
        } catch {
          // Bridge communication failed
        }
      }

      canScan = hasScanner();
      bridgeCheckDone = true;

      // The native bridge may be injected after SvelteKit hydration.
      // Re-check periodically for a short window to catch late injection.
      if (!canScan) {
        const recheckInterval = setInterval(() => {
          canScan = hasScanner();
          if (canScan) {
            clearInterval(recheckInterval);
          }
        }, 200);
        // Stop checking after 3 seconds
        setTimeout(() => clearInterval(recheckInterval), 3000);
      }
    }
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
          deviceToken: deviceToken.trim(),
          lastUpdated: Date.now(),
          serverUrl: trimmedUrl || getDefaultServerUrl(),
        } satisfies ShooterConfig)
      );

      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveConfig(
          JSON.stringify({
            serverUrl: trimmedUrl || getDefaultServerUrl(),
            apiKey: apiKey.trim(),
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
    } catch (error) {
      const err = error as Error;
      result = `Configuration failed: ${err.message}`;
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
      const testPayload: {
        data: Record<string, unknown>;
        deviceToken?: string;
        message: string;
        title: string;
      } = {
        data: { source: 'config-test', timestamp: Date.now() },
        message: `Configuration test at ${new Date().toLocaleTimeString()}`,
        title: 'Configuration Test',
      };

      if (deviceToken.trim()) {
        testPayload.deviceToken = deviceToken.trim();
      }

      const response = await fetch('/api/notify', {
        body: JSON.stringify(testPayload),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        result = 'Test notification sent successfully';
        statusType = 'success';
      } else {
        result = `Test failed: ${data.error || 'Unknown error'}`;
        statusType = 'error';
      }
    } catch (error) {
      const err = error as Error;
      result = `Network error: ${err.message}`;
      statusType = 'error';
    }

    loading = false;
  }

  function clearConfiguration(): void {
    if (browser) {
      localStorage.removeItem('shooter_config');
      serverUrl = typeof window !== 'undefined' ? window.location.origin : '';
      apiKey = '';
      deviceToken = '';
      result = 'Configuration cleared';
      statusType = 'success';

      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveConfig(JSON.stringify({ serverUrl: '', apiKey: '' }));
      }
    }
  }
</script>

<svelte:head>
  <title>Settings - Shooter</title>
  <meta name="description" content="Configure notification system settings" />
</svelte:head>

<main class="main">
  <div class="settings-container">
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-description">Configure your API credentials and notification preferences</p>
    </div>

    <div class="settings-grid">
      <section class="settings-section">
        <Card title="Server Configuration" description="Configure server connection and credentials">
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

          <Input
            name="deviceToken"
            label="Device Token"
            bind:value={deviceToken}
            dataType="text"
            placeholder={isNativeApp ? 'Waiting for token...' : '64-character hex string'}
            infoMessage={isNativeApp && deviceToken ? 'Auto-detected from app' : 'Device token from app registration'}
            classes="input-mono"
          />
        </Card>

        {#if result}
          {@const bannerIcon = statusType === 'success' ? 'check-circle' : statusType === 'error' ? 'x-circle' : 'alert-triangle'}
          <Banner text={result} classes="banner-{statusType || 'info'}">
            {#snippet icon()}
              <Icon name={bannerIcon} size={16} />
            {/snippet}
          </Banner>
        {/if}

        <div class="button-group">
          <Button
            classes="btn-secondary"
            onclick={testConfiguration}
            disabled={loading || !apiKey.trim()}
          >
            {#snippet children()}
              {#if !loading}
                <Icon name="play" size={14} />
              {/if}
              Test Connection
            {/snippet}
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
          <ol class="setup-steps">
            <li class="step">
              <span class="step-number">1</span>
              <div class="step-content">
                <h4>Get API Key</h4>
                <p>Retrieve the API key from your environment variables</p>
              </div>
            </li>
            <li class="step">
              <span class="step-number">2</span>
              <div class="step-content">
                <h4>Find Device Token</h4>
                <p>Get the 64-character token from iOS app logs</p>
              </div>
            </li>
            <li class="step">
              <span class="step-number">3</span>
              <div class="step-content">
                <h4>Test Connection</h4>
                <p>Verify credentials work before saving</p>
              </div>
            </li>
          </ol>
        </Card>

        <Card title="Mobile App Setup" description={canScan ? 'Scan a QR code to connect' : 'Scan to connect your mobile app'}>
          <div class="qr-section">
            {#if canScan}
              <p class="qr-description">
                Scan the QR code shown on your server's settings page to auto-configure
                the connection.
              </p>
              <Button classes="btn-secondary btn-sm" onclick={handleScanQR} disabled={scanLoading}
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
                  Generate a QR code containing your server URL and API key. Your mobile app can scan
                  it to auto-configure the connection.
                </p>
              {/if}
              <Button classes="btn-secondary btn-sm" onclick={fetchQrCode} disabled={qrLoading || !apiKey.trim()}
                text={qrDataUrl ? 'Regenerate QR Code' : 'Generate QR Code'}
              />
            {/if}
          </div>
        </Card>

        <Card title="Danger Zone">
          <p class="danger-description">Clear all saved configuration data from this device.</p>
          <Button classes="btn-danger btn-sm" onclick={clearConfiguration}
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
    padding-bottom: 80px;
  }

  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-title {
    font-size: var(--text-2xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin-bottom: var(--space-1);
  }

  .page-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
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

  .setup-steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .step {
    display: flex;
    gap: var(--space-3);
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--component-bg-active);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .step-content h4 {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: var(--space-1);
  }

  .step-content p {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    line-height: var(--leading-relaxed);
  }

  .qr-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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
    border-color: rgba(217, 48, 54, 0.3);
  }

  .danger-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-bottom: var(--space-4);
    line-height: var(--leading-relaxed);
    padding-left: var(--space-3);
    border-left: 3px solid rgba(217, 48, 54, 0.5);
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
