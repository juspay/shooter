# Development Guidance

This document provides guidance for AI assistants and developers on how to work with this codebase effectively.

## Table of Contents

- [Project Organization](#project-organization)
- [Type System](#type-system)
- [Code Location Guidelines](#code-location-guidelines)
- [Development Workflow](#development-workflow)
- [Best Practices](#best-practices)

---

## Project Organization

### Directory Structure

```text
shooter/
├── server.ts                   # Custom HTTP + WebSocket server (entry point)
├── .claude/                    # Claude Code integration (Shooter lifecycle hooks)
├── docs/                       # Project documentation
│   ├── GUIDANCE.md            # This file - development guidance
│   ├── CLAUDE-CODE-INTEGRATION.md
│   ├── POC-ACHIEVEMENT-SUMMARY.md
│   └── POC-IMPLEMENTATION-GUIDE.md
├── plans/                      # Architecture and planning documents
│   ├── PLAN-A.MD              # Basic architecture (IMPLEMENTED)
│   ├── PLAN-B.MD              # Comprehensive bidirectional system
│   └── NEXT-PHASES.md         # Future roadmap
├── specs/                      # Type specifications (YAML)
│   └── types/
│       ├── index.yaml         # Main type spec (top file)
│       ├── jwt.yaml           # JWT authentication types
│       ├── apn.yaml           # APNs notification types
│       └── terminal.yaml      # Terminal/PTY types
├── src/
│   ├── generated/
│   │   └── types/             # Auto-generated TypeScript types (DO NOT EDIT)
│   ├── lib/
│   │   ├── modules/
│   │   │   ├── client/        # Client-side code
│   │   │   │   ├── common/    # Reusable UI components
│   │   │   │   └── terminal/  # Terminal UI components
│   │   │   │       ├── ChatView.svelte
│   │   │   │       ├── LaunchSheet.svelte
│   │   │   │       ├── QuickKeys.svelte
│   │   │   │       ├── ConnectionStatus.svelte
│   │   │   │       └── xterm-wrapper.ts
│   │   │   └── server/        # Server-side code
│   │   │       ├── apn/       # APNs implementations
│   │   │       ├── auth.ts    # Authentication helpers
│   │   │       ├── terminal/  # PTY management
│   │   │       │   ├── pty-manager.ts
│   │   │       │   └── session-watcher.ts
│   │   │       ├── ws/        # WebSocket server
│   │   │       │   ├── server.ts
│   │   │       │   ├── terminal-handler.ts
│   │   │       │   ├── session-handler.ts
│   │   │       │   ├── events-handler.ts
│   │   │       │   ├── keepalive.ts
│   │   │       │   └── ticket-store.ts
│   │   │       └── sessions/  # Session readers
│   │   │           ├── jsonl-reader.ts
│   │   │           ├── opencode-reader.ts
│   │   │           └── types.ts
│   │   └── assets/            # Static assets
│   └── routes/                # SvelteKit routes (API + pages)
│       ├── api/               # API endpoints
│       │   ├── notify/        # POST /api/notify
│       │   ├── sessions/      # GET /api/sessions
│       │   ├── terminals/     # POST/DELETE /api/terminals, /api/terminals/[id]
│       │   ├── ws-ticket/     # POST /api/ws-ticket
│       │   ├── ws-status/     # GET /api/ws-status
│       │   ├── webhook/       # POST /api/webhook (future)
│       │   └── debug/         # Debug endpoint (authenticated)
│       ├── terminals/         # Terminal list page (/terminals)
│       │   └── [id]/          # Terminal session page (/terminals/[id])
│       ├── project/           # Project overview page (/project)
│       ├── session/
│       │   └── [id]/          # Session detail page (/session/[id])
│       ├── config/            # Configuration UI page
│       ├── +page.svelte       # Home page
│       └── +layout.svelte     # Root layout
├── ios/                        # iOS Swift application
└── package.json
```

---

## Type System

### 🔴 CRITICAL: Auto-Generated Types

**ALL types are auto-generated from YAML specifications. NEVER manually edit generated TypeScript files.**

### Type-Crafter Workflow

1. **Define types in YAML specs** (`specs/types/`)
2. **Validate specs**: `pnpm run types:validate`
3. **Generate TypeScript**: `pnpm run types:generate`
4. **Import and use** in your code

### YAML Specification Files

#### `specs/types/index.yaml` (Top File)

- Main specification file with `info` section
- Contains `groupedTypes` that reference other spec files
- This is the entry point for type generation

#### `specs/types/jwt.yaml` (Non-Top File)

- JWT authentication types
- `JWT.Header` - JWT header structure
- `JWT.Payload` - JWT payload with claims

#### `specs/types/apn.yaml` (Non-Top File)

- APNs notification types
- `APN.NotificationPayload` - Push notification payload
- `APN.NotificationResult` - Send operation result
- `APN.Error` - Error details
- `APN.ProviderOptions` - APNs provider configuration
- And many more...

#### `specs/types/cli.yaml` (Non-Top File)

- CLI module types for command execution
- `CLI.Options` - Configuration options (verbose, dryRun, timeout)
- `CLI.Command` - Command structure (name, args, options)
- `CLI.Result` - Execution result (success, output, error, exitCode)

### Generated TypeScript Files

**Location**: `src/generated/types/` (DO NOT EDIT THESE FILES)

- `index.ts` - Re-exports all types
- `JWT.ts` - Generated JWT types
- `APN.ts` - Generated APNs types
- `CLI.ts` - Generated CLI types
- `Terminal.ts` - Generated Terminal types

### Type Usage Examples

```typescript
// Import from centralized types module
import type { Header as JWTHeader, Payload as JWTPayload } from '$lib/types';

import type { NotificationPayload, NotificationResult, Error as APNsError } from '$lib/types';

// All nullable fields use | null (NOT | undefined)
const payload: NotificationPayload = {
  title: 'Hello',
  body: 'World',
  message: null, // ✅ Correct
  badge: null,
  sound: null,
  data: null,
};

// NOT this:
const badPayload = {
  title: 'Hello',
  body: undefined, // ❌ Wrong - use null
};
```

### Adding New Types

1. **Edit YAML spec** in `specs/types/`

   ```yaml
   # specs/types/apn.yaml
   APN:
     MyNewType:
       type: object
       required:
         - requiredField
       properties:
         requiredField:
           type: string
         optionalField: # Not in required = nullable
           type: string
   ```

2. **Validate** your changes

   ```bash
   pnpm run types:validate
   ```

3. **Regenerate TypeScript**

   ```bash
   pnpm run types:generate
   ```

4. **Use in code**
   ```typescript
   import type { MyNewType } from '$lib/types';
   ```

### Type-Crafter Rules Summary

- **Nullability**: Controlled by `required` array. `nullable: true` may also be used to explicitly mark a field as `| null`; `optional` keyword is not supported.
- **Arrays**: Must be properties within objects, never top-level
- **References**: Use full paths from project root (e.g., `./specs/types/apn.yml#/APN/Error`)
- **Top files**: Have `info` section, can use `#/` for same-file refs
- **Non-top files**: Must use full file paths for ALL references

---

## Code Location Guidelines

### Where to Write Different Types of Code

#### 1. **UI Components** → `src/lib/modules/client/common/`

**When**: Creating reusable Svelte components (buttons, cards, inputs, etc.)

```text
src/lib/modules/client/common/
├── Alert.svelte
├── Button.svelte
├── Card.svelte
├── Input.svelte
└── index.ts          # Re-export all components
```

**Import pattern**:

```typescript
import { Button, Card, Input } from '$lib/modules/client/common';
```

#### 2. **APNs Implementations** → `src/lib/modules/server/apn/`

**When**: Working with Apple Push Notifications

```text
src/lib/modules/server/apn/
├── library-apns.ts   # APNs service (using @parse/node-apn)
├── pending-requests.ts # In-memory bidirectional permission store
└── types.ts          # Shared notification types
```

**Import pattern**:

```typescript
import { LibraryAPNsService } from '$lib/modules/server/apn/library-apns';
```

#### 2b. **CLI Utilities** → `src/lib/modules/server/cli/`

**When**: Working with CLI command execution

```text
src/lib/modules/server/cli/
└── index.ts          # CLI command utilities
```

**Import pattern**:

```typescript
import {
  createCommand,
  withOptions,
  formatCommand,
  createSuccessResult,
  createErrorResult,
} from '$lib/modules/server/cli';
import type { CLICommand, CLIOptions, CLIResult } from '$lib/modules/server/cli';
```

#### 2c. **Terminal Modules** → `src/lib/modules/server/terminal/`

**When**: Working with PTY management and session watching

```text
src/lib/modules/server/terminal/
├── pty-manager.ts    # PTY lifecycle (spawn, resize, kill)
└── session-watcher.ts # Watch for session file changes
```

**Import pattern**:

```typescript
import { PtyManager } from '$lib/modules/server/terminal/pty-manager';
import { SessionWatcher } from '$lib/modules/server/terminal/session-watcher';
```

#### 2d. **WebSocket Modules** → `src/lib/modules/server/ws/`

**When**: Working with WebSocket server, handlers, and connection management

```text
src/lib/modules/server/ws/
├── server.ts          # WebSocket server setup
├── terminal-handler.ts # Handle terminal I/O over WS
├── session-handler.ts  # Handle session events over WS
├── events-handler.ts   # Handle general events over WS
├── keepalive.ts        # Connection keepalive/ping-pong
└── ticket-store.ts     # One-time WS auth ticket store
```

**Import pattern**:

```typescript
import { createWSServer } from '$lib/modules/server/ws/server';
import { TicketStore } from '$lib/modules/server/ws/ticket-store';
```

#### 2e. **Session Modules** → `src/lib/modules/server/sessions/`

**When**: Reading and parsing session data (JSONL, OpenCode formats)

```text
src/lib/modules/server/sessions/
├── jsonl-reader.ts    # Parse JSONL session files
├── opencode-reader.ts # Parse OpenCode session format
└── types.ts           # Session data types
```

**Import pattern**:

```typescript
import { readJsonlSession } from '$lib/modules/server/sessions/jsonl-reader';
import { readOpencodeSession } from '$lib/modules/server/sessions/opencode-reader';
```

#### 2f. **Terminal UI Components** → `src/lib/modules/client/terminal/`

**When**: Building terminal-related UI (xterm, controls, status)

```text
src/lib/modules/client/terminal/
├── ChatView.svelte        # Chat-style session view
├── LaunchSheet.svelte     # Terminal launch dialog
├── QuickKeys.svelte       # Quick-access key buttons
├── ConnectionStatus.svelte # WS connection indicator
└── xterm-wrapper.ts       # xterm.js integration wrapper
```

**Import pattern**:

```typescript
import ChatView from '$lib/modules/client/terminal/ChatView.svelte';
import { XtermWrapper } from '$lib/modules/client/terminal/xterm-wrapper';
```

#### 3. **Server Utilities** → `src/lib/modules/server/`

**When**: Creating server-side utilities (future modules)

```text
src/lib/modules/server/
├── apn/              # APNs implementations
├── auth.ts           # Authentication helpers
├── cli/              # CLI command utilities
├── terminal/         # PTY management
├── ws/               # WebSocket server
├── sessions/         # Session readers
└── webhook/          # Webhook handlers (future)
```

#### 4. **API Endpoints** → `src/routes/api/`

**When**: Creating REST API endpoints

```text
src/routes/api/
├── notify/
│   └── +server.ts    # POST /api/notify
├── sessions/
│   └── +server.ts    # GET /api/sessions
├── terminals/
│   ├── +server.ts    # POST /api/terminals (create)
│   └── [id]/
│       ├── +server.ts    # DELETE /api/terminals/[id]
│       └── resize/
│           └── +server.ts # POST /api/terminals/[id]/resize
├── ws-ticket/
│   └── +server.ts    # POST /api/ws-ticket
├── ws-status/
│   └── +server.ts    # GET /api/ws-status
├── webhook/
│   └── +server.ts    # POST /api/webhook (future)
└── health/
    └── +server.ts    # GET /api/health (future)
```

**Structure**:

```typescript
// src/routes/api/notify/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  // Handle POST /api/notify
};
```

#### 5. **UI Pages** → `src/routes/`

**When**: Creating user-facing pages

```text
src/routes/
├── +page.svelte      # Home page (/)
├── +layout.svelte    # Root layout
├── config/
│   └── +page.svelte  # Config page (/config)
├── terminals/
│   ├── +page.svelte  # Terminal list page (/terminals)
│   └── [id]/
│       └── +page.svelte  # Terminal session page (/terminals/[id])
├── project/
│   └── +page.svelte  # Project overview page (/project)
├── session/
│   └── [id]/
│       └── +page.svelte  # Session detail page (/session/[id])
└── admin/
    └── +page.svelte  # Admin page (/admin) (future)
```

#### 6. **Type Specifications** → `specs/types/`

**When**: Defining data structures and types

```text
specs/types/
├── index.yaml        # Main spec file
├── jwt.yaml          # JWT types
├── apn.yaml          # APNs types
├── terminal.yaml     # Terminal/PTY types
└── webhook.yaml      # Webhook types (future)
```

#### 7. **Documentation** → `docs/` and `plans/`

**When**: Writing documentation

- `docs/` - Implementation guides, achievements, working configs
- `plans/` - Architecture plans, future roadmap

---

## Development Workflow

### Package Manager: pnpm ONLY

This project **ENFORCES** pnpm. npm and yarn are blocked.

```bash
# ✅ Correct
pnpm install
pnpm run dev
pnpm run build

# ❌ Blocked
npm install    # Will fail with error
yarn install   # Will fail with error
```

### Common Commands

```bash
# Development
pnpm run dev                # Start dev server
pnpm run build             # Build for production
pnpm run preview           # Preview production build

# Type System
pnpm run types:validate    # Validate YAML specs
pnpm run types:generate    # Generate TypeScript from YAML

# Code Quality
pnpm run lint              # Run ESLint
pnpm run lint:fix          # Fix ESLint errors
pnpm run format            # Format with Prettier
pnpm run format:check      # Check formatting
pnpm run check             # TypeScript type check
pnpm run validate          # Run all checks (format + lint + typecheck)

# Production
pnpm start                 # Run production server (tsx server.ts)
```

### Making Changes

1. **Before starting**:

   ```bash
   pnpm install              # Ensure dependencies are up to date
   ```

2. **During development**:

   ```bash
   pnpm run dev              # Run dev server
   pnpm run check            # Type check as you go
   ```

3. **Before committing**:

   ```bash
   pnpm run validate         # Run all checks
   pnpm run build           # Ensure it builds
   ```

4. **Commit with clear message**:

   ```bash
   git add .
   git commit -m "type: description"
   ```

   **Commit types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

---

## Best Practices

### 1. Type System

- ✅ **DO**: Define types in YAML specs
- ✅ **DO**: Use `null` for optional values
- ✅ **DO**: Import from `$lib/types`
- ❌ **DON'T**: Manually edit generated TypeScript files
- ❌ **DON'T**: Use `undefined` for optional values (use `null`)
- ❌ **DON'T**: Create inline type definitions for complex types

### 2. Module Organization

- ✅ **DO**: Keep client code in `client/` modules
- ✅ **DO**: Keep server code in `server/` modules
- ✅ **DO**: Create focused, single-purpose modules
- ❌ **DON'T**: Mix client and server code
- ❌ **DON'T**: Create circular dependencies

### 3. Import Paths

- ✅ **DO**: Use `$lib/` alias for library imports
- ✅ **DO**: Use relative paths for same-module imports
- ✅ **DO**: Remove `.js` extensions from imports
- ❌ **DON'T**: Use `../../` deep relative paths
- ❌ **DON'T**: Include file extensions in imports

```typescript
// ✅ Good
import { Button } from '$lib/modules/client/common';
import type { NotificationPayload } from '$lib/types';
import { helper } from './utils';

// ❌ Bad
import { Button } from '../../lib/modules/client/common/Button.svelte';
import type { NotificationPayload } from '../../../lib/types/APN.ts';
```

### 4. Component Structure

```svelte
<script lang="ts">
  // 1. Imports
  import type { NotificationPayload } from '$lib/types';
  import { Button } from '$lib/modules/client/common';

  // 2. Props
  interface Props {
    title: string;
    onSubmit: () => void;
  }

  let { title, onSubmit }: Props = $props();

  // 3. State (using Svelte 5 runes)
  let count = $state(0);
  let doubled = $derived(count * 2);

  // 4. Functions
  function handleClick() {
    count++;
    onSubmit();
  }
</script>

<!-- 5. Template -->
<div class="container">
  <h1>{title}</h1>
  <Button onclick={handleClick}>Count: {count}</Button>
</div>

<!-- 6. Styles -->
<style>
  .container {
    padding: 1rem;
  }
</style>
```

### 5. API Endpoints

```typescript
// src/routes/api/example/+server.ts
import type { RequestHandler } from './$types';
import type { NotificationPayload } from '$lib/types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  try {
    // 1. Parse and validate request
    const body = await request.json();

    // 2. Process request
    const result = await processNotification(body);

    // 3. Return response
    return json({ success: true, data: result });
  } catch (error) {
    // 4. Handle errors
    console.error('Error:', error);
    return json({ success: false, error: 'Failed' }, { status: 500 });
  }
};
```

### 6. Error Handling

```typescript
// ✅ Good - Specific error types
try {
  const result = await sendNotification(payload);
  return result;
} catch (error) {
  if (error instanceof APNsError) {
    console.error('APNs error:', error.reason);
  } else {
    console.error('Unknown error:', error);
  }
  throw error;
}

// ❌ Bad - Silent failures
try {
  await sendNotification(payload);
} catch {
  // Silent failure - debugging nightmare
}
```

### 7. Nullable Values

```typescript
// ✅ Good - Use null for optional values
const payload: NotificationPayload = {
  title: 'Hello',
  body: 'World',
  message: null, // Optional field
  badge: null,
  sound: null,
  data: null,
};

// Use nullish coalescing
const badge = payload.badge ?? 0;

// ❌ Bad - Don't use undefined
const badPayload = {
  title: 'Hello',
  body: undefined, // Type error!
};
```

---

## Quick Reference

### File Creation Checklist

When creating a new file, ask:

1. **Is it a type definition?**
   - → Add to `specs/types/*.yml` and regenerate

2. **Is it a UI component?**
   - → Create in `src/lib/modules/client/common/`

3. **Is it server-side logic?**
   - → Create in `src/lib/modules/server/{module}/`

4. **Is it an API endpoint?**
   - → Create in `src/routes/api/{endpoint}/+server.ts`

5. **Is it a UI page?**
   - → Create in `src/routes/{page}/+page.svelte`

6. **Is it documentation?**
   - → Add to `docs/` (implementation) or `plans/` (architecture)

### Import Path Patterns

| What                | Import From                                   |
| ------------------- | --------------------------------------------- |
| Types               | `$lib/types`                                  |
| UI Components       | `$lib/modules/client/common`                  |
| Terminal UI         | `$lib/modules/client/terminal/{component}`    |
| APNs Services       | `$lib/modules/server/apn/library-apns`        |
| CLI Utilities       | `$lib/modules/server/cli`                     |
| Terminal (PTY)      | `$lib/modules/server/terminal/{module}`       |
| WebSocket           | `$lib/modules/server/ws/{module}`             |
| Sessions            | `$lib/modules/server/sessions/{module}`       |
| Auth                | `$lib/modules/server/auth`                    |
| Server Utils        | `$lib/modules/server/{module}`                |
| SvelteKit Types     | `./$types`                                    |
| SvelteKit Utilities | `@sveltejs/kit`                               |

---

## Getting Help

- **Type System**: Read type-crafter documentation in specs
- **SvelteKit**: https://kit.svelte.dev/docs
- **Svelte 5 Runes**: https://svelte.dev/docs/svelte/runes
- **Project Plans**: See `plans/PLAN-A.MD` and `plans/PLAN-B.MD`
- **Implementation Guide**: See `docs/POC-IMPLEMENTATION-GUIDE.md`
