<script lang="ts">
  import type {
    ChatViewProps,
    ConversationMessage,
    GroupedPart,
    MessagePart,
    ToolGroup,
    ToolUsePart,
  } from '$lib/types';

  import { browser } from '$app/environment';
  import { getToolDescription, renderMarkdown } from '$lib/modules/client/common';
  import { Accordion, Avatar, Button, Input, Pill } from '@juspay/svelte-ui-components';
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  // --- Props (Svelte 5 runes) ---
  const {
    connectionState = 'idle',
    messages,
    newestFirst = false,
    onCancel,
    onSendInput,
    sendDisabled,
    sessionEnded = false,
    showHeader = false,
    showInput = true,
  }: ChatViewProps = $props();

  // When sendDisabled is explicitly provided, it overrides the connectionState check.
  // Otherwise fall back to the existing behaviour (disabled when not connected).
  const isInputDisabled = $derived(
    sessionEnded || (sendDisabled !== undefined ? sendDisabled : connectionState !== 'connected')
  );

  // --- Local state ---
  let inputText = $state('');
  let chatContainerEl = $state<HTMLElement | null>(null);
  let shouldAutoScroll = $state(true);

  const expandedTools = new SvelteSet<string>();
  const expandedGroups = new SvelteSet<string>();

  // --- Show Details toggle (persisted in localStorage) ---
  const SHOW_DETAILS_KEY = 'shooter:chatview:showDetails';
  let showDetails = $state(browser ? localStorage.getItem(SHOW_DETAILS_KEY) === 'true' : false);

  function toggleShowDetails(): void {
    showDetails = !showDetails;
    if (browser) {
      localStorage.setItem(SHOW_DETAILS_KEY, String(showDetails));
    }
  }

  // --- Tool grouping ---
  function groupMessageParts(parts: MessagePart[], messageId: string): GroupedPart[] {
    const result: GroupedPart[] = [];
    let currentToolGroup: ToolUsePart[] = [];
    let groupIndex = 0;

    function flushToolGroup(): void {
      if (currentToolGroup.length === 0) {
        return;
      }

      if (currentToolGroup.length === 1) {
        // Single tool -- render as normal tool card, no group wrapper
        result.push(currentToolGroup[0]);
      } else {
        const toolNames = currentToolGroup.map((t) => t.toolName);
        // Deduplicate tool names while preserving order
        const uniqueNames = [...new Set(toolNames)];
        const summary = `Used ${currentToolGroup.length} tools: ${uniqueNames.join(', ')}`;
        result.push({
          groupId: `toolgroup-${messageId}-${groupIndex}`,
          summary,
          tools: currentToolGroup,
          type: 'tool_group',
        });
        groupIndex++;
      }
      currentToolGroup = [];
    }

    for (const part of parts) {
      if (part.type === 'tool_use') {
        currentToolGroup.push(part);
      } else {
        flushToolGroup();
        result.push(part);
      }
    }
    flushToolGroup();

    return result;
  }

  function isToolGroup(part: GroupedPart): part is ToolGroup {
    return (part as ToolGroup).type === 'tool_group';
  }

  function hasOnlyToolResults(message: ConversationMessage): boolean {
    return message.parts.every((p) => p.type === 'tool_result');
  }

  // --- Auto-scroll ---
  // Re-scroll whenever the messages array identity changes
  $effect(() => {
    // Read messages to track dependency
    void messages;
    void scrollToBottom();
  });

  async function scrollToBottom(): Promise<void> {
    if (!shouldAutoScroll || !chatContainerEl) {
      return;
    }
    await tick();
    if (newestFirst) {
      chatContainerEl.scrollTop = 0;
    } else {
      chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
    }
  }

  function handleScroll(): void {
    if (!chatContainerEl) {
      return;
    }
    const { clientHeight, scrollHeight, scrollTop } = chatContainerEl;
    if (newestFirst) {
      shouldAutoScroll = scrollTop < 100;
    } else {
      shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 100;
    }
  }

  // --- Input handling ---
  function handleSend(): void {
    const text = inputText.trim();
    if (!text) {
      return;
    }
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

  function toggleGroup(id: string): void {
    if (expandedGroups.has(id)) {
      expandedGroups.delete(id);
    } else {
      expandedGroups.add(id);
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
        <Pill text="LIVE" classes="pill-live" />
        <span class="chatview-title">Session</span>
      </div>
      <div class="chatview-header-right">
        <span class="connection-status {connectionState}">
          <span class="connection-status-dot"></span>
          {connectionState === 'connected'
            ? 'Connected'
            : connectionState === 'connecting' || connectionState === 'reconnecting'
              ? 'Connecting...'
              : 'Disconnected'}
        </span>
        {#if !sessionEnded && onCancel}
          <Button
            classes="btn-danger btn-sm"
            onclick={(): void => {
              onCancel();
            }}
            text="Cancel"
          />
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chat Container (scrollable) -->
  <div class="chat-container chatview-scroll" bind:this={chatContainerEl} onscroll={handleScroll}>
    {#if messages.length === 0}
      <div class="chatview-empty">
        <p class="chatview-empty-text">Waiting for session messages...</p>
      </div>
    {:else}
      <!-- Show details toggle -->
      <div class="chatview-details-toggle">
        <Button
          classes="chatview-details-btn {showDetails ? 'active' : ''}"
          onclick={toggleShowDetails}
          text="{showDetails ? '\u25BC' : '\u25B6'} {showDetails ? 'Hide details' : 'Show details'}"
        />
      </div>

      {#each messages as message (message.id)}
        {#if message.role === 'user'}
          <div class="chat-message chat-message-user">
            <div>
              {#each message.parts as part, partIdx (partIdx)}
                {#if part.type === 'text'}
                  <div class="chat-bubble chat-bubble-user">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized markdown -->
                    {@html renderMarkdown(part.content)}
                  </div>
                {/if}
              {/each}
              <div class="chat-timestamp">{formatTime(message.timestamp)}</div>
            </div>
            <Avatar alt="User" name="User" size="small" classes="avatar-user" />
          </div>
        {:else if message.role === 'assistant'}
          <div class="chat-message chat-message-assistant">
            <Avatar alt="Claude" name="Claude" size="small" classes="avatar-assistant" />
            <div>
              {#each groupMessageParts(message.parts, message.id) as gpart, partIdx (partIdx)}
                {#if isToolGroup(gpart)}
                  <!-- Collapsed tool group summary -->
                  {@const groupExpanded = showDetails || expandedGroups.has(gpart.groupId)}
                  <div class="chat-tool-group">
                    <div
                      class="chat-tool-group-header"
                      onclick={(): void => {
                        toggleGroup(gpart.groupId);
                      }}
                      onkeydown={(e: KeyboardEvent): void => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleGroup(gpart.groupId);
                        }
                      }}
                      role="button"
                      tabindex="0"
                    >
                      <span class="chat-tool-group-chevron" class:expanded={groupExpanded}
                        >&#9654;</span
                      >
                      <span class="chat-tool-group-summary">{gpart.summary}</span>
                    </div>
                    {#if groupExpanded}
                      <div class="chat-tool-group-body">
                        {#each gpart.tools as tool (tool.id)}
                          {@const toolId = tool.id}
                          {@const isExpanded = showDetails || expandedTools.has(toolId)}
                          <div class="chat-tool-card">
                            <div
                              class="chat-tool-header"
                              onclick={(): void => {
                                toggleTool(toolId);
                              }}
                              onkeydown={(e: KeyboardEvent): void => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleTool(toolId);
                                }
                              }}
                              role="button"
                              tabindex="0"
                            >
                              <span class="chat-tool-chevron" class:expanded={isExpanded}
                                >&#9654;</span
                              >
                              <Pill text={tool.toolName} classes="pill-tool-name" />
                              <span class="chat-tool-description"
                                >{getToolDescriptionFromPart(tool)}</span
                              >
                            </div>
                            <Accordion expand={isExpanded}>
                              {#if isExpanded}
                                <div class="chat-tool-body">{formatInput(tool.input)}</div>
                              {/if}
                            </Accordion>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {:else if gpart.type === 'text'}
                  <div class="chat-bubble chat-bubble-assistant">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized markdown -->
                    {@html renderMarkdown(gpart.content)}
                  </div>
                {:else if isToolUsePart(gpart)}
                  <!-- Single tool (not grouped) -->
                  {@const toolId = gpart.id}
                  {@const isExpanded = showDetails || expandedTools.has(toolId)}
                  <div class="chat-tool-card">
                    <div
                      class="chat-tool-header"
                      onclick={(): void => {
                        toggleTool(toolId);
                      }}
                      onkeydown={(e: KeyboardEvent): void => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleTool(toolId);
                        }
                      }}
                      role="button"
                      tabindex="0"
                    >
                      <span class="chat-tool-chevron" class:expanded={isExpanded}>&#9654;</span>
                      <Pill text={gpart.toolName} classes="pill-tool-name" />
                      <span class="chat-tool-description">{getToolDescriptionFromPart(gpart)}</span>
                    </div>
                    <Accordion expand={isExpanded}>
                      {#if isExpanded}
                        <div class="chat-tool-body">{formatInput(gpart.input)}</div>
                      {/if}
                    </Accordion>
                  </div>
                {:else if gpart.type === 'thinking'}
                  {@const thinkId = `thinking-${message.id}`}
                  {@const isThinkExpanded = showDetails || expandedTools.has(thinkId)}
                  <div class="chat-thinking">
                    <div
                      class="chat-thinking-header"
                      onclick={(): void => {
                        toggleTool(thinkId);
                      }}
                      onkeydown={(e: KeyboardEvent): void => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleTool(thinkId);
                        }
                      }}
                      role="button"
                      tabindex="0"
                    >
                      &#128173; Thinking... {isThinkExpanded ? '&#9660;' : '&#9654;'}
                    </div>
                    <Accordion expand={isThinkExpanded}>
                      {#if isThinkExpanded}
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized markdown -->
                        <div class="chat-thinking-body">{@html renderMarkdown(gpart.content)}</div>
                      {/if}
                    </Accordion>
                  </div>
                {/if}
              {/each}
              <div class="chat-timestamp">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        {:else if message.role === 'system'}
          <!-- Hide system messages with only tool_result when details are off -->
          {#if showDetails || !hasOnlyToolResults(message)}
            {#each message.parts as part, partIdx (partIdx)}
              {#if part.type === 'tool_result'}
                {#if showDetails}
                  {@const resultId = `result-${part.toolUseId}`}
                  {@const isResultExpanded = expandedTools.has(resultId)}
                  <div class="chat-message chat-message-system">
                    <div class="chat-tool-card">
                      <div
                        class="chat-tool-header"
                        onclick={(): void => {
                          toggleTool(resultId);
                        }}
                        onkeydown={(e: KeyboardEvent): void => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleTool(resultId);
                          }
                        }}
                        role="button"
                        tabindex="0"
                      >
                        <span class="chat-tool-chevron" class:expanded={isResultExpanded}
                          >&#9654;</span
                        >
                        <Pill
                          text={part.isError ? '\u274C Tool Error' : '\u2705 Tool Result'}
                          classes={part.isError ? 'pill-tool-error' : 'pill-tool-success'}
                        />
                      </div>
                      <Accordion expand={isResultExpanded}>
                        {#if isResultExpanded}
                          <div
                            class="chat-tool-result"
                            class:chat-tool-result-success={!part.isError}
                            class:chat-tool-result-error={part.isError}
                          >
                            {part.output}
                          </div>
                        {/if}
                      </Accordion>
                    </div>
                  </div>
                {/if}
              {:else if part.type === 'text'}
                <!-- System text messages (e.g. error messages displayed inline) -->
                <div class="chat-message chat-message-system">
                  <div class="chat-bubble chat-bubble-system">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized markdown -->
                    {@html renderMarkdown(part.content)}
                  </div>
                </div>
              {/if}
            {/each}
          {/if}
        {/if}
      {/each}

      <!-- Session ended indicator -->
      {#if sessionEnded}
        <div class="chatview-ended">
          <Pill text="ENDED" classes="pill-badge-ended" />
          <span>Session has ended</span>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Input bar (if showInput is true) -->
  {#if showInput}
    <div class="chat-input-bar">
      <Input
        bind:value={inputText}
        dataType="text"
        useTextArea={true}
        placeholder={sessionEnded
          ? 'Session ended'
          : 'Send a message... (Shift+Enter for new line)'}
        disable={isInputDisabled}
        onKeyDown={handleKeydown}
        classes="chat-input-field"
      />
      <Button
        classes="btn-primary btn-sm"
        disabled={isInputDisabled || !inputText.trim()}
        onclick={handleSend}
        text="Send"
      />
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
    background: var(--ds-background-200, #111827);
    border-bottom: 1px solid var(--border, #1e293b);
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

  :global(.chat-input-field) {
    --input-container-margin: 0;
    --input-height: 40px;
    flex: 1;
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

  /* Show details toggle */
  .chatview-details-toggle {
    display: flex;
    justify-content: flex-end;
    padding: 0 0 var(--space-2, 0.5rem) 0;
    position: sticky;
    top: 0;
    z-index: 5;
  }

  :global(.chatview-details-btn) {
    --button-height: auto;
    --button-padding: 4px 10px;
    --button-border: 1px solid var(--border, #2a2a2a);
    --button-border-radius: var(--radius-sm, 4px);
    --button-color: var(--bg-secondary, #141414);
    --button-text-color: var(--text-tertiary, #7d7d7d);
    --button-font-size: 0.7rem;
    --button-hover-color: var(--bg-secondary, #141414);
    --button-hover-text-color: var(--text-secondary, #a3a3a3);
    --button-hover-border: 1px solid var(--text-tertiary, #7d7d7d);
    user-select: none;
  }

  :global(.chatview-details-btn.active) {
    --button-text-color: var(--text-secondary, #a3a3a3);
    --button-border: 1px solid var(--text-tertiary, #7d7d7d);
  }

  /* Tool group (collapsed N tools) */
  .chat-tool-group {
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    margin: var(--space-2, 0.5rem) 0;
    max-width: 90%;
    align-self: flex-start;
  }

  .chat-tool-group-header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    cursor: pointer;
    user-select: none;
    transition: background var(--transition-fast, 150ms);
  }

  .chat-tool-group-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .chat-tool-group-chevron {
    font-size: 0.7rem;
    color: var(--text-tertiary, #737373);
    transition: transform 0.2s ease;
  }

  .chat-tool-group-chevron.expanded {
    transform: rotate(90deg);
  }

  .chat-tool-group-summary {
    font-size: 0.8rem;
    color: var(--text-tertiary, #737373);
    font-weight: 500;
  }

  .chat-tool-group-body {
    border-top: 1px solid var(--border, #2a2a2a);
    padding: var(--space-2, 0.5rem);
  }

  .chat-tool-group-body .chat-tool-card {
    margin: var(--space-1, 0.25rem) 0;
    max-width: 100%;
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
