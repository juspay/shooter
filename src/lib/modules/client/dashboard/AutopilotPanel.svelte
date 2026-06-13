<script lang="ts">
  import type { NextStep, SessionSummaryRecord } from '$lib/types';

  import {
    formatRelativeTime,
    getApiKey,
    startPresenceReporting,
  } from '$lib/modules/client/common';
  import { onMount } from 'svelte';

  import { autopilotDriver } from './autopilot-driver.svelte';

  // Two distinct controls:
  //  1. The SERVER engine (summarize + push) — toggled via /api/autopilot. Read-only view
  //     of persisted summaries from /api/summaries.
  //  2. AUTONOMY (auto-inject) — the in-WebView driver that runs proposed commands into idle
  //     managed terminals. Local kill switch (autopilotDriver), persisted in localStorage.

  let enabled = $state(false);
  let summaries = $state<SessionSummaryRecord[]>([]);

  /** Latest summary per session, newest first. */
  const latest = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedup, not reactive state
    const seen = new Set<string>();
    const out: SessionSummaryRecord[] = [];
    for (const s of summaries) {
      const key = s.sessionId ?? s.terminalId ?? s.id;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(s);
      }
    }
    return out;
  });

  function authHeaders(): Record<string, string> {
    const key = getApiKey();
    return key ? { Authorization: `Bearer ${key}` } : {};
  }

  async function refreshState(): Promise<void> {
    try {
      const res = await fetch('/api/autopilot', { headers: authHeaders() });
      if (res.ok) {
        enabled = Boolean(((await res.json()) as { enabled?: boolean }).enabled);
      }
    } catch {
      // ignore transient errors
    }
  }

  async function refreshSummaries(): Promise<void> {
    try {
      const res = await fetch('/api/summaries?limit=30', { headers: authHeaders() });
      if (res.ok) {
        summaries = ((await res.json()) as { summaries?: SessionSummaryRecord[] }).summaries ?? [];
      }
    } catch {
      // ignore transient errors
    }
  }

  async function toggle(): Promise<void> {
    const next = !enabled;
    enabled = next;
    try {
      const res = await fetch('/api/autopilot', {
        body: JSON.stringify({ enabled: next }),
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (res.ok) {
        enabled = Boolean(((await res.json()) as { enabled?: boolean }).enabled);
      }
    } catch {
      enabled = !next;
    }
  }

  function toggleAutonomy(): void {
    autopilotDriver.setEnabled(!autopilotDriver.enabled);
  }

  function actionTime(at: number): string {
    return formatRelativeTime(new Date(at).toISOString());
  }

  function parseSteps(raw: string): NextStep[] {
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? (value as NextStep[]) : [];
    } catch {
      return [];
    }
  }

  function stepBadgeClass(step: NextStep): string {
    if (step.tentative) {
      return 'step-badge step-badge--tentative';
    }
    const v = step.votes ?? 1;
    if (v >= 4) {
      return 'step-badge step-badge--strong';
    }
    if (v >= 3) {
      return 'step-badge step-badge--medium';
    }
    return 'step-badge step-badge--weak';
  }

  function voteLabel(step: NextStep): string {
    return step.tentative ? '~' : `${step.votes ?? 1}`;
  }

  onMount(() => {
    void refreshState();
    void refreshSummaries();
    const key = getApiKey();
    if (key) {
      autopilotDriver.start(key);
    }
    const stopPresence = key ? startPresenceReporting(key) : null;
    const timer = setInterval(() => {
      void refreshSummaries();
      void refreshState();
    }, 8000);
    return (): void => {
      clearInterval(timer);
      autopilotDriver.stop();
      stopPresence?.();
    };
  });
</script>

<div class="autopilot-panel">
  <div class="panel-header">
    <div class="panel-title-row">
      <span class="panel-title">Auto-pilot</span>
      {#if enabled}
        <span class="status-dot-active" aria-hidden="true"></span>
      {/if}
    </div>
    <button
      class={enabled ? 'toggle-btn toggle-btn--on' : 'toggle-btn toggle-btn--off'}
      onclick={toggle}
      aria-label={enabled ? 'Stop Auto-pilot' : 'Start Auto-pilot'}
      aria-pressed={enabled}
    >
      {enabled ? 'Stop' : 'Start'}
    </button>
  </div>

  <div class="autonomy-row">
    <div class="autonomy-label">
      <span class="autonomy-title">Autonomy</span>
      <span class="autonomy-sub">
        {autopilotDriver.enabled
          ? 'Auto-running commands into idle terminals'
          : 'Off — summaries + suggestions only'}
      </span>
    </div>
    <button
      class={autopilotDriver.enabled
        ? 'toggle-btn toggle-btn--danger'
        : 'toggle-btn toggle-btn--off'}
      onclick={toggleAutonomy}
      aria-label={autopilotDriver.enabled ? 'Disable autonomy' : 'Enable autonomy'}
      aria-pressed={autopilotDriver.enabled}
    >
      {autopilotDriver.enabled ? 'On' : 'Off'}
    </button>
  </div>

  {#if autopilotDriver.enabled}
    <div class="autonomy-warning" role="alert">
      ⚠ Auto-inject is ON — proposed commands run automatically in idle managed terminals.
    </div>
  {/if}

  {#if autopilotDriver.actions.length > 0}
    <div class="actions-log">
      <span class="actions-label">Recent actions</span>
      <ul class="actions-list">
        {#each autopilotDriver.actions.slice(0, 6) as a (`${a.at}-${a.terminalId}`)}
          <li class="action-item action-item--{a.kind}">
            <span class="action-kind">{a.kind}</span>
            <span class="action-detail" title={a.detail}>{a.detail}</span>
            <span class="action-time">{actionTime(a.at)}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if latest.length > 0}
    <div class="sessions-list">
      {#each latest as s (s.id)}
        {@const steps = parseSteps(s.nextSteps)}
        <div class="session-card">
          <div class="session-header">
            <span class="session-name">{s.projectName ?? s.terminalId}</span>
            <span class="session-status session-status--idle">{s.trigger}</span>
          </div>

          {#if s.summary}
            <p class="session-summary">{s.summary}</p>
          {/if}

          {#if steps.length > 0}
            <div class="next-steps">
              <span class="next-steps-label">Next steps</span>
              <ul class="steps-list">
                {#each steps as step (step.text)}
                  <li class="step-item">
                    <span class={stepBadgeClass(step)} title="{step.votes ?? 1} vote(s)">
                      {voteLabel(step)}
                    </span>
                    <span class="step-text">{step.text}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          <span class="last-updated">Updated {formatRelativeTime(s.createdAt)}</span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="panel-empty">
      {enabled
        ? 'Watching all active sessions…'
        : 'Start Auto-pilot for AI summaries + next steps across all sessions — runs on the server, even with this page closed.'}
    </p>
  {/if}
</div>

<style>
  .autopilot-panel {
    background: var(--component-bg, #1a1a1a);
    border: 1px solid var(--border, #2e2e2e);
    border-radius: var(--radius-lg, 8px);
    padding: var(--space-4, 16px);
    margin-bottom: var(--space-4, 16px);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3, 12px);
  }

  .panel-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .panel-title {
    color: var(--text-primary, #ededed);
    font-size: var(--text-sm, 13px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .status-dot-active {
    animation: pulse 2s ease-in-out infinite;
    background: var(--ds-green-700, #16a34a);
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
    height: 7px;
    width: 7px;
  }

  .toggle-btn {
    border: 1px solid transparent;
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    padding: 4px 14px;
    transition:
      background var(--transition-fast, 150ms ease),
      color var(--transition-fast, 150ms ease);
  }

  .toggle-btn--off {
    background: var(--ds-green-alpha-200, rgba(22, 163, 74, 0.12));
    border-color: var(--ds-green-alpha-400, rgba(22, 163, 74, 0.3));
    color: var(--ds-green-700, #16a34a);
  }

  .toggle-btn--off:hover {
    background: var(--ds-green-alpha-400, rgba(22, 163, 74, 0.2));
  }

  .toggle-btn--on {
    background: var(--ds-gray-alpha-200, rgba(255, 255, 255, 0.06));
    border-color: var(--border, #2e2e2e);
    color: var(--text-secondary, #a1a1a1);
  }

  .toggle-btn--on:hover {
    background: var(--ds-gray-alpha-300, rgba(255, 255, 255, 0.1));
    color: var(--text-primary, #ededed);
  }

  .toggle-btn:focus-visible {
    outline: 2px solid var(--ds-blue-700, #0070f3);
    outline-offset: 2px;
  }

  .panel-empty {
    color: var(--text-tertiary, #7d7d7d);
    font-size: var(--text-xs, 12px);
    font-style: italic;
    margin: 0;
  }

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }

  .session-card {
    background: var(--bg-subtle, rgba(255, 255, 255, 0.02));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
    border-radius: var(--radius-md, 6px);
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px);
  }

  .session-header {
    align-items: center;
    display: flex;
    gap: var(--space-2, 8px);
    justify-content: space-between;
  }

  .session-name {
    color: var(--text-primary, #ededed);
    flex: 1;
    font-size: var(--text-sm, 13px);
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-status {
    flex-shrink: 0;
    font-size: var(--text-xs, 12px);
    font-weight: 500;
  }

  .session-status--idle {
    color: var(--text-tertiary, #7d7d7d);
  }

  .session-summary {
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: var(--text-secondary, #a1a1a1);
    display: -webkit-box;
    font-size: var(--text-xs, 12px);
    line-clamp: 2;
    line-height: var(--leading-normal, 1.5);
    margin: 0;
    overflow: hidden;
  }

  .next-steps {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .next-steps-label {
    color: var(--text-tertiary, #7d7d7d);
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .steps-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .step-item {
    align-items: baseline;
    display: flex;
    gap: 8px;
  }

  .step-badge {
    align-items: center;
    border-radius: var(--radius-full, 9999px);
    cursor: default;
    display: inline-flex;
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    height: 18px;
    justify-content: center;
    min-width: 20px;
    padding: 0 5px;
  }

  .step-badge--strong {
    background: var(--ds-green-alpha-200, rgba(22, 163, 74, 0.12));
    color: var(--ds-green-700, #16a34a);
  }

  .step-badge--medium {
    background: var(--ds-blue-alpha-200, rgba(0, 112, 243, 0.12));
    color: var(--ds-blue-700, #0070f3);
  }

  .step-badge--weak {
    background: var(--ds-gray-alpha-200, rgba(255, 255, 255, 0.06));
    color: var(--text-tertiary, #7d7d7d);
  }

  .step-badge--tentative {
    background: var(--ds-amber-alpha-200, rgba(217, 119, 6, 0.12));
    color: var(--ds-amber-700, #d97706);
    font-style: italic;
  }

  .step-text {
    color: var(--text-secondary, #a1a1a1);
    font-size: var(--text-xs, 12px);
    line-height: var(--leading-normal, 1.5);
  }

  .last-updated {
    color: var(--text-tertiary, #7d7d7d);
    font-size: 10px;
    margin-top: 2px;
  }

  .autonomy-row {
    align-items: center;
    display: flex;
    gap: var(--space-2, 8px);
    justify-content: space-between;
    margin-bottom: var(--space-3, 12px);
  }

  .autonomy-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .autonomy-title {
    color: var(--text-primary, #ededed);
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .autonomy-sub {
    color: var(--text-tertiary, #7d7d7d);
    font-size: 11px;
  }

  .toggle-btn--danger {
    background: var(--ds-red-alpha-200, rgba(220, 38, 38, 0.14));
    border-color: var(--ds-red-alpha-400, rgba(220, 38, 38, 0.35));
    color: var(--ds-red-700, #dc2626);
  }

  .toggle-btn--danger:hover {
    background: var(--ds-red-alpha-400, rgba(220, 38, 38, 0.22));
  }

  .autonomy-warning {
    background: var(--ds-amber-alpha-200, rgba(217, 119, 6, 0.12));
    border: 1px solid var(--ds-amber-alpha-400, rgba(217, 119, 6, 0.3));
    border-radius: var(--radius-md, 6px);
    color: var(--ds-amber-700, #d97706);
    font-size: 11px;
    margin-bottom: var(--space-3, 12px);
    padding: 6px 10px;
  }

  .actions-log {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: var(--space-3, 12px);
  }

  .actions-label {
    color: var(--text-tertiary, #7d7d7d);
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .actions-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .action-item {
    align-items: baseline;
    display: flex;
    font-size: 11px;
    gap: 8px;
  }

  .action-kind {
    border-radius: var(--radius-full, 9999px);
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    text-transform: uppercase;
  }

  .action-item--injected .action-kind {
    background: var(--ds-green-alpha-200, rgba(22, 163, 74, 0.12));
    color: var(--ds-green-700, #16a34a);
  }

  .action-item--skipped .action-kind {
    background: var(--ds-gray-alpha-200, rgba(255, 255, 255, 0.06));
    color: var(--text-tertiary, #7d7d7d);
  }

  .action-item--error .action-kind {
    background: var(--ds-red-alpha-200, rgba(220, 38, 38, 0.14));
    color: var(--ds-red-700, #dc2626);
  }

  .action-detail {
    color: var(--text-secondary, #a1a1a1);
    flex: 1;
    font-family: var(--font-mono, monospace);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-time {
    color: var(--text-tertiary, #7d7d7d);
    flex-shrink: 0;
    font-size: 10px;
  }
</style>
