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
  import CommandPalette from '$lib/modules/client/terminal/CommandPalette.svelte';
  import ConnectionStatus from '$lib/modules/client/terminal/ConnectionStatus.svelte';
  import { createShortcutManager, modLabel } from '$lib/modules/client/terminal/keyboard-shortcuts';
  import QuickKeys from '$lib/modules/client/terminal/QuickKeys.svelte';
  import ShortcutsHelp from '$lib/modules/client/terminal/ShortcutsHelp.svelte';
  import { Button, Input, Pill, Tabs, Tooltip } from '@juspay/svelte-ui-components';
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
  let isActive = $state(false);
  let currentCwd = $state<null | string>(null);
  let viewMode = $state<'chat' | 'raw'>('raw');
  let connectionStatus = $state<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  let inputText = $state('');
  let chatMessages = $state<ConversationMessage[]>([]);
  let chatSessionEnded = $state(false);

  // DOM references
  let termContainer = $state<HTMLDivElement | null>(null);
  const inputRef = $state<HTMLInputElement | null>(null);

  // WebSocket and terminal instance refs (not reactive)
  let termInstance: null | { dispose: () => void; sendInput: (data: string) => void; term: { cols: number; rows: number }; } = null;
  let shortcutManager: null | { destroy: () => void } = null;
  let showShortcutsHelp = $state(false);
  let showCommandPalette = $state(false);
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
  const badgeClass = $derived(isAI ? 'pill-badge-ai' : 'pill-badge-shell');
  const tabItems = ['Raw', 'Chat'];
  const tabActiveIndex = $derived(viewMode === 'raw' ? 0 : 1);
  const displayCwd = $derived(shortenPath(currentCwd || terminal?.cwd || ''));
  const paletteCommands = $derived.by(() => {
    const cmds = [
      { action: () => void goto('/'), label: 'Go to Home' },
      { action: () => void goto('/terminals'), label: 'Go to Terminals' },
      { action: () => void goto('/config'), label: 'Go to Settings' },
      { action: () => { showShortcutsHelp = true; }, label: 'Show keyboard shortcuts' },
    ];
    if (isRunning) {
      cmds.push({ action: () => void killTerminal(), label: 'Kill terminal' });
    }
    return cmds;
  });

  // ------- Helpers -------

  function shortenPath(p: string): string {
    if (!p) {return '';}
    const home = typeof window !== 'undefined' ? '' : '';
    let display = p;
    // Replace home prefix with ~
    if (typeof navigator !== 'undefined') {
      // Best effort home detection from path
      const parts = p.split('/');
      if (parts.length >= 3 && parts[1] === 'Users') {
        display = `~/${  parts.slice(3).join('/')}`;
      } else if (parts.length >= 3 && parts[1] === 'home') {
        display = `~/${  parts.slice(3).join('/')}`;
      }
    }
    // Show last 2 segments if too long
    if (display.length > 30) {
      const segs = display.split('/');
      if (segs.length > 2) {
        return `.../${  segs.slice(-2).join('/')}`;
      }
    }
    return display || home;
  }

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
        apiKey: getConfig()?.apiKey,
        container: termContainer,
        fontSize: window.innerWidth < 768 ? 12 : 14,
        getTicket,
        onActivity: (active: boolean) => {
          if (!disposed) {isActive = active;}
        },
        onCwd: (path: string) => {
          if (!disposed) {currentCwd = path;}
        },
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
        terminalId,
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
      const historyRaw = (msg.messages || []) as {
        content: MessagePart[];
        id: string;
        role: 'assistant' | 'system' | 'user';
        timestamp: string;
      }[];
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

    // Set up keyboard shortcuts
    shortcutManager = createShortcutManager({
      onHelp: () => { showShortcutsHelp = !showShortcutsHelp; },
    });

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
    shortcutManager?.destroy();
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
        <Pill text={badgeLabel} classes={badgeClass} />
        {#if isRunning}
          <Tooltip text={isActive ? 'Active' : 'Idle'} position="bottom">
            <span class="activity-dot {isActive ? 'activity-active' : 'activity-idle'}"></span>
          </Tooltip>
        {/if}
        {#if displayCwd}
          <Tooltip text={currentCwd || terminal?.cwd || ''} position="bottom">
            <span class="term-cwd">{displayCwd}</span>
          </Tooltip>
        {/if}
        <ConnectionStatus status={connectionStatus} onretry={handleRetry} />
      </div>

      <div class="term-topbar-right">
        {#if isAI}
          <Tabs
            items={tabItems}
            activeIndex={tabActiveIndex}
            onchange={(index) => { setViewMode(index === 0 ? 'raw' : 'chat'); }}
            classes="term-tabs"
          />
        {/if}

        <button
          class="term-shortcuts-btn"
          onclick={() => { showShortcutsHelp = !showShortcutsHelp; }}
          type="button"
          title="{modLabel}+/ for shortcuts"
          aria-label="Keyboard shortcuts"
        >?</button>

        {#if isRunning}
          <Button
            classes="btn-danger btn-sm"
            onclick={killTerminal}
            disabled={killing}
            showLoader={killing}
            text="Kill"
          />
        {:else}
          <Button
            classes="btn-secondary btn-sm"
            onclick={removeTerminal}
            disabled={removing}
            showLoader={removing}
            text="Remove"
          />
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
          <Input
            bind:value={inputText}
            dataType="text"
            placeholder="Type command..."
            classes="input-mono term-input-field"
            onKeyDown={handleInputKeydown}
          />
          <Button
            classes="btn-primary btn-send"
            onclick={handleRawInput}
            disabled={!inputText.trim()}
            text="&crarr;"
          />
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
          <Pill text="code {terminal.exitCode}" classes={terminal.exitCode !== 0 ? 'pill-exit-error' : 'pill-exit-ok'} />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<ShortcutsHelp open={showShortcutsHelp} onClose={() => { showShortcutsHelp = false; }} />
<CommandPalette bind:open={showCommandPalette} commands={paletteCommands} onClose={() => { showCommandPalette = false; }} />

<style>
  /* ============================================
     Terminal Page — full viewport layout
     ============================================ */

  .term-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - var(--header-height) - 64px);
    height: calc(100dvh - var(--header-height) - 64px);
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

  /* Tabs compact override for term topbar */
  :global(.term-tabs) {
    --tabs-bar-border-bottom: none;
    --tabs-bar-background: var(--ds-gray-200);
    --tabs-bar-padding: 2px;
    --tabs-item-padding: 6px 12px;
    --tabs-item-font-size: var(--text-xs);
    --tabs-indicator-height: 0;
    --tabs-active-color: var(--text-primary);
    --tabs-item-color: var(--text-tertiary);
    border-radius: var(--radius-md);
    border: 1px solid var(--ds-gray-400);
    overflow: hidden;
  }

  /* Shortcuts button */
  .term-shortcuts-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-tertiary);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }

  .term-shortcuts-btn:hover {
    background: var(--component-bg-hover);
    color: var(--text-primary);
  }

  /* CWD display */
  .term-cwd {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  /* Activity indicator */
  .activity-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .activity-active {
    background: #4ade80;
    animation: activity-pulse 600ms ease-in-out infinite;
  }

  .activity-idle {
    background: var(--ds-gray-600);
  }

  @keyframes activity-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.7; }
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

  :global(.term-input-field) {
    --input-container-margin: 0;
    --input-height: 44px;
    flex: 1;
  }

  :global(.btn-send) {
    --button-height: 44px;
    --button-width: 44px;
    --button-padding: 0;
    --button-font-size: 18px;
    flex-shrink: 0;
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
  }
</style>
