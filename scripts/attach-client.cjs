/**
 * `shooter attach` — pipe a local terminal into a Shooter-owned PTY.
 *
 * Shooter's holder architecture already keeps a PTY alive across server
 * restarts, and the browser/phone can drive it over /ws/terminal/<id>. This is
 * the missing third client: it lets the machine that owns the work keep using a
 * real terminal instead of forcing everything through a web xterm.
 *
 * The pure helpers below carry the logic worth testing; attach() is the I/O
 * wiring around them.
 */

'use strict';

/** Ctrl-] — detach without killing the PTY. Chosen because it is not bound by
 *  shells or by Claude Code, and Ctrl-C must stay available to the PTY. */
const DETACH_BYTE = 0x1d;

/** Build the WebSocket upgrade URL for a terminal channel. */
function buildAttachUrl(baseUrl, terminalId, ticket) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsBase}/ws/terminal/${encodeURIComponent(terminalId)}?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * Translate a server frame into a terminal action. Anything unrecognised is
 * ignored rather than thrown — a new server frame type must never crash an
 * attached client.
 */
function decodeServerFrame(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { kind: 'ignore' };
  }
  if (!msg || typeof msg !== 'object') {
    return { kind: 'ignore' };
  }

  switch (msg.type) {
    case 'error':
      return { kind: 'error', message: String(msg.message ?? 'unknown error') };
    case 'exit':
      return { code: typeof msg.code === 'number' ? msg.code : 0, kind: 'exit' };
    case 'output':
    // Scrollback is replayed history — it renders exactly like live output.
    case 'scrollback':
      return { data: typeof msg.data === 'string' ? msg.data : '', kind: 'output' };
    case 'output-dropped':
      return {
        kind: 'notice',
        message: `output truncated (${msg.bytes ?? 0} bytes dropped — the PTY outran this client)`,
      };
    default:
      return { kind: 'ignore' };
  }
}

/**
 * Split a raw stdin chunk at the detach key. Bytes typed before it still belong
 * to the PTY; the key itself must never be forwarded.
 */
function splitOnDetach(chunk) {
  const index = chunk.indexOf(DETACH_BYTE);
  if (index === -1) {
    return { before: chunk, detached: false };
  }
  return { before: chunk.subarray(0, index), detached: true };
}

/** Exchange the API key for a short-lived single-use WebSocket ticket. */
async function requestTicket(baseUrl, apiKey) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const response = await fetch(`${base}/api/ws-ticket`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Could not get a WebSocket ticket (HTTP ${response.status})`);
  }
  const body = await response.json();
  if (!body || typeof body.ticket !== 'string') {
    throw new Error('Server did not return a ticket');
  }
  return body.ticket;
}

/** Fetch the terminal list so `attach` can resolve or list ids. */
async function listTerminals(baseUrl, apiKey) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const response = await fetch(`${base}/api/terminals`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Could not list terminals (HTTP ${response.status})`);
  }
  const body = await response.json();
  return Array.isArray(body.terminals) ? body.terminals : [];
}

/**
 * Attach the current process's stdin/stdout to a Shooter terminal.
 * Resolves with the exit code to use.
 */
async function attach(options) {
  const { apiKey, baseUrl, terminalId } = options;
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;

  const WebSocket = require('ws');
  const ticket = await requestTicket(baseUrl, apiKey);
  const socket = new WebSocket(buildAttachUrl(baseUrl, terminalId, ticket));

  const wasRaw = Boolean(stdin.isRaw);
  let restored = false;

  const restore = () => {
    if (restored) {
      return;
    }
    restored = true;
    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(wasRaw);
    }
    stdin.pause();
    stdin.removeListener('data', onStdin);
    process.removeListener('SIGWINCH', onResize);
  };

  const send = (payload) => {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(payload));
    }
  };

  function onStdin(chunk) {
    const { before, detached } = splitOnDetach(chunk);
    if (before.length > 0) {
      send({ data: before.toString('utf8'), type: 'input' });
    }
    if (detached) {
      stdout.write('\r\n[detached — the session keeps running]\r\n');
      restore();
      socket.close();
    }
  }

  function onResize() {
    if (stdout.columns && stdout.rows) {
      send({ cols: stdout.columns, rows: stdout.rows, type: 'resize' });
    }
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      restore();
      resolve(code);
    };

    socket.on('open', () => {
      if (stdin.isTTY && stdin.setRawMode) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.on('data', onStdin);
      process.on('SIGWINCH', onResize);
      onResize(); // adopt the local terminal's size immediately
      stdout.write(`[attached to ${terminalId} — press Ctrl-] to detach]\r\n`);
    });

    socket.on('message', (raw) => {
      const frame = decodeServerFrame(typeof raw === 'string' ? raw : raw.toString('utf8'));
      if (frame.kind === 'output') {
        stdout.write(frame.data);
      } else if (frame.kind === 'notice') {
        stdout.write(`\r\n[${frame.message}]\r\n`);
      } else if (frame.kind === 'error') {
        stdout.write(`\r\n[error: ${frame.message}]\r\n`);
      } else if (frame.kind === 'exit') {
        stdout.write(`\r\n[terminal exited with code ${frame.code}]\r\n`);
        socket.close();
        finish(frame.code);
      }
    });

    socket.on('close', () => {
      finish(0);
    });

    socket.on('error', (err) => {
      restore();
      if (!settled) {
        settled = true;
        reject(new Error(`WebSocket error: ${err.message || err}`));
      }
    });
  });
}

module.exports = {
  DETACH_BYTE,
  attach,
  buildAttachUrl,
  decodeServerFrame,
  listTerminals,
  requestTicket,
  splitOnDetach,
};
