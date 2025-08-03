🚀 SvelteKit + Vercel Private Push Architecture for iOS/Swift App

1. System Overview

Send real-time push notifications (alert/silent/interactive) to your own iOS/Swift app from anywhere using:
	•	SvelteKit on Vercel (API & UI layer)
	•	Apple APNs (secure push delivery)
	•	CLI tools for event/webhook triggering
	•	Optional: Cloudflare Tunnel for Mac/local server push

All device tokens, secrets, and APNs credentials are managed securely (env vars/JSON). The system is suitable for local development, testing, or personal production use, with minimal infra cost.

⸻

2. High-Level Architecture Diagram

flowchart TD
    CLI[(CLI or Script)] -->|POST /api/push| API[SvelteKit API (Vercel)]
    App((Swift/iOS App)) -- Reg Device Token --> API
    API -- Store Token --> TOKENS[Device Token Store]
    API -- Push via HTTP/2 + JWT (.p8) --> APNS[Apple Push Notification Service]
    APNS -- Notify --> App
    Admin[Admin UI (SvelteKit, optional)] -- View/Edit --> API


⸻

3. Component Responsibilities

SvelteKit (Vercel)
	•	/api/device/register — Accept device tokens from app, store securely (JSON/env/KV).
	•	/api/push — Receives push commands (from CLI/webhook), authenticates with API key, triggers push via APNS.
	•	/api/device/query — List/view tokens for debug/admin.
	•	Admin UI (optional) — Manage/view tokens, trigger test pushes.
	•	All endpoints are protected by custom API key header.

Apple APNs (.p8 Auth Key)
	•	Vercel reads key from env, generates JWT, and calls APNs HTTP/2 endpoint (sandbox/production).
	•	Device token and bundle ID used to address the target app.

CLI/Automation
	•	Calls /api/push (with key) to trigger notification (alert, silent, or custom payload).

Swift/iOS App
	•	Registers for push, sends token to /api/device/register.
	•	Handles notifications in app delegate (didReceiveRemoteNotification).

⸻

4. SvelteKit Endpoint Skeletons (TypeScript)

/src/routes/api/device/register/+server.ts

import { json } from '@sveltejs/kit';
export const POST = async ({ request }) => {
  const { token } = await request.json();
  // Save to local file, DB, or memory (demo: JSON file)
  // e.g. fs.writeFileSync('tokens.json', ...)
  return json({ ok: true });
};

/src/routes/api/push/+server.ts

import { json } from '@sveltejs/kit';
export const POST = async ({ request }) => {
  if (request.headers.get('x-api-key') !== process.env.API_KEY)
    return new Response('Unauthorized', { status: 401 });
  const { alert, token } = await request.json();
  // Load APNS creds: process.env.APNS_P8_KEY, ...
  // Send HTTP/2 request to APNs with payload
  return json({ ok: true });
};

/src/routes/api/device/query/+server.ts

import { json } from '@sveltejs/kit';
export const GET = async () => {
  // Return list of tokens from JSON/file/memory
  return json({ tokens: [] });
};


⸻

5. APNs Payload Examples

Alert Notification

{ "aps": { "alert": "Hello from SvelteKit!", "sound": "default" } }

Silent Push

{ "aps": { "content-available": 1 } }

Interactive (Custom)

{ "aps": { "alert": "Action Required!", "category": "ACTIONABLE" }, "myData": "value" }


⸻

6. Alternatives & Tradeoffs

Method	Real-time	iOS BG Support	Infra Needed	Setup	Data Limit
APNs+SvelteKit	Yes	Yes	Vercel+APNs	Medium	4KB
Tunnel+Server	Yes	No (iOS BG)	Vercel+CF	Low/Medium	Large
KV+Polling	No	No	Vercel+KV	Low	Large

	•	APNs push (default): Best for iOS, works background/locked.
	•	Cloudflare Tunnel: Best for Mac/local, real-time, app must be running.
	•	KV+polling: Simple, not real-time, app fetches periodically.

⸻

7. Deployment Checklist
	•	Create Apple APNs .p8 key; store in Vercel project env (APNS_P8_KEY, APNS_KEY_ID, APNS_TEAM_ID).
	•	Hardcode or securely store device token from iOS app.
	•	Set API_KEY in Vercel env, require in all requests.
	•	Implement SvelteKit endpoints and protect with API key.
	•	Never commit secrets or tokens to git.
	•	(Optional) Build admin UI in SvelteKit.

⸻

8. README Scaffold (Markdown)

# SvelteKit/Vercel Private Push API for iOS App

## Features
- SvelteKit API endpoints: `/api/push`, `/api/device/register`
- APNs push delivery with .p8 key
- CLI and webhook integration
- Admin UI (optional)

## Quickstart
1. Enable push in iOS app, get device token
2. Create APNs Auth Key (.p8), note Key ID, Team ID
3. Add endpoints to SvelteKit, set env vars in Vercel:
   - `API_KEY`, `APNS_P8_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, etc.
4. Deploy to Vercel
5. Call `/api/push`:
   ```sh
   curl -XPOST https://your-app.vercel.app/api/push \
     -H 'x-api-key: YOUR_KEY' \
     -d '{ "alert": "Hello!", "token": "..." }'

Security
	•	All endpoints require x-api-key header
	•	All secrets only in env vars

⸻

See ARCHITECTURE.md for more.

