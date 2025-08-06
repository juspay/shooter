<script>
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
      const response = await fetch('/api/health');
      const data = await response.json();
      
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
      result = `❌ Configuration failed: ${error.message}`;
      statusType = 'error';
    }

    loading = false;
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
      const testPayload = {
        title: '🔧 SHOOTER Config Test',
        message: `Configuration test at ${new Date().toLocaleTimeString()}`,
        data: { source: 'config-test', timestamp: Date.now() }
      };

      if (deviceToken.trim()) {
        testPayload.deviceToken = deviceToken.trim();
      }

      const response = await fetch('/api/notify', {
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
      result = `❌ Network Error: ${error.message}`;
      statusType = 'error';
    }

    loading = false;
  }

  // Load saved configuration on mount
  import { onMount } from 'svelte';
  onMount(() => {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.apiKey) apiKey = config.apiKey;
        if (config.deviceToken) deviceToken = config.deviceToken;
      }
    } catch (e) {
      console.log('No saved configuration found');
    }
  });
</script>

<svelte:head>
  <title>Configuration - SHOOTER</title>
  <meta name="description" content="Configure SHOOTER notification system settings" />
</svelte:head>

<div class="app">
  <header class="header">
    <div class="header-content">
      <button class="back-btn" on:click={() => goto('/')}>
        <span class="back-icon">←</span>
        <span>Notifications</span>
      </button>
      <div class="header-title">
        <h1>⚙️ Configuration</h1>
        <p>Setup your notification system</p>
      </div>
    </div>
  </header>

  <main class="main config-main">
    <div class="config-section">
      <div class="section-header">
        <h2>🔐 API Configuration</h2>
        <p>Configure your SHOOTER API credentials</p>
      </div>

      <div class="config-card">
        <div class="input-group">
          <label for="apiKey">API Key</label>
          <input 
            id="apiKey"
            bind:value={apiKey} 
            type="password" 
            placeholder="Enter your API key"
            class="input"
          />
          <small>Required for sending notifications to the SHOOTER system</small>
        </div>
        
        <div class="input-group">
          <label for="deviceToken">Device Token</label>
          <input 
            id="deviceToken"
            bind:value={deviceToken} 
            type="text"
            placeholder="Your iOS device token"
            class="input"
          />
          <small>64-character hex string from your iOS device registration</small>
        </div>
      </div>
    </div>

    <div class="config-section">
      <div class="section-header">
        <h2>🧪 Testing</h2>
        <p>Test your configuration settings</p>
      </div>

      <div class="action-buttons">
        <button 
          class="btn btn-primary"
          on:click={testConfiguration} 
          disabled={loading || !apiKey.trim()}
        >
          {#if loading}
            <div class="btn-spinner"></div>
            Testing...
          {:else}
            📱 Send Test Notification
          {/if}
        </button>
        
        <button 
          class="btn btn-success"
          on:click={saveConfiguration} 
          disabled={loading || !apiKey.trim()}
        >
          {#if loading}
            <div class="btn-spinner"></div>
            Saving...
          {:else}
            💾 Save Configuration
          {/if}
        </button>
      </div>
    </div>

    {#if result}
      <div class="config-section">
        <div class="result-card {statusType}">
          <div class="result-content">
            <p class="result-text">{result}</p>
          </div>
        </div>
      </div>
    {/if}

    <div class="config-section">
      <div class="section-header">
        <h2>ℹ️ Setup Guide</h2>
        <p>How to configure your system</p>
      </div>

      <div class="info-card">
        <div class="setup-steps">
          <div class="step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h4>Get Your API Key</h4>
              <p>Use the API key from your SHOOTER system environment variables</p>
            </div>
          </div>
          
          <div class="step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h4>Find Device Token</h4>
              <p>Get your 64-character device token from the iOS app registration logs</p>
            </div>
          </div>
          
          <div class="step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h4>Test & Save</h4>
              <p>Send a test notification to verify everything works, then save your settings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>

<style>
  .config-main {
    max-width: 600px;
    margin: 0 auto;
    padding: var(--spacing-lg);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .back-btn:hover {
    background: var(--bg-elevated);
    transform: translateY(-1px);
  }

  .back-icon {
    font-size: var(--font-size-lg);
  }

  .header-title {
    text-align: center;
    flex: 1;
  }

  .header-title h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    color: var(--text-primary);
  }

  .header-title p {
    margin: var(--spacing-xs) 0 0 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .config-section {
    margin-bottom: var(--spacing-xl);
  }

  .section-header {
    margin-bottom: var(--spacing-lg);
    text-align: center;
  }

  .section-header h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    color: var(--text-primary);
  }

  .section-header p {
    margin: var(--spacing-xs) 0 0 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .config-card {
    background: var(--card-bg);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-md);
  }

  .input-group {
    margin-bottom: var(--spacing-lg);
  }

  .input-group:last-child {
    margin-bottom: 0;
  }

  .input-group label {
    display: block;
    margin-bottom: var(--spacing-sm);
    color: var(--text-primary);
    font-weight: 500;
    font-size: var(--font-size-sm);
  }

  .input {
    width: 100%;
    padding: var(--spacing-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-base);
    transition: all 0.2s ease;
  }

  .input:focus {
    outline: none;
    border-color: var(--accent-blue);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  }

  .input-group small {
    display: block;
    margin-top: var(--spacing-xs);
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
  }

  .action-buttons {
    display: flex;
    gap: var(--spacing-md);
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    min-width: 140px;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent-blue);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-blue-hover);
    transform: translateY(-1px);
  }

  .btn-success {
    background: var(--accent-green);
    color: white;
  }

  .btn-success:hover:not(:disabled) {
    background: #28a745;
    transform: translateY(-1px);
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .result-card {
    background: var(--card-bg);
    backdrop-filter: blur(10px);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-md);
  }

  .result-card.success {
    border: 1px solid var(--accent-green);
    background: rgba(48, 209, 88, 0.1);
  }

  .result-card.error {
    border: 1px solid var(--accent-red);
    background: rgba(255, 69, 58, 0.1);
  }

  .result-card.warning {
    border: 1px solid var(--accent-orange);
    background: rgba(255, 159, 10, 0.1);
  }

  .result-text {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-base);
  }

  .info-card {
    background: var(--card-bg);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-md);
  }

  .setup-steps {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .step {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md);
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--accent-blue);
    color: white;
    border-radius: 50%;
    font-weight: 600;
    font-size: var(--font-size-sm);
    flex-shrink: 0;
  }

  .step-content h4 {
    margin: 0 0 var(--spacing-xs) 0;
    color: var(--text-primary);
    font-size: var(--font-size-base);
  }

  .step-content p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .config-main {
      padding: var(--spacing-md);
    }
    
    .action-buttons {
      flex-direction: column;
    }
    
    .btn {
      width: 100%;
    }
  }
</style>