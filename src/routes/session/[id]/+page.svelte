<script lang="ts">
  import type {
    ConversationMessage,
    MessagePart,
    SessionInfo,
    ToolUsePart,
  } from '$lib/modules/server/sessions/types';

  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { EmptyState } from '$lib/modules/client/common';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  // Configure marked for safe rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  function renderMarkdown(text: string): string {
    if (!text) {
      return '';
    }
    const html = marked.parse(text) as string;
    return DOMPurify.sanitize(html);
  }

  interface SessionResponse {
    messages: ConversationMessage[];
    session: SessionInfo;
  }

  // WebSocket message types from the live session channel
  interface WsMessage {
    type: string;
    role?: string;
    content?: MessagePart[];
    timestamp?: string;
    name?: string;
    input?: Record<string, unknown>;
    status?: string;
    id?: string;
    output?: string;
    text?: string;
    isError?: boolean;
  }

  let session = $state<null | SessionInfo>(null);
  let messages = $state<ConversationMessage[]>([]);
  let loading = $state(true);
  let error = $state<null | string>(null);
  const expandedTools = new SvelteSet<string>();

  // Live streaming state
  type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'idle';
  let isSessionActive = $state(false);
  let connectionState = $state<ConnectionState>('idle');
  let ws = $state<WebSocket | null>(null);
  let chatContainerEl = $state<HTMLDivElement | null>(null);
  let shouldAutoScroll = $state(true);

  const sessionId = $derived(page.params.id);
  const projectId = $derived(page.url.searchParams.get('project') || '');

  // Check if a session was modified within the last 5 minutes
  function checkSessionActive(sess: SessionInfo): boolean {
    const modifiedTime = new Date(sess.modified).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return modifiedTime > fiveMinutesAgo;
  }

  // Auto-scroll to bottom of chat container
  async function scrollToBottom(): Promise<void> {
    if (!shouldAutoScroll || !chatContainerEl) return;
    await tick();
    chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
  }

  // Track whether user has scrolled up (disable auto-scroll)
  function handleScroll(): void {
    if (!chatContainerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerEl;
    // Consider "at bottom" if within 100px of the end
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 100;
  }

  // Generate a unique message ID for WebSocket-delivered messages
  let wsMessageCounter = 0;
  function nextWsMessageId(): string {
    wsMessageCounter++;
    return `ws-msg-${Date.now()}-${wsMessageCounter}`;
  }

  // Handle incoming WebSocket messages
  function handleWsMessage(event: MessageEvent): void {
    let data: WsMessage;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === 'message') {
      // Full message (user or assistant)
      const newMsg: ConversationMessage = {
        id: nextWsMessageId(),
        role: (data.role as 'assistant' | 'system' | 'user') || 'assistant',
        parts: data.content || [],
        timestamp: data.timestamp || new Date().toISOString(),
      };
      messages = [...messages, newMsg];
      void scrollToBottom();
    } else if (data.type === 'tool-use') {
      // Append tool_use block to the last assistant message
      const toolPart: ToolUsePart = {
        type: 'tool_use',
        id: data.id || nextWsMessageId(),
        toolName: data.name || 'Unknown',
        input: data.input || {},
      };
      appendToLastAssistant(toolPart);
    } else if (data.type === 'tool-result') {
      // Append a system message with the tool result
      const resultMsg: ConversationMessage = {
        id: nextWsMessageId(),
        role: 'system',
        parts: [
          {
            type: 'tool_result',
            toolUseId: data.id || '',
            output: data.output || '',
            isError: data.isError || false,
          },
        ],
        timestamp: new Date().toISOString(),
      };
      messages = [...messages, resultMsg];
      void scrollToBottom();
    } else if (data.type === 'thinking') {
      // Append thinking block to the last assistant message
      const thinkPart: MessagePart = {
        type: 'thinking',
        content: data.text || '',
      };
      appendToLastAssistant(thinkPart);
    } else if (data.type === 'session-end') {
      // Session has ended — mark as inactive
      isSessionActive = false;
      connectionState = 'disconnected';
      if (ws) {
        ws.close();
        ws = null;
      }
    }
  }

  // Append a part to the last assistant message, or create one
  function appendToLastAssistant(part: MessagePart): void {
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    if (lastMsg && lastMsg.role === 'assistant') {
      // Mutate the parts array and reassign to trigger reactivity
      const updatedParts = [...lastMsg.parts, part];
      const updatedMsg = { ...lastMsg, parts: updatedParts };
      messages = [...messages.slice(0, -1), updatedMsg];
    } else {
      // Create a new assistant message to hold this part
      const newMsg: ConversationMessage = {
        id: nextWsMessageId(),
        role: 'assistant',
        parts: [part],
        timestamp: new Date().toISOString(),
      };
      messages = [...messages, newMsg];
    }
    void scrollToBottom();
  }

  // Connect to the live session WebSocket
  async function connectWebSocket(): Promise<void> {
    if (!browser || !isSessionActive) return;

    const saved = localStorage.getItem('shooter_config');
    if (!saved) return;
    const config = JSON.parse(saved);

    connectionState = 'connecting';

    try {
      // Obtain a short-lived ticket
      const ticketRes = await fetch('/api/ws-ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!ticketRes.ok) {
        connectionState = 'disconnected';
        return;
      }
      const { ticket } = await ticketRes.json();

      // Build WebSocket URL
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/session/${sessionId}?ticket=${ticket}`;

      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        connectionState = 'connected';
        ws = socket;
      };

      socket.onmessage = handleWsMessage;

      socket.onclose = () => {
        connectionState = 'disconnected';
        ws = null;
      };

      socket.onerror = () => {
        connectionState = 'disconnected';
        ws = null;
      };
    } catch {
      connectionState = 'disconnected';
    }
  }

  // Cache helpers using sessionStorage
  function getCached(key: string): unknown {
    try {
      const item = sessionStorage.getItem(key);
      if (!item) {
        return null;
      }
      const { data, timestamp } = JSON.parse(item);
      // Cache valid for 30 seconds
      if (Date.now() - timestamp > 30000) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function setCache(key: string, data: unknown): void {
    try {
      sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
      // sessionStorage full — silently ignore
    }
  }

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

  function formatDate(ts: string): string {
    return new Date(ts).toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function shortPath(p: string): string {
    const parts = p.split('/');
    return parts.slice(-2).join('/');
  }

  function getToolDescription(part: ToolUsePart): string {
    const input = part.input;
    if (part.toolName === 'Bash') {
      return (input.command as string) || (input.description as string) || '';
    }
    if (part.toolName === 'Read') {
      return (input.file_path as string) || '';
    }
    if (part.toolName === 'Edit' || part.toolName === 'Write') {
      return (input.file_path as string) || '';
    }
    if (part.toolName === 'Grep') {
      return (input.pattern as string) || '';
    }
    if (part.toolName === 'Glob') {
      return (input.pattern as string) || '';
    }
    if (part.toolName === 'Agent') {
      return (input.description as string) || (input.prompt as string)?.slice(0, 50) || '';
    }
    return JSON.stringify(input).slice(0, 60);
  }

  function formatInput(input: Record<string, unknown>): string {
    return JSON.stringify(input, null, 2);
  }

  function isToolUsePart(part: MessagePart): part is ToolUsePart {
    return part.type === 'tool_use';
  }

  async function fetchSession(): Promise<void> {
    if (!browser) {
      return;
    }

    // Don't show loading spinner if we already have cached data
    if (messages.length === 0) {
      loading = true;
    }

    try {
      const saved = localStorage.getItem('shooter_config');
      if (!saved) {
        error = 'No configuration found. Please configure settings first.';
        loading = false;
        return;
      }
      const config = JSON.parse(saved);

      const sid = sessionId || '';
      const pid = projectId || '';
      const queryStr = pid
        ? `id=${encodeURIComponent(sid)}&project=${encodeURIComponent(pid)}`
        : `id=${encodeURIComponent(sid)}`;
      const res = await fetch(`/api/sessions?${queryStr}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!res.ok) {
        error = 'Session not found';
        loading = false;
        return;
      }
      const data: SessionResponse = await res.json();
      session = data.session;
      messages = (data.messages || []).reverse();
      setCache(`shooter_session_${sid}`, { messages: data.messages || [], session: data.session });

      // Check if session is active and connect WebSocket if so
      if (data.session) {
        isSessionActive = checkSessionActive(data.session);
        if (isSessionActive) {
          void connectWebSocket();
        }
      }
    } catch {
      error = 'Failed to load session';
    }
    loading = false;
  }

  onMount(() => {
    // Show cached data immediately
    const cached = getCached(`shooter_session_${page.params.id}`) as null | {
      messages: ConversationMessage[];
      session: SessionInfo;
    };
    if (cached) {
      session = cached.session;
      messages = (cached.messages || []).reverse();
      loading = false;
    }

    void fetchSession();

    // Cleanup WebSocket on component destroy
    return () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  });
