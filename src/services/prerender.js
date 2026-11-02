/**
 * Server-rendered body content for the public SPA routes (rec 1968).
 *
 * The React app ships an empty <div id="root">, so crawlers that don't run JS
 * (GPTBot, ClaudeBot, PerplexityBot, most link unfurlers) saw no article body,
 * capability copy or case-study text. This builds the same content as plain
 * HTML for server.js to inject in a <noscript> block — the same pattern the
 * homepage already uses — so browsers that run the app never see it.
 *
 * Rendered per request from the DB rather than at build time: blog posts and
 * case studies are published straight to the DB without a frontend rebuild,
 * so a build-time snapshot would go stale on the first new post. It's string
 * templating over a couple of indexed SELECTs, so no headless browser and no
 * extra memory.
 */

import db from '../../database.js';
import { PILLARS_LIST, PILLARS_BY_SLUG } from '../../frontend/src/data/pillarsData.js';

const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Only http(s), mailto, tel and site-relative links survive; anything else
// (javascript:, data:) is dropped to its text.
const safeHref = (url) => (/^(https?:\/\/|mailto:|tel:|\/)/i.test(url) ? url : null);

function inline(text) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => (safeHref(src) ? `<img src="${src}" alt="${alt}" loading="lazy">` : ''))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => (safeHref(href) ? `<a href="${href}">${label}</a>` : label))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Minimal Markdown → HTML for crawler output. Escapes first, so DB content
 * can't inject markup; covers what the posts actually use (headings, lists,
 * quotes, links, emphasis, paragraphs). A content "#" becomes <h2> because the
 * page title is the only <h1>.
 */
