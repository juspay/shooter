#!/usr/bin/env bash
# Shooter FULL-FEATURE end-to-end test.
#
# Exercises (not just renders) every HTTP route, all three WebSocket channels,
# the bidirectional permission loop, PTY I/O + resize + image paste, the
# multi-provider session API, and terminal persistence across a server restart.
# Run against a live build: API_KEY=<key> PORT=54007 bash scripts/e2e-all-features.sh
set -uo pipefail

PORT="${PORT:-54007}"
API_KEY="${API_KEY:-e2e-browser-key}"
BASE="http://localhost:${PORT}"
WSJS="$(pwd)/.e2e-allfeat-$$.mjs"     # keep WS client in-project so `ws` resolves
LOG="/tmp/shooter-allfeat-$$.log"
PASS=0; FAIL=0
TERMS=""
A=(-H "Authorization: Bearer ${API_KEY}")
J=(-H "Content-Type: application/json")

ok(){ PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; }
hcode(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
jget(){ python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1" 2>/dev/null; }

cleanup(){
  for t in $TERMS; do
    curl -s -X DELETE "${A[@]}" "${BASE}/api/terminals/${t}" >/dev/null 2>&1 || true
    pkill -f "pty-holder.cjs ${t}" 2>/dev/null || true
    rm -f "/tmp/shooter-term-${t}.sock" 2>/dev/null || true
  done
  # Kill the server only if THIS script started it (leave a pre-existing external one).
  [ -n "${SERVER_PID:-}" ] && kill "${SERVER_PID}" 2>/dev/null || true
  rm -f "$WSJS" "$LOG"
}
trap cleanup EXIT

ensure_up(){ for i in $(seq 1 20); do [ "$(hcode "${A[@]}" "${BASE}/api/health")" = 200 ] && return 0; sleep 1; done; return 1; }
start_server(){ nohup env API_KEY="${API_KEY}" PORT="${PORT}" npx tsx server.ts >"$LOG" 2>&1 & SERVER_PID=$!; disown 2>/dev/null || true; }

echo "=== Shooter full-feature E2E (port ${PORT}) ==="
[ -f build/handler.js ] || { echo "build/handler.js missing — run pnpm build"; exit 1; }
ensure_up || { echo "server not up; starting"; start_server; ensure_up || { echo "FAILED to start"; exit 1; }; }

# ─────────────────────────────────────────────────────────────────────────
echo ""; echo "── 1. Auth + health/status/debug ──"
[ "$(hcode "${BASE}/api/sessions")" = 401 ] && ok "auth: unauth request → 401" || no "auth gate" "got $(hcode "${BASE}/api/sessions")"
[ "$(hcode "${A[@]}" "${BASE}/api/sessions")" = 200 ] && ok "auth: valid key → 200" || no "auth valid" "not 200"
curl -s "${A[@]}" "${BASE}/api/health" | grep -q '"status":"healthy"' && ok "/api/health healthy" || no "/api/health" "not healthy"
curl -s "${A[@]}" "${BASE}/api/ws-status" | grep -qE '\{' && ok "/api/ws-status returns JSON" || no "/api/ws-status" "no json"
curl -s "${A[@]}" "${BASE}/api/debug" | grep -q 'deviceToken' && ok "/api/debug returns diagnostics" || no "/api/debug" "no deviceToken field"

echo ""; echo "── 2. Pairing / device config ──"
QR=$(curl -s "${A[@]}" "${BASE}/api/qr-config")
echo "$QR" | grep -q 'data:image/png;base64' && ok "/api/qr-config returns QR data URL" || no "/api/qr-config" "no QR dataUrl"
echo "$QR" | grep -q 'serverUrl' && ok "/api/qr-config returns serverUrl" || no "/api/qr-config serverUrl" "missing"
DT=$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"platform":"ios","deviceToken":"'"$(printf 'a%.0s' {1..64})"'"}' "${BASE}/api/device-token")
[ "$DT" = 200 ] && ok "/api/device-token registers token" || no "/api/device-token" "got $DT"
[ "$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"platform":"ios"}' "${BASE}/api/device-token")" = 400 ] && ok "/api/device-token validates missing token (400)" || no "device-token validation" "no 400"

echo ""; echo "── 3. Notifications + webhook ──"
NOT=$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"title":"E2E","message":"hello"}' "${BASE}/api/notify")
[ "$NOT" = 200 ] && ok "/api/notify accepts notification (200)" || no "/api/notify" "got $NOT"
[ "$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"message":"no title"}' "${BASE}/api/notify")" = 400 ] && ok "/api/notify validates required fields (400)" || no "notify validation" "no 400"
[ "$(hcode "${A[@]}" "${J[@]}" -X POST -d '{}' "${BASE}/api/webhook")" = 501 ] && ok "/api/webhook stub returns 501" || no "/api/webhook" "expected 501"

