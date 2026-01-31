<script lang="ts">
  interface NotificationAction {
    id: string;
    label: string;
    style?: string;
  }

  interface NotificationItem {
    id: number | string;
    title: string;
    message: string;
    timestamp: number;
    type?: string;
    status?: string;
    data?: {
      actionData?: {
        actions?: NotificationAction[];
        inputPlaceholder?: string;
      };
    };
    success?: boolean;
    sent?: number;
    failed?: number;
  }

  export let notification: NotificationItem;

  let processing = false;
  let response: { actionId: string; userInput?: string; timestamp: number } | null = null;
  let inputValue = '';
  let showInput = false;

  $: hasActions = notification.data?.actionData?.actions && notification.data.actionData.actions.length > 0;
  $: alreadyResponded = !!response;

  function formatTime(timestamp: number) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatRelativeTime(timestamp: number) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) {
return 'Just now';
}
    if (seconds < 60) {
return `${seconds}s ago`;
}
    if (minutes < 60) {
return `${minutes}m ago`;
}
    if (hours < 24) {
return `${hours}h ago`;
}
    return `${Math.floor(hours / 24)}d ago`;
  }

  async function handleAction(actionId: string, requiresInput: boolean = false) {
    if (alreadyResponded) {
return;
}

    if (requiresInput && !showInput) {
      showInput = true;
      return;
    }

    processing = true;

    // Simulate processing (in real app, this would send to backend)
    await new Promise(resolve => setTimeout(resolve, 500));

    response = {
      actionId,
      ...(requiresInput ? { userInput: inputValue } : {}),
      timestamp: Date.now()
    };

    processing = false;
    showInput = false;
    inputValue = '';

    // Update the notification in storage
    updateNotificationWithResponse();
  }

  function updateNotificationWithResponse() {
    // In a real implementation, this would update the backend
    console.log('Response recorded:', {
      notificationId: notification.id,
      response
    });
  }

  function getActionStyle(action: NotificationAction): string {
    return action.style || 'secondary';
  }

  function getActionIcon(actionId: string): string {
    switch (actionId) {
      case 'confirm': return '✅';
      case 'cancel': return '❌';
      case 'reply': return '💬';
      default: return '';
    }
  }

  function getResponseIcon(actionId: string): string {
    switch (actionId) {
      case 'confirm': return '✅ Confirmed';
      case 'cancel': return '❌ Cancelled';
      case 'reply': return '💬 Replied';
      default: return '✓ Responded';
    }
  }
</script>

<div class="notification-card {notification.success ? 'success' : 'failed'}">
  <div class="header">
    <span class="emoji">📱</span>
    <div class="title-section">
      <h3>{notification.title}</h3>
      <div class="meta">
        <span class="time">{formatTime(notification.timestamp)}</span>
        <span class="separator">•</span>
        <span class="relative-time">{formatRelativeTime(notification.timestamp)}</span>
      </div>
    </div>
    {#if notification.success}
      <span class="status-badge success">SENT</span>
    {:else}
      <span class="status-badge failed">FAILED</span>
    {/if}
  </div>

  <div class="body">
    <p>{notification.message}</p>
  </div>

  {#if hasActions}
    <div class="actions-container">
      {#if alreadyResponded && response}
        <div class="response-indicator">
          <span class="icon">{getResponseIcon(response.actionId)}</span>
          <span class="text">at {formatTime(response.timestamp)}</span>
          {#if response.userInput}
            <div class="user-input">
              <span class="label">Your response:</span> <span>{response.userInput}</span>
            </div>
          {/if}
        </div>
      {:else}
        {#if showInput}
          <div class="input-section">
            <input
              type="text"
              bind:value={inputValue}
              placeholder={notification.data?.actionData?.inputPlaceholder || 'Type your response...'}
              disabled={processing}
              on:keydown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) {
                  handleAction('reply', true);
                }
              }}
            />
            <div class="input-actions">
              <button
                class="action-btn primary"
                on:click={() => handleAction('reply', true)}
                disabled={processing || !inputValue.trim()}
              >
                {processing ? 'Sending...' : 'Send'}
              </button>
              <button
                class="action-btn secondary"
                on:click={() => {
                  showInput = false;
                  inputValue = '';
                }}
                disabled={processing}
              >
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <div class="actions">
            {#each notification.data?.actionData?.actions || [] as action}
              <button
                class="action-btn {getActionStyle(action)}"
                on:click={() => handleAction(action.id, action.id === 'reply')}
                disabled={processing}
              >
                {getActionIcon(action.id)} {action.label}
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .notification-card {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-card);
    padding: var(--spacing-lg);
    transition: all var(--transition-base);
  }

  .notification-card:hover {
    border-color: var(--border-color-secondary);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .notification-card.success {
    border-left: 3px solid var(--status-color-success);
  }

  .notification-card.failed {
    border-left: 3px solid var(--status-color-error);
  }

  .header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-sm);
  }

  .title-section {
    flex: 1;
  }

  h3 {
    margin: 0 0 var(--spacing-xxs) 0;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .status-badge {
    padding: var(--spacing-xxs) var(--spacing-sm);
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .status-badge.success {
    background: var(--status-color-success-bg);
  }

  .status-badge.failed {
    background: var(--status-color-error-bg);
  }

  .body {
    margin-left: 2.5rem;
    margin-bottom: var(--spacing-sm);
  }

  .body p {
    margin: 0;

  }

  .actions-container {
    margin-left: 2.5rem;
    margin-top: var(--spacing-md);
  }

  .actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .action-btn {
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--radius-md);
    border: none;
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .action-btn.primary {
    background: var(--status-color-info);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--status-color-info-hover);
    transform: translateY(-1px);
  }

  .action-btn.secondary {
    background: var(--bg-color-tertiary);
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--border-color-secondary);
    transform: translateY(-1px);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .input-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .input-section input {
    background: var(--bg-color-primary);
    border: 1px solid var(--border-color-secondary);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm);

  }

  .input-section input:focus {
    outline: none;
    border-color: var(--status-color-info);
  }

  .input-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .response-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--status-color-success-subtle);
    border: 1px solid var(--status-color-success-border);
    border-radius: var(--radius-md);
  }

  .response-indicator

  .user-input {
    margin-top: var(--spacing-xs);
    padding-top: var(--spacing-xs);
    border: 1px solid var(--status-color-success-border);
  }
</style>
