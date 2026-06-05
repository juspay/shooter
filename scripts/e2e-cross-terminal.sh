#!/usr/bin/env bash
# Shooter cross-terminal E2E smoke test
# Usage: API_KEY=<key> PORT=54818 bash scripts/e2e-cross-terminal.sh
# Pre-requisites: build/handler.js must exist (run pnpm build first)
# Required env: API_KEY (default: e2e-test-key), PORT (default: 54818)
#
# Boots the real server and exercises the live HTTP + WebSocket + PTY stack for
# two independent terminals (A and B), then tears everything down (including the
# intentionally-detached pty-holder processes). Exits non-zero on any failure.
# NOTE: this smoke test verifies each terminal's own I/O, not A->coordinator->B
# relay routing — relay is covered by the SoS suite.

set -euo pipefail

PORT="${PORT:-54818}"
API_KEY="${API_KEY:-e2e-test-key}"
BASE="http://localhost:${PORT}"
HOME_DIR="${HOME}"
LOG="/tmp/shooter-e2e-$$.log"
# Keep the WS client INSIDE the project dir so Node resolves the local `ws` package.
WS_SCRIPT="$(pwd)/.shooter-e2e-ws-$$.mjs"
TERM_A_ID=""
TERM_B_ID=""
SERVER_PID=""

cleanup() {
  [ -n "${TERM_A_ID:-}" ] && curl -s -X DELETE -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/terminals/${TERM_A_ID}" > /dev/null || true
  [ -n "${TERM_B_ID:-}" ] && curl -s -X DELETE -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/terminals/${TERM_B_ID}" > /dev/null || true
  # Terminate the server we started by its own PID; fall back to a port sweep only
  # if we never captured it (avoids killing an unrelated process on this port).
  if [ -n "${SERVER_PID:-}" ]; then
    kill "${SERVER_PID}" 2>/dev/null || true
  else
    lsof -ti "tcp:${PORT}" | xargs kill -9 2>/dev/null || true
  fi
  [ -n "${TERM_A_ID:-}" ] && pkill -f "pty-holder.cjs ${TERM_A_ID}" 2>/dev/null || true
  [ -n "${TERM_B_ID:-}" ] && pkill -f "pty-holder.cjs ${TERM_B_ID}" 2>/dev/null || true
  [ -n "${TERM_A_ID:-}" ] && rm -f "/tmp/shooter-term-${TERM_A_ID}.sock" || true
  [ -n "${TERM_B_ID:-}" ] && rm -f "/tmp/shooter-term-${TERM_B_ID}.sock" || true
  rm -f "${LOG}" "${WS_SCRIPT}"
  echo "TEARDOWN_COMPLETE"
}
trap cleanup EXIT

echo "=== Shooter Cross-Terminal E2E (port=${PORT}) ==="

# 0. Verify build
[ -f "build/handler.js" ] || { echo "ERROR: build/handler.js not found. Run pnpm build first."; exit 1; }

# 1. Start server
API_KEY="${API_KEY}" PORT="${PORT}" npx tsx server.ts > "${LOG}" 2>&1 &
SERVER_PID=$!
echo "Server PID: ${SERVER_PID}"

# 2. Wait for health
echo "Waiting for server..."
for i in $(seq 1 15); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/health" 2>/dev/null || true)
  [ "${STATUS}" = "200" ] && { echo "Server up after $((i*2))s"; break; }
  sleep 2
done

