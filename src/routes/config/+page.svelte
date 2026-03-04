<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Alert, Button, Card, Icon, Input } from '$lib/modules/client/common';
  import { onMount } from 'svelte';

  interface Config {
    apiKey: string;
    deviceToken: string;
    lastUpdated: number;
  }

  let apiKey = $state('');
  let deviceToken = $state('');
  let result = $state('');
  let loading = $state(false);
  let statusType = $state<'' | 'error' | 'success' | 'warning'>('');

  onMount(() => {
    if (browser) {
      try {
        const saved = localStorage.getItem('shooter_config');
        if (saved) {
          const config = JSON.parse(saved) as Config;
          if (config.apiKey) {
            apiKey = config.apiKey;
          }
          if (config.deviceToken) {
            deviceToken = config.deviceToken;
          }
        }
      } catch {
        console.log('No saved configuration found');
      }
    }
  });

  async function saveConfiguration(): Promise<void> {
    loading = true;
    result = '';
    statusType = '';

    try {
      localStorage.setItem(
        'shooter_config',
        JSON.stringify({
          apiKey: apiKey.trim(),
          deviceToken: deviceToken.trim(),
          lastUpdated: Date.now(),
        } satisfies Config)
      );

      const response = await fetch('/api/health');

      if (response.ok) {
        result = 'Configuration saved successfully';
        statusType = 'success';

        setTimeout(() => {
          void goto('/');
        }, 1500);
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
      apiKey = '';
      deviceToken = '';
      result = 'Configuration cleared';
      statusType = 'success';
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
        <Card title="API Configuration" description="Enter your authentication credentials">
          <Input
            id="apiKey"
            label="API Key"
            bind:value={apiKey}
            type="password"
            placeholder="Enter your API key"
            hint="Required for sending notifications"
          />

          <Input
            id="deviceToken"
            label="Device Token"
            bind:value={deviceToken}
            type="text"
            placeholder="64-character hex string"
            hint="iOS device token from app registration"
            mono={true}
          />
        </Card>

        {#if result}
          <Alert message={result} type={statusType || 'info'} />
        {/if}

        <div class="button-group">
          <Button
            variant="secondary"
            onclick={testConfiguration}
            disabled={loading || !apiKey.trim()}
          >
            {#if !loading}
              <Icon name="play" size={14} />
            {/if}
            Test Connection
          </Button>
          <Button
            variant="primary"
            onclick={saveConfiguration}
            disabled={loading || !apiKey.trim()}
            {loading}
          >
            Save Changes
          </Button>
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

        <Card title="Danger Zone">
          <p class="danger-description">Clear all saved configuration data from this device.</p>
          <Button variant="danger" size="sm" onclick={clearConfiguration}>
            Clear Configuration
          </Button>
        </Card>
      </aside>
    </div>
  </div>
</main>

<style>
  .settings-container {
    max-width: 900px;
    margin: 0 auto;
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

  .danger-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-bottom: var(--space-4);
    line-height: var(--leading-relaxed);
  }

  @media (max-width: 768px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }

    .settings-sidebar {
      order: -1;
    }

    .button-group {
      flex-direction: column;
    }

    .button-group :global(.btn) {
      width: 100%;
    }
  }
</style>
