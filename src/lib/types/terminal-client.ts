import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import type { CreateTerminalResponse } from './generated';
import type { ConversationMessage, MessagePart, ToolUsePart } from './sessions';

// --- ChatView types ---

export interface ChatViewProps {
  connectionState?: 'connected' | 'connecting' | 'disconnected' | 'idle' | 'reconnecting';
  messages: ConversationMessage[];
  newestFirst?: boolean;
  onCancel?: () => void;
  onSendInput?: (text: string) => void;
  sendDisabled?: boolean;
  sessionEnded?: boolean;
  showHeader?: boolean;
  showInput?: boolean;
}

export interface Command {
  action: () => void;
  label: string;
}

export interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
  open?: boolean;
}

// --- CommandPalette types ---

export interface ConfigPageData {
  activeProvider: string;
  aiProviders: Record<string, boolean>;
}

export interface ConnectionStatusProps {
  onretry?: () => void;
  status: 'connected' | 'disconnected' | 'reconnecting';
}

// --- ConnectionStatus types ---

export type GroupedPart = MessagePart | ToolGroup;

// --- LaunchSheet types ---

export interface LaunchSheetProps {
  apiKey: string;
  onClose: () => void;
  onLaunch: (response: CreateTerminalResponse) => void;
  open?: boolean;
}

export interface LayoutData {
  aiProviders: Record<string, boolean>;
  litellmBaseUrl: string;
  litellmModel: string;
  neurolinkProvider: string;
}

// --- QuickKeys types ---

export interface Preset {
  args: string[];
  command: string;
  label: string;
}

export interface QuickKey {
  escape: string;
  label: string;
}

// --- ShortcutsHelp types ---

export interface QuickKeysProps {
  onKey: (key: string) => void;
}

// --- keyboard-shortcuts types ---

export interface ShareGateProps {
  /** Returns an error message to display, or null on success. */
  onSubmit: (password: string) => Promise<null | string>;
}

// --- xterm-wrapper types ---

export interface ShareSheetProps {
  onClose: () => void;
  open?: boolean;
  shareUrl: string;
  terminalId: string;
}

export interface ShortcutManagerOptions {
  onHelp: () => void;
}

export interface ShortcutsHelpProps {
  onClose: () => void;
  open: boolean;
}

export interface TerminalInstance {
  dispose: () => void;
  fitAddon: FitAddon | null;
  /** Highest output `seq` seen from the server (for Phase 2 reconnect resume). */
  getLastSeq: () => number;
  sendInput: (data: string) => void;
  term: Terminal;
}

// --- Route-level types ---

export interface TerminalOptions {
  apiKey?: string;
  container: HTMLElement;
  fontSize?: number;
  getTicket: () => Promise<string>;
  initialCols?: number;
  initialRows?: number;
  onActivity?: (active: boolean) => void;
  onCwd?: (path: string) => void;
  onDisconnect?: () => void;
  onExit?: (code: number) => void;
  onReconnect?: () => void;
  readOnly?: boolean;
  terminalId?: string;
  wsUrl: string;
}

export interface ToolGroup {
  groupId: string;
  summary: string;
  tools: ToolUsePart[];
  type: 'tool_group';
}

/** Shape of inbound WebSocket messages received by the terminal client. */
export interface WsTerminalInboundMessage {
  active?: boolean;
  bytes?: number;
  code?: number;
  cols?: number;
  data?: string;
  path?: string;
  rows?: number;
  seq?: number;
  type: string;
}
