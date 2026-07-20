// Per-project coalescing of "status"-tier notifications (idle_input,
// intervention). The delivery action + window are INJECTED so this module holds
// only the buffering policy — no APNs/DB deps — and stays unit-testable in the
// .cjs harness (type-only imports are erased by tsx). The notify route wires the
// real fan-out flush + COALESCE_WINDOW_MS and owns the module-level singleton so
// buffers persist across requests.

import type { StatusCoalescer, StatusItem, StatusSummary } from '$lib/types';

/**
 * Build a per-project coalescer. `enqueue` buffers items per project; the first
 * item for a project starts a `windowMs` timer, and when it fires `flush` is
 * called once with every item buffered in that window, then the buffer clears.
 */
export function makeStatusCoalescer(opts: {
  flush: (project: string, items: StatusItem[]) => void;
  windowMs: number;
}): StatusCoalescer {
  const buffers = new Map<string, { items: StatusItem[]; timer: ReturnType<typeof setTimeout> }>();
  return {
    enqueue(project: string, item: StatusItem): void {
      const existing = buffers.get(project);
      if (existing) {
        existing.items.push(item);
        return;
      }
      const timer = setTimeout(() => {
        const buf = buffers.get(project);
        buffers.delete(project);
        if (buf) {
          opts.flush(project, buf.items);
        }
      }, opts.windowMs);
      buffers.set(project, { items: [item], timer });
    },
  };
}

/**
 * Tally buffered status items into one rollup title + body. Pure.
 *
 *   3 idle                    → "3 agents idle"
 *   2 idle + 1 intervention   → "2 agents idle · 1 needs attention"
 *
 * The project prefix ("lighthouse · ") is added by the caller when it builds the
 * push title; this stays project-agnostic so it is trivially testable.
 */
export function summarizeStatusBuffer(items: readonly StatusItem[]): StatusSummary {
  let idle = 0;
  let attention = 0;
  let other = 0;
  for (const it of items) {
    if (it.category === 'idle_input') {
      idle += 1;
    } else if (it.category === 'intervention') {
      attention += 1;
    } else {
      other += 1;
    }
  }
  const parts: string[] = [];
  if (idle > 0) {
    parts.push(`${idle} ${idle === 1 ? 'agent' : 'agents'} idle`);
  }
  if (attention > 0) {
    parts.push(`${attention} needs attention`);
  }
  if (other > 0) {
    parts.push(`${other} update${other === 1 ? '' : 's'}`);
  }
  const title = parts.join(' · ') || `${items.length} updates`;

  // Body: the most recent few item bodies, newest first — enough to glance at
  // without stacking one push per event.
  const body =
    items
      .slice(-3)
      .reverse()
      .map((i) => i.body)
      .filter((b) => b.length > 0)
      .join('\n') || title;

  return { body, title };
}
