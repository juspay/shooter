// Activity feed types that require union types not expressible in type-crafter YAML.

/** A single content block within a WebSocket session message. */
export interface ActivityContentBlock {
  content?: string;
  is_error?: boolean;
  name?: string;
  text?: string;
  type: string;
}

/** A conversation message from a Claude Code session history batch.
 *  Uses a union type (string | array) which the YAML schema cannot express. */
export interface ActivitySessionMessage {
  content: ActivityContentBlock[] | string;
  role: string;
  timestamp?: string;
}