# A: Health
echo ""; echo "=== A: Health ==="
HEALTH=$(curl -s -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/health")
echo "${HEALTH}"
echo "${HEALTH}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='healthy', d"
echo "PASS: health=healthy"

# B: Sessions
echo ""; echo "=== B: Sessions ==="
SESSIONS=$(curl -s -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/sessions")
COUNT=$(echo "${SESSIONS}" | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])")
echo "Sessions: ${COUNT}"
[ "${COUNT}" -gt 0 ] && echo "PASS: count=${COUNT}" || echo "WARN: 0 sessions"

# C: Detect
echo ""; echo "=== C: Detect ==="
DETECT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/sessions/detect")
[ "${DETECT_STATUS}" = "200" ] && echo "PASS: detect=200" || { echo "FAIL: detect=${DETECT_STATUS}"; exit 1; }

# D: Create terminals
echo ""; echo "=== D: Create terminals ==="
TERM_A=$(curl -s -X POST -H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" \
  -d "{\"command\":\"bash\",\"cwd\":\"${HOME_DIR}\"}" "${BASE}/api/terminals")
TERM_A_ID=$(echo "${TERM_A}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Terminal A: id=${TERM_A_ID}"

TERM_B=$(curl -s -X POST -H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" \
  -d "{\"command\":\"bash\",\"cwd\":\"${HOME_DIR}\"}" "${BASE}/api/terminals")
TERM_B_ID=$(echo "${TERM_B}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Terminal B: id=${TERM_B_ID}"

# E/F/G: WebSocket checks via temp .mjs file
cat > "${WS_SCRIPT}" << JSEOF
import { WebSocket } from 'ws';

const BASE_URL = '${BASE}';
const WS_BASE  = 'ws://localhost:${PORT}';
const API_KEY  = '${API_KEY}';
const TERM_A   = '${TERM_A_ID}';
const TERM_B   = '${TERM_B_ID}';
const PING     = 'PING_FROM_A_' + Date.now();

async function getTicket() {
  const r = await fetch(\`\${BASE_URL}/api/ws-ticket\`, { method: 'POST', headers: { Authorization: \`Bearer \${API_KEY}\` } });
  if (!r.ok) throw new Error('ticket failed: ' + r.status);
  return (await r.json()).ticket;
}
function connectWs(path, ticket) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(\`\${WS_BASE}\${path}?ticket=\${ticket}\`);
    ws.once('open', () => res(ws));
    ws.once('error', rej);
    setTimeout(() => rej(new Error('timeout ' + path)), 6000);
  });
}
function collect(ws, ms) {
  const frames = [];
  return new Promise(res => {
    const t = setTimeout(() => res(frames), ms);
    ws.on('message', raw => { try { frames.push(JSON.parse(raw.toString('utf-8'))); } catch {} });
    ws.once('close', () => { clearTimeout(t); res(frames); });
  });
}
const strip = s => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');

// E: terminal A input -> output
const tA = await getTicket();
const wsA = await connectWs('/ws/terminal/' + TERM_A, tA);
await collect(wsA, 1000);
wsA.send(JSON.stringify({ type: 'input', data: 'echo ' + PING + '\n' }));
const frA = await collect(wsA, 3000);
const outA = frA.filter(f => f.type === 'output').map(f => strip(f.data)).join('');
const pingLine = outA.split('\n').find(l => l.includes(PING));
console.log('E PASS:', !!pingLine, '| token:', JSON.stringify(pingLine));
if (!pingLine) process.exit(1);

// F: terminal B independent I/O — write directly to B and verify its echo.
//    NOTE: NOT a relay assertion (A's output is not routed to B here); true
//    A->coordinator->B relay is covered by the SoS suite, not this smoke test.
const tB = await getTicket();
const wsB = await connectWs('/ws/terminal/' + TERM_B, tB);
await collect(wsB, 1000);
wsB.send(JSON.stringify({ type: 'input', data: 'echo TERMB_IO_' + PING + '\n' }));
const frB = await collect(wsB, 3000);
const outB = frB.filter(f => f.type === 'output').map(f => strip(f.data)).join('');
const ioLine = outB.split('\n').find(l => l.includes('TERMB_IO_'));
console.log('F PASS (terminal-B I/O, not relay):', !!ioLine, '| token:', JSON.stringify(ioLine));
if (!ioLine) process.exit(1);

// G: /ws/session plain shell -> empty history frame
const tS = await getTicket();
const wsS = await connectWs('/ws/session/' + TERM_A, tS);
const frS = await collect(wsS, 2500);
wsS.close();
const hist = frS.find(f => f.type === 'history');
console.log('G PASS:', !!hist, '| messages:', hist?.messages?.length ?? 'n/a');
if (!hist) process.exit(1);

wsA.close(); wsB.close();
console.log('ALL_WS_CHECKS: PASS');
JSEOF

echo ""; echo "=== E/F/G: WebSocket checks ==="
node "${WS_SCRIPT}"

echo ""; echo "=== Shooter Cross-Terminal E2E: ALL PASS ==="
