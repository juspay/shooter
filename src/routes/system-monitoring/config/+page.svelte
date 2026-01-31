<script lang="ts">
  import { goto } from '$app/navigation';
  let apiKey = '';
  let deviceToken = '';
  let result = '';
  let loading = false;
  let statusType = '';

  // Smart defaults for local development
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    apiKey = 'your-api-key-here';
    deviceToken = 'your-device-token-here';
  }

  async function saveConfiguration() {
    loading = true;
    result = '';
    statusType = '';

    try {
      // Save to localStorage for persistence
      localStorage.setItem('shooter_config', JSON.stringify({
        apiKey: apiKey.trim(),
        deviceToken: deviceToken.trim(),
        lastUpdated: Date.now()
      }));

      // Test the configuration
      const response = await fetch('/health');
      const _data = await response.json();
      
      if (response.ok) {
        result = '✅ Configuration saved and tested successfully!';
        statusType = 'success';
        
        // Redirect to home after success
        setTimeout(() => {
          goto('/');
        }, 2000);
      } else {
        result = '⚠️ Configuration saved but system health check failed';
        statusType = 'warning';
      }
    } catch (error) {
      result = `❌ Configuration failed: ${(error as Error).message}`;
      statusType = 'error';
    } finally {
      loading = false;
    }
  }

  async function testConfiguration() {
    if (!apiKey.trim()) {
      result = 'Error: API key is required for testing';
      statusType = 'error';
      return;
    }

    loading = true;
    result = '';
    statusType = '';

    try {
      const testPayload: {
        title: string;
        message: string;
        data: { source: string; timestamp: number };
        deviceToken?: string;
      } = {
        title: '🔧 SHOOTER Config Test',
        message: `Configuration test at ${new Date().toLocaleTimeString()}`,
        data: { source: 'config-test', timestamp: Date.now() }
      };

      if (deviceToken.trim()) {
        testPayload.deviceToken = deviceToken.trim();
      }

      const response = await fetch('/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(testPayload)
      });

      const data = await response.json();
      
      if (response.ok) {
        result = '✅ Test notification sent successfully! Check your device.';
        statusType = 'success';
      } else {
        result = `❌ Test failed: ${data.error || 'Unknown error'}`;
        statusType = 'error';
      }
    } catch (error) {
      result = `❌ Network Error: ${(error as Error).message}`;
      statusType = 'error';
    } finally {
      loading = false;
    }
  }

  // Load saved configuration on mount
  import { onMount } from 'svelte';
  onMount(() => {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.apiKey) {
apiKey = config.apiKey;
}
        if (config.deviceToken) {
deviceToken = config.deviceToken;
}
      }
    } catch (_e) {
      console.log('No saved configuration found');
    }
  });
</script>

<svelte:head>
  <title>Configuration - SHOOTER</title>
  <meta name="description" content="Configure SHOOTER notification system settings" />
</svelte:head>

<div class="config-page u-flex u-flex-col u-gap-xl">
  <header class="u-flex u-flex-col u-gap-sm u-items-center u-text-center">
    <button class="global-button-base global-button-tertiary global-button-sm" on:click={() => goto('/')}>
      ← Notifications
    </button>
    <div class="u-flex u-flex-col u-gap-xxs">
      <h1>⚙️ Configuration</h1>
      <p>Setup your notification system</p>
    </div>
  </header>

  <section class="u-flex u-flex-col u-gap-md">
    <article class="global-card-base u-mb-0">
      <div class="global-card-header">
        <h2>🔐 API Configuration</h2>
        <p>Configure your SHOOTER API credentials</p>
      </div>
      <div class="global-card-content u-flex u-flex-col u-gap-md">
        <div class="global-form-group">
          <label for="apiKey">API Key</label>
          <input
            id="apiKey"
            class="global-input-base"
            bind:value={apiKey}
            type="password"
            placeholder="Enter your API key"
          />
          <small>Required for sending notifications to the SHOOTER system</small>
        </div>

        <div class="global-form-group">
          <label for="deviceToken">Device Token</label>
          <input
            id="deviceToken"
            class="global-input-base"
            bind:value={deviceToken}
            type="text"
            placeholder="Your iOS device token"
          />
          <small>64-character hex string from your iOS device registration</small>
        </div>
      </div>
    </article>

    <article class="global-card-base u-mb-0">
      <div class="global-card-header">
        <h2>🧪 Testing</h2>
        <p>Test your configuration settings</p>
      </div>
      <div class="global-card-content u-flex u-flex-wrap u-gap-sm u-justify-center">
        <button
          class="global-button-base global-button-primary"
          on:click={testConfiguration}
          disabled={loading || !apiKey.trim()}
        >
          {#if loading}
            <span class="global-spinner" aria-hidden="true"></span>
            Testing...
          {:else}
            📱 Send Test Notification
          {/if}
        </button>
        <button
          class="global-button-base global-button-secondary"
          on:click={saveConfiguration}
          disabled={loading || !apiKey.trim()}
        >
          {#if loading}
            <span class="global-spinner" aria-hidden="true"></span>
            Saving...
          {:else}
            💾 Save Configuration
          {/if}
        </button>
      </div>
    </article>

    {#if result}
      <article
        class={`global-card-base u-mb-0 ${
          statusType === 'success'
            ? 'global-card-success'
            : statusType === 'error'
            ? 'global-card-error'
            : statusType === 'warning'
            ? 'global-card-warning'
            : ''
        }`}
      >
        <div class="global-card-content">
          <p>{result}</p>
        </div>
      </article>
    {/if}

    <article class="global-card-base u-mb-0">
      <div class="global-card-header">
        <h2>ℹ️ Setup Guide</h2>
        <p>How to configure your system</p>
      </div>
      <div class="global-card-content">
        <ol class="setup-list">
          <li>
            <h3>Get Your API Key</h3>
            <p>Use the API key from your SHOOTER system environment variables.</p>
          </li>
          <li>
            <h3>Find Device Token</h3>
            <p>Get your 64-character device token from the iOS app registration logs.</p>
          </li>
          <li>
            <h3>Test & Save</h3>
            <p>Send a test notification to verify everything works, then save your settings.</p>
          </li>
        </ol>
      </div>
    </article>
  </section>
</div>


<style>
  .config-page {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--spacing-lg);
  }

  .setup-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin: 0;
    padding-left: var(--spacing-lg);
  }

  @media (max-width: 768px) {
    .config-page {
      padding: var(--spacing-md);
    }
  }
</style>
