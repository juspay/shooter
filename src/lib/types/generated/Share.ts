import {
  isJSON,
  decodeString,
  _decodeString,
  decodeNumber,
  _decodeNumber,
  decodeBoolean,
  _decodeBoolean,
} from 'type-decoder';

/**
 * @type { ShareMode }
 * @description What a share guest may do — watch only, or full input control
 */
export type ShareMode = 'view' | 'control';

export function decodeShareMode(rawInput: unknown): ShareMode | null {
  switch (rawInput) {
    case 'view':
    case 'control':
      return rawInput;
  }
  return null;
}

export function _decodeShareMode(rawInput: unknown): ShareMode | undefined {
  switch (rawInput) {
    case 'view':
    case 'control':
      return rawInput;
  }
  return;
}

/**
 * @type { AccessLevel }
 * @description Authorization level resolved for a terminal-scoped request
 */
export type AccessLevel = 'owner' | 'guest';

export function decodeAccessLevel(rawInput: unknown): AccessLevel | null {
  switch (rawInput) {
    case 'owner':
    case 'guest':
      return rawInput;
  }
  return null;
}

export function _decodeAccessLevel(rawInput: unknown): AccessLevel | undefined {
  switch (rawInput) {
    case 'owner':
    case 'guest':
      return rawInput;
  }
  return;
}

/**
 * @type { AccessContext }
 * @description Resolved authorization for a terminal-scoped API request
 */
export type AccessContext = {
  /**
   * @description owner (API key) or guest (share session token)
   * @type { AccessLevel }
   * @memberof AccessContext
   */
  level: AccessLevel;
  /**
   * @description Guest access mode (present only when level is guest)
   * @type { ShareMode }
   * @memberof AccessContext
   */
  mode: ShareMode | null;
};

export function decodeAccessContext(rawInput: unknown): AccessContext | null {
  if (isJSON(rawInput)) {
    const decodedLevel = decodeAccessLevel(rawInput['level']);
    const decodedMode = decodeShareMode(rawInput['mode']);

    if (decodedLevel === null) {
      return null;
    }

    return {
      level: decodedLevel,
      mode: decodedMode,
    };
  }
  return null;
}

/**
 * @type { TerminalShareRecord }
 * @description Persisted share configuration for one terminal (terminal_shares table)
 */
export type TerminalShareRecord = {
  /**
   * @description Terminal this share belongs to (primary key)
   * @type { string }
   * @memberof TerminalShareRecord
   */
  terminalId: string;
  /**
   * @description scrypt:<salt-hex>:<hash-hex> password hash
   * @type { string }
   * @memberof TerminalShareRecord
   */
  passwordHash: string;
  /**
   * @description Access mode granted to guests
   * @type { ShareMode }
   * @memberof TerminalShareRecord
   */
  mode: ShareMode;
  /**
   * @description Unix timestamp (ms) when the share was created
   * @type { number }
   * @memberof TerminalShareRecord
   */
  createdAt: number;
  /**
   * @description Unix timestamp (ms) when the share was last updated
   * @type { number }
   * @memberof TerminalShareRecord
   */
  updatedAt: number;
};

export function decodeTerminalShareRecord(rawInput: unknown): TerminalShareRecord | null {
  if (isJSON(rawInput)) {
    const decodedTerminalId = decodeString(rawInput['terminalId']);
    const decodedPasswordHash = decodeString(rawInput['passwordHash']);
    const decodedMode = decodeShareMode(rawInput['mode']);
    const decodedCreatedAt = decodeNumber(rawInput['createdAt']);
    const decodedUpdatedAt = decodeNumber(rawInput['updatedAt']);

    if (
      decodedTerminalId === null ||
      decodedPasswordHash === null ||
      decodedMode === null ||
      decodedCreatedAt === null ||
      decodedUpdatedAt === null
    ) {
      return null;
    }

    return {
      terminalId: decodedTerminalId,
      passwordHash: decodedPasswordHash,
      mode: decodedMode,
      createdAt: decodedCreatedAt,
      updatedAt: decodedUpdatedAt,
    };
  }
  return null;
}

/**
 * @type { ShareSessionRecord }
 * @description Persisted guest session (share_sessions table); token stored as sha256 hash
 */
export type ShareSessionRecord = {
  /**
   * @description sha256 hex of the guest bearer token (primary key)
   * @type { string }
   * @memberof ShareSessionRecord
   */
  tokenHash: string;
  /**
   * @description Terminal the session grants access to
   * @type { string }
   * @memberof ShareSessionRecord
   */
  terminalId: string;
  /**
   * @description Unix timestamp (ms) when the session was created
   * @type { number }
   * @memberof ShareSessionRecord
   */
  createdAt: number;
  /**
   * @description Unix timestamp (ms) when the session expires (created + 7 days)
   * @type { number }
   * @memberof ShareSessionRecord
   */
  expiresAt: number;
};

