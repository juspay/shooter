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

export function renderMarkdown(text: string): string {
  if (!text) {
    return '';
  }
  const html = marked.parse(text) as string;
  return DOMPurify.sanitize(html);
}
