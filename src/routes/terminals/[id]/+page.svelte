<script lang="ts">
  import type {
    MessagePart,
    ToolUsePart,
  } from '$lib/modules/server/sessions/types';

  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { EmptyState } from '$lib/modules/client/common';
  import ConnectionStatus from '$lib/modules/client/terminal/ConnectionStatus.svelte';
  import QuickKeys from '$lib/modules/client/terminal/QuickKeys.svelte';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { onDestroy, onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  // Configure marked for safe rendering
  marked.setOptions({ breaks: true, gfm: true });

  function renderMarkdown(text: string): string {
    if (!text) return '';
    const html = marked.parse(text) as string;
    return DOMPurify.sanitize(html);
  }

  // ------- Interfaces -------

  interface TerminalDetail {
    id: string;
    command: string;
    args: string[];
    cwd: string;
    pid: number;
    status: 'exited' | 'running';
    createdAt: string;
    exitedAt: string | null;
    exitCode: number | null;
    ws: string;
    sessionWs: string;
  }

  interface ChatMessage {
    id: string;
    role: 'assistant' | 'system' | 'user';
    content: MessagePart[];
    timestamp: string;
  }

  // ------- Constants -------

  const AI_COMMANDS = ['claude', 'opencode'];

  // ------- Reactive state -------

  let terminal = $state<null | TerminalDetail>(null);
  let loading = $state(true);
  let error = $state<null | string>(null);
  let killing = $state(false);
  let removing = $state(false);
  let viewMode = $state<'chat' | 'raw'>('raw');
  let connectionStatus = $state<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  let inputText = $state('');
  let chatMessages = $state<ChatMessage[]>([]);
  const expandedTools = new SvelteSet<string>();

  // DOM references
  let termContainer = $state<HTMLDivElement | null>(null);
  let chatEndRef = $state<HTMLDivElement | null>(null);
  let inputRef = $state<HTMLInputElement | null>(null);
  let chatInputRef = $state<HTMLInputElement | null>(null);

  // WebSocket and terminal instance refs (not reactive)
  let termInstance: { dispose: () => void; term: { cols: number; rows: number }; sendInput: (data: string) => void } | null = null;
  let sessionWs: WebSocket | null = null;
  let disposed = false;

  // ------- Derived -------

  const terminalId = $derived($page.params.id);
  const isAI = $derived(
    terminal ? AI_COMMANDS.includes((terminal.command.split('/').pop() || '').toLowerCase()) : false
  );
  const isRunning = $derived(terminal?.status === 'running');
  const commandName = $derived(terminal?.command.split('/').pop() || 'terminal');
  const badgeLabel = $derived(isAI ? 'AI' : 'SHELL');
  const badgeClass = $derived(isAI ? 'badge-ai' : 'badge-shell');

  // ------- Helpers -------

  function getConfig(): { apiKey: string } | null {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (typeof parsed?.apiKey === 'string' && parsed.apiKey) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  function formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function isToolUsePart(part: MessagePart): part is ToolUsePart {
    return part.type === 'tool_use';
  }

  function getToolDescription(part: ToolUsePart): string {
    const input = part.input;
    if (part.toolName === 'Bash') return (input.command as string) || (input.description as string) || '';
    if (part.toolName === 'Read') return (input.file_path as string) || '';
    if (part.toolName === 'Edit' || part.toolName === 'Write') return (input.file_path as string) || '';
    if (part.toolName === 'Grep') return (input.pattern as string) || '';
    if (part.toolName === 'Glob') return (input.pattern as string) || '';
    if (part.toolName === 'Agent')
      return (input.description as string) || (input.prompt as string)?.slice(0, 50) || '';
    return JSON.stringify(input).slice(0, 60);
  }

  function formatInput(input: Record<string, unknown>): string {
    return JSON.stringify(input, null, 2);
  }

  function toggleTool(id: string): void {
    if (expandedTools.has(id)) expandedTools.delete(id);
    else expandedTools.add(id);
  }

  function scrollChatToBottom(): void {
    requestAnimationFrame(() => {
      chatEndRef?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ------- API calls -------

  async function fetchTerminal(): Promise<void> {
    if (!browser) return;

    const config = getConfig();
    if (!config) {
      error = 'No configuration found. Please configure settings first.';
      loading = false;
      return;
    }

    try {
      const res = await fetch(`/api/terminals/${terminalId}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!res.ok) {
        error = res.status === 404 ? 'Terminal not found' : 'Failed to load terminal';
        loading = false;
        return;
      }
      terminal = await res.json();
    } catch {
      error = 'Failed to connect to server';
    }
    loading = false;
  }

  async function getWsTicket(): Promise<string | null> {
    const config = getConfig();
    if (!config) return null;
    try {
      const res = await fetch('/api/ws-ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!res.ok) return null;
      const data: { ticket: string } = await res.json();
      return data.ticket;
    } catch {
      return null;
    }
  }

  async function killTerminal(): Promise<void> {
    if (!terminal || killing) return;
    const config = getConfig();
    if (!config) return;

    killing = true;
    try {
      const res = await fetch(`/api/terminals/${terminalId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (res.ok) {
        void goto('/terminals');
      } else {
        killing = false;
      }
    } catch {
      killing = false;
    }
  }

  async function removeTerminal(): Promise<void> {
    if (!terminal || removing) return;
    const config = getConfig();
    if (!config) return;

    removing = true;
    try {
      const res = await fetch(`/api/terminals/${terminalId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (res.ok) {
        void goto('/terminals');
      } else {
        removing = false;
      }
    } catch {
      removing = false;
    }
  }

  // ------- Raw terminal (xterm.js) -------

  async function initRawTerminal(): Promise<void> {
    if (!termContainer || !terminal || disposed) return;

    // Build the WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${terminal.ws}`;

    const getTicket = async (): Promise<string> => {
      const ticket = await getWsTicket();
      if (!ticket) throw new Error('Failed to obtain WebSocket ticket');
      return ticket;
    };

    try {
      const { createTerminal } = await import('$lib/modules/client/terminal/xterm-wrapper');

      if (disposed || !termContainer) return;

      const instance = await createTerminal({
        container: termContainer,
        wsUrl,
        getTicket,
        fontSize: window.innerWidth < 768 ? 12 : 14,
        onDisconnect: () => {
          if (!disposed) connectionStatus = 'reconnecting';
        },
        onReconnect: () => {
          if (!disposed) connectionStatus = 'connected';
        },
        onExit: (code: number) => {
          if (!disposed && terminal) {
            terminal = { ...terminal, status: 'exited', exitCode: code, exitedAt: new Date().toISOString() };
            connectionStatus = 'disconnected';
          }
        },
      });

      if (disposed) {
        instance.dispose();
        return;
      }

      termInstance = instance;
      connectionStatus = 'connected';
    } catch (err) {
      console.error('Failed to initialize terminal:', err);
      connectionStatus = 'disconnected';
    }
  }

  function disposeRawTerminal(): void {
    if (termInstance) {
      termInstance.dispose();
      termInstance = null;
    }
  }

  // ------- Chat (session WebSocket) -------

  async function connectSessionWs(): Promise<void> {
    if (!terminal || disposed) return;

    const ticket = await getWsTicket();
    if (!ticket || disposed || !terminal) {
      connectionStatus = 'disconnected';
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${terminal.sessionWs}?ticket=${ticket}`;

    sessionWs = new WebSocket(wsUrl);

    sessionWs.onopen = () => {
      if (!disposed) {
        connectionStatus = 'connected';
        sessionWs?.send(JSON.stringify({ type: 'subscribe', sessionId: terminalId }));
      }
    };

    sessionWs.onmessage = (event) => {
      if (disposed) return;
      try {
        const msg = JSON.parse(event.data);
        handleSessionMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    sessionWs.onclose = () => {
      if (!disposed && terminal?.status === 'running') {
        connectionStatus = 'reconnecting';
        // Reconnect after delay (will fetch a fresh ticket)
        setTimeout(() => {
          if (!disposed && terminal?.status === 'running') void connectSessionWs();
        }, 2000);
      }
    };

    sessionWs.onerror = () => {
      if (!disposed) connectionStatus = 'disconnected';
    };
  }

  function handleSessionMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'history') {
      const history = msg.messages as ChatMessage[];
      chatMessages = history || [];
      scrollChatToBottom();
    } else if (msg.type === 'message') {
      chatMessages = [
        ...chatMessages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: msg.role as ChatMessage['role'],
          content: msg.content as MessagePart[],
          timestamp: (msg.timestamp as string) || new Date().toISOString(),
        },
      ];
      scrollChatToBottom();
    } else if (msg.type === 'tool-use') {
      // Append tool use as an assistant message fragment
      chatMessages = [
        ...chatMessages,
        {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: (msg.id as string) || `tool-${Date.now()}`,
              toolName: msg.name as string,
              input: (msg.input as Record<string, unknown>) || {},
            } as ToolUsePart,
          ],
          timestamp: new Date().toISOString(),
        },
      ];
      scrollChatToBottom();
    } else if (msg.type === 'tool-result') {
      chatMessages = [
        ...chatMessages,
        {
          id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'system',
          content: [
            {
              type: 'tool_result',
              toolUseId: msg.id as string,
              output: (msg.output as string) || '',
              isError: msg.status === 'error',
            } as MessagePart,
          ],
          timestamp: new Date().toISOString(),
        },
      ];
      scrollChatToBottom();
    } else if (msg.type === 'session-end') {
      if (terminal) terminal = { ...terminal, status: 'exited' };
    }
  }

  function disconnectSessionWs(): void {
    if (sessionWs) {
      sessionWs.onclose = null;
      sessionWs.close();
      sessionWs = null;
    }
  }

  // ------- Input handling -------

  function handleRawInput(): void {
    if (!inputText.trim()) return;
    // Send the text as raw PTY input with a newline via the xterm wrapper's WebSocket
    if (termInstance && connectionStatus === 'connected') {
      termInstance.sendInput(inputText + '\r');
    }
    inputText = '';
    inputRef?.focus();
  }

  function handleChatInput(): void {
    if (!inputText.trim() || !sessionWs || sessionWs.readyState !== WebSocket.OPEN) return;
    sessionWs.send(JSON.stringify({ type: 'send-input', text: inputText }));
    inputText = '';
    chatInputRef?.focus();
  }

  function handleQuickKey(key: string): void {
    if (viewMode === 'raw') {
      if (termInstance && connectionStatus === 'connected') {
        termInstance.sendInput(key);
      }
    } else if (viewMode === 'chat') {
      // For chat mode, Ctrl+C sends a cancel signal
      if (key === '\x03' && sessionWs && sessionWs.readyState === WebSocket.OPEN) {
        sessionWs.send(JSON.stringify({ type: 'cancel' }));
      }
    }
  }

  function handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (viewMode === 'raw') handleRawInput();
      else handleChatInput();
    }
  }

  // ------- View mode switching -------

  // Track whether each mode has been initialized at least once
  let rawInitialized = false;
  let chatInitialized = false;

  function setViewMode(mode: 'chat' | 'raw'): void {
    if (mode === viewMode) return;
    viewMode = mode;

    // Lazily initialize connections on first switch — keep them alive afterwards
    if (mode === 'raw' && !rawInitialized) {
      requestAnimationFrame(() => {
        void initRawTerminal();
      });
      rawInitialized = true;
    } else if (mode === 'chat' && !chatInitialized) {
      void connectSessionWs();
      chatInitialized = true;
    }

    // Scroll chat to bottom when switching to chat
    if (mode === 'chat') {
      scrollChatToBottom();
    }
  }

  // ------- Retry connection -------

  function handleRetry(): void {
    if (viewMode === 'raw') {
      disposeRawTerminal();
      connectionStatus = 'reconnecting';
      void initRawTerminal();
      rawInitialized = true;
    } else {
      disconnectSessionWs();
      connectionStatus = 'reconnecting';
      void connectSessionWs();
      chatInitialized = true;
    }
  }

  // ------- Lifecycle -------

  onMount(async () => {
    await fetchTerminal();

    if (!terminal || error) return;

    // Default view: Chat on mobile for AI sessions, Raw on desktop
    if (isAI && window.innerWidth < 768) {
      viewMode = 'chat';
    } else {
      viewMode = 'raw';
    }

    if (viewMode === 'raw') {
      // Wait one tick for the DOM to render the terminal container
      requestAnimationFrame(() => {
        void initRawTerminal();
      });
      rawInitialized = true;
    } else {
      void connectSessionWs();
      chatInitialized = true;
    }
  });

  onDestroy(() => {
    disposed = true;
    disposeRawTerminal();
    disconnectSessionWs();
  });
</script>

<svelte:head>
  <title>{commandName} - Terminal - Shooter</title>
  <meta name="description" content="Interactive terminal session" />
</svelte:head>

{#if loading}
  <div class="term-page">
    <div class="term-topbar">
      <div class="skeleton" style="width: 120px; height: 20px;"></div>
    </div>
    <div class="term-body-loading">
      <div class="skeleton" style="width: 100%; height: 100%;"></div>
    </div>
  </div>
{:else if error}
  <main class="main">
    <div class="session-back-row">
      <a href="/terminals" class="back-link">
        <span class="back-arrow">&larr;</span>
        Terminals
      </a>
    </div>
    <EmptyState icon="alert-triangle" title="Error" description={error} />
  </main>
{:else if terminal}
  <div class="term-page">
    <!-- Top Bar -->
    <div class="term-topbar">
      <div class="term-topbar-left">
        <a href="/terminals" class="term-back" aria-label="Back to terminals">&larr;</a>
        <span class="term-command-name">{commandName}</span>
        <span class="term-type-badge {badgeClass}">{badgeLabel}</span>
        <ConnectionStatus status={connectionStatus} onretry={handleRetry} />
      </div>

      <div class="term-topbar-right">
        {#if isAI}
          <div class="term-toggle" role="radiogroup" aria-label="View mode">
            <button
              class="term-toggle-btn"
              class:active={viewMode === 'raw'}
              onclick={() => setViewMode('raw')}
              type="button"
              role="radio"
              aria-checked={viewMode === 'raw'}
            >
              Raw
            </button>
            <button
              class="term-toggle-btn"
              class:active={viewMode === 'chat'}
              onclick={() => setViewMode('chat')}
              type="button"
              role="radio"
              aria-checked={viewMode === 'chat'}
            >
              Chat
            </button>
          </div>
        {/if}

        {#if isRunning}
          <button
            class="term-kill-btn"
            onclick={killTerminal}
            disabled={killing}
            type="button"
            aria-label="Kill terminal"
          >
            {#if killing}
              <span class="btn-spinner"></span>
            {/if}
            Kill
          </button>
        {:else}
          <button
            class="term-remove-btn"
            onclick={removeTerminal}
            disabled={removing}
            type="button"
            aria-label="Remove terminal"
          >
            {#if removing}
              <span class="btn-spinner"></span>
            {/if}
            Remove
          </button>
        {/if}
      </div>
    </div>

    <!-- Body: both views always rendered, toggled via CSS display to preserve WebSocket connections -->

    <!-- Raw Terminal View -->
    <div class="term-body" bind:this={termContainer} style:display={viewMode === 'raw' ? 'flex' : 'none'}></div>

    <!-- Raw Input Bar + Quick Keys -->
    {#if isRunning && viewMode === 'raw'}
      <div class="term-input-area">
        <QuickKeys onKey={handleQuickKey} />
        <div class="term-input-bar">
          <input
            class="term-input"
            type="text"
            bind:value={inputText}
            bind:this={inputRef}
            onkeydown={handleInputKeydown}
            placeholder="Type command..."
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
          <button
            class="term-send-btn"
            onclick={handleRawInput}
            disabled={!inputText.trim()}
            type="button"
            aria-label="Send"
          >
            &crarr;
          </button>
        </div>
      </div>
    {/if}

    <!-- Chat View -->
    <div class="term-chat-body" style:display={viewMode === 'chat' ? 'flex' : 'none'}>
      {#if chatMessages.length === 0}
        <div class="term-chat-empty">
          <p class="term-chat-empty-text">Waiting for session messages...</p>
        </div>
      {:else}
        <div class="chat-container term-chat-messages">
          {#each chatMessages as message (message.id)}
            {#if message.role === 'user'}
              <div class="chat-message chat-message-user">
                <div>
                  {#each message.content as part, partIdx (partIdx)}
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
                  {#each message.content as part, partIdx (partIdx)}
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
                          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleTool(toolId); }}
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
                          onclick={() => toggleTool(thinkId)}
                          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleTool(thinkId); }}
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
              {#each message.content as part, partIdx (partIdx)}
                {#if part.type === 'tool_result'}
                  {@const resultId = `result-${part.toolUseId}`}
                  {@const isResultExpanded = expandedTools.has(resultId)}
                  <div class="chat-message chat-message-system">
                    <div class="chat-tool-card">
                      <div
                        class="chat-tool-header"
                        onclick={() => toggleTool(resultId)}
                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleTool(resultId); }}
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
          <div bind:this={chatEndRef}></div>
        </div>
      {/if}

      <!-- Chat Input Bar -->
      {#if isRunning}
        <div class="term-input-area">
          <div class="term-input-bar">
            <input
              class="term-input"
              type="text"
              bind:value={inputText}
              bind:this={chatInputRef}
              onkeydown={handleInputKeydown}
              placeholder="Send a message..."
              autocomplete="off"
              autocapitalize="off"
            />
            <button
              class="term-send-btn"
              onclick={handleChatInput}
              disabled={!inputText.trim()}
              type="button"
              aria-label="Send"
            >
              &crarr;
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Exited overlay for non-running terminals -->
    {#if !isRunning}
      <div class="term-exited-bar">
        <span>Process exited</span>
        {#if terminal.exitCode !== null}
          <span class="term-exit-code" class:exit-err={terminal.exitCode !== 0}>
            code {terminal.exitCode}
          </span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* ============================================
     Terminal Page — full viewport layout
     ============================================ */

  .term-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - var(--header-height));
    height: calc(100dvh - var(--header-height));
    overflow: hidden;
    background: var(--ds-background-200);
  }

  /* Top bar */
  .term-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--ds-background-100);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    min-height: 48px;
  }

  .term-topbar-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    overflow: hidden;
  }

  .term-topbar-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  /* Back button */
  .term-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 18px;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
    flex-shrink: 0;
  }

  .term-back:hover {
    background: var(--ds-gray-alpha-100);
    color: var(--text-primary);
  }

  /* Command name */
  .term-command-name {
    font-family: var(--font-mono);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Type badge (reuse from terminals list) */
  .term-type-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0.03em;
    border: 1px solid;
    flex-shrink: 0;
  }

  .badge-ai {
    background: rgba(139, 92, 246, 0.12);
    color: #a78bfa;
    border-color: rgba(139, 92, 246, 0.25);
  }

  .badge-shell {
    background: rgba(34, 197, 94, 0.12);
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.25);
  }

  /* Raw/Chat toggle */
  .term-toggle {
    display: flex;
    background: var(--ds-gray-200);
    border-radius: var(--radius-md);
    border: 1px solid var(--ds-gray-400);
    overflow: hidden;
  }

  .term-toggle-btn {
    min-height: 36px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .term-toggle-btn:hover {
    color: var(--text-secondary);
  }

  .term-toggle-btn.active {
    background: var(--ds-gray-400);
    color: var(--text-primary);
  }

  /* Kill button */
  .term-kill-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-md);
    background: #d93036;
    color: #fff;
    border: none;
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      opacity var(--transition-fast);
    flex-shrink: 0;
  }

  .term-kill-btn:hover:not(:disabled) {
    background: #ff6166;
  }

  .term-kill-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Remove button for exited terminals */
  .term-remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-md);
    background: var(--ds-gray-400);
    color: var(--text-primary);
    border: none;
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      opacity var(--transition-fast);
    flex-shrink: 0;
  }

  .term-remove-btn:hover:not(:disabled) {
    background: var(--ds-red-100);
    color: var(--ds-red-900);
  }

  .term-remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ============================================
     Terminal body — raw xterm.js
     ============================================ */

  .term-body {
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: var(--space-1);
    background: #0a0a0f;
  }

  .term-body :global(.xterm) {
    height: 100%;
  }

  .term-body :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .term-body-loading {
    flex: 1;
    padding: var(--space-4);
    min-height: 200px;
  }

  /* ============================================
     Chat body
     ============================================ */

  .term-chat-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .term-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    -webkit-overflow-scrolling: touch;
  }

  .term-chat-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
  }

  .term-chat-empty-text {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  /* ============================================
     Input area (shared between raw + chat)
     ============================================ */

  .term-input-area {
    flex-shrink: 0;
    background: var(--ds-background-100);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .term-input-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
  }

  .term-input {
    flex: 1;
    height: 44px;
    padding: 0 var(--space-3);
    background: var(--ds-gray-100);
    border: 1px solid var(--ds-gray-400);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-base);
    font-family: var(--font-mono);
    transition: border-color var(--transition-fast);
  }

  .term-input:focus {
    outline: none;
    border-color: var(--text-primary);
  }

  .term-input::placeholder {
    color: var(--text-tertiary);
  }

  .term-send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: var(--ds-gray-1000);
    color: var(--ds-background-100);
    border: none;
    font-size: 18px;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background var(--transition-fast),
      opacity var(--transition-fast);
  }

  .term-send-btn:hover:not(:disabled) {
    background: #fff;
  }

  .term-send-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ============================================
     Exited bar
     ============================================ */

  .term-exited-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
    background: var(--ds-gray-200);
    border-top: 1px solid var(--border);
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .term-exit-code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--ds-gray-alpha-100);
    color: var(--text-secondary);
  }

  .term-exit-code.exit-err {
    color: var(--ds-red-900);
    background: var(--ds-red-100);
  }

  /* ============================================
     Responsive
     ============================================ */

  @media (max-width: 768px) {
    .term-topbar {
      padding: var(--space-2) var(--space-3);
      gap: var(--space-2);
    }

    .term-command-name {
      font-size: var(--text-sm);
      max-width: 100px;
    }

    .term-chat-messages {
      padding: var(--space-3);
    }

    .term-input {
      font-size: var(--text-sm);
    }
  }

  @media (max-width: 480px) {
    .term-command-name {
      max-width: 80px;
      text-overflow: ellipsis;
    }

    .term-topbar-right {
      flex-shrink: 1;
    }

    .term-kill-btn {
      padding: 0 8px;
      font-size: 11px;
    }
  }
</style>
