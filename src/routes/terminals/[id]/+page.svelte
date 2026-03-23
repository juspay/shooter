<script lang="ts">
  import type {
    ConversationMessage,
    MessagePart,
    ToolUsePart,
  } from '$lib/modules/server/sessions/types';

  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { EmptyState } from '$lib/modules/client/common';
  import ChatView from '$lib/modules/client/terminal/ChatView.svelte';
  import ConnectionStatus from '$lib/modules/client/terminal/ConnectionStatus.svelte';
  import QuickKeys from '$lib/modules/client/terminal/QuickKeys.svelte';
  import { onDestroy, onMount } from 'svelte';

  // ------- Interfaces -------

  interface TerminalDetail {
    args: string[];
    command: string;
    createdAt: string;
    cwd: string;
    exitCode: null | number;
    exitedAt: null | string;
    id: string;
    pid: number;
    sessionWs: string;
    status: 'exited' | 'running';
    ws: string;
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
  let chatMessages = $state<ConversationMessage[]>([]);
  let chatSessionEnded = $state(false);

  // DOM references
  let termContainer = $state<HTMLDivElement | null>(null);
  let inputRef = $state<HTMLInputElement | null>(null);

  // WebSocket and terminal instance refs (not reactive)
  let termInstance: null | { dispose: () => void; sendInput: (data: string) => void; term: { cols: number; rows: number }; } = null;
  let sessionWs: null | WebSocket = null;
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

  function getConfig(): null | { apiKey: string } {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (!saved) {return null;}
      const parsed = JSON.parse(saved);
      if (typeof parsed?.apiKey === 'string' && parsed.apiKey) {return parsed;}
      return null;
    } catch {
      return null;
    }
  }


  // ------- API calls -------

  async function fetchTerminal(): Promise<void> {
    if (!browser) {return;}

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

  async function getWsTicket(): Promise<null | string> {
    const config = getConfig();
    if (!config) {return null;}
    try {
      const res = await fetch('/api/ws-ticket', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        method: 'POST',
      });
      if (!res.ok) {return null;}
      const data: { ticket: string } = await res.json();
      return data.ticket;
    } catch {
      return null;
    }
  }

  async function killTerminal(): Promise<void> {
    if (!terminal || killing) {return;}
    const config = getConfig();
    if (!config) {return;}

    killing = true;
    try {
      const res = await fetch(`/api/terminals/${terminalId}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        method: 'DELETE',
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
    if (!terminal || removing) {return;}
    const config = getConfig();
    if (!config) {return;}

    removing = true;
    try {
      const res = await fetch(`/api/terminals/${terminalId}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        method: 'DELETE',
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
    if (!termContainer || !terminal || disposed) {return;}

    // Build the WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${terminal.ws}`;

    const getTicket = async (): Promise<string> => {
      const ticket = await getWsTicket();
      if (!ticket) {throw new Error('Failed to obtain WebSocket ticket');}
      return ticket;
    };

    try {
      const { createTerminal } = await import('$lib/modules/client/terminal/xterm-wrapper');

      if (disposed || !termContainer) {return;}

      const instance = await createTerminal({
        container: termContainer,
        fontSize: window.innerWidth < 768 ? 12 : 14,
        getTicket,
        onDisconnect: () => {
          if (!disposed) {connectionStatus = 'reconnecting';}
        },
        onExit: (code: number) => {
          if (!disposed && terminal) {
            terminal = { ...terminal, exitCode: code, exitedAt: new Date().toISOString(), status: 'exited' };
            connectionStatus = 'disconnected';
          }
        },
        onReconnect: () => {
          if (!disposed) {connectionStatus = 'connected';}
        },
        wsUrl,
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
    if (!terminal || disposed) {return;}

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
        sessionWs?.send(JSON.stringify({ sessionId: terminalId, type: 'subscribe' }));
      }
    };

    sessionWs.onmessage = (event) => {
      if (disposed) {return;}
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
          if (!disposed && terminal?.status === 'running') {void connectSessionWs();}
        }, 2000);
      }
    };

    sessionWs.onerror = () => {
      if (!disposed) {connectionStatus = 'disconnected';}
    };
  }

  function handleSessionMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'history') {
      // History messages use `content` on the wire; convert to `parts` for ConversationMessage
      const historyRaw = (msg.messages || []) as Array<{
        content: MessagePart[];
        id: string;
        role: 'assistant' | 'system' | 'user';
        timestamp: string;
      }>;
      chatMessages = historyRaw.map((m) => ({
        id: m.id,
        parts: m.content,
        role: m.role,
        timestamp: m.timestamp,
      }));
    } else if (msg.type === 'message') {
      chatMessages = [
        ...chatMessages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parts: (msg.content as MessagePart[]) || [],
          role: (msg.role as ConversationMessage['role']) || 'assistant',
          timestamp: (msg.timestamp as string) || new Date().toISOString(),
        },
      ];
    } else if (msg.type === 'tool-use') {
      // Append tool use as an assistant message fragment
      chatMessages = [
        ...chatMessages,
        {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parts: [
            {
              id: (msg.id as string) || `tool-${Date.now()}`,
              input: (msg.input as Record<string, unknown>) || {},
              toolName: msg.name as string,
              type: 'tool_use',
            } as ToolUsePart,
          ],
          role: 'assistant',
          timestamp: new Date().toISOString(),
        },
      ];
    } else if (msg.type === 'tool-result') {
      chatMessages = [
        ...chatMessages,
        {
          id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parts: [
            {
              isError: msg.isError || false,
              output: (msg.output as string) || '',
              toolUseId: msg.id as string,
              type: 'tool_result',
            } as MessagePart,
          ],
          role: 'system',
          timestamp: new Date().toISOString(),
        },
      ];
    } else if (msg.type === 'thinking') {
      // Append thinking block to the last assistant message
      const thinkPart: MessagePart = {
        content: (msg.text as string) || '',
        type: 'thinking',
      };
      const lastMsg = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
      if (lastMsg?.role === 'assistant') {
        chatMessages = [
          ...chatMessages.slice(0, -1),
          { ...lastMsg, parts: [...lastMsg.parts, thinkPart] },
        ];
      } else {
        chatMessages = [
          ...chatMessages,
          {
            id: `think-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            parts: [thinkPart],
            role: 'assistant',
            timestamp: new Date().toISOString(),
          },
        ];
      }
    } else if (msg.type === 'error') {
      // Server-sent error — display as a system message
      chatMessages = [
        ...chatMessages,
        {
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parts: [{ content: (msg.message as string) || 'Unknown error', type: 'text' } as MessagePart],
          role: 'system',
          timestamp: new Date().toISOString(),
        },
      ];
    } else if (msg.type === 'session-end') {
      chatSessionEnded = true;
      if (terminal) { terminal = { ...terminal, status: 'exited' }; }
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
    if (!inputText.trim()) {return;}
    // Send the text as raw PTY input with a newline via the xterm wrapper's WebSocket
    if (termInstance && connectionStatus === 'connected') {
      termInstance.sendInput(`${inputText  }\r`);
    }
    inputText = '';
    inputRef?.focus();
  }

  function handleChatSendInput(text: string): void {
    if (!text.trim() || sessionWs?.readyState !== WebSocket.OPEN) { return; }
    sessionWs.send(JSON.stringify({ text, type: 'send-input' }));
  }

  function handleChatCancel(): void {
    if (sessionWs?.readyState === WebSocket.OPEN) {
      sessionWs.send(JSON.stringify({ type: 'cancel' }));
    }
  }

  function handleQuickKey(key: string): void {
    if (viewMode === 'raw') {
      if (termInstance && connectionStatus === 'connected') {
        termInstance.sendInput(key);
      }
    } else if (viewMode === 'chat') {
      // For chat mode, Ctrl+C sends a cancel signal
      if (key === '\x03') {
        handleChatCancel();
      }
    }
  }

  function handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRawInput();
    }
  }

  // ------- View mode switching -------

  // Track whether each mode has been initialized at least once
  let rawInitialized = false;
  let chatInitialized = false;

  function setViewMode(mode: 'chat' | 'raw'): void {
    if (mode === viewMode) {return;}
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

    if (!terminal || error) {return;}

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
              onclick={() => { setViewMode('raw'); }}
              type="button"
              role="radio"
              aria-checked={viewMode === 'raw'}
            >
              Raw
            </button>
            <button
              class="term-toggle-btn"
              class:active={viewMode === 'chat'}
              onclick={() => { setViewMode('chat'); }}
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
      <ChatView
        messages={chatMessages}
        connectionState={connectionStatus}
        sessionEnded={chatSessionEnded}
        showInput={isRunning}
        onSendInput={handleChatSendInput}
        onCancel={handleChatCancel}
      />
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
    flex-shrink: 1;
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

    .term-input {
      font-size: var(--text-sm);
    }
  }

  @media (max-width: 480px) {
    .term-topbar {
      min-height: 44px;
      padding: var(--space-1) var(--space-2);
    }

    .term-command-name {
      max-width: 80px;
      text-overflow: ellipsis;
    }

    .term-topbar-right {
      flex-shrink: 1;
    }

    .term-kill-btn {
      padding: 0 6px;
      font-size: 11px;
      height: 28px;
    }

    .term-badge {
      font-size: 10px;
      padding: 1px 6px;
    }
  }
</style>
