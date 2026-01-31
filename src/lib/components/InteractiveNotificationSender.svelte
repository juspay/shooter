<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { config } from '$lib/stores/config';

  let title = '';
  let message = '';
  let notificationType: 'info' | 'confirmation' | 'input' = 'info';
  let sending = false;
  let result = '';
  let resultType: 'success' | 'error' = 'success';

  $: actionData = getActionDataForType(notificationType);

  function getActionDataForType(type: typeof notificationType) {
    switch (type) {
      case 'confirmation':
        return {
          actions: [
            { id: 'confirm', label: 'Confirm', style: 'primary' },
            { id: 'cancel', label: 'Cancel', style: 'secondary' }
          ]
        };
      case 'input':
        return {
          actions: [
            { id: 'reply', label: 'Reply', style: 'primary' }
          ],
          inputRequired: true,
          inputPlaceholder: 'Type your response...'
        };
      default:
        return null;
    }
  }

  async function sendNotification() {
    if (!title || !message) {
      result = 'Title and message are required';
      resultType = 'error';
      return;
    }

    sending = true;
    result = '';

    try {
      const payload = {
        title,
        message,
        data: {
          source: 'interactive-test',
          category: 'user_action',
          timestamp: Date.now(),
          actionData: actionData
        }
      };

      const response = await fetch('/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${$config.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        result = '✅ Interactive notification sent successfully!';
        resultType = 'success';

        // Clear form
        title = '';
        message = '';
        notificationType = 'info';

        // Refresh notification list
        await invalidateAll();
      } else {
        result = `❌ Failed: ${data.error || data.details || 'Unknown error'}`;
        resultType = 'error';
      }
    } catch (error) {
      result = `❌ Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      resultType = 'error';
    } finally {
      sending = false;
    }
  }
</script>

<div class="interactive-sender">
  <h3>🎯 Interactive Notifications</h3>
  <p class="subtitle">Send notifications with action buttons and input fields</p>

  <div class="form">
    <div class="form-group">
      <span class="label">Type</span>
      <select id="notification-type" bind:value={notificationType}>
        <option value="info">ℹ️ Info (No actions)</option>
        <option value="confirmation">✅ Confirmation (Confirm/Cancel)</option>
        <option value="input">💬 Input (Reply with text)</option>
      </select>
    </div>

    <div class="form-group">
      <span class="label">Title</span>
      <input
        id="title"
        type="text"
        bind:value={title}
        placeholder="Notification title..."
        disabled={sending}
      />
    </div>

    <div class="form-group">
      <span class="label">Message</span>
      <!-- svelte-ignore element_invalid_self_closing_tag -->
      <textarea
        id="message"
        bind:value={message}
        placeholder="Notification message..."
        rows="3"
        disabled={sending}
      />
    </div>

    {#if actionData}
      <div class="action-preview">
        <span class="preview-label">Actions:</span>
        <div class="actions">
          {#each actionData.actions as action}
            <button class="action-btn {action.style}" disabled>
              {action.label}
            </button>
          {/each}
        </div>
        {#if actionData.inputRequired}
          <div class="input-preview">
            <input type="text" placeholder={actionData.inputPlaceholder} disabled />
          </div>
        {/if}
      </div>
    {/if}

    <button class="send-btn" on:click={sendNotification} disabled={sending || !title || !message}>
      {sending ? 'Sending...' : '🚀 Send Interactive Notification'}
    </button>

    {#if result}
      <div class="result {resultType}">
        <p>{result}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .interactive-sender {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-card);
    padding: var(--spacing-xl);
    margin-bottom: var(--spacing-xxl);
  }

  h3 {
    margin: 0 0 var(--spacing-xs) 0;
  }

  .subtitle {
    margin: 0 0 var(--spacing-xl) 0;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .label {
    display: block;
  }

  input,
  textarea,
  select {
    background: var(--bg-color-primary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm);

  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--status-color-info);
  }

  input:disabled,
  textarea:disabled,
  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-preview {
    background: var(--bg-color-light);
    border: 1px solid var(--text-color-hint);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
  }

  .preview-label {
    display: block;
    margin-bottom: var(--spacing-sm);
  }

  .actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .action-btn {
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-sm);
    border: none;
    cursor: default;
  }

  .action-btn.primary {
    background: var(--status-color-info);
  }

  .action-btn.secondary {
    background: var(--bg-color-tertiary);
  }

  .input-preview {
    margin-top: var(--spacing-sm);
  }

  .input-preview input {
    width: 100%;
  }

  .send-btn {
    background: var(--status-color-info) 0%, var(--status-color-info-hover) 100%);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--spacing-md) var(--spacing-xl);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .send-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px var(--status-color-info-alt-border);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .result {
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .result p {
    margin: 0;
  }

  .result.success {
    background: var(--status-color-success-subtle);
    border: 1px solid var(--status-color-success-border);
  }

  .result.error {
    background: var(--status-color-error-subtle);
    border: 1px solid var(--status-color-error-border);
  }
</style>
