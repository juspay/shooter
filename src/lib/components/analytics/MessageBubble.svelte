<!--
  MessageBubble - Individual chat message with role-based styling
  Extracted from Claude Code mobile template for Shooter
-->
<script lang="ts">
  import type { MessageData } from '$types';
  
  export let message: MessageData;
  export let showTimestamp = true;
  export let showAvatar = false;
  
  $: isUser = message.role === 'user';
  $: isAssistant = message.role === 'assistant';
  $: formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Extract content text from various message formats
  $: content = Array.isArray(message.content)
    ? message.content.map(c => c.text || c.type || '').join(' ')
    : message.content || '';
  
  // Check if message contains tool results or code
  $: hasToolResults = message.metadata?.hasCode || false;
  $: isToolExecution = message.metadata?.contentType === 'code';
</script>

<div class="message" class:message-user={isUser} class:message-assistant={isAssistant}>
  {#if showAvatar}
    <div class="message-avatar">
      {#if isUser}
        <span class="avatar-icon">👤</span>
      {:else}
        <span class="avatar-icon">🤖</span>
      {/if}
    </div>
  {/if}
  
  <div class="message-content">
    <div class="message-bubble" class:tool-execution={isToolExecution}>
      <div class="message-text">
        {content}
      </div>
      
      {#if hasToolResults}
        <div class="tool-indicator">
          <span class="tool-icon">🔧</span>
          <span class="tool-text">Tool execution</span>
        </div>
      {/if}
    </div>
    
    {#if showTimestamp}
      <div class="message-timestamp">
        {formattedTime}
      </div>
    {/if}
  </div>
</div>

<style>
  .message {
    margin-bottom: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    max-width: 85%;
    animation: messageSlide 0.3s ease-out;
  }
  
  @keyframes messageSlide {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .message-user {
    align-self: flex-end;
    align-items: flex-end;
  }
  
  .message-assistant {
    align-self: flex-start;
    align-items: flex-start;
  }
  
  .message-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg-color-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
    flex-shrink: 0;
  }

  .message-user .message-avatar {
    background: var(--status-color-success-hover);
  }

  .message-assistant .message-avatar {
    background: var(--status-color-warning-hover);
  }

  .message-content {
    flex: 1;
    min-width: 0;
  }
  
  .message-bubble {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-bubble);

    word-wrap: break-word;
    position: relative;
  }

  .message-user .message-bubble {
    background: var(--status-color-success-hover);
    border-radius: var(--radius-bubble) var(--radius-bubble) var(--radius-xs) var(--radius-bubble);
  }

  .message-assistant .message-bubble {
    background: var(--bg-color-primary);
    border: 2px solid var(--status-color-warning-hover);
    border-radius: var(--radius-md);
  }

  .tool-execution {
    background: var(--bg-color-warning-subtle) !important;
    border: 1px solid var(--status-color-warning) !important;
    border-radius: var(--radius-md) !important;
  }

  .message-text {
    margin: 0;
    white-space: pre-wrap;
  }

  .tool-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
    padding: var(--spacing-xxs) var(--spacing-sm);
    background: var(--bg-color-warning-subtle);
    border-radius: var(--radius-lg);
  }

  .message-timestamp {

    margin-top: 4px;
    padding: 0 var(--spacing-xxs);
  }
  
  .message-user .message-timestamp {
    text-align: right;
  }
  
  .message-assistant .message-timestamp {
    text-align: left;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .message {
      max-width: 90%;
    }

    .message-bubble {
      padding: var(--spacing-sm) var(--spacing-sm);

    }

    .tool-indicator {

      padding: var(--spacing-xxs) var(--spacing-xs);
    }
  }

  @media (max-width: 480px) {
    .message {
      max-width: 95%;
    }

    .message-bubble {
      padding: var(--spacing-xs) var(--spacing-sm);

    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .message-bubble {
      border-width: 3px;
    }

    .message-user .message-bubble {
      background: var(--status-color-success-active);
    }

    .message-assistant .message-bubble {
      border-color: var(--status-color-warning);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .message {
      animation: none;
    }
  }
</style>