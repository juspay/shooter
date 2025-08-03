<script>
  let title = '🎯 SHOOTER Notification';
  let message = 'SHOOTER system firing notifications perfectly! 🎯';
  let apiKey = '';
  let result = '';
  let loading = false;
  let statusType = '';
  let showAdvanced = false;
  let deviceToken = 'ffd431c70b0f0971b76c5b5d1bce24ac52753e06854496d29200ced822a11bab';

  // Pre-fill API key if in development
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    apiKey = 'shooter2024';
  }

  async function sendNotification() {
    if (!apiKey.trim()) {
      result = 'Error: API key is required';
      statusType = 'error';
      return;
    }

    loading = true;
    result = '';
    statusType = '';

    try {
      const payload = {
        title,
        body: message,
        data: { 
          source: 'web-interface',
          timestamp: Date.now(),
          version: '1.0'
        }
      };

      if (showAdvanced && deviceToken.trim()) {
        payload.deviceToken = deviceToken.trim();
      }

      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (response.ok) {
        result = `✅ Notification sent successfully!\n\nResponse: ${JSON.stringify(data, null, 2)}`;
        statusType = 'success';
      } else {
        result = `❌ Failed to send notification\n\nError: ${JSON.stringify(data, null, 2)}`;
        statusType = 'error';
      }
    } catch (error) {
      result = `❌ Network Error: ${error.message}`;
      statusType = 'error';
    }

    loading = false;
  }

  async function checkHealth() {
    loading = true;
    result = '';
    statusType = '';

    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      
      if (response.ok) {
        result = `🟢 System Health: All systems operational\n\nDetails: ${JSON.stringify(data, null, 2)}`;
        statusType = 'success';
      } else {
        result = `🔴 System Health: Issues detected\n\nDetails: ${JSON.stringify(data, null, 2)}`;
        statusType = 'error';
      }
    } catch (error) {
      result = `🔴 Health Check Failed: ${error.message}`;
      statusType = 'error';
    }

    loading = false;
  }

  function quickTest() {
    title = '🎯 SHOOTER Quick Test';
    message = `SHOOTER firing test notification at ${new Date().toLocaleTimeString()}`;
    sendNotification();
  }
</script>

<svelte:head>
  <title>SHOOTER → iOS Push Notifications</title>
  <meta name="description" content="Bidirectional communication between SHOOTER and iOS devices via push notifications" />
</svelte:head>

<div class="app">
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <span class="logo-icon">📱</span>
        <div class="logo-text">
          <h1>SHOOTER</h1>
          <p>iOS Push Notifications</p>
        </div>
      </div>
      <div class="status-indicator {statusType || 'idle'}">
        {#if loading}
          <div class="loading-spinner"></div>
          <span>Processing...</span>
        {:else if statusType === 'success'}
          <span class="status-icon">✅</span>
          <span>Connected</span>
        {:else if statusType === 'error'}
          <span class="status-icon">❌</span>
          <span>Error</span>
        {:else}
          <span class="status-icon">⚪</span>
          <span>Ready</span>
        {/if}
      </div>
    </div>
  </header>

  <main class="main">
    <div class="card main-card">
      <div class="card-header">
        <h2>📤 Send Notification</h2>
        <p>Send push notifications to connected iOS devices</p>
      </div>

      <div class="form">
        <div class="input-group">
          <label for="apiKey">🔐 API Key</label>
          <input 
            id="apiKey"
            bind:value={apiKey} 
            type="password" 
            placeholder="Enter API key"
            class="input"
          />
        </div>
        
        <div class="input-group">
          <label for="title">📝 Notification Title</label>
          <input 
            id="title"
            bind:value={title} 
            type="text"
            placeholder="Enter notification title"
            class="input"
          />
        </div>
        
        <div class="input-group">
          <label for="message">💬 Message</label>
          <textarea 
            id="message"
            bind:value={message}
            placeholder="Enter your message here..."
            class="input textarea"
            rows="3"
          ></textarea>
        </div>

        <!-- Advanced Options Toggle -->
        <div class="advanced-toggle">
          <button 
            type="button"
            class="toggle-btn"
            on:click={() => showAdvanced = !showAdvanced}
          >
            <span>⚙️ Advanced Options</span>
            <span class="toggle-icon" class:rotated={showAdvanced}>▼</span>
          </button>
        </div>

        {#if showAdvanced}
          <div class="advanced-options">
            <div class="input-group">
              <label for="deviceToken">📱 Device Token (Optional)</label>
              <input 
                id="deviceToken"
                bind:value={deviceToken} 
                type="text"
                placeholder="Leave empty to use default registered device"
                class="input"
              />
              <small>Override the default device token for testing</small>
            </div>
          </div>
        {/if}

        <div class="action-buttons">
          <button 
            class="btn btn-primary"
            on:click={sendNotification} 
            disabled={loading || !apiKey.trim()}
          >
            {#if loading}
              <div class="btn-spinner"></div>
              Sending...
            {:else}
              📱 Send Notification
            {/if}
          </button>
          
          <button 
            class="btn btn-secondary"
            on:click={quickTest} 
            disabled={loading || !apiKey.trim()}
          >
            ⚡ Quick Test
          </button>
          
          <button 
            class="btn btn-tertiary"
            on:click={checkHealth} 
            disabled={loading}
          >
            🏥 Health Check
          </button>
        </div>
      </div>
    </div>

    {#if result}
      <div class="card result-card {statusType}">
        <div class="card-header">
          <h3>
            {#if statusType === 'success'}
              ✅ Success
            {:else}
              ❌ Error
            {/if}
          </h3>
        </div>
        <div class="result-content">
          <pre class="result-text">{result}</pre>
        </div>
      </div>
    {/if}

    <div class="info-cards">
      <div class="card info-card">
        <div class="card-header">
          <h3>🎯 How It Works</h3>
        </div>
        <div class="card-content">
          <ol>
            <li>SHOOTER sends HTTP request to SvelteKit API</li>
            <li>SvelteKit server processes request and validates API key</li>
            <li>APNs service fires push notification to iOS device</li>
            <li>iOS app receives and displays SHOOTER notification</li>
          </ol>
        </div>
      </div>

      <div class="card info-card">
        <div class="card-header">
          <h3>🚀 Status</h3>
        </div>
        <div class="card-content">
          <div class="status-grid">
            <div class="status-item">
              <span class="status-dot success"></span>
              <span>Local Development</span>
            </div>
            <div class="status-item">
              <span class="status-dot warning"></span>
              <span>Production (JSON Issue)</span>
            </div>
            <div class="status-item">
              <span class="status-dot success"></span>
              <span>iOS Integration</span>
            </div>
            <div class="status-item">
              <span class="status-dot success"></span>
              <span>APNs Connection</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <footer class="footer">
    <p>Built with SvelteKit • APNs • Vercel</p>
    <p>Part of the SHOOTER → iOS Push Notification System</p>
  </footer>
</div>