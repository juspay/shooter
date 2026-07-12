/**
 * Shared Markdown rendering utility.
 *
 * Uses `marked` for parsing and `DOMPurify` for sanitisation.
 * Callers should import this instead of duplicating the setup.
 */

import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Configure marked once at module level
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Memoize rendered markdown to avoid re-parsing identical strings
const markdownCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

export function renderMarkdown(text: string): string {
  if (!text) {
    return '';
  }

  const cached = markdownCache.get(text);
  if (cached !== undefined) {
    return cached;
  }

  const html = marked.parse(stripAnsi(text)) as string;
  const result = DOMPurify.sanitize(html);

  // Evict oldest entry when cache is full
  if (markdownCache.size >= MAX_CACHE_SIZE) {
    const firstKey = markdownCache.keys().next().value;
    if (firstKey !== undefined) {
      markdownCache.delete(firstKey);
    }
  }
  markdownCache.set(text, result);

  return result;
}

/**
 * Strip ANSI/VT escape sequences (CSI, OSC, and lone escapes). Some system
 * messages — e.g. Claude Code's "Set model to \x1b[1mFable 5\x1b[22m …" —
 * carry terminal styling codes that would otherwise leak into the rendered
 * chat as literal "[1m…[22m" noise. Every branch is anchored on the ESC
 * (\x1b) byte, so ordinary text such as a markdown "[link]" is never touched.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[@-Z\\-_]/g, '');
}
