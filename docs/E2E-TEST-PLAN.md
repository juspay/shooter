# Shooter — End-to-End Test Plan

> **Purpose:** Comprehensive manual and consumer-facing test plan covering every feature, endpoint, page, CLI command, and integration in Shooter. Each item has step-by-step instructions, expected results, and edge cases.
>
> **How to use:** Work through sections in priority order. Mark items `[x]` as you verify them. Add findings/bugs inline.

---

## Table of Contents

1. [Pre-Flight: Static Analysis & Build](#1-pre-flight-static-analysis--build)
2. [Server Startup & Process Management](#2-server-startup--process-management)
3. [Authentication & Security](#3-authentication--security)
4. [Health & Diagnostics](#4-health--diagnostics)
5. [Push Notifications (APNs & FCM)](#5-push-notifications-apns--fcm)
6. [Bidirectional Permissions](#6-bidirectional-permissions)
7. [Device Registration & QR Config](#7-device-registration--qr-config)
8. [Terminal Subsystem](#8-terminal-subsystem)
9. [WebSocket Channels](#9-websocket-channels)
10. [Session Management](#10-session-management)
11. [NeuroLink AI Integration](#11-neurolink-ai-integration)
12. [Activity Feed & AI Summarization](#12-activity-feed--ai-summarization)
13. [UI Pages](#13-ui-pages)
14. [Settings Page & AI Provider Config](#14-settings-page--ai-provider-config)
15. [Setup Wizard (CLI)](#15-setup-wizard-cli)
16. [CLI Commands](#16-cli-commands)
17. [Persistence & Recovery](#17-persistence--recovery)
18. [Security & Edge Cases](#18-security--edge-cases)
19. [Regression Checklist](#19-regression-checklist)

---

## 1. Pre-Flight: Static Analysis & Build

### 1.1 TypeScript Type Check

- [ ] **Steps:** Run `pnpm check`
- [ ] **Expected:** 0 errors, 0 warnings.

### 1.2 ESLint

- [ ] **Steps:** Run `pnpm lint`
- [ ] **Expected:** 0 errors, 0 warnings.

### 1.3 Production Build

- [ ] **Steps:** Run `pnpm build`
- [ ] **Expected:** Build completes with `adapter-node` output. `build/handler.js` and `build/pty-holder.cjs` exist.

### 1.4 Clean Install Build

- [ ] **Steps:** `rm -rf node_modules && pnpm install && pnpm build`
- [ ] **Expected:** Installs cleanly, builds without errors. Native modules (`better-sqlite3`, `node-pty`) compile successfully.

---

## 2. Server Startup & Process Management

### 2.1 Dev Server Start

- [ ] **Steps:** Run `pnpm dev`
- [ ] **Expected:**
  - Prints port `54006`, home `~/.shooter-dev`
  - Auto-generates a non-empty dev API key (format: `hostname-<32 hex chars>`)
  - Builds successfully
  - Prints "Shooter server running on http://localhost:54006"
  - Tunnel starts (if cloudflared installed)

### 2.2 Production Server Start

- [ ] **Steps:** `pnpm build && pnpm start`
- [ ] **Expected:**
  - Server starts on port 54007 (default)
  - Prints "Shooter server running on http://localhost:54007"
  - WebSocket upgrade handler registered

### 2.3 Build Guard

- [ ] **Steps:** Delete `build/` directory, run `pnpm start`
- [ ] **Expected:** Exits with clear error: "Build directory not found. Run `pnpm build` first."

### 2.4 Graceful Shutdown

- [ ] **Steps:** Start server, send SIGTERM (`kill <pid>`)
- [ ] **Expected:** Server shuts down cleanly, no orphaned processes, PID file removed.

### 2.5 File Watcher (Dev Mode)

- [ ] **Steps:** Start `pnpm dev`, edit a `.svelte` file, save
- [ ] **Expected:** Auto-rebuilds and restarts within a few seconds.

---

## 3. Authentication & Security

### 3.1 Missing Auth Header

- [ ] **Steps:** `curl http://localhost:54006/api/sessions`
- [ ] **Expected:** `401 Unauthorized` with `{"error":"Missing or invalid Authorization header"}`

### 3.2 Invalid Auth Token

- [ ] **Steps:** `curl -H "Authorization: Bearer wrong-key" http://localhost:54006/api/sessions`
- [ ] **Expected:** `401 Unauthorized`

### 3.3 Valid Auth Token

- [ ] **Steps:** `curl -H "Authorization: Bearer <valid-key>" http://localhost:54006/api/sessions`
- [ ] **Expected:** `200 OK` with JSON response

### 3.4 Empty Bearer Token

- [ ] **Steps:** `curl -H "Authorization: Bearer " http://localhost:54006/api/sessions`
- [ ] **Expected:** `401 Unauthorized`

### 3.5 Public Endpoints (No Auth Required)

- [ ] **Steps:** `curl http://localhost:54006/api/health`
- [ ] **Expected:** `200 OK` — health endpoint is public for the layout status badge.

### 3.6 Auth on WebSocket Tickets

- [ ] **Steps:** `curl -X POST http://localhost:54006/api/ws-ticket` (no auth)
- [ ] **Expected:** `401 Unauthorized`

---

## 4. Health & Diagnostics

### 4.1 Public Health Check

- [ ] **Steps:** `curl http://localhost:54006/api/health`
- [ ] **Expected:**
  ```json
  {"status":"healthy","timestamp":"...","version":"1.5.0","warnings":[...]}
  ```

### 4.2 Detailed Health (Authenticated)

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" "http://localhost:54006/api/health?details=true"`
- [ ] **Expected:** Full response with `checks`, `configuration`, `ai`, `environment`, `version`.

### 4.3 AI Provider Checks — All Configured

- [ ] **Steps:** Set all 5 AI keys in `.env`, restart, hit detailed health.
- [ ] **Expected:** `ai.providers` shows all 5 as `true`. No AI warning in `warnings` array.

### 4.4 AI Provider Checks — None Configured

- [ ] **Steps:** Remove all AI keys from `.env`, restart, hit health.
- [ ] **Expected:** `warnings` contains `"No AI provider configured — AI summaries disabled. Run \"shooter setup\" to configure."`

### 4.5 AI Provider Checks — Partial

- [ ] **Steps:** Set only `GOOGLE_AI_API_KEY`, restart, hit detailed health.
- [ ] **Expected:** `ai.providers["google-ai"]: true`, rest `false`. `ai.hasAnyProvider: true`. No AI warning.

### 4.6 AI Active Provider Override

- [ ] **Steps:** Set `NEUROLINK_PROVIDER=anthropic` in `.env`, restart, hit detailed health.
- [ ] **Expected:** `ai.activeProvider: "anthropic"`

### 4.7 APNs Warning

- [ ] **Steps:** Remove APNs keys from `.env`, hit health.
- [ ] **Expected:** Warning: "APNs not configured — iOS push notifications disabled"

### 4.8 FCM Warning

- [ ] **Steps:** Remove FCM keys from `.env`, hit health.
- [ ] **Expected:** Warning: "FCM not configured — Android push notifications disabled"

### 4.9 Debug Endpoint

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/debug`
- [ ] **Expected:** Returns APNs status, device token validity, API key presence.

### 4.10 Version Matches package.json

- [ ] **Steps:** Compare health `version` field with `package.json` version.
- [ ] **Expected:** They match.

---

## 5. Push Notifications (APNs & FCM)

### 5.1 Send iOS Notification

- [ ] **Steps:**
  ```bash
  curl -X POST -H "Authorization: Bearer KEY" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test","message":"Hello from E2E test","data":{"source":"e2e"}}' \
    http://localhost:54006/api/notify
  ```
- [ ] **Expected:** `{"message":"Notification sent successfully","requestId":"...","result":{...}}`
- [ ] **Verify on device:** iOS notification received with title "Test" and message "Hello from E2E test"

### 5.2 Send Android Notification

- [ ] **Steps:** Set `DEVICE_PLATFORM=android` + `ANDROID_DEVICE_TOKEN` in `.env`, restart, send same curl.
- [ ] **Expected:** FCM delivery success.

### 5.3 Missing Push Config

- [ ] **Steps:** Remove all APNs/FCM keys, send notification.
- [ ] **Expected:** `500` or error message about missing push config.

### 5.4 Custom Device Token Override

- [ ] **Steps:** Include `"deviceToken":"<other-token>"` in request body.
- [ ] **Expected:** Notification sent to the specified token instead of env default.

### 5.5 Skip Push (WebSocket Only)

- [ ] **Steps:** Send with `"skipPush": true` in body.
- [ ] **Expected:** Returns success but no push notification sent. Event still broadcast to WebSocket.

### 5.6 Notification Deduplication

- [ ] **Steps:** Send identical notification twice within 10 seconds.
- [ ] **Expected:** Second request returns `"filtered"` or deduplicated status.

### 5.7 Notification History

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/notify`
- [ ] **Expected:** GET returns list of recent notifications (up to 50).

---

## 6. Bidirectional Permissions

### 6.1 Permission Request Flow

- [ ] **Steps:**
  1. Send notification with `"waitForResponse": true, "data": {"requestId": "test-123", "toolName": "Bash"}`
  2. Poll: `curl -H "Authorization: Bearer KEY" "http://localhost:54006/api/response?requestId=test-123"`
  3. On iOS, tap "Allow" on the interactive notification
  4. Poll again
- [ ] **Expected:** First poll returns `{"status":"pending"}`. After iOS response, returns `{"status":"resolved","decision":"allow"}`.

### 6.2 Permission Deny

- [ ] **Steps:** Same as 6.1 but tap "Deny" on iOS.
- [ ] **Expected:** Returns `{"decision":"deny"}`.

### 6.3 Permission Timeout

- [ ] **Steps:** Send permission request, don't respond for 120+ seconds.
- [ ] **Expected:** Polling returns `404` after expiry (180s server-side cleanup).

### 6.4 Record Response via POST

- [ ] **Steps:**
  ```bash
  curl -X POST -H "Authorization: Bearer KEY" \
    -H "Content-Type: application/json" \
    -d '{"requestId":"test-123","decision":"allow"}' \
    http://localhost:54006/api/response
  ```
- [ ] **Expected:** `200` with `{"status":"resolved"}`.

### 6.5 Invalid Decision Value

- [ ] **Steps:** POST response with `"decision":"maybe"`.
- [ ] **Expected:** `400` error — decision must be "allow" or "deny".

---

## 7. Device Registration & QR Config

### 7.1 Register iOS Device Token

- [ ] **Steps:**
  ```bash
  curl -X POST -H "Authorization: Bearer KEY" \
    -H "Content-Type: application/json" \
    -d '{"platform":"ios","deviceToken":"abc123...64hexchars"}' \
    http://localhost:54006/api/device-token
  ```
- [ ] **Expected:** `200`, token saved to `~/.shooter/device-tokens.json`.

### 7.2 Register Android Device Token

- [ ] **Steps:** Same with `"platform":"android"`.
- [ ] **Expected:** `200`, token saved.

### 7.3 Invalid Platform

- [ ] **Steps:** POST with `"platform":"windows"`.
- [ ] **Expected:** `400` error.

### 7.4 Generate QR Code

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/qr-config`
- [ ] **Expected:** Returns `{"dataUrl":"data:image/png;base64,...","serverUrl":"https://..."}`.

### 7.5 QR Code Contains Config

- [ ] **Steps:** Decode the QR code data URL (base64 PNG → scan → JSON).
- [ ] **Expected:** JSON contains `serverUrl` and `apiKey`.

---

## 8. Terminal Subsystem

### 8.1 Create Terminal

- [ ] **Steps:**
  ```bash
  curl -X POST -H "Authorization: Bearer KEY" \
    -H "Content-Type: application/json" \
    -d '{"command":"zsh","cwd":"/tmp"}' \
    http://localhost:54006/api/terminals
  ```
- [ ] **Expected:** Returns terminal ID, status "running", WebSocket URLs.

### 8.2 List Terminals

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/terminals`
- [ ] **Expected:** JSON array with terminal objects (id, command, cwd, status, pid).

### 8.3 Get Terminal Details

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/terminals/<id>`
- [ ] **Expected:** Terminal metadata + lastOutput (scrollback).

### 8.4 Resize Terminal

- [ ] **Steps:**
  ```bash
  curl -X POST -H "Authorization: Bearer KEY" \
    -H "Content-Type: application/json" \
    -d '{"cols":120,"rows":40}' \
    http://localhost:54006/api/terminals/<id>/resize
  ```
- [ ] **Expected:** `200` success.

### 8.5 Resize Invalid Dimensions

- [ ] **Steps:** POST with `{"cols":999,"rows":999}`.
- [ ] **Expected:** `400` — cols must be <= 500, rows <= 200.

### 8.6 Delete Running Terminal

- [ ] **Steps:** `curl -X DELETE -H "Authorization: Bearer KEY" http://localhost:54006/api/terminals/<id>`
- [ ] **Expected:** Terminal receives SIGTERM, exits. Returns success.

### 8.7 Delete Already-Exited Terminal

- [ ] **Steps:** Delete a terminal that already exited.
- [ ] **Expected:** Returns `{"removed": true}`.

### 8.8 Delete Nonexistent Terminal

- [ ] **Steps:** DELETE with a fake terminal ID.
- [ ] **Expected:** `404`.

### 8.9 Create Terminal — Command Allowlist

- [ ] **Steps:** POST with `"command":"rm"`.
- [ ] **Expected:** `400` — command not in allowlist (only `zsh`, `bash`, `sh`, `fish`, `claude`, `opencode`).

### 8.10 Create Claude Terminal

- [ ] **Steps:** POST with `"command":"claude"`.
- [ ] **Expected:** Claude Code session starts in the specified cwd. Terminal connects to WebSocket.

### 8.11 Create Terminal — Invalid CWD

- [ ] **Steps:** POST with `"cwd":"/nonexistent/path"`.
- [ ] **Expected:** `400` — cwd must be a valid directory.

### 8.12 Paste Image to Terminal

- [ ] **Steps:**
  ```bash
  curl -X POST -H "Authorization: Bearer KEY" \
    -F "image=@/path/to/screenshot.png" \
    http://localhost:54006/api/terminals/<id>/paste-image
  ```
- [ ] **Expected:** Image encoded as base64, injected into terminal input.

---

## 9. WebSocket Channels

### 9.1 Get WebSocket Ticket

- [ ] **Steps:**
  ```bash
  curl -X POST -H "Authorization: Bearer KEY" http://localhost:54006/api/ws-ticket
  ```
- [ ] **Expected:** `{"ticket":"<64-char-hex>"}`.

### 9.2 Ticket Expiry

- [ ] **Steps:** Get ticket, wait 31+ seconds, try to connect with it.
- [ ] **Expected:** WebSocket upgrade rejected — ticket expired.

### 9.3 Ticket Rate Limit

- [ ] **Steps:** Request 31 tickets within 1 minute.
- [ ] **Expected:** 31st request returns `429 Too Many Requests` with message "Rate limit exceeded. Maximum 30 ticket requests per minute."

### 9.4 Terminal WebSocket — Connect

- [ ] **Steps:**
  1. Create a terminal via API
  2. Get a WS ticket
  3. Connect: `wscat -c "ws://localhost:54006/ws/terminal/<id>?ticket=<ticket>"`
- [ ] **Expected:** Connection established, terminal output streams (shell prompt).

### 9.5 Terminal WebSocket — Send Input

- [ ] **Steps:** While connected, type `echo hello` + Enter.
- [ ] **Expected:** Terminal processes command, output streams back.

### 9.6 Terminal WebSocket — Invalid Ticket

- [ ] **Steps:** Connect with `?ticket=invalid`.
- [ ] **Expected:** Connection rejected immediately.

### 9.7 Session WebSocket — Connect

- [ ] **Steps:**
  1. Get a session ID from `/api/sessions`
  2. Get ticket
  3. Connect: `wscat -c "ws://localhost:54006/ws/session/<sessionId>?ticket=<ticket>"`
- [ ] **Expected:** Receives `history` message with existing conversation messages.

### 9.8 Session WebSocket — Live Updates

- [ ] **Steps:** Connect to an active Claude Code session's WebSocket while it's running.
- [ ] **Expected:** Live `message`, `tool-use`, `tool-result` events stream in real-time.

### 9.9 Events WebSocket — Connect

- [ ] **Steps:** `wscat -c "ws://localhost:54006/ws/events?ticket=<ticket>"`
- [ ] **Expected:** Connection established. Events broadcast when notifications arrive.

### 9.10 Events WebSocket — Hook Events

- [ ] **Steps:** While connected to events WS, trigger a notification via POST.
- [ ] **Expected:** Event appears on WS with `type`, `tool`, `timestamp` fields.

### 9.11 Keepalive Ping

- [ ] **Steps:** Connect to any WS channel, wait 30+ seconds.
- [ ] **Expected:** Receives periodic ping frames (keeps Cloudflare Tunnel alive).

### 9.12 WebSocket Status

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/ws-status`
- [ ] **Expected:** Returns connected client counts per channel type.

---

## 10. Session Management

### 10.1 List All Sessions

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/sessions`
- [ ] **Expected:** Returns `{count, projects: [...], total, timestamp}`. Projects sorted by modification time.

### 10.2 Session Pagination

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" "http://localhost:54006/api/sessions?limit=5&offset=0"`
- [ ] **Expected:** Returns at most 5 projects. `total` shows full count.

### 10.3 Force Cache Refresh

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" "http://localhost:54006/api/sessions?refresh=true"`
- [ ] **Expected:** Returns fresh data (not cached).

### 10.4 Get Single Session Messages

- [ ] **Steps:**
  ```bash
  curl -H "Authorization: Bearer KEY" \
    "http://localhost:54006/api/sessions?id=<sessionId>&project=<projectPath>&limit=50"
  ```
- [ ] **Expected:** Returns `{session, messages: [...], timestamp}` with up to 50 messages.

### 10.5 Session Message Pagination

- [ ] **Steps:** Request with `offset=50&limit=50`.
- [ ] **Expected:** Returns next page of messages.

### 10.6 Detect Active Sessions

- [ ] **Steps:** `curl -H "Authorization: Bearer KEY" http://localhost:54006/api/sessions/detect`
- [ ] **Expected:** Returns array of detected active Claude Code and OpenCode sessions.

### 10.7 Connect to Session (WebSocket URL)

- [ ] **Steps:** POST to `/api/sessions/connect` with session ID.
- [ ] **Expected:** Returns WebSocket URL for live session streaming.

### 10.8 Claude Code Sessions (JSONL Format)

- [ ] **Steps:** Have a Claude Code session running, verify it appears in session list.
- [ ] **Expected:** Session listed with correct `projectPath`, `sessionId`, `messageCount`.

### 10.9 OpenCode Sessions (SQLite Format)

- [ ] **Steps:** Have an OpenCode session running (if available), verify it appears.
- [ ] **Expected:** OpenCode sessions merged with Claude Code sessions in the project list.

---

## 11. NeuroLink AI Integration

### 11.1 Provider Registry

- [ ] **Steps:** Read `src/lib/modules/client/neurolink/provider-config.ts`.
- [ ] **Expected:** 5 providers defined: google-ai, anthropic, openai, mistral, litellm. Each has `id`, `label`, `model`, `envKeys`, `cors`.

### 11.2 NeuroLink Playground — Load SDK

- [ ] **Steps:** Open `/neurolink` in browser.
- [ ] **Expected:** "Connected" badge appears. Log shows "Loaded! N exports".

### 11.3 Playground — Google AI

- [ ] **Steps:** Select "Google AI" tab, type "Say hello", press Enter. Open browser Network tab to inspect traffic.
- [ ] **Expected:** Gemini response appears. Token count shown. All requests go through `/api/neurolink-proxy` (not directly to Google). No API keys visible in browser request headers or response bodies (server injects keys server-side).

### 11.4 Playground — Anthropic (Proxy)

- [ ] **Steps:** Select "Anthropic" tab, send prompt.
- [ ] **Expected:** Claude response appears. Request routed through `/api/neurolink-proxy` (check Network tab).

### 11.5 Playground — OpenAI (Proxy)

- [ ] **Steps:** Select "OpenAI" tab, send prompt.
- [ ] **Expected:** GPT response appears.

### 11.6 Playground — Mistral (Proxy)

- [ ] **Steps:** Select "Mistral" tab, send prompt.
- [ ] **Expected:** Mistral response appears.

### 11.7 Playground — LiteLLM

- [ ] **Steps:** Select "LiteLLM" tab (requires local LiteLLM proxy running), send prompt.
- [ ] **Expected:** Response from LiteLLM backend.

### 11.8 Playground — Provider Switch

- [ ] **Steps:** Switch between providers multiple times.
- [ ] **Expected:** Log shows "Switched to provider: X" each time. No errors.

### 11.9 Playground — Missing Provider Key

- [ ] **Steps:** Remove a provider's key from `.env`, restart, try that provider.
- [ ] **Expected:** Error message in log, not a crash.

### 11.10 CORS Proxy — Auth Required

- [ ] **Steps:** `curl -X POST http://localhost:54006/api/neurolink-proxy` (no auth)
- [ ] **Expected:** `401 Unauthorized`.

### 11.11 CORS Proxy — Keys Not Leaked

- [ ] **Steps:** In browser Network tab, inspect a proxied Anthropic request.
- [ ] **Expected:** No `x-api-key` or `authorization` header sent from browser. Server injects keys.

### 11.12 Fetch Proxy Idempotency

- [ ] **Steps:** Call `installFetchProxy()` multiple times (it's called from both summarizers + playground).
- [ ] **Expected:** Only installs once (guards with `installed` flag). No duplicate interception.

---

## 12. Activity Feed & AI Summarization

### 12.1 Activity Page Loads

- [ ] **Steps:** Open `/activity` in browser.
- [ ] **Expected:** "Activity" header. Status shows session count or "No active sessions".

### 12.2 Sessions Connect Automatically

- [ ] **Steps:** Have Claude Code running in any project. Open `/activity`.
- [ ] **Expected:** Status changes to "● Watching N sessions".

### 12.3 Raw Events Show Tool Names

- [ ] **Steps:** Toggle "Show raw" while Claude Code is using tools (Read, Bash, Edit, etc.).
- [ ] **Expected:** Events display `[Read]`, `[Bash]`, `[Edit]` — NOT "unknown" or bare type names.

### 12.4 Raw Events Show File Paths

- [ ] **Steps:** Claude Code reads a file. Check raw events.
- [ ] **Expected:** Event shows file path like `src/lib/foo.ts`.

### 12.5 Raw Events Show Commands

- [ ] **Steps:** Claude Code runs a bash command. Check raw events.
- [ ] **Expected:** Event shows command snippet like `pnpm build`.

### 12.6 AI Summary Generates

- [ ] **Steps:** Wait for 5+ events from a project (batch size is 5, interval is 15s).
- [ ] **Expected:** AI summary card appears with a specific, contextual sentence (not "unknown tool" garbage).

### 12.7 Summary Mentions Tools/Files

- [ ] **Steps:** Read the generated summary text.
- [ ] **Expected:** Summary references specific tool names and/or file names from the events.

### 12.8 Per-Project Summaries

- [ ] **Steps:** Have Claude Code sessions in 2+ different project directories.
- [ ] **Expected:** Separate summary cards appear for each project (grouped by project name).

### 12.9 Summary Triggers on Connect

- [ ] **Steps:** Open `/activity` while sessions are already active (history exists).
- [ ] **Expected:** Summary appears quickly after `history` WebSocket message (not waiting for full 15s interval).

### 12.10 Multiple Projects Summarized in Parallel

- [ ] **Steps:** Two projects each with 5+ events.
- [ ] **Expected:** Both get summaries (not just the most active one). Uses `Promise.allSettled` for parallel execution.

### 12.11 Fallback Banner — No AI Provider

- [ ] **Steps:** Remove all AI keys from `.env`, restart, open `/activity`, wait for summarization attempt.
- [ ] **Expected:** Yellow banner: "AI summaries unavailable — configure a provider to enable"

### 12.12 Fallback Banner — Link Works

- [ ] **Steps:** Click the "configure a provider" link in the banner.
- [ ] **Expected:** Navigates to `/config` (settings page).

### 12.13 No Banner When AI Available

- [ ] **Steps:** With AI keys configured, open `/activity`.
- [ ] **Expected:** No yellow banner visible.

### 12.14 Fallback Text When No AI

- [ ] **Steps:** With no AI keys, wait for summary to generate.
- [ ] **Expected:** Shows basic text like "5 events: Read, Bash, Edit" instead of AI-generated prose.

### 12.15 Provider Auto-Detection

- [ ] **Steps:** Set only `ANTHROPIC_API_KEY` (remove Google AI), restart, open activity feed.
- [ ] **Expected:** Console logs `[ActivityFeed] NeuroLink SDK loaded: anthropic/claude-haiku-4-5-20251001`.

### 12.16 Provider Override

- [ ] **Steps:** Set `NEUROLINK_PROVIDER=openai` in `.env` (with OpenAI key), restart.
- [ ] **Expected:** Console logs provider as `openai` regardless of other keys.

### 12.17 Dashboard Summarizer Uses Detected Provider

- [ ] **Steps:** Open `/` (dashboard) with active sessions. Check console.
- [ ] **Expected:** Console logs `[SessionSummarizer] Using provider: <detected-provider>/...`.

---

## 13. UI Pages

### 13.1 Home / Dashboard (`/`)

- [ ] **Steps:** Open `/` in browser.
- [ ] **Expected:** Project cards shown. Each card has project name, session count, last activity time.

### 13.2 Dashboard — Empty State

- [ ] **Steps:** Open with no Claude Code sessions on machine.
- [ ] **Expected:** Empty state message shown (not blank page or error).

### 13.3 Dashboard — Project Card Click

- [ ] **Steps:** Click a project card.
- [ ] **Expected:** Navigates to `/project?path=<encoded-path>` with session list for that project.

### 13.4 Dashboard — Session Card Click

- [ ] **Steps:** Click a session within a project.
- [ ] **Expected:** Navigates to `/session/<id>` with full conversation view.

### 13.5 Session Viewer (`/session/[id]`)

- [ ] **Steps:** Open a session. Scroll through messages.
- [ ] **Expected:** ChatView renders user messages, assistant messages, tool use blocks (collapsed), tool results, code blocks with syntax highlighting, markdown.

### 13.6 Session Viewer — Tool Groups

- [ ] **Steps:** View a session with multiple tool calls.
- [ ] **Expected:** Sequential tool calls are grouped visually. Expandable/collapsible.

### 13.7 Terminals List (`/terminals`)

- [ ] **Steps:** Open `/terminals`.
- [ ] **Expected:** Shows running and exited terminals. Running first, then exited.

### 13.8 Terminals — Empty State

- [ ] **Steps:** With no terminals, open `/terminals`.
- [ ] **Expected:** Empty state message with "New Terminal" button.

### 13.9 Terminals — Create Modal

- [ ] **Steps:** Click "New Terminal" button.
- [ ] **Expected:** Modal/sheet appears with command selector (shell, Claude, OpenCode), cwd field.

### 13.10 Terminal Detail (`/terminals/[id]`)

- [ ] **Steps:** Click a running terminal.
- [ ] **Expected:** xterm.js renders, connected to WebSocket. Shell prompt visible. Can type commands.

### 13.11 Terminal — Chat View Tab

- [ ] **Steps:** If terminal is a Claude session, switch to Chat tab.
- [ ] **Expected:** ChatView shows conversation messages from the session.

### 13.12 Terminal — Quick Keys

- [ ] **Steps:** Tap the quick keys bar (Ctrl+C, Tab, Up, Down, etc.).
- [ ] **Expected:** Keys sent to terminal. Ctrl+C interrupts running command.

### 13.13 Terminal — Kill Button

- [ ] **Steps:** Tap kill/stop button for a running terminal.
- [ ] **Expected:** Terminal receives SIGTERM, exits. UI updates to show exited state.

### 13.14 Terminal — Connection Status

- [ ] **Steps:** View terminal connection indicator.
- [ ] **Expected:** Shows green "Connected" when WebSocket is open, yellow "Reconnecting..." on disconnect.

### 13.15 Error Page

- [ ] **Steps:** Navigate to `/nonexistent-page`.
- [ ] **Expected:** Error page renders with status code, message, "Go Home" and "Go Back" buttons.

### 13.16 Navigation — Bottom Tab Bar

- [ ] **Steps:** Tap Dashboard / Activity / Terminals tabs.
- [ ] **Expected:** Active tab highlighted in green. Pages load correctly.

### 13.17 Navigation — Settings Gear

- [ ] **Steps:** Tap gear icon in top-right header.
- [ ] **Expected:** Navigates to `/config`. Gear icon shows active state.

### 13.18 Status Badge in Header

- [ ] **Steps:** Check the status badge next to the logo.
- [ ] **Expected:** Shows "Healthy" (green) when server is running. Updates every 30 seconds.

### 13.19 Mobile Responsive Layout

- [ ] **Steps:** Open any page on iPhone or narrow browser window (< 480px).
- [ ] **Expected:** Bottom tabs shrink, buttons wrap, header adjusts. No horizontal overflow.

---

## 14. Settings Page & AI Provider Config

### 14.1 Page Loads

- [ ] **Steps:** Open `/config` in browser.
- [ ] **Expected:** `200`. Server Configuration card, Mobile App Setup card, AI Providers card, Danger Zone card.

### 14.2 Server URL & API Key Fields

- [ ] **Steps:** Enter server URL and API key in fields. Click Save.
- [ ] **Expected:** Configuration saved to localStorage. "Configuration saved" confirmation.

### 14.3 Test Notification Button

- [ ] **Steps:** Enter valid server URL + API key. Click "Test Notification".
- [ ] **Expected:** Success message. Push notification arrives on device.

### 14.4 Test Notification — Missing Config

- [ ] **Steps:** Clear API key, click Test.
- [ ] **Expected:** Error message about missing configuration.

### 14.5 QR Code Generation

- [ ] **Steps:** Click "Generate QR Code".
- [ ] **Expected:** QR code image appears with server URL below it.

### 14.6 QR Code Scanning (Mobile)

- [ ] **Steps:** On iOS app, use "Scan QR Code" feature.
- [ ] **Expected:** Camera opens, scans QR, auto-fills server URL and API key.

### 14.7 AI Providers Card — All Configured

- [ ] **Steps:** With all 5 AI keys in `.env`, open `/config`.
- [ ] **Expected:** All 5 providers show green checkmark + "configured".

### 14.8 AI Providers Card — None Configured

- [ ] **Steps:** Remove all AI keys, restart, open `/config`.
- [ ] **Expected:** All 5 show red X + "not configured". Guidance text: "Run `shooter setup` to configure AI providers."

### 14.9 AI Providers Card — Partial

- [ ] **Steps:** Set only `GOOGLE_AI_API_KEY` and `ANTHROPIC_API_KEY`.
- [ ] **Expected:** Those two green, other three red.

### 14.10 AI Providers Card — Active Provider

- [ ] **Steps:** Set `NEUROLINK_PROVIDER=anthropic` in `.env`.
- [ ] **Expected:** Card shows "Active: **anthropic**" below the provider list.

### 14.11 AI Providers Card — Auto-Detect

- [ ] **Steps:** Keys set but no `NEUROLINK_PROVIDER`.
- [ ] **Expected:** Card shows "Auto-detected from configured keys".

### 14.12 Clear Configuration

- [ ] **Steps:** Click "Clear Configuration" in Danger Zone.
- [ ] **Expected:** All localStorage config removed. Fields reset to empty.

### 14.13 Setup Guide Stepper

- [ ] **Steps:** View the setup guide section.
- [ ] **Expected:** Shows progress steps: Get API Key → Find Device Token → Test Connection.

---

## 15. Setup Wizard (CLI)

### 15.1 Auto Mode

- [ ] **Steps:** `node scripts/setup.cjs --auto`
- [ ] **Expected:**
  - Checks prerequisites (Node.js >= 20, pnpm)
  - Auto-generates a non-empty API key (hostname + hex suffix, cryptographically strong)
  - Skips push config
  - Prints "Skipping AI provider configuration in --auto mode"
  - Runs `pnpm build`
  - Completes without prompts

### 15.2 Interactive — API Key

- [ ] **Steps:** Run `node scripts/setup.cjs`, press Enter at API key prompt.
- [ ] **Expected:** Auto-generates key, displays it.

### 15.3 Interactive — Custom API Key

- [ ] **Steps:** Type a custom key at the prompt.
- [ ] **Expected:** Uses the custom key.

### 15.4 Interactive — AI Provider Step Appears

- [ ] **Steps:** After API key step, watch for AI step.
- [ ] **Expected:** "AI-Powered Features (Optional)" header. Asks "Configure AI providers?"

### 15.5 Interactive — Skip AI

- [ ] **Steps:** Answer "n" to "Configure AI providers?"
- [ ] **Expected:** Prints "Skipped — summaries will use basic text fallback."

### 15.6 Interactive — Configure Google AI

- [ ] **Steps:**
  1. Answer "y" to configure
  2. Select "1" (Google AI)
  3. Enter API key
- [ ] **Expected:** Prints URL hint (`aistudio.google.com`), accepts key, shows "✓ Google AI (Gemini) configured".

### 15.7 Interactive — Configure Multiple Providers

- [ ] **Steps:** After first provider, answer "y" to "Configure another provider?"
- [ ] **Expected:** Shows numbered menu again. Can add second provider.

### 15.8 Interactive — LiteLLM Extra Keys

- [ ] **Steps:** Select "5" (LiteLLM).
- [ ] **Expected:** Asks for `LITELLM_API_KEY`, `LITELLM_BASE_URL` (required), then `LITELLM_MODEL` (optional, Enter to skip).

### 15.9 Interactive — Skip from Menu

- [ ] **Steps:** Select "6" (Skip) from provider menu.
- [ ] **Expected:** Exits AI configuration, moves to next step.

### 15.10 Keys Saved to .env

- [ ] **Steps:** After setup, check `~/.shooter/.env`.
- [ ] **Expected:** Contains `GOOGLE_AI_API_KEY=...` (and/or other configured keys) plus `NEUROLINK_PROVIDER=google-ai`.

### 15.11 NEUROLINK_PROVIDER Auto-Set

- [ ] **Steps:** Configure Google AI as first provider.
- [ ] **Expected:** `.env` contains `NEUROLINK_PROVIDER=google-ai` (first configured provider).

### 15.12 Re-Run Preserves Existing Config

- [ ] **Steps:** Run setup again after initial config.
- [ ] **Expected:** Existing API key reused. Existing AI config preserved. Shows "Existing AI config preserved."

### 15.13 Push Mode

- [ ] **Steps:** `node scripts/setup.cjs --push`
- [ ] **Expected:** Shows push notification configuration steps (iOS APNs + Android FCM).

### 15.14 Step Numbering

- [ ] **Steps:** Count step numbers during full interactive run.
- [ ] **Expected:** Sequential, no gaps or repeats. Total matches `_totalSteps`.

### 15.15 Build Failure Handling

- [ ] **Steps:** Break `package.json` (syntax error), run setup.
- [ ] **Expected:** Build step fails with clear error. Setup exits non-zero.

---

## 16. CLI Commands

### 16.1 `shooter start`

- [ ] **Steps:** `npx shooter start` (or `node bin/shooter.cjs start`)
- [ ] **Expected:** Server starts in foreground. Terminal output visible.

### 16.2 `shooter start -d` (Daemon)

- [ ] **Steps:** `shooter start -d`
- [ ] **Expected:** Server starts in background. PID written to `~/.shooter/shooter.pid`. Logs go to `~/.shooter/logs/shooter.log`.

### 16.3 `shooter start --no-tunnel`

- [ ] **Steps:** `shooter start --no-tunnel`
- [ ] **Expected:** Server starts without Cloudflare Tunnel.

### 16.4 `shooter stop`

- [ ] **Steps:** Start daemon, then `shooter stop`.
- [ ] **Expected:** Server process killed. PID file removed. Tunnel stopped.

### 16.5 `shooter stop` (Not Running)

- [ ] **Steps:** Run stop when no server is running.
- [ ] **Expected:** "Server is not running" message (not error/crash).

### 16.6 `shooter status`

- [ ] **Steps:** `shooter status` while server is running.
- [ ] **Expected:** Shows PID, port, tunnel URL (if active), autostart state.

### 16.7 `shooter status` (Not Running)

- [ ] **Steps:** `shooter status` when server is stopped.
- [ ] **Expected:** "Server is not running" + autostart status.

### 16.8 `shooter autostart on`

- [ ] **Steps:** `shooter autostart on`
- [ ] **Expected:**
  - **macOS:** Creates LaunchAgent plist at `~/Library/LaunchAgents/`.
  - **Linux:** Creates systemd user unit.
  - Shows confirmation message.

### 16.9 `shooter autostart off`

- [ ] **Steps:** `shooter autostart off`
- [ ] **Expected:** Removes LaunchAgent/systemd unit. Shows confirmation.

### 16.10 `shooter logs`

- [ ] **Steps:** `shooter logs` while daemon is running.
- [ ] **Expected:** Tails the log file output.

### 16.11 `shooter setup`

- [ ] **Steps:** `shooter setup`
- [ ] **Expected:** Runs interactive setup wizard (same as section 15).

### 16.12 `shooter version`

- [ ] **Steps:** `shooter version`
- [ ] **Expected:** Prints version from package.json.

### 16.13 `shooter help`

- [ ] **Steps:** `shooter help`
- [ ] **Expected:** Prints help text with all available commands.

---

## 17. Persistence & Recovery

### 17.1 Terminal Survives Server Restart

- [ ] **Steps:**
  1. Create a terminal via API
  2. Type some commands in it
  3. Stop server (`shooter stop`)
  4. Start server again
  5. List terminals
- [ ] **Expected:** Terminal reappears in list. Scrollback buffer preserved. Can reconnect via WebSocket.

### 17.2 Terminal Store (SQLite)

- [ ] **Steps:** Check `~/.shooter/shooter.db` exists after creating a terminal.
- [ ] **Expected:** Database contains terminal records (command, cwd, pid, socket path).

### 17.3 Terminal Cleanup (24h)

- [ ] **Steps:** Check that terminals older than 24 hours are removed from DB on startup.
- [ ] **Expected:** Old records cleaned up automatically.

### 17.4 Holder Process Persistence

- [ ] **Steps:** Stop server, check `ps aux | grep pty-holder`.
- [ ] **Expected:** PTY holder processes are still running (detached). Unix sockets still exist at `/tmp/shooter-term-*.sock`.

### 17.5 Reconnect After Restart

- [ ] **Steps:** Start server after restart. Check terminal list.
- [ ] **Expected:** `reconnectAll()` recovers terminals from SQLite. Holder clients reconnect.

### 17.6 Dead Holder Recovery

- [ ] **Steps:** Kill a holder process manually, restart server.
- [ ] **Expected:** Reconnect fails for that terminal. Terminal marked as exited. No crash.

### 17.7 .env Fallback Chain

- [ ] **Steps:** Set `API_KEY` in `~/.shooter/.env` only (not project `.env`).
- [ ] **Expected:** Server picks up the key from fallback location.

---

## 18. Security & Edge Cases

### 18.1 API Key Not in Logs

- [ ] **Steps:** Start server, check log output.
- [ ] **Expected:** API key never printed in full. Only masked version (e.g., `sachin...1a`).

### 18.2 CWD Traversal Prevention

- [ ] **Steps:** Create terminal with `"cwd":"../../etc"`.
- [ ] **Expected:** `400` — directory traversal blocked.

### 18.3 Command Injection Prevention

- [ ] **Steps:** Create terminal with `"command":"zsh; rm -rf /"`.
- [ ] **Expected:** `400` — command not in allowlist.

### 18.4 Device Token File Permissions

- [ ] **Steps:** Check `~/.shooter/device-tokens.json` permissions.
- [ ] **Expected:** Mode `0600` (owner read/write only).

### 18.5 Concurrent WebSocket Clients

- [ ] **Steps:** Open same terminal in two browser tabs.
- [ ] **Expected:** Both receive output. Input from either tab works. No crash.

### 18.6 WebSocket Backpressure

- [ ] **Steps:** Run a command that produces massive output (e.g., `find /`).
- [ ] **Expected:** Server manages backpressure. Slow clients don't crash the server.

### 18.7 Large Session File

- [ ] **Steps:** View a session with 1000+ messages.
- [ ] **Expected:** Loads with pagination. No timeout or OOM.

### 18.8 Corrupt JSONL Session

- [ ] **Steps:** Manually corrupt a session JSONL file (add garbage bytes).
- [ ] **Expected:** Parser skips corrupt lines. Other sessions unaffected.

---

## 19. Regression Checklist

Quick smoke tests to ensure nothing is broken:

- [ ] **19.1** `GET /` → 200, renders HTML
- [ ] **19.2** `GET /terminals` → 200
- [ ] **19.3** `GET /activity` → 200
- [ ] **19.4** `GET /config` → 200
- [ ] **19.5** `GET /neurolink` → 200
- [ ] **19.6** `GET /api/health` → 200, status "healthy"
- [ ] **19.7** `GET /api/sessions` (with auth) → 200
- [ ] **19.8** `POST /api/notify` (with auth + body) → 200
- [ ] **19.9** `POST /api/ws-ticket` (with auth) → 200
- [ ] **19.10** `GET /api/terminals` (with auth) → 200
- [ ] **19.11** `POST /api/terminals` (create zsh) → 200
- [ ] **19.12** `GET /api/debug` (with auth) → 200
- [ ] **19.13** `GET /api/qr-config` (with auth) → 200
- [ ] **19.14** `POST /api/device-token` (with auth + body) → 200
- [ ] **19.15** `GET /nonexistent` → error page renders

---

## Findings Log

> Record bugs, issues, and observations here as you test.

| #   | Date | Section | Item | Finding | Severity | Status |
| --- | ---- | ------- | ---- | ------- | -------- | ------ |
|     |      |         |      |         |          |        |

---

**Total test items: 143**

| Category                         | Count |
| -------------------------------- | ----- |
| Pre-Flight                       | 4     |
| Server Startup                   | 5     |
| Authentication                   | 6     |
| Health & Diagnostics             | 10    |
| Push Notifications               | 7     |
| Bidirectional Permissions        | 5     |
| Device Registration              | 5     |
| Terminal Subsystem               | 12    |
| WebSocket Channels               | 12    |
| Session Management               | 9     |
| NeuroLink AI                     | 12    |
| Activity Feed & AI Summarization | 17    |
| UI Pages                         | 19    |
| Settings & AI Config             | 13    |
| Setup Wizard                     | 15    |
| CLI Commands                     | 13    |
| Persistence & Recovery           | 7     |
| Security & Edge Cases            | 8     |
| Regression Smoke                 | 15    |
