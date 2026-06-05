<script lang="ts">
  import type {
    ShooterConfig,
    SosRoutingRule,
    SosServerMessage,
    SosTranscriptEntry,
    SuperSession,
  } from '$lib/types';

  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { Banner, Button, Input, Pill, Select } from '@juspay/svelte-ui-components';
  import { onDestroy, onMount } from 'svelte';

  const SOURCES = [
    'claude-code',
    'codex',
    'opencode',
    'gemini',
    'qwen',
    'cursor',
    'copilot',
    'amp',
  ];

  const id = $page.params.id ?? '';

  let session = $state<null | SuperSession>(null);
  let transcript = $state<SosTranscriptEntry[]>([]);
  let pending = $state<
    {
      expiresAt: string;
      fromMemberId: string;
      preview: string;
      relayId: string;
      toMemberId: string;
    }[]
  >([]);
  let error = $state('');
  let ws: null | WebSocket = null;
  let disposed = false;

  // Forward form
  let fwdMember = $state('');
  let fwdText = $state('');
  // Add-member form
  let amKey = $state('');
  let amProvider = $state('claude-code');
  let amTerminal = $state('');
  // Rule form
  let rFrom = $state('');
  let rTo = $state('');
  let rAction = $state('relay');
  let rPattern = $state('');

  const members = $derived(session?.members ?? []);
  const rules = $derived(session?.routingRules ?? []);

  // Pin the merged transcript to the latest message so live updates stay visible.
  let transcriptEl = $state<HTMLDivElement | undefined>(undefined);
  $effect(() => {
    // Reading transcript.length registers the dependency, so this re-runs on
    // every new entry and keeps the view pinned to the latest message.
    if (transcriptEl && transcript.length > 0) {
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
  });

  function getConfig(): null | ShooterConfig {
    try {
      const saved = localStorage.getItem('shooter_config');
      return saved ? (JSON.parse(saved) as ShooterConfig) : null;
    } catch {
      return null;
    }
  }
  function apiKey(): string {
    return getConfig()?.apiKey ?? '';
  }
  function authHeaders(json = false): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${apiKey()}` };
    if (json) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  }
  function memberLabel(memberId: string): string {
    const m = members.find((x) => x.id === memberId);
    return m ? `${providerLabel(m.provider)} · ${m.id.slice(0, 6)}` : memberId.slice(0, 6);
  }
  function providerLabel(p: string): string {
    return p === 'claude-code' ? 'Claude' : p.charAt(0).toUpperCase() + p.slice(1);
  }
  function entryText(entry: SosTranscriptEntry): string {
    return entry.message.parts
      .map((part) => {
        if (part.type === 'text' || part.type === 'thinking') {
          return part.content;
        }
        if (part.type === 'tool_use') {
          return `🔧 ${part.toolName}`;
        }
        return `↳ ${part.output.slice(0, 200)}`;
      })
      .join('\n')
      .trim();
  }

  async function loadSession(): Promise<boolean> {
    try {
      const res = await fetch(`/api/sos/${id}`, { headers: authHeaders() });
      if (!res.ok) {
        error = res.status === 404 ? 'Super-session not found' : `Failed to load (${res.status})`;
        return false;
      }
      session = (await res.json()) as SuperSession;
      transcript = session.transcript ?? [];
      if (!fwdMember && members[0]) {
        fwdMember = members[0].id;
      }
      return true;
    } catch {
      error = 'Network error';
      return false;
    }
  }

  async function connectWs(): Promise<void> {
    try {
      const res = await fetch('/api/ws-ticket', { headers: authHeaders(), method: 'POST' });
      if (!res.ok) {
        error = 'Failed to open the live connection (ticket request failed)';
        return;
      }
      const { ticket } = (await res.json()) as { ticket: string };
      if (disposed) {
        return;
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(
        `${proto}//${window.location.host}/ws/super-session/${id}?ticket=${ticket}`
      );
      ws.onmessage = (ev): void => {
        let msg: SosServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as SosServerMessage;
        } catch {
          return;
        }
        handleWs(msg);
      };
      ws.onerror = (): void => {
        error = 'Live connection error';
      };
    } catch {
      error = 'Failed to open the live connection (network error)';
    }
  }

  function handleWs(msg: SosServerMessage): void {
    switch (msg.type) {
      case 'sos-error':
        error = msg.message;
        break;
      case 'sos-history':
        transcript = msg.entries;
        break;
      case 'sos-member-added':
        if (session) {
          session = { ...session, members: [...session.members, msg.member] };
        }
        break;
      case 'sos-member-removed':
        if (session) {
          session = { ...session, members: session.members.filter((m) => m.id !== msg.memberId) };
        }
        break;
      case 'sos-message':
        transcript = [...transcript, msg.entry];
        break;
      case 'sos-relay-pending':
        pending = [
          ...pending,
          {
            expiresAt: msg.expiresAt,
            fromMemberId: msg.fromMemberId,
            preview: msg.preview,
            relayId: msg.relayId,
            toMemberId: msg.toMemberId,
          },
        ];
        break;
      case 'sos-relay-resolved':
        pending = pending.filter((p) => p.relayId !== msg.relayId);
        break;
    }
  }

  function sendWs(payload: Record<string, unknown>): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  async function forward(): Promise<void> {
    if (!fwdMember || !fwdText.trim()) {
      return;
    }
    try {
      const res = await fetch(`/api/sos/${id}/inject`, {
        body: JSON.stringify({ text: fwdText, toMemberId: fwdMember }),
        headers: authHeaders(true),
        method: 'POST',
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        error = d.error ?? 'Failed to forward message';
        return;
      }
      fwdText = '';
    } catch {
      error = 'Network error — could not forward message';
    }
  }

  async function addMember(): Promise<void> {
    if (!amKey.trim()) {
      return;
    }
    try {
      const res = await fetch(`/api/sos/${id}/members`, {
        body: JSON.stringify({
          provider: amProvider,
          sessionKey: amKey.trim(),
          terminalId: amTerminal.trim() || undefined,
        }),
        headers: authHeaders(true),
        method: 'POST',
      });
      if (res.ok) {
        amKey = '';
        amTerminal = '';
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        error = d.error ?? 'Failed to add member';
      }
    } catch {
      error = 'Network error — could not add member';
    }
  }

  async function removeMember(memberId: string): Promise<void> {
    try {
      const res = await fetch(`/api/sos/${id}/members/${memberId}`, {
        headers: authHeaders(),
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        error = d.error ?? 'Failed to remove member';
      }
    } catch {
      error = 'Network error — could not remove member';
    }
  }

  async function addRule(): Promise<void> {
    if (!rFrom || !rTo) {
      return;
    }
    const next: SosRoutingRule[] = [
      ...rules,
      {
        action: rAction as SosRoutingRule['action'],
        fromMemberId: rFrom,
        id: '',
        matchPattern: rPattern,
        priority: rules.length + 1,
        toMemberId: rTo,
      },
    ];
    try {
      const res = await fetch(`/api/sos/${id}/rules`, {
        body: JSON.stringify({ routingRules: next }),
        headers: authHeaders(true),
        method: 'PATCH',
      });
      if (res.ok && session) {
        const d = (await res.json()) as { routingRules: SosRoutingRule[] };
        session = { ...session, routingRules: d.routingRules };
        rPattern = '';
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        error = d.error ?? 'Failed to add rule';
      }
    } catch {
      error = 'Network error — could not add rule';
    }
  }

  async function deleteRule(ruleId: string): Promise<void> {
    const next = rules.filter((r) => r.id !== ruleId);
    try {
      const res = await fetch(`/api/sos/${id}/rules`, {
        body: JSON.stringify({ routingRules: next }),
        headers: authHeaders(true),
        method: 'PATCH',
      });
      if (res.ok && session) {
        session = { ...session, routingRules: next };
      } else if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        error = d.error ?? 'Failed to delete rule';
      }
    } catch {
      error = 'Network error — could not delete rule';
    }
  }

  onMount(() => {
    if (!browser) {
      return;
    }
    // Only open the live socket when the initial load succeeded — otherwise a
    // ticket/WS failure would overwrite the real 401/404 error message.
    void loadSession().then((loaded) => {
      if (loaded && !disposed) {
        void connectWs();
      }
    });
    return (): void => {
      disposed = true;
      ws?.close();
    };
  });
  onDestroy(() => {
    disposed = true;
    ws?.close();
  });
</script>

<svelte:head><title>{session?.label ?? 'Super-session'} - Shooter</title></svelte:head>

<main class="main sos-view">
  <a class="back" href="/sos">← All super-sessions</a>

  {#if error}
    <Banner text={error} classes="banner-error" />
  {/if}

  {#if session}
    <div class="head">
      <h1>{session.label}</h1>
      <Pill text={`${members.length} members`} classes="pill-status-unknown" />
    </div>

    {#each pending as p (p.relayId)}
      <div class="pending">
        <span class="pending-text">
          Relay {memberLabel(p.fromMemberId)} → {memberLabel(p.toMemberId)}: <em>{p.preview}</em>
        </span>
        <div class="pending-actions">
          <Button
            text="Approve"
            classes="btn-approve"
            onclick={(): void => {
              sendWs({ relayId: p.relayId, type: 'relay-approve' });
            }}
          />
          <Button
            text="Deny"
            classes="btn-deny"
            onclick={(): void => {
              sendWs({ relayId: p.relayId, type: 'relay-deny' });
            }}
          />
        </div>
      </div>
    {/each}

    <!-- Merged transcript -->
    <section class="panel">
      <h2>Merged transcript</h2>
      <div class="transcript" bind:this={transcriptEl}>
        {#if transcript.length === 0}
          <p class="muted">No messages yet. Add members below.</p>
        {/if}
        {#each transcript as entry, i (`${entry.message.id}-${i}`)}
          <div class="entry" class:relayed={entry.relayed}>
            <div class="entry-tag">
              <Pill
                text={providerLabel(entry.provider)}
                classes={`pill-source-${entry.provider}`}
              />
              <span class="member-id">{entry.memberId.slice(0, 6)}</span>
              {#if entry.relayed}<span class="relay-badge">relayed</span>{/if}
            </div>
            <pre class="entry-body">{entryText(entry)}</pre>
          </div>
        {/each}
      </div>
    </section>

    <!-- Forward -->
    <section class="panel">
      <h2>Forward to a member</h2>
      <div class="row">
        <Select
          items={members.map((m) => ({ id: m.id, label: memberLabel(m.id) }))}
          value={fwdMember ? [fwdMember] : []}
          placeholder="Member"
          onchange={(v: string[]): void => {
            fwdMember = v[0] ?? '';
          }}
          classes="sos-select"
        />
        <Input
          bind:value={fwdText}
          dataType="text"
          placeholder="Message to inject…"
          classes="sos-input"
        />
        <Button
          text="Send"
          disabled={!fwdMember || !fwdText.trim()}
          onclick={forward}
          classes="btn-send"
        />
      </div>
    </section>

    <!-- Members -->
    <section class="panel">
      <h2>Members</h2>
      {#each members as m (m.id)}
        <div class="member-row">
          <Pill text={providerLabel(m.provider)} classes={`pill-source-${m.provider}`} />
          <span class="member-key" title={m.sessionKey}>{m.sessionKey}</span>
          <span class="member-flag">{m.terminalId ? '⌁ terminal' : 'observed'}</span>
          <Button
            text="Remove"
            classes="btn-remove"
            onclick={(): void => {
              void removeMember(m.id);
            }}
          />
        </div>
      {/each}
      <div class="row add-row">
        <Input
          bind:value={amKey}
          dataType="text"
          placeholder="sessionKey (file path or session id)"
          classes="sos-input"
        />
        <Select
          items={SOURCES.map((s) => ({ id: s, label: providerLabel(s) }))}
          value={[amProvider]}
          onchange={(v: string[]): void => {
            amProvider = v[0] ?? 'claude-code';
          }}
          classes="sos-select"
        />
        <Input
          bind:value={amTerminal}
          dataType="text"
          placeholder="terminalId (optional)"
          classes="sos-input"
        />
        <Button text="Add" disabled={!amKey.trim()} onclick={addMember} classes="btn-send" />
      </div>
    </section>

    <!-- Routing rules -->
    <section class="panel">
      <h2>Routing rules</h2>
      {#each rules as r (r.id)}
        <div class="rule-row">
          <span>{memberLabel(r.fromMemberId)} → {memberLabel(r.toMemberId)}</span>
          <span class="rule-action">{r.action}</span>
          <span class="rule-pattern">{r.matchPattern || '(any)'}</span>
          <Button
            text="✕"
            classes="btn-remove"
            onclick={(): void => {
              void deleteRule(r.id);
            }}
          />
        </div>
      {/each}
      <div class="row add-row">
        <Select
          items={members.map((m) => ({ id: m.id, label: memberLabel(m.id) }))}
          value={rFrom ? [rFrom] : []}
          placeholder="From"
          onchange={(v: string[]): void => {
            rFrom = v[0] ?? '';
          }}
          classes="sos-select"
        />
        <Select
          items={members.map((m) => ({ id: m.id, label: memberLabel(m.id) }))}
          value={rTo ? [rTo] : []}
          placeholder="To"
          onchange={(v: string[]): void => {
            rTo = v[0] ?? '';
          }}
          classes="sos-select"
        />
        <Select
          items={[
            { id: 'relay', label: 'relay' },
            { id: 'block', label: 'block' },
            { id: 'escalate', label: 'escalate' },
          ]}
          value={[rAction]}
          onchange={(v: string[]): void => {
            rAction = v[0] ?? 'relay';
          }}
          classes="sos-select"
        />
        <Input
          bind:value={rPattern}
          dataType="text"
          placeholder="match (substring, empty=any)"
          classes="sos-input"
        />
        <Button text="Add rule" disabled={!rFrom || !rTo} onclick={addRule} classes="btn-send" />
      </div>
    </section>
  {/if}
</main>

<style>
  .sos-view {
    max-width: 820px;
    margin: 0 auto;
    padding: var(--space-4);
  }
  .back {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: var(--text-sm);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: var(--space-3) 0;
  }
  .head h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    margin: 0;
    color: var(--text-primary);
  }
  .panel {
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-3);
  }
  .panel h2 {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 var(--space-2);
  }
  .transcript {
    max-height: 50vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .entry {
    border-left: 2px solid var(--border);
    padding-left: var(--space-2);
  }
  .entry.relayed {
    border-left-color: var(--ds-green-700);
  }
  .entry-tag {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .member-id {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .relay-badge {
    font-size: var(--text-xs);
    color: var(--ds-green-700);
  }
  .entry-body {
    margin: var(--space-1) 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--text-primary);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .add-row {
    margin-top: var(--space-2);
  }
  :global(.sos-input) {
    flex: 1;
    min-width: 140px;
    --input-container-margin: 0;
  }
  :global(.sos-select) {
    min-width: 120px;
  }
  .member-row,
  .rule-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }
  .member-key {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .member-flag,
  .rule-action {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .rule-pattern {
    flex: 1;
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
  }
  .muted {
    color: var(--text-tertiary);
  }
  .pending {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--component-bg-hover);
    border: 1px solid var(--ds-green-700);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
  }
  .pending-text {
    font-size: var(--text-sm);
    color: var(--text-primary);
  }
  .pending-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }
</style>
