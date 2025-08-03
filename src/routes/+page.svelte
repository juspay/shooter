<script>
  let title = 'Claude Code Test';
  let message = 'Hello from the POC!';
  let apiKey = '';
  let result = '';
  let loading = false;
  let statusType = '';

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
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          title,
          message,
          data: { source: 'web-interface' }
        })
      });

      const data = await response.json();
      result = JSON.stringify(data, null, 2);
      statusType = response.ok ? 'success' : 'error';
    } catch (error) {
      result = `Error: ${error.message}`;
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
      result = JSON.stringify(data, null, 2);
      statusType = response.ok ? 'success' : 'error';
    } catch (error) {
      result = `Error: ${error.message}`;
      statusType = 'error';
    }

    loading = false;
  }
</script>

<svelte:head>
  <title>Claude iOS Notifier POC</title>
</svelte:head>

<h1>🚀 Claude Code → iOS Push Notification POC</h1>

<div class="form">
  <label>
    API Key:
    <input bind:value={apiKey} type="password" placeholder="Enter API key" />
  </label>
  
  <label>
    Notification Title:
    <input bind:value={title} type="text" />
  </label>
  
  <label>
    Message:
    <textarea bind:value={message}></textarea>
  </label>
  
  <div style="display: flex; gap: 1rem;">
    <button on:click={sendNotification} disabled={loading || !apiKey.trim()}>
      {loading ? 'Sending...' : '📱 Send Notification'}
    </button>
    
    <button on:click={checkHealth} disabled={loading}>
      {loading ? 'Checking...' : '🏥 Health Check'}
    </button>
  </div>
</div>

{#if result}
  <div class="status {statusType}">
    <strong>Response:</strong>
  </div>
  <pre>{result}</pre>
{/if}

<div style="margin: 2rem auto; max-width: 500px; text-align: center; font-size: 0.9rem; color: #666;">
  <p>
    This POC demonstrates Claude Code sending push notifications to iOS devices.
  </p>
  <p>
    <strong>Next Steps:</strong> Configure environment variables and deploy to Vercel.
  </p>
</div>