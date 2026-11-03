/**
 * Plain Markdown → HTML for posts that leave this site (a client's WordPress,
 * a handoff package). Same subset as renderMarkdown() in
 * frontend/src/views/Blog.jsx, minus that page's CSS classes, and with the
 * source HTML-escaped first: a draft is model output, so nothing in it is
 * trusted to be markup.
 */

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeUrl = (u) => (/^(https?:\/\/|\/)/i.test(u) ? u.replace(/"/g, '%22') : '#');

export function markdownToHtml(md) {
  if (!md) return '';
  const blocks = escapeHtml(md.replace(/\r/g, '')).split(/\n{2,}/);

  const inline = (text) => text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${safeUrl(href)}">${label}</a>`)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  return blocks.map((block) => {
    const b = block.trim();
    if (!b) return '';
    const fence = b.match(/^```\w*\n([\s\S]*?)\n?```$/);
    if (fence) return `<pre><code>${fence[1]}</code></pre>`;
    const heading = b.match(/^(#{1,4}) (.+)$/);
    if (heading && !b.includes('\n')) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    if (b === '---') return '<hr />';
    const lines = b.split('\n');
    if (lines.every((l) => /^- /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\d+\. /.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    if (lines.every((l) => /^&gt; /.test(l))) return `<blockquote>${inline(lines.map((l) => l.slice(5)).join(' '))}</blockquote>`;
    return `<p>${inline(lines.join('<br />'))}</p>`;
  }).filter(Boolean).join('\n');
}
