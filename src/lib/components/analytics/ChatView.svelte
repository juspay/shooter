<!--
  ChatView - Main chat interface with scrollable messages
  Extracted from Claude Code mobile template for Shooter
-->
<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import MessageBubble from './MessageBubble.svelte';
  import ConversationHeader from './ConversationHeader.svelte';
  import type { ConversationData, MessageData } from '$types';
  
  export let conversations: ConversationData[] = [];
  export let selectedConversation: ConversationData | null = null;
  export let autoScroll = true;
  export let showAvatars = false;
  export let showTimestamps = true;
  
  const dispatch = createEventDispatcher<{
    conversationSelect: { conversation: ConversationData | null | undefined };
    messageInteraction: { message: MessageData; action: string };
    scrollToTop: void;
    scrollToBottom: void;
  }>();
  
  let messagesContainer: HTMLElement;
  let isAtBottom = true;
  let showScrollToBottom = false;
  
  onMount(() => {
    if (messagesContainer) {
      messagesContainer.addEventListener('scroll', handleScroll);
    }
  });
  
  onDestroy(() => {
    if (messagesContainer) {
      messagesContainer.removeEventListener('scroll', handleScroll);
    }
  });
  
  afterUpdate(() => {
    if (autoScroll && isAtBottom) {
      scrollToBottom();
    }
  });
  
  function handleScroll() {
    if (!messagesContainer) {
return;
}
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    const threshold = 100; // pixels from bottom
    
    isAtBottom = scrollHeight - scrollTop - clientHeight < threshold;
    showScrollToBottom = !isAtBottom && scrollHeight > clientHeight + threshold;
  }
  
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      dispatch('scrollToBottom');
    }
  }
  
  function scrollToTop() {
    if (messagesContainer) {
      messagesContainer.scrollTop = 0;
      dispatch('scrollToTop');
    }
  }
  
  function handleConversationSelect(conversation: ConversationData) {
    dispatch('conversationSelect', { conversation });
  }
  
  function handleMessageInteraction(event: CustomEvent) {
    dispatch('messageInteraction', event.detail);
  }
  
  $: displayMessages = selectedConversation?.messages || [];
  $: hasMessages = displayMessages.length > 0;
  $: hasConversations = conversations.length > 0;
</script>

<div class="chat-view">
  <div class="messages-container" bind:this={messagesContainer}>
    {#if !hasConversations}
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-title">No conversations yet</div>
        <div class="empty-description">
          Start using Claude Code to see your conversations here
        </div>
      </div>
    {:else if !selectedConversation}
      <div class="conversation-list">
        <div class="conversation-list-header">
          <h3>Recent Conversations</h3>
          <span class="conversation-count">{conversations.length} total</span>
        </div>
        
        {#each conversations as conversation}
          <ConversationHeader
            {conversation}
            isSelected={false}
            showDetails={true}
            on:select={() => handleConversationSelect(conversation)}
          />
        {/each}
      </div>
    {:else}
      <!-- Selected conversation header -->
      <ConversationHeader
        conversation={selectedConversation}
        isSelected={true}
        showDetails={true}
        on:back={() => dispatch('conversationSelect', { conversation: undefined })}
      />
      
      <!-- Messages -->
      {#if hasMessages}
        {#each displayMessages as message}
          <MessageBubble
            {message}
            showTimestamp={showTimestamps}
            showAvatar={showAvatars}
            on:interaction={handleMessageInteraction}
          />
        {/each}
      {:else}
        <div class="empty-messages">
          <div class="empty-icon">📝</div>
          <div class="empty-title">No messages</div>
          <div class="empty-description">
            This conversation doesn't have any messages yet
          </div>
        </div>
      {/if}
    {/if}
  </div>
  
  <!-- Scroll to bottom button -->
  {#if showScrollToBottom}
    <button class="scroll-to-bottom" on:click={scrollToBottom} title="Scroll to bottom">
      <span>⬇️</span>
      <span class="scroll-text">New</span>
    </button>
  {/if}
  
  <!-- Scroll controls -->
  <div class="scroll-controls">
    <button class="scroll-control" on:click={scrollToTop} title="Scroll to top">
      <span>⬆️</span>
    </button>
  </div>
</div>

<style>
  .chat-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg);
    scroll-behavior: smooth;
  }
  
  .empty-state,
  .empty-messages {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: var(--spacing-xxl) var(--spacing-lg);
  }
  
  .empty-icon {
    font-size: var(--font-size-4xl);
    margin-bottom: 16px;
    opacity: 0.7;
  }

  .empty-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
    margin-bottom: 8px;
  }

  .empty-description {
    font-size: var(--font-size-sm);
    color: var(--text-color-secondary);
    max-width: 300px;
  }
  
  .conversation-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  
  .conversation-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) 0 var(--spacing-xs);
    border-bottom: 1px solid var(--bg-color-elevated);
    margin-bottom: 8px;
  }

  .conversation-list-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
  }

  .conversation-count {
    font-size: var(--font-size-xs);
    color: var(--text-color-secondary);
    background: var(--bg-color-tertiary);
    padding: var(--spacing-xxs) var(--spacing-xs);
    border-radius: var(--radius-lg);
  }
  
  .scroll-to-bottom {
    position: fixed;
    bottom: 80px;
    right: 24px;
    background: var(--status-color-warning);
    border: none;
    border-radius: var(--radius-3xl);
    padding: var(--spacing-sm) var(--spacing-md);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    cursor: pointer;
    color: var(--text-color-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    box-shadow: var(--shadow-lg);
    transition: all 0.2s ease;
    z-index: 10;
  }

  .scroll-to-bottom:hover {
    background: var(--status-color-warning-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-xl);
  }
  
  .scroll-to-bottom:active {
    transform: translateY(0);
  }
  
  .scroll-text {
    font-size: var(--font-size-xs);
  }

  .scroll-controls {
    position: fixed;
    top: 80px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 10;
  }
  
  .scroll-control {
    background: var(--bg-color-tertiary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-2xl);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    opacity: 0.7;
  }

  .scroll-control:hover {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
    opacity: 1;
  }
  
  .scroll-control span {
    font-size: var(--font-size-md);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .messages-container {
      padding: var(--spacing-md);
    }
    
    .scroll-to-bottom {
      bottom: 24px;
      right: 16px;
      padding: var(--spacing-sm) var(--spacing-sm);
      font-size: var(--font-size-xs);
    }
    
    .scroll-controls {
      top: 70px;
      right: 16px;
    }
    
    .scroll-control {
      width: 36px;
      height: 36px;
    }
    
    .empty-state,
    .empty-messages {
      padding: var(--spacing-lg) var(--spacing-md);
    }
    
    .empty-icon {
      font-size: var(--font-size-3xl);
    }
  }
  
  @media (max-width: 480px) {
    .messages-container {
      padding: var(--spacing-sm);
    }
    
    .conversation-list-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
  }
  
  /* Scrollbar styling */
  .messages-container::-webkit-scrollbar {
    width: 6px;
  }

  .messages-container::-webkit-scrollbar-track {
    background: var(--bg-color-tertiary);
  }

  .messages-container::-webkit-scrollbar-thumb {
    background: var(--bg-color-elevated);
    border-radius: var(--radius-xs);
  }

  .messages-container::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-muted);
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .messages-container {
      scroll-behavior: auto;
    }
    
    .scroll-to-bottom {
      transition: none;
    }
  }
</style>