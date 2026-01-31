<script lang="ts">
  import { onMount } from 'svelte';
  
  let notificationSettings = {
    enabled: true,
    soundEnabled: true,
    vibrationEnabled: true,
    categories: {
      debug: true,
      feature: true,
      testing: true,
      learning: true,
      system: true
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    },
    deviceTokens: [],
    apiKey: ''
  };

  let saving = false;
  let saveMessage = '';

  async function loadSettings() {
    try {
      const response = await fetch('/notifications/status');
      if (response.ok) {
        const status = await response.json();
        notificationSettings.enabled = status.enabled;
        // Load other settings from status
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async function saveSettings() {
    saving = true;
    try {
      const response = await fetch('/notifications/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: notificationSettings.enabled
        })
      });
      
      if (response.ok) {
        saveMessage = 'Settings saved successfully!';
        setTimeout(() => saveMessage = '', 3000);
      } else {
        saveMessage = 'Failed to save settings';
      }
    } catch (error) {
      saveMessage = `Error: ${error}`;
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    loadSettings();
  });
</script>

<svelte:head>
  <title>Notification Settings - SHOOTER</title>
</svelte:head>

<div class="settings">
  <h1>⚙️ Notification Settings</h1>
  
  <form on:submit|preventDefault={saveSettings}>
    <!-- General Settings -->
    <section class="settings-section">
      <h2>General Settings</h2>
      
      <div class="setting-item">
        <span class="toggle-label">
          <input 
            type="checkbox" 
            bind:checked={notificationSettings.enabled}
          />
          <span class="toggle-slider"></span>
          Enable Notifications
        </span>
        <p class="setting-description">
          Master switch for all push notifications
        </p>
      </div>

      <div class="setting-item">
        <span class="toggle-label">
          <input 
            type="checkbox" 
            bind:checked={notificationSettings.soundEnabled}
            disabled={!notificationSettings.enabled}
          />
          <span class="toggle-slider"></span>
          Sound Enabled
        </span>
      </div>

      <div class="setting-item">
        <span class="toggle-label">
          <input 
            type="checkbox" 
            bind:checked={notificationSettings.vibrationEnabled}
            disabled={!notificationSettings.enabled}
          />
          <span class="toggle-slider"></span>
          Vibration Enabled
        </span>
      </div>
    </section>

    <!-- Category Settings -->
    <section class="settings-section">
      <h2>Categories</h2>
      <p class="section-description">Choose which types of notifications to receive</p>
      
      <div class="categories-grid">
        <div class="category-item">
          <span class="toggle-label">
            <input 
              type="checkbox" 
              bind:checked={notificationSettings.categories.debug}
              disabled={!notificationSettings.enabled}
            />
            <span class="toggle-slider"></span>
            🐛 Debug
          </span>
          <p class="category-description">Error messages and debugging info</p>
        </div>

        <div class="category-item">
          <span class="toggle-label">
            <input 
              type="checkbox" 
              bind:checked={notificationSettings.categories.feature}
              disabled={!notificationSettings.enabled}
            />
            <span class="toggle-slider"></span>
            ✨ Feature
          </span>
          <p class="category-description">New features and updates</p>
        </div>

        <div class="category-item">
          <span class="toggle-label">
            <input 
              type="checkbox" 
              bind:checked={notificationSettings.categories.testing}
              disabled={!notificationSettings.enabled}
            />
            <span class="toggle-slider"></span>
            🧪 Testing
          </span>
          <p class="category-description">Test results and validation</p>
        </div>

        <div class="category-item">
          <span class="toggle-label">
            <input 
              type="checkbox" 
              bind:checked={notificationSettings.categories.learning}
              disabled={!notificationSettings.enabled}
            />
            <span class="toggle-slider"></span>
            📚 Learning
          </span>
          <p class="category-description">Educational content and tips</p>
        </div>

        <div class="category-item">
          <span class="toggle-label">
            <input 
              type="checkbox" 
              bind:checked={notificationSettings.categories.system}
              disabled={!notificationSettings.enabled}
            />
            <span class="toggle-slider"></span>
            ⚙️ System
          </span>
          <p class="category-description">System status and health alerts</p>
        </div>
      </div>
    </section>

    <!-- Quiet Hours -->
    <section class="settings-section">
      <h2>Quiet Hours</h2>
      
      <div class="setting-item">
        <span class="toggle-label">
          <input 
            type="checkbox" 
            bind:checked={notificationSettings.quietHours.enabled}
            disabled={!notificationSettings.enabled}
          />
          <span class="toggle-slider"></span>
          Enable Quiet Hours
        </span>
        <p class="setting-description">
          Suppress notifications during specified hours
        </p>
      </div>

      {#if notificationSettings.quietHours.enabled && notificationSettings.enabled}
        <div class="time-range">
          <div class="form-group">
            <label for="quiet-start">Start Time</label>
            <input
              id="quiet-start"
              type="time"
              bind:value={notificationSettings.quietHours.start}
            />
          </div>
          <div class="form-group">
            <label for="quiet-end">End Time</label>
            <input
              id="quiet-end"
              type="time"
              bind:value={notificationSettings.quietHours.end}
            />
          </div>
        </div>
      {/if}
    </section>

    <!-- Save Button -->
    <div class="save-section">
      <button 
        type="submit" 
        class="btn-primary"
        disabled={saving}
      >
        {saving ? 'Saving...' : '💾 Save Settings'}
      </button>
      
      {#if saveMessage}
        <div class="save-message" class:success={saveMessage.includes('success')} class:error={!saveMessage.includes('success')}>
          {saveMessage}
        </div>
      {/if}
    </div>
  </form>

  <!-- Quick Actions -->
  <section class="settings-section">
    <h2>Quick Actions</h2>
    <div class="quick-actions">
      <a href="/notifications" class="action-btn">
        📊 Dashboard
      </a>
      <a href="/notifications/history" class="action-btn">
        📋 History  
      </a>
      <a href="/system-monitoring/health" class="action-btn">
        🔍 System Status
      </a>
    </div>
  </section>
</div>

<style>
  .settings {
    max-width: 800px;
    margin: 0 auto;
  }

  .settings h1 {
    margin-bottom: var(--spacing-xl);
  }

  .settings-section {
    background: var(--bg-color-muted);
    border: 1px solid var(--accent-color-secondary);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
  }

  .settings-section h2 {
    margin: 0 0 var(--spacing-lg) 0;

  }

  .section-description {

    margin-bottom: var(--spacing-lg);
  }

  .setting-item {
    margin-bottom: var(--spacing-lg);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    cursor: pointer;

  }

  .toggle-label input[type="checkbox"] {
    display: none;
  }

  .toggle-slider {
    width: 48px;
    height: 24px;
    background: var(--overlay-light-heavy);
    border-radius: var(--radius-3xl);
    margin-right: var(--spacing-sm);
    position: relative;
    transition: background 0.3s ease;
  }

  .toggle-slider:before {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--text-color-inverse);
    top: 2px;
    left: 2px;
    transition: transform 0.3s ease;
  }

  .toggle-label input:checked + .toggle-slider {
    background: var(--accent-color-primary);
  }

  .toggle-label input:checked + .toggle-slider:before {
    transform: translateX(24px);
  }

  .toggle-label input:disabled + .toggle-slider {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .setting-description, .category-description {
    margin-top: var(--spacing-xxs);
    margin-left: 64px;
  }

  .categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--spacing-md);
    align-items: start; /* Category toggles align tops */
  }

  .category-item {
    padding: var(--spacing-md);
    background: var(--bg-color-subtle);
    border: 1px solid var(--overlay-light-medium);
    border-radius: var(--radius-sm);
  }

  .time-range {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
    margin-top: var(--spacing-md);
    align-items: start; /* Labels and inputs align tops */
  }

  .form-group label {
    display: block;
    margin-bottom: var(--spacing-xs);

  }

  .form-group input[type="time"] {
    width: 100%;
    padding: var(--spacing-sm);
    background: var(--overlay-dark-medium);
    border: 1px solid var(--overlay-light-heavy);
    border-radius: var(--radius-xs);

  }

  .form-group input[type="time"]:focus {
    outline: none;
    border: 1px solid var(--accent-color-primary);
    box-shadow: var(--shadow-focus);
  }

  .save-section {
    margin: var(--spacing-xl) 0;
    text-align: center;
  }

  .btn-primary {
    background: var(--gradient-cyan-blue);
    border: none;
    padding: var(--spacing-sm) var(--spacing-xl);
    border-radius: var(--radius-sm);

    cursor: pointer;
    transition: all var(--transition-base);

  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px var(--accent-color-secondary-strong);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .save-message {
    margin-top: var(--spacing-md);
    padding: var(--spacing-sm);
    border-radius: var(--radius-xs);

  }

  .save-message.success {
    background: var(--status-color-success-bright-bg);
    border: 1px solid var(--status-color-success-bright);
  }

  .save-message.error {
    background: var(--status-color-error-bright-bg);
    border: 1px solid var(--status-color-error-bright);
  }

  .quick-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--spacing-sm);
    align-items: start;
  }

  .action-btn {
    display: block;
    padding: var(--spacing-sm);
    background: var(--accent-color-secondary-subtle);
    border: 1px solid var(--accent-color-secondary);
    border-radius: var(--radius-sm);
    text-decoration: none;
    text-align: center;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--bg-color-info-subtle);
    border: 1px solid var(--accent-color-primary);
  }

  @media (max-width: 768px) {
    .categories-grid {
      grid-template-columns: 1fr;
    }
    
    .time-range {
      grid-template-columns: 1fr;
    }
    
    .quick-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
