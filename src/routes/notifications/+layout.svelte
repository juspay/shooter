<script lang="ts">
  import type { LayoutData } from './$types';
  
  export let data: LayoutData;
</script>

<div class="notifications-layout">
  <header class="notifications-header">
    <div class="header-content">
      <h1>📱 Notification Management</h1>
      <div class="status-indicator">
        <span class="status-dot {data.notificationSettings.enabled ? 'active' : 'inactive'}"></span>
        <span class="status-text">
          {data.notificationSettings.enabled ? 'Notifications Active' : 'Notifications Disabled'}
        </span>
      </div>
    </div>
  </header>

  <nav class="notifications-nav">
    <a href="/notifications" class="nav-link" data-sveltekit-preload-data>
      📊 Dashboard
    </a>
    <a href="/notifications/settings" class="nav-link" data-sveltekit-preload-data>
      ⚙️ Settings
    </a>
  </nav>

  <main class="notifications-content">
    <slot />
  </main>
</div>

<style>
  .notifications-layout {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--bg-color-light), var(--bg-color-secondary));
  }

  .notifications-header {
    background: var(--bg-color-info-subtle);
    border: 1px solid var(--accent-color-primary);
    padding: var(--spacing-md) var(--spacing-xl);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
  }

  .notifications-header h1 {
    margin: 0;

  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--status-color-error);
  }

  .status-dot.active {
    background: var(--accent-color-primary);
    box-shadow: var(--shadow-focus);
  }

  .status-text {

    opacity: 0.8;
  }

  .notifications-nav {
    background: var(--bg-color-tertiary);
    padding: 0 2rem;
    border-bottom: 1px solid var(--bg-color-elevated);
  }

  .notifications-nav {
    display: flex;
    gap: var(--spacing-xl);
    max-width: 1200px;
    margin: 0 auto;
  }

  .nav-link {
    padding: var(--spacing-sm) 0;
    text-decoration: none;
    border-bottom: 2px solid transparent;
    transition: all 0.2s ease;
  }

  .nav-link:hover {
    border: 1px solid var(--accent-color-primary);
  }

  .notifications-content {
    padding: var(--spacing-xl);
    max-width: 1200px;
    margin: 0 auto;
  }
</style>