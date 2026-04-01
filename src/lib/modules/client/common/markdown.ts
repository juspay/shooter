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

  const html = marked.parse(text) as string;
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
