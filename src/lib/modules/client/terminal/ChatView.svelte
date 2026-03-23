<script lang="ts">
  import type {
    ConversationMessage,
    MessagePart,
    ToolUsePart,
  } from '$lib/modules/server/sessions/types';

  import {
    getToolDescription,
    renderMarkdown,
  } from '$lib/modules/client/common';
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  // --- Props (Svelte 5 runes) ---
  const {
    connectionState = 'idle',
    messages,
    onCancel,
    onSendInput,
    sessionEnded = false,
    showHeader = false,
    showInput = true,
  }: {
    connectionState?: 'connected' | 'connecting' | 'disconnected' | 'idle' | 'reconnecting';
    messages: ConversationMessage[];
    onCancel?: () => void;
    onSendInput?: (text: string) => void;
    sessionEnded?: boolean;
    showHeader?: boolean;
    showInput?: boolean;
  } = $props();

  // --- Local state ---
  let inputText = $state('');
  let chatContainerEl = $state<HTMLElement | null>(null);
  let shouldAutoScroll = $state(true);

  const expandedTools = new SvelteSet<string>();

  // --- Auto-scroll ---
  // Re-scroll whenever the messages array identity changes
  $effect(() => {
    // Read messages to track dependency
    void messages;
    void scrollToBottom();
  });

  async function scrollToBottom(): Promise<void> {
    if (!shouldAutoScroll || !chatContainerEl) { return; }
    await tick();
    chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
  }

  function handleScroll(): void {
    if (!chatContainerEl) { return; }
    const { clientHeight, scrollHeight, scrollTop } = chatContainerEl;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 100;
  }

  // --- Input handling ---
  function handleSend(): void {
    const text = inputText.trim();
    if (!text) { return; }
    inputText = '';
    onSendInput?.(text);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // --- Tool helpers ---
  function toggleTool(id: string): void {
    if (expandedTools.has(id)) {
      expandedTools.delete(id);
    } else {
      expandedTools.add(id);
    }
  }

  function formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getToolDescriptionFromPart(part: ToolUsePart): string {
    return getToolDescription(part.toolName, part.input);
  }

  function formatInput(input: Record<string, unknown>): string {
    return JSON.stringify(input, null, 2);
  }

  function isToolUsePart(part: MessagePart): part is ToolUsePart {
    return part.type === 'tool_use';
  }
</script>

<div class="chatview-wrapper">
  <!-- Optional header (pages can supply their own) -->
  {#if showHeader}
    <div class="chatview-header">
      <div class="chatview-header-left">
        <span class="badge-live">LIVE</span>
        <span class="chatview-title">Session</span>
      </div>
      <div class="chatview-header-right">
        <span
          class="connection-status {connectionState}"
        >
          <span class="connection-status-dot"></span>
          {connectionState === 'connected'
            ? 'Connected'
            : connectionState === 'connecting' || connectionState === 'reconnecting'
              ? 'Connecting...'
              : 'Disconnected'}
        </span>
        {#if !sessionEnded && onCancel}
          <button
            class="chatview-cancel-btn"
            onclick={() => { onCancel(); }}
          >
            Cancel
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chat Container (scrollable) -->
  <div
    class="chat-container chatview-scroll"
    bind:this={chatContainerEl}
    onscroll={handleScroll}
  >
    {#if messages.length === 0}
      <div class="chatview-empty">
        <p class="chatview-empty-text">Waiting for session messages...</p>
      </div>
    {:else}
      {#each messages as message (message.id)}
        {#if message.role === 'user'}
          <div class="chat-message chat-message-user">
            <div>
              {#each message.parts as part, partIdx (partIdx)}
                {#if part.type === 'text'}
                  <div class="chat-bubble chat-bubble-user">
                    {@html renderMarkdown(part.content)}
                  </div>
                {/if}
              {/each}
              <div class="chat-timestamp">{formatTime(message.timestamp)}</div>
            </div>
            <div class="chat-avatar chat-avatar-user">U</div>
          </div>
        {:else if message.role === 'assistant'}
          <div class="chat-message chat-message-assistant">
            <div class="chat-avatar chat-avatar-assistant">C</div>
            <div>
              {#each message.parts as part, partIdx (partIdx)}
                {#if part.type === 'text'}
                  <div class="chat-bubble chat-bubble-assistant">
                    {@html renderMarkdown(part.content)}
                  </div>
                {:else if isToolUsePart(part)}
                  {@const toolId = part.id}
                  {@const isExpanded = expandedTools.has(toolId)}
                  <div class="chat-tool-card">
                    <div
                      class="chat-tool-header"
                      onclick={() => { toggleTool(toolId); }}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { toggleTool(toolId); }
                      }}
                      role="button"
                      tabindex="0"
                    >
                      <span class="chat-tool-chevron" class:expanded={isExpanded}>&#9654;</span>
                      <span class="chat-tool-name" data-tool={part.toolName}>{part.toolName}</span>
                      <span class="chat-tool-description">{getToolDescriptionFromPart(part)}</span>
                    </div>
                    {#if isExpanded}
                      <div class="chat-tool-body">{formatInput(part.input)}</div>
                    {/if}
                  </div>
                {:else if part.type === 'thinking'}
                  {@const thinkId = `thinking-${message.id}`}
                  {@const isThinkExpanded = expandedTools.has(thinkId)}
                  <div class="chat-thinking">
                    <div
                      class="chat-thinking-header"
                      onclick={() => { toggleTool(thinkId); }}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { toggleTool(thinkId); }
                      }}
                      role="button"
                      tabindex="0"
                    >
                      &#128173; Thinking... {isThinkExpanded ? '&#9660;' : '&#9654;'}
                    </div>
                    {#if isThinkExpanded}
                      <div class="chat-thinking-body">{@html renderMarkdown(part.content)}</div>
                    {/if}
                  </div>
                {/if}
              {/each}
              <div class="chat-timestamp">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        {:else if message.role === 'system'}
          {#each message.parts as part, partIdx (partIdx)}
            {#if part.type === 'tool_result'}
              {@const resultId = `result-${part.toolUseId}`}
              {@const isResultExpanded = expandedTools.has(resultId)}
              <div class="chat-message chat-message-system">
                <div class="chat-tool-card">
                  <div
                    class="chat-tool-header"
                    onclick={() => { toggleTool(resultId); }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { toggleTool(resultId); }
                    }}
                    role="button"
                    tabindex="0"
                  >
                    <span class="chat-tool-chevron" class:expanded={isResultExpanded}>&#9654;</span>
                    <span class="chat-tool-description">
                      {part.isError ? '\u274C Tool Error' : '\u2705 Tool Result'}
                    </span>
                  </div>
                  {#if isResultExpanded}
                    <div
                      class="chat-tool-result"
                      class:chat-tool-result-success={!part.isError}
                      class:chat-tool-result-error={part.isError}
                    >
                      {part.output}
                    </div>
                  {/if}
                </div>
              </div>
            {:else if part.type === 'text'}
              <!-- System text messages (e.g. error messages displayed inline) -->
              <div class="chat-message chat-message-system">
                <div class="chat-bubble chat-bubble-system">
                  {@html renderMarkdown(part.content)}
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      {/each}

      <!-- Session ended indicator -->
      {#if sessionEnded}
        <div class="chatview-ended">
          <span class="badge-ended">ENDED</span>
          <span>Session has ended</span>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Input bar (if showInput is true) -->
  {#if showInput}
    <div class="chat-input-bar">
      <input
        type="text"
        placeholder={sessionEnded ? 'Session ended' : 'Send a message...'}
        disabled={sessionEnded || connectionState !== 'connected'}
        bind:value={inputText}
        onkeydown={handleKeydown}
      />
      <button
        disabled={sessionEnded || connectionState !== 'connected' || !inputText.trim()}
        onclick={handleSend}
      >
        Send
      </button>
    </div>
  {/if}
</div>

<style>
  /* ChatView wrapper: fills parent, flex column layout */
  .chatview-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--ds-background-100, #0a0a0a);
  }

  /* Header bar */
  .chatview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
    background: #111827;
    border-bottom: 1px solid #1e293b;
    min-height: 48px;
    flex-shrink: 0;
  }

  .chatview-header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    min-width: 0;
  }

  .chatview-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary, #ededed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chatview-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    flex-shrink: 0;
  }

  .chatview-cancel-btn {
    height: 32px;
    padding: 0 var(--space-3, 0.75rem);
    background: transparent;
    border: 1px solid #ef4444;
    border-radius: var(--radius-md, 6px);
    color: #ef4444;
    font-family: var(--font-sans);
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--transition-fast, 150ms),
      color var(--transition-fast, 150ms);
  }

  .chatview-cancel-btn:hover {
    background: rgba(239, 68, 68, 0.15);
  }

  /* Scrollable chat area */
  .chatview-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--space-4, 1rem);
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
  }

  /* Empty state */
  .chatview-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8, 2rem);
    height: 100%;
  }

  .chatview-empty-text {
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-tertiary, #7d7d7d);
  }

  /* Session ended indicator */
  .chatview-ended {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-4, 1rem);
    font-size: 0.85rem;
    color: var(--text-tertiary, #7d7d7d);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .chatview-header {
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      gap: var(--space-2, 0.5rem);
      min-height: 44px;
    }

    .chatview-title {
      font-size: 0.8rem;
    }

    .chatview-scroll {
      padding: var(--space-3, 0.75rem);
    }
  }

  @media (max-width: 480px) {
    .chatview-header {
      flex-wrap: wrap;
    }
  }
</style>
