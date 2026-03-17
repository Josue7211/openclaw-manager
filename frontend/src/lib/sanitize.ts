import DOMPurify from 'dompurify'

/**
 * Explicit allowlist for DOMPurify — restricts to safe Markdown-rendered tags.
 * Blocks form elements, iframes, scripts, embeds, and data-* attributes.
 */
const PURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br',
    'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'div', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'del', 's', 'sub', 'sup',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'src', 'alt', 'title',
    'class', 'id', 'width', 'height', 'colspan', 'rowspan',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
}

DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('target', '_blank');
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (!src.startsWith('data:image/') && !src.startsWith('/api/')) {
      node.removeAttribute('src');
    }
  }
});

/** Sanitize HTML with a strict allowlist of tags and attributes. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}