echo ""; echo "── 4. NeuroLink proxy (allowlist enforcement) ──"
NP=$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"provider":"evil","url":"http://attacker.test/x","headers":{}}' "${BASE}/api/neurolink-proxy")
[ "$NP" = 403 ] && ok "/api/neurolink-proxy blocks non-allowlisted URL (403)" || no "neurolink-proxy allowlist" "got $NP"
[ "$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"provider":"openai"}' "${BASE}/api/neurolink-proxy")" = 400 ] && ok "/api/neurolink-proxy validates malformed payload (400)" || no "neurolink-proxy validation" "no 400"

echo ""; echo "── 5. Multi-provider sessions ──"
S=$(curl -s "${A[@]}" "${BASE}/api/sessions")
NPROV=$(echo "$S" | python3 -c "import json,sys;from collections import Counter;d=json.load(sys.stdin);print(len(Counter(x['source'] for p in d.get('projects',[]) for x in p.get('sessions',[]))))" 2>/dev/null)
[ "${NPROV:-0}" -ge 5 ] && ok "/api/sessions lists ${NPROV} providers" || no "/api/sessions providers" "only ${NPROV}"
echo "$S" | grep -q '"iflow"' && no "iflow removed" "iflow still present" || ok "iflow fully removed from API"
[ "$(hcode "${A[@]}" "${BASE}/api/sessions/detect")" = 200 ] && ok "/api/sessions/detect (running-process scan) 200" || no "sessions/detect" "not 200"
# conversation retrieval for a real claude session
CIDP=$(echo "$S" | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((s['id']+'|'+p['id'] for p in d.get('projects',[]) for s in p.get('sessions',[]) if s['source']=='claude-code' and s.get('messageCount',0)>0),''))" 2>/dev/null)
CID="${CIDP%%|*}"; CPID="${CIDP##*|}"
if [ -n "$CID" ]; then
  MC=$(curl -s "${A[@]}" "${BASE}/api/sessions?id=${CID}&project=${CPID}&limit=50" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('messages',[])))" 2>/dev/null)
  [ "${MC:-0}" -gt 0 ] && ok "/api/sessions?id=&project= returns ${MC} parsed messages" || no "conversation read" "0 messages"
else no "conversation read" "no claude session found"; fi
# connect validation (security guards)
[ "$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"sessionId":"../etc","cwd":"/tmp"}' "${BASE}/api/sessions/connect")" = 400 ] && ok "/api/sessions/connect rejects path-traversal id (400)" || no "connect id guard" "no 400"
[ "$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"sessionId":"abc","cwd":"/etc"}' "${BASE}/api/sessions/connect")" = 400 ] && ok "/api/sessions/connect rejects cwd outside home (400)" || no "connect cwd guard" "no 400"

