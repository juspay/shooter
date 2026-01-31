<!--
  NotificationSettingsModal - Detailed notification settings using Shooter components
  Features: Advanced notification configuration, filtering, scheduling
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ShooterModal, ShooterButton, ShooterInput, ShooterCheckbox, ShooterSelect, ShooterBadge } from '$lib/components/shooter';
  import type { SelectOption } from '$lib/components/shooter';
  
  export let open = false;
  
  interface NotificationSettings {
    general: {
      enabled: boolean;
      sound: boolean;
      badge: boolean;
      vibration: boolean;
    };
    categories: {
      coding: boolean;
      debugging: boolean;
      testing: boolean;
      deployment: boolean;
      collaboration: boolean;
    };
    delivery: {
      desktop: boolean;
      mobile: boolean;
      email: boolean;
      slack: boolean;
    };
    scheduling: {
      quietHours: boolean;
      startTime: string;
      endTime: string;
      weekendsOnly: boolean;
    };
    filtering: {
      priority: string;
      keywords: string;
      excludeKeywords: string;
      maxPerHour: string;
    };
  }
  
  let settings: NotificationSettings = {
    general: {
      enabled: true,
      sound: true,
      badge: true,
      vibration: false
    },
    categories: {
      coding: true,
      debugging: true,
      testing: false,
      deployment: true,
      collaboration: true
    },
    delivery: {
      desktop: true,
      mobile: true,
      email: false,
      slack: false
    },
    scheduling: {
      quietHours: false,
      startTime: '22:00',
      endTime: '08:00',
      weekendsOnly: false
    },
    filtering: {
      priority: 'normal',
      keywords: '',
      excludeKeywords: '',
      maxPerHour: '10'
    }
  };
  
  // Select options
  const priorityOptions: SelectOption[] = [
    { value: 'all', label: 'All notifications' },
    { value: 'normal', label: 'Normal and above' },
    { value: 'important', label: 'Important only' },
    { value: 'critical', label: 'Critical only' }
  ];
  
  const maxPerHourOptions: SelectOption[] = [
    { value: '5', label: '5 per hour' },
    { value: '10', label: '10 per hour' },
    { value: '20', label: '20 per hour' },
    { value: 'unlimited', label: 'Unlimited' }
  ];
  
  let isSubmitting = false;
  let activeSection: 'general' | 'categories' | 'delivery' | 'scheduling' | 'filtering' = 'general';
  
  const dispatch = createEventDispatcher<{
    save: NotificationSettings;
    cancel: void;
    test: void;
  }>();
  
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
  
  function handleTestNotification() {
    dispatch('test');
  }
  
  function switchSection(section: typeof activeSection) {
    activeSection = section;
  }
  
  // Helper to count enabled categories
  $: enabledCategories = Object.values(settings.categories).filter(Boolean).length;
  $: enabledDelivery = Object.values(settings.delivery).filter(Boolean).length;
</script>

<ShooterModal
  bind:open
  title="Notification Settings"
  size="xl"
  on:close={handleCancel}
  closable
