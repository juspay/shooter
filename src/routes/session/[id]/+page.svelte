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
  import { getCached, setCache } from '$lib/modules/client/common';
  import ChatView from '$lib/modules/client/terminal/ChatView.svelte';
  import { Shimmer } from '@juspay/svelte-ui-components';
  import { onMount } from 'svelte';

  // --- State ---

  let session = $state<null | SessionInfo>(null);
  let messages = $state<ConversationMessage[]>([]);
  let loading = $state(true);
  let error = $state<null | string>(null);
  let hasMoreMessages = $state(false);
  let loadingMore = $state(false);
  let currentLimit = $state(200);

  // Terminal + WS connection state
  let connectedTerminalId = $state<null | string>(null);
  let chatConnectionState = $state<'connected' | 'connecting' | 'disconnected' | 'idle' | 'reconnecting'>('idle');
  // sendStatus:
  //   'idle'       = no terminal yet; input ready for first send
  //   'connecting' = calling /api/sessions/connect
  //   'resuming'   = waiting for session history (claude loading)
  //   'ready'      = history received; input goes straight to PTY
  let sendStatus = $state<'connecting' | 'idle' | 'ready' | 'resuming'>('idle');
  let pendingMessage: null | string = null;

  // Non-reactive WS refs
  let terminalWs: null | WebSocket = null;
  let sessionWs: null | WebSocket = null;
  let sessionReconnectTimer: null | ReturnType<typeof setTimeout> = null;
  let disposed = false;

  const sessionId = $derived(page.params.id);
  const projectId = $derived(page.url.searchParams.get('project') || '');

  // Disable send button while a message is in-flight
  const sendDisabled = $derived(sendStatus === 'connecting' || sendStatus === 'resuming');

  // --- Helpers ---

  function getConfig(): null | ShooterConfig {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (!saved) { return null; }
      return JSON.parse(saved) as ShooterConfig;
    } catch {
      return null;
    }
  }

  async function getWsTicket(): Promise<null | string> {
    const config = getConfig();
    if (!config) { return null; }
    try {
      const res = await fetch('/api/ws-ticket', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        method: 'POST',
      });
      if (!res.ok) { return null; }
      const data: { ticket: string } = await res.json();
      return data.ticket;
    } catch {
      return null;
    }
  }

  // --- Session WS (receive chat messages) ---

  async function connectSessionWs(sessionWsPath: string, termId: string): Promise<void> {
    if (disposed) { return; }

    // Avoid stacking connections
    if (
      sessionWs &&
      (sessionWs.readyState === WebSocket.OPEN || sessionWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ticket = await getWsTicket();
    if (!ticket || disposed) { return; }

    chatConnectionState = 'connecting';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
      `${protocol}//${window.location.host}${sessionWsPath}?ticket=${ticket}`
    );

    socket.onopen = () => {
      if (disposed) { socket.close(); return; }
      chatConnectionState = 'connected';
      socket.send(JSON.stringify({ sessionId: termId, type: 'subscribe' }));
    };

    socket.onmessage = (event) => {
      if (disposed) { return; }
      try { handleSessionMessage(JSON.parse(event.data as string)); } catch { /* ignore */ }
    };

    socket.onclose = () => {
      if (disposed) { return; }
      chatConnectionState = 'disconnected';
      sessionWs = null;
      if (connectedTerminalId) {
        if (sessionReconnectTimer) { clearTimeout(sessionReconnectTimer); }
        sessionReconnectTimer = setTimeout(() => {
          sessionReconnectTimer = null;
          if (!disposed && connectedTerminalId) {
            void connectSessionWs(`/ws/session/${connectedTerminalId}`, connectedTerminalId);
          }
        }, 2000);
      }
    };

    socket.onerror = () => {
      if (!disposed) { chatConnectionState = 'disconnected'; }
    };

    sessionWs = socket;
  }

  // --- Terminal WS (send PTY input only) ---

  async function connectTerminalWs(wsPath: string): Promise<void> {
    if (disposed) { return; }

    const ticket = await getWsTicket();
    if (!ticket || disposed) { return; }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}${wsPath}?ticket=${ticket}`);

    ws.onopen = () => {
      if (disposed) { ws.close(); return; }
      terminalWs = ws;
      if (sendStatus === 'ready' && pendingMessage) {
        ws.send(JSON.stringify({ data: `${pendingMessage}\n`, type: 'input' }));
        pendingMessage = null;
      }
    };

    ws.onclose = () => {
      if (terminalWs === ws) { terminalWs = null; }
    };
  }

  // --- Message handler (mirrors terminal page) ---

  function handleSessionMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'history') {
      const historyRaw = (msg.messages || []) as {
        content: MessagePart[];
        id: string;
        role: string;
        timestamp: string;
      }[];
      messages = historyRaw.map((m) => ({
        id: m.id,
        parts: m.content,
        role: m.role as ConversationMessage['role'],
        timestamp: m.timestamp,
      }));
      // WS history is always complete
      hasMoreMessages = false;

      if (sendStatus === 'resuming') {
        sendStatus = 'ready';
        if (pendingMessage && terminalWs?.readyState === WebSocket.OPEN) {
          terminalWs.send(JSON.stringify({ data: `${pendingMessage}\n`, type: 'input' }));
          pendingMessage = null;
        }
      }
    } else if (msg.type === 'message') {
      messages = [
        ...messages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parts: (msg.content as MessagePart[]) || [],
          role: (msg.role as ConversationMessage['role']) || 'assistant',
          timestamp: (msg.timestamp as string) || new Date().toISOString(),
        },
      ];
    } else if (msg.type === 'tool-use') {
      const toolUsePart: ToolUsePart = {
        id: (msg.id as string) || `tool-${Date.now()}`,
        input: (msg.input as Record<string, unknown>) || {},
        toolName: msg.name as string,
        type: 'tool_use',
      };
      const lastToolMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      if (lastToolMsg?.role === 'assistant') {
        messages = [
          ...messages.slice(0, -1),
          { ...lastToolMsg, parts: [...lastToolMsg.parts, toolUsePart] },
        ];
      } else {
        messages = [
          ...messages,
          {
            id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            parts: [toolUsePart],
            role: 'assistant',
            timestamp: new Date().toISOString(),
          },
        ];
      }
    } else if (msg.type === 'tool-result') {
      const toolResultPart: MessagePart = {
        isError: (msg.isError as boolean) || false,
        output: (msg.output as string) || '',
        toolUseId: msg.id as string,
        type: 'tool_result',
      };
      const lastResultMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      if (lastResultMsg?.role === 'system') {
        messages = [
          ...messages.slice(0, -1),
          { ...lastResultMsg, parts: [...lastResultMsg.parts, toolResultPart] },
        ];
      } else {
        messages = [
          ...messages,
          {
            id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            parts: [toolResultPart],
            role: 'system',
            timestamp: new Date().toISOString(),
          },
        ];
      }
    } else if (msg.type === 'thinking') {
      const thinkPart: MessagePart = { content: (msg.text as string) || '', type: 'thinking' };
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      if (lastMsg?.role === 'assistant') {
        messages = [
          ...messages.slice(0, -1),
          { ...lastMsg, parts: [...lastMsg.parts, thinkPart] },
        ];
      } else {
        messages = [
          ...messages,
          {
            id: `think-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            parts: [thinkPart],
            role: 'assistant',
            timestamp: new Date().toISOString(),
          },
        ];
      }
    } else if (msg.type === 'session-end') {
      sendStatus = 'idle';
    }
  }

  // --- Connect + send flow ---

  async function connectAndSend(): Promise<void> {
    if (!session || disposed) { sendStatus = 'idle'; return; }

    const config = getConfig();
    if (!config) { sendStatus = 'idle'; return; }

    sendStatus = 'connecting';

    try {
      const command = session.source === 'opencode' ? 'opencode' : 'claude';
      const res = await fetch('/api/sessions/connect', {
        body: JSON.stringify({ command, cwd: session.projectPath, sessionId }),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!res.ok || disposed) { sendStatus = 'idle'; return; }

      const result: { sessionWs: string; terminalId: string; ws: string } = await res.json();
      connectedTerminalId = result.terminalId;
      sendStatus = 'resuming';

      void connectSessionWs(result.sessionWs, result.terminalId);
      void connectTerminalWs(result.ws);
    } catch {
      sendStatus = 'idle';
    }
  }

  // --- Called by ChatView on submit ---

  function sendMessage(text: string): void {
    if (!text.trim()) { return; }

    if (sendStatus === 'ready' && terminalWs?.readyState === WebSocket.OPEN) {
      terminalWs.send(JSON.stringify({ data: `${text}\n`, type: 'input' }));
      return;
    }

    // Already connecting — just update queued message
    if (sendStatus === 'connecting' || sendStatus === 'resuming') {
      pendingMessage = text;
      return;
    }

    // Not connected yet — queue and connect
    pendingMessage = text;
    void connectAndSend();
  }

  // --- REST fetch (initial messages) ---

  async function fetchSession(): Promise<void> {
    if (!browser) { return; }
    if (messages.length === 0) { loading = true; }

    try {
      const config = getConfig();
      if (!config) {
        error = 'No configuration found. Please configure settings first.';
        loading = false;
        return;
      }

      const sid = sessionId || '';
      const pid = projectId || '';
      const queryStr = pid
        ? `id=${encodeURIComponent(sid)}&project=${encodeURIComponent(pid)}&limit=${currentLimit}`
        : `id=${encodeURIComponent(sid)}&limit=${currentLimit}`;

      let res = await fetch(`/api/sessions?${queryStr}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });

      // Fallback: search across all projects if not found
      if (res.status === 404 && !pid) {
        const projectsRes = await fetch('/api/sessions', {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        if (projectsRes.ok) {
          const projectsData: { projects?: { id: string; sessions?: { id: string }[] }[] } =
            await projectsRes.json();
          for (const project of projectsData.projects || []) {
            if ((project.sessions || []).find((s) => s.id === sid)) {
              res = await fetch(
                `/api/sessions?id=${encodeURIComponent(sid)}&project=${encodeURIComponent(project.id)}`,
                { headers: { Authorization: `Bearer ${config.apiKey}` } }
              );
              break;
            }
          }
        }
      }

      if (!res.ok) { error = 'Session not found'; loading = false; return; }

      const data: SessionViewResponse = await res.json();
      session = data.session as SessionInfo;
      const rawMessages = Array.isArray(data.messages) ? (data.messages as unknown as ConversationMessage[]) : [];
      messages = rawMessages;
      hasMoreMessages = rawMessages.length >= currentLimit;
      setCache(`shooter_session_${sid}`, { messages: rawMessages, session: data.session });
    } catch {
      error = 'Failed to load session';
    }
    loading = false;
  }

  async function loadEarlierMessages(): Promise<void> {
    if (!browser || loadingMore) { return; }
    const config = getConfig();
    if (!config) { return; }

    loadingMore = true;
    try {
      const newLimit = currentLimit + 200;
      const sid = sessionId || '';
      const pid = projectId || '';
      const queryParts = [`id=${encodeURIComponent(sid)}`, `limit=${newLimit}`];
      if (pid) { queryParts.push(`project=${encodeURIComponent(pid)}`); }
      const res = await fetch(`/api/sessions?${queryParts.join('&')}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!res.ok) { return; }
      const data: SessionViewResponse = await res.json();
      const rawMessages = Array.isArray(data.messages) ? (data.messages as unknown as ConversationMessage[]) : [];
      messages = rawMessages;
      currentLimit = newLimit;
      hasMoreMessages = rawMessages.length >= newLimit;
      setCache(`shooter_session_${sid}`, { messages: rawMessages, session: data.session });
    } catch { /* best effort */ } finally { loadingMore = false; }
  }

  // --- Lifecycle ---

  onMount(() => {
    // Show cached data immediately
    const cached = getCached(`shooter_session_${page.params.id}`) as null | {
      messages: ConversationMessage[];
      session: SessionInfo;
    };
    if (cached) {
      session = cached.session;
      messages = Array.isArray(cached.messages) ? cached.messages : [];
      loading = false;
    }

    void fetchSession().then(async () => {
      if (!session || disposed) { return; }

      // Check if there's already a running terminal for this session
      const config = getConfig();
      if (!config) { return; }

      try {
        const command = session.source === 'opencode' ? 'opencode' : 'claude';
        const res = await fetch('/api/sessions/connect', {
          body: JSON.stringify({
            command,
            cwd: session.projectPath,
            noCreate: true,
            sessionId,
          }),
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        if (res.ok && !disposed) {
          const result: { sessionWs: string; terminalId: string; ws: string } = await res.json();
          connectedTerminalId = result.terminalId;
          sendStatus = 'resuming';
          void connectSessionWs(result.sessionWs, result.terminalId);
          void connectTerminalWs(result.ws);
        }
        // 404 = no existing terminal, that's fine
      } catch { /* ignore */ }
    });

    return () => {
      disposed = true;
      if (sessionReconnectTimer) { clearTimeout(sessionReconnectTimer); }
      sessionWs?.close();
      terminalWs?.close();
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
      </div>
    </div>
  {:else if error}
    <div class="session-back-row">
      <a href={projectId ? `/project?id=${projectId}` : '/'} class="back-link">← Back</a>
    </div>
    <p class="error-text">{error}</p>
  {:else if session}
    <!-- Compact header -->
    <div class="session-header">
      <div class="session-header-row">
        <a href={projectId ? `/project?id=${projectId}` : '/'} class="back-link">← Back</a>
        {#if sendStatus === 'connecting'}
          <span class="resume-status">Connecting...</span>
        {:else if sendStatus === 'resuming'}
          <span class="resume-status">Resuming session...</span>
        {:else if chatConnectionState === 'connected'}
          <span class="connection-dot connected"></span>
        {:else if chatConnectionState === 'reconnecting'}
          <span class="connection-dot reconnecting"></span>
        {/if}
      </div>
      <h1 class="session-title">{session.title}</h1>
    </div>

    <!-- Chat -->
    <div class="session-chat-container">
      {#if hasMoreMessages}
        <div class="load-earlier-row">
          <button
            class="load-earlier-btn"
            onclick={loadEarlierMessages}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load earlier messages'}
          </button>
        </div>
      {/if}
      <ChatView
        messages={[...messages].reverse()}
        newestFirst={true}
        connectionState={chatConnectionState}
        showInput={true}
        {sendDisabled}
        onSendInput={sendMessage}
        sessionEnded={false}
      />
    </div>
  {/if}
</main>

<style>
  .session-page-main {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .session-back-row {
    margin-bottom: var(--space-5);
  }

  .error-text {
    color: var(--text-secondary);
    padding: var(--space-4);
  }

  /* Compact header */
  .session-header {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .session-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-1);
  }

  .session-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .resume-status {
    font-size: 0.75rem;
    color: var(--text-tertiary, #888);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .connection-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .connection-dot.connected {
    background: #4ade80;
  }

  .connection-dot.reconnecting {
    background: #f59e0b;
    animation: pulse 1s ease-in-out infinite;
  }

  /* Chat container fills remaining space */
  .session-chat-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Load earlier row */
  .load-earlier-row {
    display: flex;
    justify-content: center;
    padding: var(--space-2) var(--space-3);
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .load-earlier-btn {
    font-size: 0.8rem;
    color: var(--text-secondary);
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 4px);
    padding: 4px 12px;
    cursor: pointer;
  }

  .load-earlier-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .load-earlier-btn:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--text-tertiary, #888);
  }
</style>
