<script lang="ts">
  import type {
    ConversationMessage,
    MessagePart,
    ToolUsePart,
  } from '$lib/modules/server/sessions/types';

  import { browser } from '$app/environment';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
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

  // --- Props (Svelte 5 runes) ---
  let {
    terminalId,
    wsUrl,
    ticket,
    apiKey,
    onSendInput,
    onCancel,
  }: {
    terminalId: string;
    wsUrl: string;
    ticket: string;
    apiKey: string;
    onSendInput: (text: string) => void;
    onCancel: () => void;
  } = $props();

  // --- Types for WebSocket messages ---
  interface WsToolUse {
    type: 'tool-use';
    id: string;
    name: string;
    input: Record<string, unknown>;
    status: 'running' | 'done';
  }

  interface WsToolResult {
    type: 'tool-result';
    id: string;
    output: string;
    status: string;
    isError?: boolean;
  }

  interface WsMessage {
    type: 'message';
    role: 'user' | 'assistant';
    content: MessagePart[];
    timestamp: string;
  }

  interface WsThinking {
    type: 'thinking';
    text: string;
  }

  /** Raw history message from server uses `content` instead of `parts`. */
  interface WsHistoryMessage {
    id: string;
    role: 'assistant' | 'system' | 'user';
    content: MessagePart[];
    timestamp: string;
  }

  interface WsHistory {
    type: 'history';
    messages: WsHistoryMessage[];
  }

  interface WsPermissionRequested {
    type: 'permission-requested';
    requestId: string;
    tool: string;
    input: Record<string, unknown>;
  }

  interface WsSessionEnd {
    type: 'session-end';
  }

  type WsIncoming =
    | WsHistory
    | WsMessage
    | WsPermissionRequested
    | WsSessionEnd
    | WsThinking
    | WsToolResult
    | WsToolUse;

  // --- Inline permission request ---
  interface PermissionRequest {
    requestId: string;
    tool: string;
    input: Record<string, unknown>;
    resolved: boolean;
    decision: 'allow' | 'deny' | null;
  }

  // --- Live tool use tracking ---
  interface LiveToolUse {
    id: string;
    name: string;
    input: Record<string, unknown>;
    status: 'running' | 'done';
    output?: string;
    isError?: boolean;
  }

  // --- State ---
  let messages = $state<ConversationMessage[]>([]);
  let liveToolUses = $state<LiveToolUse[]>([]);
  let liveThinking = $state<string | null>(null);
  let permissionRequests = $state<PermissionRequest[]>([]);
  let sessionEnded = $state(false);

  let inputText = $state('');
  let chatContainerEl = $state<HTMLElement | null>(null);

  let ws = $state<WebSocket | null>(null);
  let connectionState = $state<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  const expandedTools = new SvelteSet<string>();

  // Message counter for generating unique IDs
  let messageCounter = $state(0);

  // --- Derived ---
  let pendingPermissions = $derived(permissionRequests.filter((p) => !p.resolved));

  // --- WebSocket connection ---
  function connect(): void {
    if (!browser) return;

    const url = `${wsUrl}?ticket=${encodeURIComponent(ticket)}`;
    connectionState = 'reconnecting';

    const socket = new WebSocket(url);
    ws = socket;

    socket.addEventListener('open', () => {
      connectionState = 'connected';
      // Subscribe to the session channel
      socket.send(JSON.stringify({ type: 'subscribe', sessionId: terminalId }));
    });

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsIncoming;
        handleWsMessage(data);
      } catch {
        // Ignore unparseable messages
      }
    });

    socket.addEventListener('close', () => {
      connectionState = 'disconnected';
      ws = null;
    });

    socket.addEventListener('error', () => {
      connectionState = 'disconnected';
    });
  }

  function handleWsMessage(data: WsIncoming): void {
    switch (data.type) {
      case 'history':
        messages = (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          parts: m.content,
          timestamp: m.timestamp,
        })).reverse();
        scheduleScroll();
        break;

      case 'message': {
        messageCounter++;
        const msg: ConversationMessage = {
          id: `live-${messageCounter}-${Date.now()}`,
          role: data.role,
          parts: data.content,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        messages = [...messages, msg];
        // Clear live thinking when assistant sends a message
        if (data.role === 'assistant') {
          liveThinking = null;
        }
        scheduleScroll();
        break;
      }

      case 'tool-use': {
        const existing = liveToolUses.find((t) => t.id === data.id);
        if (existing) {
          existing.status = data.status;
          existing.name = data.name;
          existing.input = data.input;
          liveToolUses = [...liveToolUses];
        } else {
          liveToolUses = [
            ...liveToolUses,
            {
              id: data.id,
              name: data.name,
              input: data.input,
              status: data.status,
            },
          ];
        }
        scheduleScroll();
        break;
      }

      case 'tool-result': {
        const tool = liveToolUses.find((t) => t.id === data.id);
        if (tool) {
          tool.status = 'done';
          tool.output = data.output;
          tool.isError = data.isError;
          liveToolUses = [...liveToolUses];
        }
        scheduleScroll();
        break;
      }

      case 'thinking':
        liveThinking = data.text;
        scheduleScroll();
        break;

      case 'permission-requested':
        permissionRequests = [
          ...permissionRequests,
          {
            requestId: data.requestId,
            tool: data.tool,
            input: data.input,
            resolved: false,
            decision: null,
          },
        ];
        scheduleScroll();
        break;

      case 'session-end':
        sessionEnded = true;
        break;
    }
  }

  // --- Auto-scroll ---
  let scrollQueued = false;

  function scheduleScroll(): void {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (chatContainerEl) {
        chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
      }
    });
  }

  // --- Input handling ---
  function handleSend(): void {
    const text = inputText.trim();
    if (!text) return;
    inputText = '';
    onSendInput(text);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // --- Permission handling ---
  async function handlePermission(requestId: string, decision: 'allow' | 'deny'): Promise<void> {
    const req = permissionRequests.find((p) => p.requestId === requestId);
    if (!req) return;

    req.resolved = true;
    req.decision = decision;
    permissionRequests = [...permissionRequests];

    try {
      const saved = localStorage.getItem('shooter_config');
      const config = saved ? JSON.parse(saved) : { apiKey };
      const key = config.apiKey || apiKey;

      const response = await fetch('/api/response', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          decision,
        }),
      });
      if (!response.ok) {
        // Revert the optimistic resolved state
        req.resolved = false;
        req.decision = null;
        permissionRequests = [...permissionRequests];
        console.error('Failed to persist permission decision');
      }
    } catch {
      // Revert on failure
      req.resolved = false;
      req.decision = null;
      permissionRequests = [...permissionRequests];
    }
  }

  // --- Tool helpers (reused from session page) ---
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

  function getToolDescription(toolName: string, input: Record<string, unknown>): string {
    if (toolName === 'Bash') {
      return (input.command as string) || (input.description as string) || '';
    }
    if (toolName === 'Read') {
      return (input.file_path as string) || '';
    }
    if (toolName === 'Edit' || toolName === 'Write') {
      return (input.file_path as string) || '';
    }
    if (toolName === 'Grep') {
      return (input.pattern as string) || '';
    }
    if (toolName === 'Glob') {
      return (input.pattern as string) || '';
    }
    if (toolName === 'Agent') {
      return (input.description as string) || (input.prompt as string)?.slice(0, 50) || '';
    }
    return JSON.stringify(input).slice(0, 60);
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

  // --- Lifecycle ---
  $effect(() => {
    if (browser && wsUrl && ticket) {
      connect();
    }

    return () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  });
</script>

<div class="chatview-wrapper">
  <!-- Header -->
  <div class="chatview-header">
    <div class="chatview-header-left">
      <span class="badge-live">LIVE</span>
      <span class="chatview-title">Session {terminalId}</span>
    </div>
    <div class="chatview-header-right">
      <span
        class="connection-status {connectionState}"
      >
        <span class="connection-status-dot"></span>
        {connectionState === 'connected'
          ? 'Connected'
          : connectionState === 'reconnecting'
            ? 'Reconnecting...'
            : 'Disconnected'}
      </span>
      {#if !sessionEnded}
        <button
          class="chatview-cancel-btn"
          onclick={() => onCancel()}
        >
          Cancel
        </button>
      {/if}
    </div>
  </div>

  <!-- Chat Container (scrollable) -->
  <div class="chat-container chatview-scroll" bind:this={chatContainerEl}>
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
                    onclick={() => toggleTool(toolId)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') toggleTool(toolId);
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
                    onclick={() => toggleTool(thinkId)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') toggleTool(thinkId);
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
                  onclick={() => toggleTool(resultId)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleTool(resultId);
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

    <!-- Live tool uses (in-progress, not yet part of a full message) -->
    {#each liveToolUses as tool (tool.id)}
      {@const isExpanded = expandedTools.has(`live-tool-${tool.id}`)}
      <div class="chat-message chat-message-assistant">
        <div class="chat-avatar chat-avatar-assistant">C</div>
        <div>
          <div class="chat-tool-card" class:chat-tool-card-running={tool.status === 'running'}>
            <div
              class="chat-tool-header"
              onclick={() => toggleTool(`live-tool-${tool.id}`)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleTool(`live-tool-${tool.id}`);
              }}
              role="button"
              tabindex="0"
            >
              <span class="chat-tool-chevron" class:expanded={isExpanded}>&#9654;</span>
              <span class="chat-tool-name" data-tool={tool.name}>{tool.name}</span>
              <span class="chat-tool-description">{getToolDescription(tool.name, tool.input)}</span>
              {#if tool.status === 'running'}
                <span class="chat-tool-status-running">running</span>
              {:else}
                <span class="chat-tool-status-done">done</span>
              {/if}
            </div>
            {#if isExpanded}
              <div class="chat-tool-body">{formatInput(tool.input)}</div>
              {#if tool.output != null}
                <div
                  class="chat-tool-result"
                  class:chat-tool-result-success={!tool.isError}
                  class:chat-tool-result-error={tool.isError}
                >
                  {tool.output}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      </div>
    {/each}

    <!-- Live thinking block -->
    {#if liveThinking}
      <div class="chat-message chat-message-assistant">
        <div class="chat-avatar chat-avatar-assistant">C</div>
        <div>
          <div class="chat-thinking chat-thinking-live">
            <div class="chat-thinking-header">
              &#128173; Thinking...
              <span class="thinking-pulse"></span>
            </div>
            <div class="chat-thinking-body">{@html renderMarkdown(liveThinking)}</div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Inline permission requests -->
    {#each pendingPermissions as perm (perm.requestId)}
      <div class="chat-permission-inline">
        <div class="permission-label">
          <span class="chat-tool-name" data-tool={perm.tool}>{perm.tool}</span>
          <span class="permission-preview">{getToolDescription(perm.tool, perm.input)}</span>
        </div>
        <button
          class="btn-allow"
          onclick={() => handlePermission(perm.requestId, 'allow')}
        >
          Allow
        </button>
        <button
          class="btn-deny"
          onclick={() => handlePermission(perm.requestId, 'deny')}
        >
          Deny
        </button>
      </div>
    {/each}

    <!-- Resolved permission requests -->
    {#each permissionRequests.filter((p) => p.resolved) as perm (perm.requestId)}
      <div class="chat-permission-resolved">
        <span class="chat-tool-name" data-tool={perm.tool}>{perm.tool}</span>
        <span class="permission-preview">{getToolDescription(perm.tool, perm.input)}</span>
        {#if perm.decision === 'allow'}
          <span class="permission-decision-allow">Allowed</span>
        {:else}
          <span class="permission-decision-deny">Denied</span>
        {/if}
      </div>
    {/each}

    <!-- Session ended indicator -->
    {#if sessionEnded}
      <div class="chatview-ended">
        <span class="badge-ended">ENDED</span>
        <span>Session has ended</span>
      </div>
    {/if}
  </div>

  <!-- Input bar -->
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

  /* Live tool use card with running indicator */
  .chat-tool-card-running {
    border-color: rgba(245, 158, 11, 0.3);
  }

  .chat-tool-status-running {
    font-size: 0.65rem;
    font-weight: 600;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
    padding: 1px 6px;
    border-radius: var(--radius-full, 9999px);
    margin-left: auto;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .chat-tool-status-done {
    font-size: 0.65rem;
    font-weight: 600;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.12);
    padding: 1px 6px;
    border-radius: var(--radius-full, 9999px);
    margin-left: auto;
  }

  /* Live thinking (with pulse) */
  .chat-thinking-live {
    border-style: solid;
    border-color: rgba(168, 85, 247, 0.3);
  }

  .thinking-pulse {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #a855f7;
    margin-left: 6px;
    animation: pulse-dot 1.5s ease-in-out infinite;
  }

  /* Permission preview text in permission cards */
  .permission-preview {
    font-size: 0.8rem;
    color: var(--text-secondary, #a3a3a3);
    margin-left: var(--space-2, 0.5rem);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  /* Resolved permission cards */
  .chat-permission-resolved {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: var(--radius-lg, 8px);
    margin: var(--space-2, 0.5rem) 0;
    opacity: 0.7;
  }

  .permission-decision-allow {
    font-size: 0.75rem;
    font-weight: 600;
    color: #22c55e;
    margin-left: auto;
  }

  .permission-decision-deny {
    font-size: 0.75rem;
    font-weight: 600;
    color: #ef4444;
    margin-left: auto;
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

    .permission-preview {
      max-width: 120px;
    }
  }

  @media (max-width: 480px) {
    .chatview-header {
      flex-wrap: wrap;
    }

    .permission-preview {
      max-width: 80px;
    }
  }
</style>