export function decodeShareSessionRecord(rawInput: unknown): ShareSessionRecord | null {
  if (isJSON(rawInput)) {
    const decodedTokenHash = decodeString(rawInput['tokenHash']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);
    const decodedCreatedAt = decodeNumber(rawInput['createdAt']);
    const decodedExpiresAt = decodeNumber(rawInput['expiresAt']);

    if (
      decodedTokenHash === null ||
      decodedTerminalId === null ||
      decodedCreatedAt === null ||
      decodedExpiresAt === null
    ) {
      return null;
    }

    return {
      tokenHash: decodedTokenHash,
      terminalId: decodedTerminalId,
      createdAt: decodedCreatedAt,
      expiresAt: decodedExpiresAt,
    };
  }
  return null;
}

/**
 * @type { ShareInfoResponse }
 * @description Owner view of a terminal's share state (GET /api/terminals/[id]/share)
 */
export type ShareInfoResponse = {
  /**
   * @description Whether sharing is currently enabled for this terminal
   * @type { boolean }
   * @memberof ShareInfoResponse
   */
  active: boolean;
  /**
   * @description Current access mode (present when active)
   * @type { ShareMode }
   * @memberof ShareInfoResponse
   */
  mode: ShareMode | null;
  /**
   * @description Unix timestamp (ms) when the share was created (present when active)
   * @type { number }
   * @memberof ShareInfoResponse
   */
  createdAt: number | null;
  /**
   * @description Unix timestamp (ms) when the share was last updated (present when active)
   * @type { number }
   * @memberof ShareInfoResponse
   */
  updatedAt: number | null;
};

export function decodeShareInfoResponse(rawInput: unknown): ShareInfoResponse | null {
  if (isJSON(rawInput)) {
    const decodedActive = decodeBoolean(rawInput['active']);
    const decodedMode = decodeShareMode(rawInput['mode']);
    const decodedCreatedAt = decodeNumber(rawInput['createdAt']);
    const decodedUpdatedAt = decodeNumber(rawInput['updatedAt']);

    if (decodedActive === null) {
      return null;
    }

    return {
      active: decodedActive,
      mode: decodedMode,
      createdAt: decodedCreatedAt,
      updatedAt: decodedUpdatedAt,
    };
  }
  return null;
}

/**
 * @type { ShareStatusResponse }
 * @description Public probe response (GET /api/terminals/[id]/share/status)
 */
export type ShareStatusResponse = {
  /**
   * @description Whether a share exists for this terminal
   * @type { boolean }
   * @memberof ShareStatusResponse
   */
  shared: boolean;
};

export function decodeShareStatusResponse(rawInput: unknown): ShareStatusResponse | null {
  if (isJSON(rawInput)) {
    const decodedShared = decodeBoolean(rawInput['shared']);

    if (decodedShared === null) {
      return null;
    }

    return {
      shared: decodedShared,
    };
  }
  return null;
}

/**
 * @type { ShareAuthRequest }
 * @description Guest password exchange request (POST /api/terminals/[id]/share/auth)
 */
export type ShareAuthRequest = {
  /**
   * @description The share password
   * @type { string }
   * @memberof ShareAuthRequest
   */
  password: string;
};

export function decodeShareAuthRequest(rawInput: unknown): ShareAuthRequest | null {
  if (isJSON(rawInput)) {
    const decodedPassword = decodeString(rawInput['password']);

    if (decodedPassword === null) {
      return null;
    }

    return {
      password: decodedPassword,
    };
  }
  return null;
}

/**
 * @type { ShareAuthResponse }
 * @description Guest session issued after successful password exchange
 */
export type ShareAuthResponse = {
  /**
   * @description Guest bearer token (64-char hex, shown once)
   * @type { string }
   * @memberof ShareAuthResponse
   */
  token: string;
  /**
   * @description Access mode granted by this session
   * @type { ShareMode }
   * @memberof ShareAuthResponse
   */
  mode: ShareMode;
  /**
   * @description Unix timestamp (ms) when this session expires
   * @type { number }
   * @memberof ShareAuthResponse
   */
  expiresAt: number;
};

export function decodeShareAuthResponse(rawInput: unknown): ShareAuthResponse | null {
  if (isJSON(rawInput)) {
    const decodedToken = decodeString(rawInput['token']);
    const decodedMode = decodeShareMode(rawInput['mode']);
    const decodedExpiresAt = decodeNumber(rawInput['expiresAt']);

    if (decodedToken === null || decodedMode === null || decodedExpiresAt === null) {
      return null;
    }

    return {
      token: decodedToken,
      mode: decodedMode,
      expiresAt: decodedExpiresAt,
    };
  }
  return null;
}

/**
 * @type { ShareConfigRequest }
 * @description Owner create/update share request (PUT /api/terminals/[id]/share)
 */
export type ShareConfigRequest = {
  /**
   * @description New share password (min 6 chars; required on create, optional on update)
   * @type { string }
   * @memberof ShareConfigRequest
   */
  password: string | null;
  /**
   * @description Access mode to grant guests
   * @type { ShareMode }
   * @memberof ShareConfigRequest
   */
  mode: ShareMode;
};

export function decodeShareConfigRequest(rawInput: unknown): ShareConfigRequest | null {
  if (isJSON(rawInput)) {
    const decodedPassword = decodeString(rawInput['password']);
    const decodedMode = decodeShareMode(rawInput['mode']);

    if (decodedMode === null) {
      return null;
    }

    return {
      password: decodedPassword,
      mode: decodedMode,
    };
  }
  return null;
}
