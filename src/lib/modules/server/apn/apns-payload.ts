// Pure: cap an APNs JSON payload to APNs' size limit by truncating the alert body (then the
// subtitle) so a long agent message can't blow past the ~4 KB cap and 413 / fail to deliver.
// No imports — unit-tested in isolation (tests/apns-payload.test.cjs).

/** APNs caps an alert payload at 4096 bytes; leave headroom for transport framing. */
export const APNS_MAX_BYTES = 3900;

const ELLIPSIS = '…';

/**
 * Shrink an APNs payload so its JSON fits under `maxBytes`. Truncates `alert.body` first (the
 * agent's last message — the usual culprit), then `alert.subtitle`, marking cuts with an
 * ellipsis. Mutates and returns `body`. Title and custom data are preserved.
 */
export function fitApnsPayload(
  body: Record<string, unknown>,
  maxBytes: number = APNS_MAX_BYTES
): Record<string, unknown> {
  if (payloadBytes(body) <= maxBytes) {
    return body;
  }
  const aps = body.aps as Record<string, unknown> | undefined;
  const alert = aps?.alert as Record<string, unknown> | undefined;

  // First drop the biggest 413 offender: heavy custom fields. buildAlertBody
  // spreads payload.data as TOP-LEVEL siblings of `aps`, so a multi-KB toolInput
  // (echoing every AskUserQuestion option description) lands at body.toolInput,
  // not body.data. These are redundant in the push — the Decide screen reads the
  // full toolInput from the pending_requests row — so trim them BEFORE the
  // human-readable alert text, so a short body/subtitle is never destroyed to fit
  // bulky data. (Assign undefined, not `delete`, which the lint config forbids for
  // dynamic keys — JSON.stringify omits undefined-valued keys, shrinking the same.)
  if (payloadBytes(body) > maxBytes) {
    for (const field of ['toolInput', 'options', 'question'] as const) {
      if (payloadBytes(body) <= maxBytes) {
        break;
      }
      if (field in body && body[field] !== undefined) {
        body[field] = undefined;
      }
    }
  }

  if (!alert) {
    return body; // nothing else safely trimmable (e.g. silent push) — leave as-is
  }
  for (const field of ['body', 'subtitle'] as const) {
    if (payloadBytes(body) <= maxBytes) {
      break;
    }
    const value = alert[field];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    let text = value;
    while (payloadBytes(body) > maxBytes && text.length > 0) {
      const cut = Math.max(1, Math.ceil(text.length * 0.12));
      text = text.slice(0, text.length - cut);
      // When a field is fully truncated away, OMIT it (undefined → dropped by JSON.stringify)
      // rather than leaving an empty string — applies to body as well as subtitle.
      alert[field] = text.length > 0 ? text + ELLIPSIS : undefined;
    }
  }
  return body;
}

/** UTF-8 byte length of the JSON-serialised payload. */
function payloadBytes(body: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(body), 'utf8');
}