</script>

<svelte:head>
  <title>{session?.title || 'Session'} - Shooter</title>
  <meta name="description" content="Session conversation view" />
</svelte:head>

<main class="main">
  {#if loading && messages.length === 0}
    <div class="loading-container">
      <div class="skeleton" style="height: 80px; margin-bottom: 1rem;"></div>
      <div class="chat-container">
        <div class="skeleton skeleton-bubble skeleton-bubble-user" style="width: 60%;"></div>
        <div class="skeleton skeleton-bubble skeleton-bubble-assistant" style="width: 75%;"></div>
        <div class="skeleton skeleton-bubble skeleton-bubble-user" style="width: 50%;"></div>
        <div class="skeleton skeleton-bubble skeleton-bubble-assistant" style="width: 80%;"></div>
        <div class="skeleton skeleton-bubble skeleton-bubble-assistant" style="width: 40%;"></div>
      </div>
    </div>
  {:else if error}
    <div class="session-back-row">
      <a href="/" class="back-link">
        <span class="back-arrow">&larr;</span>
        Back
      </a>
    </div>
    <EmptyState icon="alert-triangle" title="Error" description={error} />
  {:else if session}
    <!-- Session Header -->
    <div class="chat-session-header">
      <div class="chat-session-header-top">
        <a href="/project?id={projectId}" class="back-link">&#8592; Back to Project</a>
        {#if isSessionActive || connectionState === 'connected' || connectionState === 'connecting'}
          <div class="live-connection-row">
            {#if connectionState === 'connected'}
              <span class="connection-status connected">
                <span class="connection-status-dot"></span>
              </span>
            {:else if connectionState === 'connecting'}
              <span class="connection-status reconnecting">
                <span class="connection-status-dot"></span>
              </span>
            {:else if connectionState === 'disconnected'}
              <span class="connection-status disconnected">
                <span class="connection-status-dot"></span>
              </span>
            {/if}
          </div>
        {/if}
      </div>
      <div class="chat-session-title-row">
        <h1 class="chat-session-title">{session.title}</h1>
        {#if isSessionActive}
          <span class="live-badge">
            <span class="live-badge-dot"></span>
            LIVE
          </span>
        {/if}
      </div>
      <div class="chat-session-meta">
        <span class="chat-session-meta-item">&#128193; {shortPath(session.projectPath)}</span>
        <span class="chat-session-meta-item">&#127807; {session.gitBranch}</span>
        <span class="chat-session-meta-item">&#128172; {session.messageCount} messages</span>
        <span class="chat-session-meta-item">&#128197; {formatDate(session.created)}</span>
      </div>
      {#if connectionState === 'disconnected' && isSessionActive}
        <div class="live-paused-banner">Live updates paused</div>
      {/if}
    </div>

    <!-- Chat Container -->
    <div
      class="chat-container"
      bind:this={chatContainerEl}
      onscroll={handleScroll}
    >
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
                      onclick={() => {
                        toggleTool(toolId);
                      }}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          toggleTool(toolId);
                        }
                      }}
                      role="button"
                      tabindex="0"
                    >
                      <span class="chat-tool-chevron" class:expanded={isExpanded}>&#9654;</span>
                      <span class="chat-tool-name" data-tool={part.toolName}>{part.toolName}</span>
                      <span class="chat-tool-description">{getToolDescription(part)}</span>
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
                      onclick={() => {
                        toggleTool(thinkId);
                      }}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          toggleTool(thinkId);
                        }
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
          <!-- Tool results rendered as collapsed panels -->
          {#each message.parts as part, partIdx (partIdx)}
            {#if part.type === 'tool_result'}
              {@const resultId = `result-${part.toolUseId}`}
              {@const isResultExpanded = expandedTools.has(resultId)}
              <div class="chat-message chat-message-system">
                <div class="chat-tool-card">
                  <div
                    class="chat-tool-header"
                    onclick={() => {
                      toggleTool(resultId);
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        toggleTool(resultId);
                      }
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
            {/if}
          {/each}
        {/if}
      {/each}
    </div>
  {/if}
</main>

<style>
  /* Back link (used in error state) */
  .session-back-row {
    margin-bottom: var(--space-5);
  }

  /* Header top row: back link + connection status */
  .chat-session-header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* Title row: title + LIVE badge */
  .chat-session-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* LIVE badge — green pulsing */
  .live-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .live-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    animation: live-pulse 2s ease-in-out infinite;
  }

  @keyframes live-pulse {
    0%, 100% {
      opacity: 1;
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
    }
    50% {
      opacity: 0.6;
      box-shadow: 0 0 0 4px rgba(34, 197, 94, 0);
    }
  }

  /* Connection status row */
  .live-connection-row {
    display: flex;
    align-items: center;
  }

  /* Live updates paused banner */
  .live-paused-banner {
    margin-top: 0.5rem;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.2);
    text-align: center;
  }
</style>
