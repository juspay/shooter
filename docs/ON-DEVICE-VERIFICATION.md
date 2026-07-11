# On-Device Verification Checklist

The "make Shooter feel native" program (releases **v1.27.0 – v1.31.0**) was built
and verified as far as is reproducible without hardware — `pnpm check/build/test/lint`,
browser screenshots, curl round-trips against the real APNs gateway, and
`xcodebuild ** BUILD SUCCEEDED **`. Everything below is the remaining acceptance
that genuinely needs a **real phone** (and, for a couple of items, an Xcode/portal
step). Work top to bottom; each item says what to do and what "pass" looks like.

Design specs for every feature live under `docs/superpowers/specs/2026-07-*`.

---

## 0. Prerequisites (one-time)

- [ ] **Server reachable from the phone.** `shooter start` on the host; the phone's
      server URL + API key are set (Settings, QR, or the pairing screen).
- [ ] **iOS build & install.** Open `ios/Shooter/Shooter.xcodeproj` in Xcode, select
      your device, Run. (Requires the App Group + Live Activity capabilities below.)
- [ ] **App Group registered** (for the home-screen widget): in the Apple Developer
      portal, create App Group `group.in.juspay.shooter` and enable it on **both** the
      `Shooter` app and the `ShooterWidget` extension in Signing & Capabilities. (The
      entitlements files already declare it; the portal registration is the manual step.)
- [ ] **Live Activity call sites** are already wired (a session notification tap starts
      one). If you want it to start on more triggers, call
      `LiveActivityManager.shared.start(sessionId:title:status:)` from there too.

---

## 1. Web Push (PWA / browser) · PR #117

- [ ] **iOS:** open the server URL in **Safari** → Share → **Add to Home Screen**, then
      open the installed PWA. (iOS only allows Web Push from an installed PWA, not a tab.)
      Android/desktop Chrome: a normal tab is fine.
- [ ] Settings → **Browser Notifications** → **Enable** → accept the OS prompt.
      **Pass:** status dot turns green, "Enabled on this device".
- [ ] Tap **Send test push**. **Pass:** a "Shooter test push" notification appears within
      a few seconds, even with the app backgrounded.
- [ ] Tap the notification. **Pass:** it focuses/opens the app.
- [ ] Trigger a real Claude Code event (e.g. a permission prompt). **Pass:** it lands as
      a browser push too.
- [ ] Tap **Turn off**. **Pass:** no further pushes arrive.

## 2. Motion & nav feel (any phone; PWA or Safari) · PR #117

- [ ] **Sliding tab indicator:** switch Dashboard ↔ Terminals ↔ SoS. **Pass:** the amber
      underline glides between tabs (no jump).
- [ ] **Edge-swipe back:** on a **Session** or **Project** screen, swipe right **from the
      very left edge**. **Pass:** the screen slides and completes back to the parent; a
      short swipe springs back.
- [ ] **Swipe-to-delete:** on the Terminals list, swipe left on an **exited** terminal.
      **Pass:** a red Delete reveals; a full swipe deletes it.
- [ ] **Pull-to-refresh** on a list screen reloads it (with a haptic tick).
- [ ] **Skeletons:** on a cold load, cards show content-shaped placeholders, not grey blocks.
- [ ] **Haptics:** a tab switch / quick-key press gives a physical tick (native build).
- [ ] **Reduced Motion** (Settings → Accessibility): the above animations are inert.

## 3. Keyboard-aware terminal + safe area · PR #117

- [ ] Open a terminal, tap the input. **Pass:** the input bar + quick-keys ride **above**
      the on-screen keyboard (never covered).
- [ ] In the Home-Screen PWA: the nav bar clears the **notch/status bar**, and the terminal
      top bar isn't under it.

## 4. Live Activity (Lock Screen + Dynamic Island) · PR #118 / #119

Requires a real device on **iOS 16.2+**, Live Activities enabled (Settings → Face ID &
Passcode → allow, and per-app).

- [ ] Trigger/tap a session notification. **Pass:** a Live Activity appears on the **Lock
      Screen** (amber icon + session title + status pill).
- [ ] On a Dynamic Island phone (14 Pro+): check compact, expanded, and minimal presentations.
- [ ] From the server, push an update with the curl below. **Pass:** the activity updates
      live. (The server↔APNs path is already gateway-verified — a real device token replaces
      the `BadDeviceToken` seen with a dummy token.)
- [ ] Push `"event":"end"`. **Pass:** the activity dismisses.
- [ ] **Status text is correct** (not stuck on "Active"): the status reflects the event —
      "Permission needed" / "Awaiting answer" / "Awaiting input" / "Done". (This was the
      #120 review fix — the app reads `data.category`.)

Live Activity update push (fill in `$BASE`, `$KEY`, `<id>`):

```bash
curl -X POST "$BASE/api/live-activity" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"sessionId":"<id>","event":"update",
       "contentState":{"title":"claude","status":"Awaiting input",
                       "detail":"Permission: Edit","updatedAt":"2026-07-11T00:00:00Z"}}'
```

## 5. Home-screen widget · PR #120

Requires the **App Group** prerequisite above.

- [ ] Add the **Shooter** widget to the Home Screen (long-press → + → Shooter), small and medium.
- [ ] Trigger a session notification (foreground or tap). **Pass:** the widget shows the
      session title + status; the dot is green while active.
- [ ] Complete the session. **Pass:** the widget flips to "Done" / dot grey (this exercises
      the `category == "completion"` fix from #120).
- [ ] Two concurrent sessions: an urgent one (Permission needed) shouldn't be downgraded by
      a "Running" event from the other (session-affinity rule).

## 6. Deep links · PR #121

- [ ] **Tap the home-screen widget.** **Pass:** the app opens **to that session**
      (`/session/<id>`), not just the home screen.
- [ ] **Tap the Lock Screen Live Activity.** **Pass:** same — opens to its session.
- [ ] Tap with the app already open. **Pass:** it navigates to the session in place.

---

## What's already verified (no device needed)

- Web Push subscribe → store → notify fan-out → prune (curl); VAPID gen/persist; `/sw.js` served.
- Live Activity request accepted by the **real APNs gateway** (`liveactivity` topic + JWT +
  content-state all validated; only a dummy token rejected).
- App Group id identical across app/widget entitlements + `WidgetShared.appGroup`.
- Deep-link scheme present in the **built `Info.plist`** alongside all generated keys.
- Two adversarial reviews (widget, deep links): all confirmed findings fixed; deep-link review clean.
- `xcodebuild ** BUILD SUCCEEDED **` for app + `ShooterWidget` (Live Activity + Home widget).
