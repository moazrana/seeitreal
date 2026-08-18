const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for safe interpolation into HTML (spec §7.2: "Escape/encode
 * all output rendered into HTML to prevent XSS"). Every piece of
 * owner-supplied text (item name, description, restaurant name) that gets
 * templated into the public AR viewer page must go through this — those
 * fields are free text, ultimately rendered to any diner who scans the QR
 * code, and are exactly the kind of stored-XSS vector this guards against.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}
