# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains a **WORKING** bidirectional communication system between Claude Code and iOS applications using push notifications. The system enables Claude Code to automatically send real-time notifications to iOS devices when coding events occur, with plans for interactive responses.

## Project Structure

### Core Implementation ✅
- `CLAUDE-CODE-INTEGRATION.md` - **WORKING** Claude Code lifecycle hooks integration
- `.claude/` - Claude Code hook configuration and Python scripts
- `src/` - SvelteKit API server (working locally, production needs env fix)
- `ios/` - Swift iOS app (working, receiving notifications)

### Architecture Documentation
- `PLAN-A.MD` - Basic SvelteKit + Vercel + APNs architecture (✅ IMPLEMENTED)
- `PLAN-B.MD` - Comprehensive bidirectional communication system with detailed implementation guide
- `DEBUGGING-JOURNEY.md` - Complete implementation history and lessons learned
- `NEXT-PHASES.md` - Roadmap for enhanced features and production readiness

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
- API routes: `/api/notify`, `/api/webhook`, `/api/health`
- APNs integration with JWT authentication
- Request validation and error handling
- Optional admin interface for monitoring

### iOS Application
- Push notification registration and handling
- Interactive notification categories (confirmation, text input)
- Response handling and server communication
- Local notification history

### Claude Code Integration ✅ **WORKING**
- **Lifecycle Hooks**: Automatic detection of tool usage, user prompts, session events
- **HTTP Client**: Python scripts send POST requests to SvelteKit API
- **Context-Aware Notifications**: Smart categorization (debug, feature, testing, learning)
- **Real-time Events**: File edits, commands, session start/stop notifications
- **Configuration**: `.claude/settings.json` + Python hooks in `.claude/hooks/`
- **Setup**: Interactive configuration script (`python3 .claude/setup.py`)

## Security Requirements

- Bearer token authentication for Claude Code → SvelteKit communication
- Apple APNs JWT tokens with automatic rotation
- HMAC signature validation for webhook security
- Environment-based configuration management
- No secrets in code or commits

## Development Workflow

Since this is currently a planning repository with no implemented code:

1. Follow PLAN-A.MD for basic implementation
2. Use PLAN-B.MD for comprehensive system architecture
3. Implement in phases as outlined in the plans
4. Test components individually before integration

## Environment Setup

When implementing, you'll need:
- Apple Developer account with Push Notifications capability
- APNs Auth Key (.p8 file) with Key ID and Team ID
- Vercel account for deployment
- Device tokens from iOS app for testing

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