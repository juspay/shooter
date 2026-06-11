<script lang="ts">
  import type {
    ConversationMessage,
    MessagePart,
    ShareAuthResponse,
    ShareMode,
    ShareStatusResponse,
    ShooterConfig,
    TerminalDetailView,
    ToolUsePart,
  } from '$lib/types';

  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw';
  import { AI_COMMANDS } from '$lib/modules/client/common';
  import ChatView from '$lib/modules/client/terminal/ChatView.svelte';
  import CommandPalette from '$lib/modules/client/terminal/CommandPalette.svelte';
  import ConnectionStatus from '$lib/modules/client/terminal/ConnectionStatus.svelte';
  import { createShortcutManager } from '$lib/modules/client/terminal/keyboard-shortcuts';
  import QuickKeys from '$lib/modules/client/terminal/QuickKeys.svelte';
  import ShareGate from '$lib/modules/client/terminal/ShareGate.svelte';
  import ShareSheet from '$lib/modules/client/terminal/ShareSheet.svelte';
  import ShortcutsHelp from '$lib/modules/client/terminal/ShortcutsHelp.svelte';
  import {
    Button,
    EmptyState,
    Icon,
    Input,
    Pill,
    Tabs,
    Tooltip,
  } from '@juspay/svelte-ui-components';
  import { onDestroy, onMount } from 'svelte';

  // ------- Constants -------

  // ------- Reactive state -------

  let terminal = $state<null | TerminalDetailView>(null);
  let loading = $state(true);
  let error = $state<null | string>(null);
  let killing = $state(false);
  let removing = $state(false);
  let isActive = $state(false);
  let currentCwd = $state<null | string>(null);
  let viewMode = $state<'chat' | 'raw'>('raw');
  let rawConnectionStatus = $state<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  let chatConnectionStatus = $state<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  let inputText = $state('');
  let chatMessages = $state<ConversationMessage[]>([]);
  let chatSessionEnded = $state(false);
  let authMode = $state<'guest' | 'owner' | null>(null);
  let guestMode = $state<null | ShareMode>(null);
  let shareGateVisible = $state(false);
  let shareSheetOpen = $state(false);

  // DOM references
  let termContainer = $state<HTMLDivElement | null>(null);
  let inputRef = $state<null | { focus: () => void }>(null);

  // WebSocket and terminal instance refs (not reactive)
  let termInstance: null | {
    dispose: () => void;
    sendInput: (data: string) => void;
    term: { cols: number; rows: number };
  } = null;
  let shortcutManager: null | { destroy: () => void } = null;
  let showShortcutsHelp = $state(false);
  let showCommandPalette = $state(false);
  let sessionWs: null | WebSocket = null;
  let sessionReconnectTimer: null | ReturnType<typeof setTimeout> = null;
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
  const connectionStatus = $derived(
    viewMode === 'raw' ? rawConnectionStatus : chatConnectionStatus
  );
  const tabActiveIndex = $derived(viewMode === 'raw' ? 0 : 1);
  const displayCwd = $derived(shortenPath(currentCwd || terminal?.cwd || ''));
  const isOwner = $derived(authMode === 'owner');
  const viewOnly = $derived(authMode === 'guest' && guestMode === 'view');
  const shareUrl = $derived(
    typeof window !== 'undefined' ? `${window.location.origin}/terminals/${terminalId}` : ''
  );
  const paletteCommands = $derived.by((): { action: () => void; label: string }[] => {
    const cmds: { action: () => void; label: string }[] = [
      { action: (): void => void goto('/'), label: 'Go to Home' },
      { action: (): void => void goto('/terminals'), label: 'Go to Terminals' },
      { action: (): void => void goto('/config'), label: 'Go to Settings' },
      {
        action: (): void => {
          showShortcutsHelp = true;
        },
        label: 'Show keyboard shortcuts',
      },
    ];
    if (isRunning && isOwner) {
      cmds.push({ action: (): void => void killTerminal(), label: 'Kill terminal' });
    }
    return cmds;
  });

  // ------- Helpers -------

  function shortenPath(p: string): string {
    if (!p) {
      return '';
    }
    const home = typeof window !== 'undefined' ? '' : '';
    let display = p;
    // Replace home prefix with ~
    if (typeof navigator !== 'undefined') {
      // Best effort home detection from path
      const parts = p.split('/');
      if (parts.length >= 3 && parts[1] === 'Users') {
        display = `~/${parts.slice(3).join('/')}`;
      } else if (parts.length >= 3 && parts[1] === 'home') {
        display = `~/${parts.slice(3).join('/')}`;
      }
    }
    // Show last 2 segments if too long
    if (display.length > 30) {
      const segs = display.split('/');
      if (segs.length > 2) {
        return `.../${segs.slice(-2).join('/')}`;
      }
    }
    return display || home;
  }

  function getConfig(): null | { apiKey: string } {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (!saved) {
        return null;
      }
      const parsed = JSON.parse(saved) as ShooterConfig;
      if (typeof parsed?.apiKey === 'string' && parsed.apiKey) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ------- Guest share tokens -------

  const SHARE_TOKENS_KEY = 'shooter_share_tokens';

  function getShareToken(): null | string {
    const id = terminalId;
    if (!id) {
      return null;
    }
    try {
      const raw = localStorage.getItem(SHARE_TOKENS_KEY);
      if (!raw) {
        return null;
      }
      const map = JSON.parse(raw) as Record<string, string>;
      return typeof map[id] === 'string' ? map[id] : null;
    } catch {
      return null;
    }
  }

  function storeShareToken(token: string): void {
    const id = terminalId;
    if (!id) {
      return;
    }
    let map: Record<string, string> = {};
    try {
      map = JSON.parse(localStorage.getItem(SHARE_TOKENS_KEY) ?? '{}') as Record<string, string>;
    } catch {
      // Corrupt entry — start fresh.
    }
    map[id] = token;
    localStorage.setItem(SHARE_TOKENS_KEY, JSON.stringify(map));
  }

  /** Bearer for API calls: the owner's API key, or this terminal's guest token. */
  function getBearer(): null | string {
    return getConfig()?.apiKey ?? getShareToken();
  }

  // ------- API calls -------

  async function fetchTerminal(): Promise<void> {
    if (!browser) {
      return;
    }

    const config = getConfig();
    const bearer = config?.apiKey ?? getShareToken();
    if (!bearer) {
      await checkShareAccess();
      return;
    }

    try {
      const res = await fetch(`/api/terminals/${terminalId}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (res.status === 401 && !config) {
        // Stale/revoked guest token — fall back to the password gate.
        await checkShareAccess();
        return;
      }
      if (!res.ok) {
        error = res.status === 404 ? 'Terminal not found' : 'Failed to load terminal';
        loading = false;
        return;
      }
      terminal = (await res.json()) as TerminalDetailView;
      if (config) {
        authMode = 'owner';
      } else {
        authMode = 'guest';
        guestMode = terminal.shareMode ?? 'view';
      }
    } catch {
      error = 'Failed to connect to server';
    }
    loading = false;
  }

  async function checkShareAccess(): Promise<void> {
    try {
      const res = await fetch(`/api/terminals/${terminalId}/share/status`);
      if (res.ok) {
        const data = (await res.json()) as ShareStatusResponse;
        if (data.shared) {
          shareGateVisible = true;
          loading = false;
          return;
        }
      }
    } catch {
      // Fall through to the configuration error.
    }
    error = 'No configuration found. Please configure settings first.';
    loading = false;
  }

  async function submitSharePassword(password: string): Promise<null | string> {
    try {
      const res = await fetch(`/api/terminals/${terminalId}/share/auth`, {
        body: JSON.stringify({ password }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (res.status === 429) {
        return 'Too many attempts — try again in a minute.';
      }
      if (!res.ok) {
        return 'Incorrect password.';
      }
      const data = (await res.json()) as ShareAuthResponse;
      storeShareToken(data.token);
      shareGateVisible = false;
      loading = true;
      await fetchTerminal();
      if (terminal && !error) {
        initViews();
      }
      return null;
    } catch {
      return 'Failed to reach the server.';
    }
  }

  async function getWsTicket(): Promise<null | string> {
    const bearer = getBearer();
    if (!bearer) {
      return null;
    }
    try {
      const res = await fetch('/api/ws-ticket', {
        headers: { Authorization: `Bearer ${bearer}` },
        method: 'POST',
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as { ticket: string };
      return data.ticket;
    } catch {
      return null;
    }
  }

  async function killTerminal(): Promise<void> {
    if (!terminal || killing) {
      return;
    }
    const config = getConfig();
    if (!config) {
      return;
    }

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
    if (!terminal || removing) {
      return;
    }
    const config = getConfig();
    if (!config) {
      return;
    }

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
    if (!termContainer || !terminal || disposed) {
      return;
    }

    // Build the WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${terminal.ws}`;

    const getTicket = async (): Promise<string> => {
      const ticket = await getWsTicket();
      if (!ticket) {
        throw new Error('Failed to obtain WebSocket ticket');
      }
      return ticket;
    };

    try {
      const { createTerminal } = await import('$lib/modules/client/terminal/xterm-wrapper');

      if (disposed || !termContainer) {
        return;
      }

      const instance = await createTerminal({
        apiKey: getBearer() ?? undefined,
        container: termContainer,
        fontSize: window.innerWidth < 768 ? 12 : 14,
        getTicket,
        initialCols: terminal.cols ?? undefined,
        initialRows: terminal.rows ?? undefined,
        onActivity: (active: boolean) => {
          if (!disposed) {
            isActive = active;
          }
        },
        onCwd: (path: string) => {
          if (!disposed) {
            currentCwd = path;
          }
        },
        onDisconnect: () => {
          if (!disposed) {
            rawConnectionStatus = 'reconnecting';
          }
        },
        onExit: (code: number) => {
          if (!disposed && terminal) {
            terminal = {
              ...terminal,
              exitCode: code,
              exitedAt: new Date().toISOString(),
              status: 'exited',
            };
            rawConnectionStatus = 'disconnected';
          }
        },
        onReconnect: () => {
          if (!disposed) {
            rawConnectionStatus = 'connected';
          }
        },
        readOnly: viewOnly,
        terminalId,
        wsUrl,
      });

      if (disposed) {
        instance.dispose();
        return;
      }

      termInstance = instance;
      rawConnectionStatus = 'connected';
    } catch (err) {
      console.error('Failed to initialize terminal:', err);
      rawConnectionStatus = 'disconnected';
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
    if (!terminal || disposed) {
      return;
    }

    // Guard against concurrent reconnects: skip if already OPEN or CONNECTING
    if (
      sessionWs &&
      (sessionWs.readyState === WebSocket.OPEN || sessionWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ticket = await getWsTicket();
    if (!ticket || disposed || !terminal) {
      chatConnectionStatus = 'disconnected';
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${terminal.sessionWs}?ticket=${ticket}`;

    sessionWs = new WebSocket(wsUrl);

    sessionWs.onopen = (): void => {
      if (!disposed) {
        chatConnectionStatus = 'connected';
        sessionWs?.send(JSON.stringify({ sessionId: terminalId, type: 'subscribe' }));
      }
    };

    sessionWs.onmessage = (event: MessageEvent): void => {
      if (disposed) {
        return;
      }
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        handleSessionMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    sessionWs.onclose = (): void => {
      if (!disposed && terminal?.status === 'running') {
        chatConnectionStatus = 'reconnecting';
        // Clear any existing reconnect timer to avoid stacking
        if (sessionReconnectTimer) {
          clearTimeout(sessionReconnectTimer);
        }
        // Reconnect after delay (will fetch a fresh ticket)
        sessionReconnectTimer = setTimeout(() => {
          sessionReconnectTimer = null;
          if (!disposed && terminal?.status === 'running') {
            void connectSessionWs();
          }
        }, 2000);
      }
    };

    sessionWs.onerror = (): void => {
      if (!disposed) {
        chatConnectionStatus = 'disconnected';
      }
    };
  }

  /** Get a typed snapshot of chatMessages. */
  function getChatMessages(): ConversationMessage[] {
    return chatMessages;
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
      const roleStr = typeof msg.role === 'string' ? msg.role : 'assistant';
      const role: ConversationMessage['role'] =
        roleStr === 'user' ? 'user' : roleStr === 'system' ? 'system' : 'assistant';
      const newMsg: ConversationMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parts: (msg.content as MessagePart[]) || [],
        role,
        timestamp:
          (typeof msg.timestamp === 'string' ? msg.timestamp : '') || new Date().toISOString(),
      };
      chatMessages = getChatMessages().concat(newMsg);
    } else if (msg.type === 'tool-use') {
      // Append tool use as an assistant message fragment
      const toolPart: ToolUsePart = {
        id: (msg.id as string) || `tool-${Date.now()}`,
        input: (msg.input as Record<string, unknown>) || {},
        toolName: msg.name as string,
        type: 'tool_use',
      };
      const newMsg: ConversationMessage = {
        id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parts: [toolPart],
        role: 'assistant',
        timestamp: new Date().toISOString(),
      };
      chatMessages = getChatMessages().concat(newMsg);
    } else if (msg.type === 'tool-result') {
      const resultPart: MessagePart = {
        isError: (msg.isError as boolean) || false,
        output: (msg.output as string) || '',
        toolUseId: msg.id as string,
        type: 'tool_result',
      };
      const newMsg: ConversationMessage = {
        id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parts: [resultPart],
        role: 'system',
        timestamp: new Date().toISOString(),
      };
      chatMessages = getChatMessages().concat(newMsg);
    } else if (msg.type === 'thinking') {
      // Append thinking block to the last assistant message
      const thinkPart: MessagePart = {
        content: (msg.text as string) || '',
        type: 'thinking',
      };
      const current: ConversationMessage[] = getChatMessages();
      const lastIdx = current.length - 1;
      if (lastIdx >= 0 && current[lastIdx].role === 'assistant') {
        const prev = current[lastIdx];
        const updated: ConversationMessage = {
          id: prev.id,
          parts: prev.parts.concat(thinkPart),
          role: prev.role,
          timestamp: prev.timestamp,
        };
        chatMessages = [...current.slice(0, lastIdx), updated];
      } else {
        const newMsg: ConversationMessage = {
          id: `think-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parts: [thinkPart],
          role: 'assistant',
          timestamp: new Date().toISOString(),
        };
        chatMessages = current.concat(newMsg);
      }
    } else if (msg.type === 'error') {
      // Server-sent error — display as a system message
      const errorPart: MessagePart = {
        content: (msg.message as string) || 'Unknown error',
        type: 'text',
      };
      const newMsg: ConversationMessage = {
        id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parts: [errorPart],
        role: 'system',
        timestamp: new Date().toISOString(),
      };
      chatMessages = getChatMessages().concat(newMsg);
    } else if (msg.type === 'session-end') {
      chatSessionEnded = true;
      if (terminal) {
        terminal = { ...terminal, status: 'exited' };
      }
    }
  }

  function disconnectSessionWs(): void {
    if (sessionReconnectTimer) {
      clearTimeout(sessionReconnectTimer);
      sessionReconnectTimer = null;
    }
    if (sessionWs) {
      sessionWs.onclose = null;
      sessionWs.close();
      sessionWs = null;
    }
  }

  // ------- Input handling -------

  function handleRawInput(): void {
    if (!inputText.trim()) {
      return;
    }
    // Send the text as raw PTY input with a newline via the xterm wrapper's WebSocket
    if (termInstance && rawConnectionStatus === 'connected') {
      termInstance.sendInput(`${inputText}\r`);
    }
    inputText = '';
    inputRef?.focus();
  }

  function handleChatSendInput(text: string): void {
    if (!text.trim() || sessionWs?.readyState !== WebSocket.OPEN) {
      return;
    }
    sessionWs.send(JSON.stringify({ text, type: 'send-input' }));
  }

  function handleChatCancel(): void {
    if (sessionWs?.readyState === WebSocket.OPEN) {
      sessionWs.send(JSON.stringify({ type: 'cancel' }));
    }
  }

  function handleQuickKey(key: string): void {
    if (viewMode === 'raw') {
      if (termInstance && rawConnectionStatus === 'connected') {
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRawInput();
    }
  }

  // ------- View mode switching -------

  // Track whether each mode has been initialized at least once
  let rawInitialized = false;
  let chatInitialized = false;

  function setViewMode(mode: 'chat' | 'raw'): void {
    if (mode === viewMode) {
      return;
    }
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
      rawConnectionStatus = 'reconnecting';
      void initRawTerminal();
      rawInitialized = true;
    } else {
      disconnectSessionWs();
      chatConnectionStatus = 'reconnecting';
      void connectSessionWs();
      chatInitialized = true;
    }
  }

  // ------- Lifecycle -------

  function initViews(): void {
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
  }

  onMount(async () => {
    await fetchTerminal();
    if (disposed) {
      return;
    }

    // Set up keyboard shortcuts
    shortcutManager = createShortcutManager({
      onHelp: () => {
        showShortcutsHelp = !showShortcutsHelp;
      },
    });

    if (!terminal || error) {
      return;
    }

    initViews();
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
{:else if shareGateVisible}
  <div class="term-page">
    <ShareGate onSubmit={submitSharePassword} />
  </div>
{:else if error}
  <main class="main">
    <div class="session-back-row">
      <a href="/terminals" class="back-link">
        <span class="back-arrow">&larr;</span>
        Terminals
      </a>
    </div>
    <EmptyState title="Error" description={error}>
      {#snippet icon()}<Icon svg={AlertTriangleSvg} classes="icon-24" />{/snippet}
    </EmptyState>
  </main>
{:else if terminal}
  <div class="term-page">
    <!-- Top Bar -->
    <div class="term-topbar">
      <div class="term-topbar-left">
        {#if isOwner}
          <a href="/terminals" class="term-back" aria-label="Back to terminals">&larr;</a>
        {/if}
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
        {#if isOwner && isAI && (terminal as TerminalDetailView & { sessionFile?: string })?.sessionFile}
          {@const sessionFile =
            (terminal as TerminalDetailView & { sessionFile?: string }).sessionFile ?? ''}
          <a
            href="/session/{sessionFile.split(/[\\/]/).pop()?.replace('.jsonl', '') || ''}"
            class="term-session-link"
            title="View session history"
          >
            Session
          </a>
        {/if}
      </div>

      <div class="term-topbar-right">
        {#if isAI}
          <Tabs
            items={tabItems}
            activeIndex={tabActiveIndex}
            onchange={(index: number): void => {
              setViewMode(index === 0 ? 'raw' : 'chat');
            }}
            classes="term-tabs"
          />
        {/if}

        <Button
          classes="term-shortcuts-btn"
          onclick={(): void => {
            showShortcutsHelp = !showShortcutsHelp;
          }}
          text="?"
          ariaLabel="Keyboard shortcuts"
        />

        {#if isOwner}
          <Button
            classes="btn-secondary btn-sm"
            onclick={(): void => {
              shareSheetOpen = true;
            }}
            text="Share"
          />
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
        {/if}
      </div>
    </div>

    <!-- Body: both views always rendered, toggled via CSS display to preserve WebSocket connections -->

    <!-- Raw Terminal View -->
    <div
      class="term-body"
      bind:this={termContainer}
      style:display={viewMode === 'raw' ? 'flex' : 'none'}
    ></div>

    <!-- Raw Input Bar + Quick Keys -->
    {#if isRunning && viewMode === 'raw' && !viewOnly}
      <div class="term-input-area">
        <QuickKeys onKey={handleQuickKey} />
        <div class="term-input-bar">
          <Input
            bind:value={inputText}
            bind:this={inputRef}
            dataType="text"
            useTextArea={true}
            placeholder="Type command... (Shift+Enter for new line)"
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
        showInput={isRunning && !viewOnly}
        onSendInput={handleChatSendInput}
        onCancel={handleChatCancel}
      />
    </div>

    <!-- Exited overlay for non-running terminals -->
    {#if !isRunning}
      <div class="term-exited-bar">
        <span>Process exited</span>
        {#if terminal.exitCode !== null}
          <Pill
            text="code {terminal.exitCode}"
            classes={terminal.exitCode !== 0 ? 'pill-exit-error' : 'pill-exit-ok'}
          />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<ShortcutsHelp
  open={showShortcutsHelp}
  onClose={(): void => {
    showShortcutsHelp = false;
  }}
/>
<ShareSheet
  open={shareSheetOpen}
  terminalId={terminalId ?? ''}
  {shareUrl}
  onClose={(): void => {
    shareSheetOpen = false;
  }}
/>
<CommandPalette
  bind:open={showCommandPalette}
  commands={paletteCommands}
  onClose={(): void => {
    showCommandPalette = false;
  }}
/>

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
  :global(.term-shortcuts-btn) {
    --button-height: 28px;
    --button-width: 28px;
    --button-padding: 0;
    --button-border-radius: var(--radius-sm);
    --button-border: 1px solid var(--border);
    --button-color: transparent;
    --button-text-color: var(--text-tertiary);
    --button-font-size: 14px;
    --button-font-weight: 600;
    --button-hover-color: var(--component-bg-hover);
    --button-hover-text-color: var(--text-primary);
    flex-shrink: 0;
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

  /* Session cross-link */
  .term-session-link {
    font-size: 11px;
    font-weight: 500;
    color: var(--ds-blue-900);
    text-decoration: none;
    white-space: nowrap;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--ds-blue-400);
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .term-session-link:hover {
    background: var(--ds-blue-100);
    color: var(--ds-blue-1000);
  }

  /* Activity indicator */
  .activity-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .activity-active {
    background: var(--ds-green-500);
    animation: activity-pulse 600ms ease-in-out infinite;
  }

  .activity-idle {
    background: var(--ds-gray-600);
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
    background: var(--ds-background-200, #0a0a0f);
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
