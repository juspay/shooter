/**
 * PTY input helpers.
 *
 * Submitting text to an interactive agent TUI (codex, claude, gemini, qwen, …)
 * is not as simple as appending a newline. These TUIs read the PTY in raw mode:
 *
 *   - A bare LF (`\n`) is NOT the Enter key — it types a literal newline into
 *     the prompt and never submits. (Verified: LF leaves codex sitting on its
 *     prompt; the message just accumulates.)
 *   - Even `"<text>\r"` written as a SINGLE chunk is treated as a bracketed
 *     paste by the TUI, so the trailing CR is absorbed into the pasted body
 *     instead of submitting. (Verified: codex types the text but does not run.)
 *
 * The reliable approach — the same bytes a real terminal emulator sends when a
 * human pastes and presses Enter — is to wrap the body in an explicit bracketed
 * paste (`ESC[200~` … `ESC[201~`) and then send a CR. The paste-end marker
 * closes the paste unambiguously, so the following CR is a real Enter. This
 * also preserves embedded newlines in multi-line messages (the whole point of
 * bracketed paste) and submits correctly in modern interactive shells, where
 * bracketed paste is enabled by default.
 *
 * Verified empirically against codex 0.136 and claude 2.1 — both receive the
 * message and complete a turn.
 */

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

/**
 * Build the PTY byte sequence that delivers `text` to an interactive terminal
 * and submits it (presses Enter). Any trailing newline the caller added is
 * stripped — the CR after the paste-end marker is what submits.
 */
export function ptySubmitSequence(text: string): string {
  const body = text.replace(/[\r\n]+$/, '');
  return `${PASTE_START}${body}${PASTE_END}\r`;
}
