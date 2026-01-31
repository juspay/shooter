<script lang="ts">

  interface DebugResult {
    error?: string;
    timestamp?: string;
    status?: string;
    success?: boolean;
    [key: string]: unknown;
  }

  let debugResults: Record<string, DebugResult> = {};
  let loading: Record<string, boolean> = {};

  const debugTools = [
    {
      id: 'apns',
      title: '📱 APNs Debug',
      description: 'Test Apple Push Notification Service connectivity and configuration',
      endpoint: '/system-monitoring/debug/apns'
    },
    {
      id: 'env',
      title: '⚙️ Environment Debug',
      description: 'Check environment variables and configuration',
      endpoint: '/system-monitoring/debug/env'
    },
    {
      id: 'notifications',
      title: '🔔 Notifications Debug',
      description: 'Test notification system functionality',
      endpoint: '/system-monitoring/debug/notifications'
    },
    {
      id: 'simple',
      title: '🧪 Simple Debug',
      description: 'Basic system health and connectivity test',
      endpoint: '/system-monitoring/debug/simple'
    }
  ];

  async function runDebugTool(toolId: string, endpoint: string) {
    loading[toolId] = true;
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        debugResults[toolId] = await response.json();
      } else {
        debugResults[toolId] = {
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      debugResults[toolId] = {
        error: `Network Error: ${error}`,
        timestamp: new Date().toISOString()
      };
    } finally {
      loading[toolId] = false;
    }
  }

  async function runAllTools() {
    for (const tool of debugTools) {
      await runDebugTool(tool.id, tool.endpoint);
    }
  }

  function clearResults() {
    debugResults = {};
  }

  function downloadResults() {
    const data = {
      timestamp: new Date().toISOString(),
      results: debugResults
    };

     
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-results-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getResultBadgeVariant(result: DebugResult | undefined): string {
    if (!result) {
return 'global-badge-info';
}
    if (result.error) {
return 'global-badge-error';
}
    if (result.status === 'ok' || result.success) {
return 'global-badge-success';
}
    if (result.status === 'warning') {
return 'global-badge-warning';
}
    return 'global-badge-info';
  }

  function getResultStatusLabel(result: DebugResult | undefined): string {
    if (!result) {
return 'PENDING';
}
    if (result.error) {
return 'ERROR';
}
    if (result.status === 'ok' || result.success) {
return 'SUCCESS';
}
    if (result.status === 'warning') {
return 'WARNING';
}
    return 'UNKNOWN';
  }

  function getStatusIcon(result: DebugResult | undefined): string {
    if (!result) {
return '⚪';
}
    if (result.error) {
return '🔴';
}
    if (result.status === 'ok' || result.success) {
return '🟢';
}
    if (result.status === 'warning') {
return '🟡';
}
    return '⚪';
  }
</script>

<svelte:head>
  <title>Debug Tools - SHOOTER</title>
</svelte:head>

<div class="debug-tools u-flex u-flex-col u-gap-xl">
  <header class="u-flex u-flex-col u-gap-sm u-items-center u-text-center">
    <h1>🐛 Debug Tools</h1>
    <p>Diagnostic tools for troubleshooting system components</p>

    <div class="u-flex u-flex-wrap u-justify-center u-gap-sm">
      <button class="global-button-base global-button-primary" on:click={runAllTools}>
        🚀 Run All Tests
      </button>
      <button class="global-button-base global-button-tertiary" on:click={clearResults} disabled={Object.keys(debugResults).length === 0}>
        🗑️ Clear Results
      </button>
      <button class="global-button-base global-button-tertiary" on:click={downloadResults} disabled={Object.keys(debugResults).length === 0}>
        💾 Download Results
      </button>
    </div>
  </header>

  <section class="u-flex u-flex-col u-gap-md">
    <h2>🧪 Debug Actions</h2>
    <div class="global-grid-auto">
      {#each debugTools as tool}
        <article class="global-card-base u-mb-0">
          <div class="global-card-header u-flex u-flex-wrap u-justify-between u-items-start u-gap-sm">
            <div class="u-flex u-flex-col u-gap-xxs">
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
            </div>
            <div class="u-flex u-items-center u-gap-xs">
              <span>{getStatusIcon(debugResults[tool.id])}</span>
              <span class={`global-badge-base ${getResultBadgeVariant(debugResults[tool.id])}`}>
                {getResultStatusLabel(debugResults[tool.id])}
              </span>
            </div>
          </div>
          <div class="global-card-content u-flex u-flex-col u-gap-sm">
            <div class="u-flex u-flex-wrap u-gap-sm">
              <button
                class="global-button-base global-button-secondary"
                on:click={() => runDebugTool(tool.id, tool.endpoint)}
                disabled={loading[tool.id]}
              >
                {loading[tool.id] ? '⏳ Running...' : '▶️ Run Test'}
              </button>
            </div>
            {#if debugResults[tool.id]}
              <div class="u-flex u-flex-wrap u-gap-sm u-justify-between u-items-center">
                <span class="u-flex u-items-center u-gap-xs">
                  <span>{getStatusIcon(debugResults[tool.id])}</span>
                  <span>Results</span>
                </span>
                <span class={`global-badge-base ${getResultBadgeVariant(debugResults[tool.id])}`}>
                  {getResultStatusLabel(debugResults[tool.id])}
                </span>
              </div>
              <div class="result-scroll">
                <pre class="global-code-block u-mb-0">{JSON.stringify(debugResults[tool.id], null, 2)}</pre>
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="u-flex u-flex-col u-gap-md">
    <h2>💻 System Information</h2>
    <article class="global-card-base u-mb-0">
      <div class="global-card-content u-flex u-flex-col u-gap-md">
        <div class="global-grid-auto">
          <div class="u-flex u-justify-between u-items-center u-gap-sm">
            <span>Platform</span>
            <span>{typeof window !== 'undefined' ? navigator.platform : 'Server'}</span>
          </div>
          <div class="u-flex u-justify-between u-items-center u-gap-sm">
            <span>User Agent</span>
            <span>{typeof window !== 'undefined' ? navigator.userAgent.slice(0, 60) + '...' : 'N/A'}</span>
          </div>
          <div class="u-flex u-justify-between u-items-center u-gap-sm">
            <span>Screen</span>
            <span>{typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'N/A'}</span>
          </div>
          <div class="u-flex u-justify-between u-items-center u-gap-sm">
            <span>Timezone</span>
            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </div>
        </div>
      </div>
    </article>
  </section>

  <section class="u-flex u-flex-col u-gap-md">
    <h2>🔗 Quick Links</h2>
    <div class="global-grid-auto">
      <a href="/system-monitoring" class="global-card-base u-block quick-link-card">
        <div class="global-card-content u-text-center">
          📊 System Overview
        </div>
      </a>
      <a href="/notifications" class="global-card-base u-block quick-link-card">
        <div class="global-card-content u-text-center">
          📱 Notifications
        </div>
      </a>
      <a href="/system-monitoring/health" class="global-card-base u-block quick-link-card">
        <div class="global-card-content u-text-center">
          🏥 Health Check
        </div>
      </a>
      <a href="/system-monitoring/metrics" class="global-card-base u-block quick-link-card">
        <div class="global-card-content u-text-center">
          📈 Metrics API
        </div>
      </a>
    </div>
  </section>

</div>

<style>
  .debug-tools {
    max-width: 1200px;
    margin: 0 auto;
  }

  .result-scroll {
    max-height: 300px;
    overflow-y: auto;
  }

  .quick-link-card {
    display: block;
    color: var(--text-color-primary);
    text-decoration: none;
  }

  .quick-link-card:hover {
    color: var(--text-color-secondary);
  }
</style>