export function markdownToHtml(md) {
  if (!md) return '';
  const blocks = escapeHtml(md).replace(/\r/g, '').split(/\n{2,}/);
  return blocks.map((block) => {
    const b = block.trim();
    if (!b || b === '---') return '';
    const heading = b.match(/^(#{1,4}) (.+)$/);
    if (heading && !b.includes('\n')) {
      const level = Math.max(heading[1].length, 2);
      return `<h${level}>${inline(heading[2])}</h${level}>`;
    }
    const lines = b.split('\n');
    if (lines.every((l) => /^[-*] /.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    }
    if (lines.every((l) => /^\d+\. /.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    }
    if (lines.every((l) => l.startsWith('&gt; '))) {
      return `<blockquote>${inline(lines.map((l) => l.slice(5)).join(' '))}</blockquote>`;
    }
    return `<p>${inline(lines.join('<br>'))}</p>`;
  }).filter(Boolean).join('\n');
}

const wrap = (inner) => `<noscript>\n<main>\n${inner}\n</main>\n</noscript>`;
const isoDate = (d) => (d ? String(d).slice(0, 10) : '');

function safeQuery(fn, label) {
  try {
    return fn();
  } catch (e) {
    console.error(`[prerender] ${label} query failed:`, e.message);
    return undefined;
  }
}

function blogIndex() {
  const posts = safeQuery(() => db.prepare(
    `SELECT slug, title, excerpt, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC`
  ).all(), 'blog index') || [];
  const items = posts.map((p) => `<li><a href="/blog/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a>`
    + `${p.published_at ? ` <time datetime="${isoDate(p.published_at)}">${isoDate(p.published_at)}</time>` : ''}`
    + `${p.excerpt ? `<p>${escapeHtml(p.excerpt)}</p>` : ''}</li>`).join('\n');
  return wrap(`<h1>Hyphening Media Blog</h1>
<p>Insights on content strategy, video production, social media operations, healthcare marketing and brand growth from Hyphening Media.</p>
<ul>\n${items}\n</ul>`);
}

function blogPost(slug) {
  const p = safeQuery(() => db.prepare(
    `SELECT title, excerpt, content, author, category, published_at, updated_at FROM blog_posts WHERE slug = ? AND status = 'published'`
  ).get(slug), 'blog post');
  if (!p) return null;
  const published = isoDate(p.published_at);
  const updated = isoDate(p.updated_at);
  return wrap(`<article>
<h1>${escapeHtml(p.title)}</h1>
<p>By ${escapeHtml(p.author || 'Hyphening Media')}${p.category ? ` · ${escapeHtml(p.category)}` : ''}`
    + `${published ? ` · Published <time datetime="${published}">${published}</time>` : ''}`
    + `${updated && updated !== published ? ` · Updated <time datetime="${updated}">${updated}</time>` : ''}</p>
${p.excerpt ? `<p><strong>${escapeHtml(p.excerpt)}</strong></p>\n` : ''}${markdownToHtml(p.content)}
</article>
<p><a href="/blog">More articles from Hyphening Media</a></p>`);
}

function caseStudiesIndex() {
  const rows = safeQuery(() => db.prepare(
    `SELECT slug, title, client_name, summary FROM case_studies WHERE status = 'published' ORDER BY published_at DESC`
  ).all(), 'case studies index') || [];
  const items = rows.map((c) => `<li><a href="/case-studies/${encodeURIComponent(c.slug)}">${escapeHtml(c.title)}</a>`
    + `${c.client_name ? ` (${escapeHtml(c.client_name)})` : ''}`
    + `${c.summary ? `<p>${escapeHtml(c.summary)}</p>` : ''}</li>`).join('\n');
  return wrap(`<h1>Hyphening Media Case Studies</h1>
<p>Client work from Hyphening Media across D2C, F&amp;B, B2B and healthcare brands.</p>
<ul>\n${items}\n</ul>`);
}

function caseStudy(slug) {
  const c = safeQuery(() => db.prepare(
    `SELECT title, client_name, summary, content, published_at FROM case_studies WHERE slug = ? AND status = 'published'`
  ).get(slug), 'case study');
  if (!c) return null;
  return wrap(`<article>
<h1>${escapeHtml(c.title)}</h1>
${c.client_name ? `<p>Client: ${escapeHtml(c.client_name)}</p>\n` : ''}${c.summary ? `<p><strong>${escapeHtml(c.summary)}</strong></p>\n` : ''}${markdownToHtml(c.content)}
</article>
<p><a href="/case-studies">All case studies</a></p>`);
}

function capabilitiesIndex() {
  const items = PILLARS_LIST.map((p) => `<li><a href="/capabilities/${p.slug}">${escapeHtml(p.title)}</a>`
    + `<p>${escapeHtml(p.summary)}</p></li>`).join('\n');
  return wrap(`<h1>Hyphening Media Capabilities</h1>\n<ul>\n${items}\n</ul>`);
}

function capability(slug) {
  const p = PILLARS_BY_SLUG[slug];
  if (!p) return null;
  const list = (rows, fmt) => (rows?.length ? rows.map(fmt).join('\n') : '');
  return wrap(`<article>
<h1>${escapeHtml(p.title)}: ${escapeHtml(p.tagline)}</h1>
<p>${escapeHtml(p.summary)}</p>
<h2>What We Deliver</h2>
<ul>\n${list(p.deliverables, (d) => `<li><strong>${escapeHtml(d.title)}.</strong> ${escapeHtml(d.desc)}</li>`)}\n</ul>
<h2>How We Work</h2>
<ol>\n${list(p.methodology, (m) => `<li><strong>${escapeHtml(m.title)}.</strong> ${escapeHtml(m.desc)}</li>`)}\n</ol>
${markdownToHtml(p.editorial)}
</article>
<p><a href="/capabilities">All capabilities</a> · <a href="/">Hyphening Media home</a></p>`);
}

const SLUG_EXISTS_SQL = {
  blog: `SELECT 1 FROM blog_posts WHERE slug = ? AND status = 'published'`,
  'case-studies': `SELECT 1 FROM case_studies WHERE slug = ? AND status = 'published'`,
};

/**
 * Whether a path is a real page the SPA can render (rec 1972). Everything
 * else used to fall through to index.html with a 200, so any typo URL — and
 * /llms.txt — answered as a duplicate of the homepage. A DB error counts as
 * known, so an outage never 404s real posts.
 */
export function isKnownPath(pathname) {
  if (/^\/(blog|case-studies|capabilities|login|dashboard)?$/.test(pathname)) return true;
  if (/^\/portal\/[^/]+$/.test(pathname)) return true;
  const m = pathname.match(/^\/(blog|case-studies|capabilities)\/([^/]+)$/);
  if (!m) return false;
  let slug;
  try {
    slug = decodeURIComponent(m[2]);
  } catch {
    return false;
  }
  if (m[1] === 'capabilities') return Boolean(PILLARS_BY_SLUG[slug]);
  try {
    return Boolean(db.prepare(SLUG_EXISTS_SQL[m[1]]).get(slug));
  } catch (e) {
    console.error(`[prerender] ${m[1]} slug check failed:`, e.message);
    return true;
  }
}

/**
 * Plain HTML body for a true 404. Not the SPA shell: the app's catch-all
 * route would just bounce the visitor to "/", which reads to a crawler as a
 * soft 404 again.
 */
export const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found | Hyphening Media</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#eee;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}a{color:#e0231c}</style>
</head>
<body>
<main>
<h1>Page not found</h1>
<p>This page doesn't exist on hypheningmedia.com.</p>
<p><a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/capabilities">Capabilities</a> · <a href="/case-studies">Case studies</a></p>
</main>
</body>
</html>
`;

/**
 * Crawler HTML for a public path, or null when the path has no server-rendered
 * content (unknown slug, or a route not covered here). "/" is handled by
 * server.js's own homepage block.
 */
export function prerenderPath(pathname) {
  if (pathname === '/blog') return blogIndex();
  if (pathname === '/case-studies') return caseStudiesIndex();
  if (pathname === '/capabilities') return capabilitiesIndex();
  const m = pathname.match(/^\/(blog|case-studies|capabilities)\/([^/]+)$/);
  if (!m) return null;
  let slug;
  try {
    slug = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  if (m[1] === 'blog') return blogPost(slug);
  if (m[1] === 'case-studies') return caseStudy(slug);
  return capability(slug);
}
