<!--
  SettingsModal - Main settings modal using Shooter components
  Features: Multiple tabs, form validation, mobile optimization
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ShooterModal, ShooterButton, ShooterInput, ShooterCheckbox, ShooterSelect } from '$lib/components/shooter';
  import type { SelectOption } from '$lib/components/shooter';
  
  // Modal state
  export let open = false;
  export let title = 'Settings';
  
  // Settings data
  interface SettingsData {
    notifications: {
      enabled: boolean;
      sound: boolean;
      desktop: boolean;
      mobile: boolean;
      frequency: string;
    };
    appearance: {
      theme: string;
      fontSize: string;
      layout: string;
    };
    account: {
      username: string;
      email: string;
      autoLogout: boolean;
      sessionTimeout: string;
    };
  }
  
  let settings: SettingsData = {
    notifications: {
      enabled: true,
      sound: true,
      desktop: true,
      mobile: true,
      frequency: 'realtime'
    },
    appearance: {
      theme: 'dark',
      fontSize: 'medium',
      layout: 'compact'
    },
    account: {
      username: '',
      email: '',
      autoLogout: true,
      sessionTimeout: '30'
    }
  };
  
  // Tab state
  let activeTab: 'notifications' | 'appearance' | 'account' = 'notifications';
  
  // Options for select components
  const frequencyOptions: SelectOption[] = [
    { value: 'realtime', label: 'Real-time' },
    { value: 'batched', label: 'Batched (5 min)' },
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' }
  ];
  
  const themeOptions: SelectOption[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'auto', label: 'Auto' }
  ];
  
  const fontSizeOptions: SelectOption[] = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' }
  ];
  
  const layoutOptions: SelectOption[] = [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' }
  ];
  
  const sessionTimeoutOptions: SelectOption[] = [
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '60', label: '1 hour' },
    { value: '240', label: '4 hours' },
    { value: '480', label: '8 hours' }
  ];
  
  // Form state
  let isSubmitting = false;
  
  const dispatch = createEventDispatcher<{
    save: SettingsData;
    cancel: void;
    close: void;
  }>();
  
  // Event handlers
  function handleSave() {
    isSubmitting = true;
    dispatch('save', settings);
    
    setTimeout(() => {
      isSubmitting = false;
      open = false;
    }, 1000);
  }
  
  function handleCancel() {
    dispatch('cancel');
    open = false;
  }
  
  function handleClose() {
    dispatch('close');
    open = false;
  }
  
  function switchTab(tab: typeof activeTab) {
    activeTab = tab;
  }
</script>

<ShooterModal
  bind:open
  {title}
  size="lg"
  on:close={handleClose}
  closable
  closeOnBackdrop={false}
