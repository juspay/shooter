<script lang="ts">
  import type { SessionViewResponse, ShooterConfig } from '$generated/types';
  import type {
    ConversationMessage,
    MessagePart,
    SessionInfo,
    ToolUsePart,
  } from '$lib/modules/server/sessions/types';

  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { EmptyState, getCached, setCache } from '$lib/modules/client/common';
  import ChatView from '$lib/modules/client/terminal/ChatView.svelte';
  import { Banner, Pill, Shimmer } from '@juspay/svelte-ui-components';
  import { onMount } from 'svelte';

  let session = $state<null | SessionInfo>(null);
  let messages = $state<ConversationMessage[]>([]);
  let loading = $state(true);
  let error = $state<null | string>(null);

  // Live streaming state
  let isSessionActive = $state(false);
  let connectionState = $state<'connected' | 'connecting' | 'disconnected' | 'idle'>('idle');
  let ws = $state<null | WebSocket>(null);
  let wsReconnectAttempts = 0;
  let wsReconnectTimer: null | number = null;
  let disposed = false;

  const sessionId = $derived(page.params.id);
  const projectId = $derived(page.url.searchParams.get('project') || '');

  // Check if a session was modified within the last 5 minutes
  function checkSessionActive(sess: SessionInfo): boolean {
    const modifiedTime = new Date(sess.modified).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return modifiedTime > fiveMinutesAgo;
  }

  // Generate a unique message ID for WebSocket-delivered messages
  let wsMessageCounter = 0;
  function nextWsMessageId(): string {
    wsMessageCounter++;
    return `ws-msg-${Date.now()}-${wsMessageCounter}`;
  }

  // Handle incoming WebSocket messages
  function handleWsMessage(event: MessageEvent): void {
    let data: {
      content?: MessagePart[];
      id?: string;
      input?: Record<string, unknown>;
      isError?: boolean;
      message?: string;
      name?: string;
      output?: string;
      role?: string;
      status?: string;
      text?: string;
      timestamp?: string;
      type: string;
    };
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === 'message') {
      // Full message (user or assistant)
      const newMsg: ConversationMessage = {
        id: nextWsMessageId(),
        parts: data.content || [],
        role: (data.role as 'assistant' | 'system' | 'user') || 'assistant',
        timestamp: data.timestamp || new Date().toISOString(),
      };
      messages = [...messages, newMsg];
    } else if (data.type === 'tool-use') {
      // Append tool_use block to the last assistant message
      const toolPart: ToolUsePart = {
        id: data.id || nextWsMessageId(),
        input: data.input || {},
        toolName: data.name || 'Unknown',
        type: 'tool_use',
      };
      appendToLastAssistant(toolPart);
    } else if (data.type === 'tool-result') {
      // Append a system message with the tool result
      const resultMsg: ConversationMessage = {
        id: nextWsMessageId(),
        parts: [
          {
            isError: data.isError || false,
            output: data.output || '',
            toolUseId: data.id || '',
            type: 'tool_result',
          },
        ],
        role: 'system',
        timestamp: new Date().toISOString(),
      };
      messages = [...messages, resultMsg];
    } else if (data.type === 'thinking') {
      // Append thinking block to the last assistant message
      const thinkPart: MessagePart = {
        content: data.text || '',
        type: 'thinking',
      };
      appendToLastAssistant(thinkPart);
    } else if (data.type === 'error') {
      // Server-sent error -- display in the UI
      const errorMsg: ConversationMessage = {
        id: nextWsMessageId(),
        parts: [{ content: data.text || data.message || 'Unknown error', type: 'text' }],
        role: 'system',
        timestamp: new Date().toISOString(),
      };
      messages = [...messages, errorMsg];
    } else if (data.type === 'permission-requested') {
      // Permission request -- log for now (full UI integration would go here)
      console.log('[session] Permission requested:', data);
    } else if (data.type === 'session-end') {
      // Session has ended -- mark as inactive
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
    if (lastMsg?.role === 'assistant') {
      // Mutate the parts array and reassign to trigger reactivity
      const updatedParts = [...lastMsg.parts, part];
      const updatedMsg = { ...lastMsg, parts: updatedParts };
      messages = [...messages.slice(0, -1), updatedMsg];
    } else {
      // Create a new assistant message to hold this part
      const newMsg: ConversationMessage = {
        id: nextWsMessageId(),
        parts: [part],
        role: 'assistant',
        timestamp: new Date().toISOString(),
      };
      messages = [...messages, newMsg];
    }
  }

  // Connect to the live session WebSocket
  async function connectWebSocket(): Promise<void> {
    if (!browser || !isSessionActive || disposed) {
      return;
    }

    const saved = localStorage.getItem('shooter_config');
    if (!saved) {
      return;
    }
    let config: ShooterConfig;
    try {
      config = JSON.parse(saved) as ShooterConfig;
    } catch {
      return;
    }

    connectionState = 'connecting';

    try {
      // Obtain a short-lived ticket
      const ticketRes = await fetch('/api/ws-ticket', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        method: 'POST',
      });
      if (!ticketRes.ok || disposed) {
        connectionState = 'disconnected';
        // Schedule retry with same backoff logic as onclose
        if (isSessionActive && !disposed && wsReconnectAttempts < 5) {
          wsReconnectAttempts++;
          wsReconnectTimer = window.setTimeout(() => {
            void connectWebSocket();
          }, 2000);
        }
        return;
      }
      const { ticket } = await ticketRes.json();

      if (disposed) {
        connectionState = 'disconnected';
        return;
      }

      // Build WebSocket URL
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/session/${sessionId}?ticket=${ticket}`;

      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (disposed) {
          socket.close();
          return;
        }
        connectionState = 'connected';
        ws = socket;
        wsReconnectAttempts = 0; // Reset on successful connection
      };

      socket.onmessage = handleWsMessage;

      socket.onclose = () => {
        connectionState = 'disconnected';
        ws = null;
        // Reconnect with backoff (max 5 retries)
        if (isSessionActive && !disposed && wsReconnectAttempts < 5) {
          wsReconnectAttempts++;
          wsReconnectTimer = window.setTimeout(() => {
            void connectWebSocket();
          }, 2000);
        }
      };

      socket.onerror = () => {
        connectionState = 'disconnected';
        ws = null;
      };
    } catch {
      connectionState = 'disconnected';
    }
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
      let config: ShooterConfig;
      try {
        config = JSON.parse(saved) as ShooterConfig;
      } catch {
        error = 'Invalid saved configuration. Please reconfigure in settings.';
        loading = false;
        return;
      }

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
      const data: SessionViewResponse = await res.json();
      session = data.session as SessionInfo;
      const rawMessages: unknown[] = Array.isArray(data.messages) ? data.messages : [];
      messages = [...(rawMessages as ConversationMessage[])].reverse();
      setCache(`shooter_session_${sid}`, { messages: rawMessages, session: data.session });

      // Check if session is active and connect WebSocket if so
      if (data.session) {
        isSessionActive = checkSessionActive(data.session as SessionInfo);
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
      messages = Array.isArray(cached.messages) ? [...cached.messages].reverse() : [];
      loading = false;
    }

    void fetchSession();

    // Cleanup WebSocket and reconnect timer on component destroy
    return () => {
      disposed = true;
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
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

<main class="main session-page-main">
  {#if loading && messages.length === 0}
    <div class="loading-container">
      <Shimmer classes="shimmer-header" />
      <div class="chat-container">
        <Shimmer classes="shimmer-bubble shimmer-bubble-user" />
        <Shimmer classes="shimmer-bubble shimmer-bubble-assistant" />
        <Shimmer classes="shimmer-bubble shimmer-bubble-user-short" />
        <Shimmer classes="shimmer-bubble shimmer-bubble-assistant-wide" />
        <Shimmer classes="shimmer-bubble shimmer-bubble-assistant-short" />
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
          <Pill text="LIVE" classes="pill-live" />
        {/if}
      </div>
      <div class="chat-session-meta">
        <span class="chat-session-meta-item">&#128193; {shortPath(session.projectPath)}</span>
        <span class="chat-session-meta-item">&#127807; {session.gitBranch}</span>
        <span class="chat-session-meta-item">&#128172; {session.messageCount} messages</span>
        <span class="chat-session-meta-item">&#128197; {formatDate(session.created)}</span>
      </div>
      {#if connectionState === 'disconnected' && isSessionActive}
        <Banner text="Live updates paused" classes="banner-warning" />
      {/if}
    </div>

    <!-- Chat Container -->
    <div class="session-chat-container">
      <ChatView {messages} {connectionState} showInput={false} sessionEnded={!isSessionActive} />
    </div>
  {/if}
</main>

<style>
  /* Make the main element a flex column so the chat fills remaining space */
  .session-page-main {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Chat container fills remaining space */
  .session-chat-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

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

  /* Connection status row */
  .live-connection-row {
    display: flex;
    align-items: center;
  }

  /* Paused banner override */
  :global(.banner-warning) {
    margin-top: 0.5rem;
  }
</style>
