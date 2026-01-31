<!--
  ConversationHeader - Individual conversation card/header with metadata
  Extracted from Claude Code mobile template for Shooter
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ConversationData } from '$types';

  export let conversation: ConversationData;
  export let isSelected = false;
  export let showDetails = true;
  export let compact = false;
  
  const dispatch = createEventDispatcher<{
    select: void;
    back: void;
    action: { action: string; conversation: ConversationData };
  }>();
  
  function handleSelect() {
    dispatch('select');
  }
  
  function handleBack() {
    dispatch('back');
  }
  
  function handleAction(action: string) {
    dispatch('action', { action, conversation });
  }
  
  $: displayTitle = conversation.title || 'Untitled Conversation';
  $: messageCount = conversation.messages?.length || 0;
  $: lastModified = new Date(conversation.updatedAt);
  $: relativeTime = getRelativeTime(lastModified);
  $: hasMessages = messageCount > 0;
  
  // Local type for handling message content (can be string or array of content blocks)
  interface MessageContentBlock {
    text?: string;
    type?: string;
  }

  interface MessageWithContent {
    content: string | MessageContentBlock[];
  }

  // Get last message preview
  $: lastMessage = conversation.messages?.[conversation.messages.length - 1];
  $: lastMessagePreview = lastMessage
    ? truncateText(getMessageText(lastMessage), 60)
    : 'No messages';

  function getMessageText(message: MessageWithContent): string {
    if (Array.isArray(message.content)) {
      return message.content.map((c: MessageContentBlock) => c.text || c.type || '').join(' ');
    }
    return message.content || '';
  }
  
  function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
return text;
}
    return text.substring(0, maxLength).trim() + '...';
  }
  
  function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) {
return 'Just now';
}
    if (diffMins < 60) {
return `${diffMins}m ago`;
}
    if (diffHours < 24) {
return `${diffHours}h ago`;
}
    if (diffDays < 7) {
return `${diffDays}d ago`;
}
    
    return date.toLocaleDateString();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="conversation-header"
  class:selected={isSelected}
  class:compact
  class:clickable={!isSelected}
  on:click={isSelected ? undefined : handleSelect}
  role={isSelected ? "banner" : "button"}
  tabindex={isSelected ? undefined : 0}
  on:keydown={(e) => {
    if (!isSelected && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleSelect();
    }
  }}
>
  {#if isSelected}
    <div class="header-navigation">
      <button class="back-button" on:click={handleBack} title="Back to conversations">
        <span>←</span>
      </button>
      
      <div class="conversation-info">
        <h3 class="conversation-title">{displayTitle}</h3>
        <div class="conversation-meta">
          <span class="message-count">{messageCount} messages</span>
          <span class="separator">•</span>
          <span class="last-modified">{relativeTime}</span>
        </div>
      </div>
      
      <div class="header-actions">
        <button 
          class="action-button" 
          on:click={() => handleAction('refresh')}
          title="Refresh conversation"
        >
          <span>🔄</span>
        </button>
        
        <button 
          class="action-button" 
          on:click={() => handleAction('export')}
          title="Export conversation"
        >
          <span>📤</span>
        </button>
      </div>
    </div>
  {:else}
    <div class="conversation-card">
      <div class="card-header">
        <div class="conversation-title">{displayTitle}</div>
        <div class="conversation-time">{relativeTime}</div>
      </div>
      
      {#if showDetails && !compact}
        <div class="card-content">
          <div class="message-preview">
            {lastMessagePreview}
          </div>
          
          <div class="conversation-stats">
            <div class="stat">
              <span class="stat-icon">💬</span>
              <span class="stat-text">{messageCount}</span>
            </div>
            
            {#if hasMessages && lastMessage}
              <div class="stat">
                <span class="stat-icon">👤</span>
                <span class="stat-text">{lastMessage.role}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .conversation-header {
    background: var(--bg-color-secondary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
    overflow: hidden;
  }

  .conversation-header.clickable {
    cursor: pointer;
  }

  .conversation-header.clickable:hover {
    border-color: var(--status-color-warning);
    background: var(--bg-color-tertiary);
    transform: translateY(-1px);
  }

  .conversation-header.clickable:active {
    transform: translateY(0);
  }

  .conversation-header.selected {
    background: var(--bg-color-primary);
    border-color: var(--status-color-warning);
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
    border-bottom: 1px solid var(--bg-color-elevated);
    margin-bottom: var(--spacing-sm);
  }
  
  .conversation-header.compact {
    border-radius: var(--radius-sm);
  }
  
  .header-navigation {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
  }
  
  .back-button {
    background: var(--bg-color-tertiary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .back-button:hover {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
  }
  
  .back-button span {
    font-size: var(--font-size-md);
  }

  .conversation-info {
    flex: 1;
    min-width: 0;
  }

  .conversation-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
    margin: 0 0 4px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conversation-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-xs);
    color: var(--text-color-secondary);
  }
  
  .separator {
    opacity: 0.5;
  }
  
  .header-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }
  
  .action-button {
    background: var(--bg-color-tertiary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    transition: all 0.2s ease;
  }

  .action-button:hover {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
  }
  
  .action-button span {
    font-size: var(--font-size-xs);
  }

  .conversation-card {
    padding: var(--spacing-md);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }

  .card-header .conversation-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
    margin: 0;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conversation-time {
    font-size: var(--font-size-xs);
    color: var(--text-color-tertiary);
    flex-shrink: 0;
    white-space: nowrap;
  }
  
  .card-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .message-preview {
    font-size: var(--font-size-sm);
    color: var(--text-color-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .conversation-stats {
    display: flex;
    gap: var(--spacing-sm);
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
    color: var(--text-color-tertiary);
  }

  .stat-icon {
    font-size: var(--font-size-sm);
  }

  .stat-text {
    font-size: var(--font-size-xs);
    color: var(--text-color-secondary);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .header-navigation {
      padding: var(--spacing-sm) var(--spacing-md);
      gap: var(--spacing-xs);
    }
    
    .conversation-title {
      font-size: var(--font-size-sm);
    }

    .conversation-meta {
      font-size: var(--font-size-xxs);
    }

    .action-button {
      width: 24px;
      height: 24px;
    }

    .action-button span {
      font-size: var(--font-size-xxs);
    }

    .conversation-card {
      padding: var(--spacing-sm);
    }

    .card-header .conversation-title {
      font-size: var(--font-size-sm);
    }

    .conversation-time {
      font-size: var(--font-size-xxs);
    }

    .message-preview {
      font-size: var(--font-size-xs);
    }
  }
  
  @media (max-width: 480px) {
    .header-navigation {
      padding: var(--spacing-sm) var(--spacing-sm);
    }
    
    .conversation-meta {
      flex-direction: column;
      gap: 2px;
      align-items: flex-start;
    }
    
    .separator {
      display: none;
    }
    
    .header-actions {
      flex-direction: column;
      gap: 4px;
    }
  }
  
  /* Focus styles for accessibility */
  .conversation-header.clickable:focus {
    outline: none;
    border-color: var(--status-color-info);
    box-shadow: var(--shadow-focus);
  }

  .back-button:focus,
  .action-button:focus {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .conversation-header {
      transition: none;
    }
    
    .conversation-header.clickable:hover {
      transform: none;
    }
  }
</style>