>
  <div class="settings-content">
    <!-- Tab Navigation -->
    <nav class="settings-tabs">
      <button
        type="button"
        class="tab-button"
        class:active={activeTab === 'notifications'}
        on:click={() => switchTab('notifications')}
      >
        🔔 Notifications
      </button>
      <button
        type="button"
        class="tab-button"
        class:active={activeTab === 'appearance'}
        on:click={() => switchTab('appearance')}
      >
        🎨 Appearance
      </button>
      <button
        type="button"
        class="tab-button"
        class:active={activeTab === 'account'}
        on:click={() => switchTab('account')}
      >
        👤 Account
      </button>
    </nav>
    
    <!-- Tab Content -->
    <div class="tab-content">
      {#if activeTab === 'notifications'}
        <div class="settings-section">
          <h3>Notification Preferences</h3>
          
          <div class="form-group">
            <ShooterCheckbox bind:checked={settings.notifications.enabled}>
              Enable notifications
            </ShooterCheckbox>
          </div>
          
          {#if settings.notifications.enabled}
            <div class="form-group">
              <ShooterCheckbox bind:checked={settings.notifications.sound}>
                Play notification sounds
              </ShooterCheckbox>
            </div>
            
            <div class="form-group">
              <ShooterCheckbox bind:checked={settings.notifications.desktop}>
                Show desktop notifications
              </ShooterCheckbox>
            </div>
            
            <div class="form-group">
              <ShooterCheckbox bind:checked={settings.notifications.mobile}>
                Send mobile push notifications
              </ShooterCheckbox>
            </div>
            
            <div class="form-group">
              <ShooterSelect
                bind:value={settings.notifications.frequency}
                options={frequencyOptions}
                label="Notification frequency"
                fullWidth
              />
            </div>
          {/if}
        </div>
      {/if}
      
      {#if activeTab === 'appearance'}
        <div class="settings-section">
          <h3>Display Settings</h3>
          
          <div class="form-group">
            <ShooterSelect
              bind:value={settings.appearance.theme}
              options={themeOptions}
              label="Theme"
              fullWidth
            />
          </div>
          
          <div class="form-group">
            <ShooterSelect
              bind:value={settings.appearance.fontSize}
              options={fontSizeOptions}
              label="Font size"
              fullWidth
            />
          </div>
          
          <div class="form-group">
            <ShooterSelect
              bind:value={settings.appearance.layout}
              options={layoutOptions}
              label="Layout density"
              fullWidth
            />
          </div>
        </div>
      {/if}
      
      {#if activeTab === 'account'}
        <div class="settings-section">
          <h3>Account Settings</h3>
          
          <div class="form-group">
            <ShooterInput
              bind:value={settings.account.username}
              label="Username"
              type="text"
              placeholder="Enter username"
              fullWidth
            />
          </div>
          
          <div class="form-group">
            <ShooterInput
              bind:value={settings.account.email}
              label="Email"
              type="email"
              placeholder="Enter email address"
              fullWidth
            />
          </div>
          
          <div class="form-group">
            <ShooterCheckbox bind:checked={settings.account.autoLogout}>
              Enable automatic logout
            </ShooterCheckbox>
          </div>
          
          {#if settings.account.autoLogout}
            <div class="form-group">
              <ShooterSelect
                bind:value={settings.account.sessionTimeout}
                options={sessionTimeoutOptions}
                label="Session timeout"
                fullWidth
              />
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Modal Footer -->
  <svelte:fragment slot="footer">
    <ShooterButton
      variant="ghost"
      on:click={handleCancel}
      disabled={isSubmitting}
    >
      Cancel
    </ShooterButton>
    <ShooterButton
      variant="primary"
      on:click={handleSave}
      loading={isSubmitting}
      disabled={isSubmitting}
    >
      Save Settings
    </ShooterButton>
  </svelte:fragment>
</ShooterModal>

<style>
  /* Import Shooter design system */

  .settings-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
    min-height: 400px;
  }
  
  .settings-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color-primary);
    margin-bottom: var(--spacing-xl);
  }
  
  .tab-button {
    background: none;
    border: none;
    padding: var(--spacing-sm) var(--spacing-xl);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all var(--transition-base);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }

  .tab-button:hover {
    background: var(--bg-color-tertiary);
  }

  .tab-button.active {
    border-bottom-color: var(--status-color-info);
    background: var(--status-color-info-bg-light);
  }
  
  .tab-content {
    flex: 1;
  }
  
  .settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .settings-section h3 {
    margin: 0 0 var(--spacing-lg) 0;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .settings-tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    
    .tab-button {
      flex-shrink: 0;
      white-space: nowrap;
      padding: var(--spacing-sm) var(--spacing-md);

    }
    
    .settings-content {
      gap: var(--spacing-md);
      min-height: 300px;
    }
    
    .settings-section {
      gap: var(--spacing-sm);
    }
    
    .form-group {
      gap: var(--spacing-xxs);
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .tab-button {
      border-width: 2px;
    }
    
    .tab-button.active {
      border-bottom-width: 3px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .tab-button {
      transition: none;
    }
  }
</style>