echo ""; echo "── 6. Terminals: create / list / get / resize / paste / delete ──"
TA=$(curl -s "${A[@]}" "${J[@]}" -X POST -d "{\"command\":\"bash\",\"cwd\":\"${HOME}\"}" "${BASE}/api/terminals")
TAID=$(echo "$TA" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$TAID" ] && { TERMS="$TERMS $TAID"; ok "POST /api/terminals creates terminal ($TAID)"; } || no "create terminal" "no id"
curl -s "${A[@]}" "${BASE}/api/terminals" | grep -q "$TAID" && ok "GET /api/terminals lists it" || no "list terminals" "missing"
[ "$(hcode "${A[@]}" "${BASE}/api/terminals/${TAID}")" = 200 ] && ok "GET /api/terminals/[id] 200" || no "get terminal" "not 200"
[ "$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"cols":120,"rows":40}' "${BASE}/api/terminals/${TAID}/resize")" = 200 ] && ok "POST /resize 200" || no "resize" "not 200"
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
PI=$(curl -s "${A[@]}" "${J[@]}" -X POST -d "{\"image\":\"data:image/png;base64,${PNG}\"}" "${BASE}/api/terminals/${TAID}/paste-image")
echo "$PI" | grep -q '"success":true' && ok "POST /paste-image writes image" || no "paste-image" "$PI"

echo ""; echo "── 7. Bidirectional permission loop (notify→decide→response→poll) ──"
RID="e2e-perm-$$"
P1=$(hcode "${A[@]}" "${J[@]}" -X POST -d "{\"title\":\"Permission\",\"message\":\"Allow Bash?\",\"skipPush\":true,\"waitForResponse\":true,\"data\":{\"requestId\":\"${RID}\",\"toolName\":\"Bash\",\"toolInput\":{\"command\":\"ls -la\"}}}" "${BASE}/api/notify")
[ "$P1" = 200 ] && ok "notify(skipPush+waitForResponse) registers pending request" || no "notify pending" "got $P1"
DEC=$(curl -s "${A[@]}" "${BASE}/api/decide/${RID}")
echo "$DEC" | grep -q '"toolName": *"Bash"' && ok "GET /api/decide/[id] returns rich request (toolName/toolInput)" || no "decide payload" "$DEC"
RC=$(hcode "${A[@]}" "${J[@]}" -X POST -d "{\"requestId\":\"${RID}\",\"decision\":\"allow\"}" "${BASE}/api/response")
[ "$RC" = 200 ] && ok "POST /api/response(allow) accepted" || no "response post" "got $RC"
POLL=$(curl -s "${A[@]}" "${BASE}/api/response?requestId=${RID}")
echo "$POLL" | grep -q '"decision":"allow"' && ok "GET /api/response?requestId= returns the decision (hook unblocks)" || no "response poll" "$POLL"
RC404=$(hcode "${A[@]}" "${J[@]}" -X POST -d '{"requestId":"nope-xyz","decision":"allow"}' "${BASE}/api/response")
[ "$RC404" = 404 ] && ok "response on unknown id → 404" || no "response 404" "got $RC404"

echo ""; echo "── 8. WebSocket channels (ticket, terminal I/O, session, events) ──"
cat > "$WSJS" <<JS
import { WebSocket } from 'ws';
const BASE='${BASE}', WS='ws://localhost:${PORT}', KEY='${API_KEY}', TID='${TAID}', CID='${CID}';
const out=(n,p,d='')=>console.log('WS '+n+' '+(p?'PASS':'FAIL')+(d?' | '+d:''));
const ticket=async()=>{const r=await fetch(BASE+'/api/ws-ticket',{method:'POST',headers:{Authorization:'Bearer '+KEY}});return (await r.json()).ticket;};
const conn=(path,t)=>new Promise((res,rej)=>{const w=new WebSocket(WS+path+'?ticket='+t);w.once('open',()=>res(w));w.once('error',rej);setTimeout(()=>rej(new Error('timeout '+path)),6000);});
const collect=(w,ms)=>{const f=[];return new Promise(r=>{const t=setTimeout(()=>r(f),ms);w.on('message',m=>{try{f.push(JSON.parse(m.toString()))}catch{}});});};
const strip=s=>s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g,'').replace(/\r/g,'');
try{
  const t1=await ticket(); out('ticket', !!t1, t1?'got ticket':'no ticket');
  // terminal I/O
  const wsT=await conn('/ws/terminal/'+TID,await ticket()); await collect(wsT,800);
  const tok='WS_IO_'+Date.now(); wsT.send(JSON.stringify({type:'input',data:'echo '+tok+'\n'}));
  const fr=await collect(wsT,2500); const o=fr.filter(f=>f.type==='output').map(f=>strip(f.data)).join('');
  out('terminal-io', o.includes(tok), 'echoed token seen='+o.includes(tok));
  wsT.send(JSON.stringify({type:'resize',cols:100,rows:30}));
  const fr2=await collect(wsT,800); out('terminal-resize', wsT.readyState===1, 'socket alive after resize');
  wsT.close();
  // session channel (claude history)
  if(CID){ const wsS=await conn('/ws/session/'+CID,await ticket()); wsS.send(JSON.stringify({type:'subscribe',sessionId:CID}));
    const fs=await collect(wsS,3000); const h=fs.find(f=>f.type==='history');
    out('session-history', !!h && (h.messages||[]).length>0, 'history msgs='+((h&&h.messages||[]).length)); wsS.close(); }
  else out('session-history', false, 'no claude id');
  // events channel: connect then trigger a notify broadcast
  const wsE=await conn('/ws/events',await ticket());
  const ev=collect(wsE,3000);
  await fetch(BASE+'/api/notify',{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({title:'EvtPing',message:'evt',eventType:'tool.before',data:{toolName:'Bash',command:'ls'}})});
  const evs=await ev; out('events-broadcast', evs.length>0, 'frames='+evs.length); wsE.close();
}catch(e){ out('ws-suite', false, e.message); }
JS
node "$WSJS" 2>&1 | while read -r line; do
  name=$(echo "$line"|awk '{print $2}'); res=$(echo "$line"|awk '{print $3}'); det=$(echo "$line"|cut -d'|' -f2-)
  [ "$res" = PASS ] && ok "WS ${name}:${det}" || no "WS ${name}" "${det}"
done

echo ""; echo "── 9. Terminal persistence across server restart ──"
TB=$(curl -s "${A[@]}" "${J[@]}" -X POST -d "{\"command\":\"bash\",\"cwd\":\"${HOME}\"}" "${BASE}/api/terminals")
TBID=$(echo "$TB" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$TBID" ] && TERMS="$TERMS $TBID"
HPID=$(pgrep -f "pty-holder.cjs ${TBID}" | head -1)
[ -n "$HPID" ] && ok "persistence: detached pty-holder process exists (pid $HPID)" || no "holder process" "none for $TBID"
# restart server
lsof -ti "tcp:${PORT}" | xargs kill -9 2>/dev/null || true; sleep 2
start_server; ensure_up || no "restart" "server did not come back"
sleep 2
curl -s "${A[@]}" "${BASE}/api/terminals" | grep -q "$TBID" && ok "persistence: terminal survived restart (reconnected from holder)" || no "persistence reconnect" "$TBID gone after restart"
# holder still alive?
pgrep -f "pty-holder.cjs ${TBID}" >/dev/null && ok "persistence: same holder process still owns the PTY" || no "holder survived" "holder died"

echo ""; echo "════════════════════════════════════════════"
echo "  RESULT: ${PASS} passed, ${FAIL} failed"
echo "════════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