>
  <div class="notification-settings">
    <!-- Section Navigation -->
    <nav class="section-nav">
      <button
        type="button"
        class="nav-button"
        class:active={activeSection === 'general'}
        on:click={() => switchSection('general')}
      >
        General
      </button>
      <button
        type="button"
        class="nav-button"
        class:active={activeSection === 'categories'}
        on:click={() => switchSection('categories')}
      >
        Categories
        <ShooterBadge variant="primary" size="sm">{enabledCategories}</ShooterBadge>
      </button>
      <button
        type="button"
        class="nav-button"
        class:active={activeSection === 'delivery'}
        on:click={() => switchSection('delivery')}
      >
        Delivery
        <ShooterBadge variant="success" size="sm">{enabledDelivery}</ShooterBadge>
      </button>
      <button
        type="button"
        class="nav-button"
        class:active={activeSection === 'scheduling'}
        on:click={() => switchSection('scheduling')}
      >
        Schedule
      </button>
      <button
        type="button"
        class="nav-button"
        class:active={activeSection === 'filtering'}
        on:click={() => switchSection('filtering')}
      >
        Filters
      </button>
    </nav>
    
    <!-- Section Content -->
    <div class="section-content">
      {#if activeSection === 'general'}
        <div class="settings-group">
          <h3>General Settings</h3>
          <p class="group-description">Configure basic notification behavior</p>
          
          <div class="form-grid">
            <ShooterCheckbox bind:checked={settings.general.enabled}>
              Enable notifications
            </ShooterCheckbox>
            
            <ShooterCheckbox 
              bind:checked={settings.general.sound}
              disabled={!settings.general.enabled}
            >
              Play sounds
            </ShooterCheckbox>
            
            <ShooterCheckbox 
              bind:checked={settings.general.badge}
              disabled={!settings.general.enabled}
            >
              Show badge counts
            </ShooterCheckbox>
            
            <ShooterCheckbox 
              bind:checked={settings.general.vibration}
              disabled={!settings.general.enabled}
            >
              Mobile vibration
            </ShooterCheckbox>
          </div>
        </div>
      {/if}
      
      {#if activeSection === 'categories'}
        <div class="settings-group">
          <h3>Notification Categories</h3>
          <p class="group-description">Choose which types of activities trigger notifications</p>
          
          <div class="form-grid">
            <ShooterCheckbox bind:checked={settings.categories.coding}>
              🚀 Coding activities (file edits, completions)
            </ShooterCheckbox>
            
            <ShooterCheckbox bind:checked={settings.categories.debugging}>
              🐛 Debugging sessions (breakpoints, errors)
            </ShooterCheckbox>
            
            <ShooterCheckbox bind:checked={settings.categories.testing}>
              🧪 Testing events (test runs, failures)
            </ShooterCheckbox>
            
            <ShooterCheckbox bind:checked={settings.categories.deployment}>
              🌍 Deployment activities (builds, releases)
            </ShooterCheckbox>
            
            <ShooterCheckbox bind:checked={settings.categories.collaboration}>
              👥 Collaboration (reviews, comments)
            </ShooterCheckbox>
          </div>
        </div>
      {/if}
      
      {#if activeSection === 'delivery'}
        <div class="settings-group">
          <h3>Delivery Methods</h3>
          <p class="group-description">Select how you want to receive notifications</p>
          
          <div class="form-grid">
            <ShooterCheckbox bind:checked={settings.delivery.desktop}>
              🖥️ Desktop notifications
            </ShooterCheckbox>
            
            <ShooterCheckbox bind:checked={settings.delivery.mobile}>
              📱 Mobile push notifications
            </ShooterCheckbox>
            
            <ShooterCheckbox bind:checked={settings.delivery.email}>
              📧 Email notifications
            </ShooterCheckbox>
            
            <ShooterCheckbox bind:checked={settings.delivery.slack}>
              💬 Slack messages
            </ShooterCheckbox>
          </div>
        </div>
      {/if}
      
      {#if activeSection === 'scheduling'}
        <div class="settings-group">
          <h3>Quiet Hours</h3>
          <p class="group-description">Set times when notifications should be muted</p>
          
          <div class="form-group">
            <ShooterCheckbox bind:checked={settings.scheduling.quietHours}>
              Enable quiet hours
            </ShooterCheckbox>
          </div>
          
          {#if settings.scheduling.quietHours}
            <div class="time-range">
              <ShooterInput
                bind:value={settings.scheduling.startTime}
                type="text"
                label="Start time"
              />
              <ShooterInput
                bind:value={settings.scheduling.endTime}
                type="text"
                label="End time"
              />
            </div>
            
            <div class="form-group">
              <ShooterCheckbox bind:checked={settings.scheduling.weekendsOnly}>
                Apply quiet hours only on weekends
              </ShooterCheckbox>
            </div>
          {/if}
        </div>
      {/if}
      
      {#if activeSection === 'filtering'}
        <div class="settings-group">
          <h3>Smart Filtering</h3>
          <p class="group-description">Reduce noise with intelligent filtering</p>
          
          <div class="form-group">
            <ShooterSelect
              bind:value={settings.filtering.priority}
              options={priorityOptions}
              label="Minimum priority level"
              fullWidth
            />
          </div>
          
          <div class="form-group">
            <ShooterSelect
              bind:value={settings.filtering.maxPerHour}
              options={maxPerHourOptions}
              label="Maximum notifications per hour"
              fullWidth
            />
          </div>
          
          <div class="form-group">
            <ShooterInput
              bind:value={settings.filtering.keywords}
              label="Include keywords (comma-separated)"
              placeholder="error, warning, success"
              fullWidth
            />
          </div>
          
          <div class="form-group">
            <ShooterInput
              bind:value={settings.filtering.excludeKeywords}
              label="Exclude keywords (comma-separated)"
              placeholder="spam, noise, verbose"
              fullWidth
            />
          </div>
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Modal Footer -->
  <svelte:fragment slot="footer">
    <ShooterButton
      variant="outline"
      on:click={handleTestNotification}
      disabled={isSubmitting}
    >
      Send Test
    </ShooterButton>
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

  .notification-settings {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
    min-height: 500px;
  }
  
  .section-nav {
    display: flex;
    gap: var(--spacing-xs);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: var(--spacing-xs);
    border-bottom: 1px solid var(--border-color-primary);
  }
  
  .nav-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: none;
    border: 1px solid var(--border-color-primary);
    padding: var(--spacing-xs) var(--spacing-md);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all var(--transition-base);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .nav-button:hover {
    background: var(--bg-color-tertiary);
    border-color: var(--border-color-focus);
  }

  .nav-button.active {
    background: var(--status-color-info);
    border-color: var(--status-color-info);
  }
  
  .section-content {
    flex: 1;
    overflow-y: auto;
  }
  
  .settings-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .settings-group h3 {
    margin: 0 0 var(--spacing-md) 0;
  }

  .group-description {
    margin: 0 0 var(--spacing-sm) 0;
  }
  
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-md);
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .time-range {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .notification-settings {
      gap: var(--spacing-md);
      min-height: 400px;
    }
    
    .section-nav {
      gap: var(--spacing-xxs);
    }
    
    .nav-button {
      padding: var(--spacing-xs) var(--spacing-sm);

    }
    
    .form-grid {
      grid-template-columns: 1fr;
      gap: var(--spacing-xs);
    }
    
    .time-range {
      grid-template-columns: 1fr;
      gap: var(--spacing-xs);
    }
    
    .settings-group {
      gap: var(--spacing-sm);
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .nav-button {
      border-width: 2px;
    }
    
    .nav-button.active {
      border-width: 3px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .nav-button {
      transition: none;
    }
  }
</style>