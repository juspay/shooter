# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📖 Required Reading

**BEFORE making ANY changes, read these documents:**

1. **`docs/GUIDANCE.md`** - Complete development guide including:
   - Project organization and directory structure
   - Type system (type-crafter workflow)
   - Code location guidelines (where to write what)
   - Development workflow and best practices
   - Import patterns and conventions

2. **`CLAUDE.md`** (this file) - High-level project overview and context

## Project Overview

This repository contains a **WORKING** bidirectional communication system between Shooter and iOS applications using push notifications. The system enables Shooter to automatically send real-time notifications to iOS devices when coding events occur, with plans for interactive responses.

## Project Structure

### Core Implementation ✅

- `docs/GUIDANCE.md` - **READ THIS FIRST** - Complete development guide
- `docs/CLAUDE-CODE-INTEGRATION.md` - **WORKING** Shooter lifecycle hooks integration
- `.claude/` - Shooter hook configuration and unified Node.js notifier (`notifier.cjs`)
- `src/lib/modules/` - Organized modular code (client + server)
  - `server/apn/` - Apple Push Notification service implementations
  - `server/cli/` - CLI command execution utilities
  - `client/common/` - Reusable UI components
- `src/lib/types/` - Auto-generated TypeScript types (DO NOT EDIT)
- `specs/types/` - Type-crafter YAML specifications (EDIT HERE for types)
  - `index.yaml` - Main spec file (top file with references)
  - `jwt.yaml` - JWT authentication types
  - `apn.yaml` - APNs notification types
  - `cli.yaml` - CLI module types
- `ios/` - Swift iOS app (working, receiving notifications + interactive permission responses)

### Architecture Documentation (in `plans/` and `docs/`)

- `plans/PLAN-A.MD` - Basic SvelteKit + Vercel + APNs architecture (✅ IMPLEMENTED)
- `plans/PLAN-B.MD` - Comprehensive bidirectional communication system with detailed implementation guide
- `plans/NEXT-PHASES.md` - Roadmap for enhanced features and production readiness
- `docs/POC-IMPLEMENTATION-GUIDE.md` - POC implementation details
- `docs/POC-ACHIEVEMENT-SUMMARY.md` - POC achievements summary
- `docs/GUIDANCE.md` - Development guidance (code organization, type system, best practices)

## Key Technologies

- **SvelteKit** - Central server framework for API endpoints and admin interface
- **Vercel** - Cloud deployment platform
- **Apple Push Notifications (APNs)** - iOS notification delivery
- **Cloudflare Tunnel** - Webhook delivery for bidirectional communication
- **TypeScript** - Primary development language
- **Swift/SwiftUI** - iOS application development

## Implementation Phases

The system is designed to be built in four phases:

1. **Phase 1**: Basic push notifications (one-way communication)
2. **Phase 2**: Interactive notifications with simple responses
3. **Phase 3**: Full bidirectional communication with webhooks
4. **Phase 4**: Reliability enhancements and state management

## Core Components

### SvelteKit Application

- API routes: `/api/notify`, `/api/response`, `/api/webhook`, `/api/health`
- APNs integration with JWT authentication (sandbox/production via `APNS_PRODUCTION` env var)
- In-memory pending request store for bidirectional permission flow
- Request validation and error handling

### iOS Application

- Push notification registration and handling
- Interactive notification categories (confirmation, text input)
- Response handling and server communication
- Local notification history

### Shooter Integration ✅ **WORKING**

- **Lifecycle Hooks**: Automatic detection of tool usage, user prompts, session events
- **Unified Notifier**: Single `notifier.cjs` (Node.js) handles all hook events with async polling for bidirectional permissions
- **Context-Aware Notifications**: Smart categorization (debug, feature, testing, learning)
- **Bidirectional Permissions**: PermissionRequest hook blocks, sends interactive iOS notification, polls for Allow/Deny response
- **Configuration**: `.claude/settings.json` + `notifier.cjs` in `.claude/hooks/`
- **Environment Variables**: `SHOOTER_USE_LOCAL`, `SHOOTER_LOCAL_PORT`, `SHOOTER_API_URL`, `SHOOTER_PERMISSION_TIMEOUT`

## Security Requirements

- Bearer token authentication for Shooter → SvelteKit communication
- Apple APNs JWT tokens with automatic rotation
- HMAC signature validation for webhook security
- Environment-based configuration management
- No secrets in code or commits

## Development Workflow

✅ **IMPLEMENTED AND WORKING** - Shooter notification system is live and comprehensive:

1. Follow `plans/PLAN-A.MD` for basic implementation
2. Use `plans/PLAN-B.MD` for comprehensive system architecture
3. Implement in phases as outlined in the plans
4. Test components individually before integration

## Environment Setup

Required environment variables (set in `.env` for local dev):

- `API_KEY` - Bearer token for hook → server auth
- `APNS_KEY` - APNs private key (.p8 contents)
- `APNS_KEY_ID` - APNs key ID
- `APNS_TEAM_ID` - Apple Team ID
- `APNS_BUNDLE_ID` - iOS app bundle identifier
- `APNS_PRODUCTION` - Set to `true` for TestFlight/App Store builds (default: sandbox)
- `DEVICE_TOKEN` - Target iOS device token

You'll also need:

- Apple Developer account with Push Notifications capability
- Vercel account for deployment

## Testing Strategy

The plans include comprehensive testing approaches:

- Unit tests for API endpoints
- Integration tests for end-to-end flows
- Performance testing with load scenarios
- Network failure simulation
- Security validation

## Deployment

- SvelteKit app deploys to Vercel
- iOS app requires Xcode and device/simulator
- Cloudflare Tunnel for webhook delivery (Phase 3+)
- Environment variables managed through Vercel dashboard

## Known Limitations

### In-Memory Pending Requests Store

The bidirectional permission flow uses an in-memory `Map` in `pending-requests.ts`. This works for single-instance deployments but will break if multiple Vercel serverless instances handle the notify and response endpoints. For multi-instance production use, replace with a shared store (e.g., Upstash Redis).

### Hook Completion Timer

The 45-second completion timer in `notifier.cjs` only works for OpenCode (persistent plugin). For Claude Code, each hook invocation is a separate process, so timers cannot fire across invocations. The code is guarded with `IS_CLAUDE_CODE` checks to skip this path.

### Hook Timeout Mismatch

The `PermissionRequest` hook has a 180-second timeout in `.claude/settings.json`, but the notifier's internal `PERMISSION_TIMEOUT` defaults to 120 seconds. The 60-second buffer ensures the notifier resolves before Claude Code kills the process.

### APNs Environment

The iOS app entitlements declare `aps-environment = production`. The server's `APNS_PRODUCTION` env var controls which APNs gateway is used (default: sandbox). For TestFlight/App Store builds, set `APNS_PRODUCTION=true` in the server environment.
