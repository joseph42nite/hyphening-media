/**
 * Blog byline + Article JSON-LD (recs 1970, 1971).
 *
 * Shared by the React article view and the server prerender, so the visible
 * byline, the crawler HTML and the structured data can't drift apart.
 *
 * A post whose `author` is a named person gets a schema.org Person (with
 * worksFor pointing at the homepage Organization's @id). The org-level
 * bylines below stay an Organization: marking "Hyphening Media" up as a
 * Person would be false structured data.
 */

const SITE = 'https://hypheningmedia.com';
export const ORG_ID = `${SITE}/#organization`;

// Bylines that mean "the company", not a person.
const ORG_BYLINES = new Set(['hyphening media', 'hyphening editorial', 'hyphening', '']);

// Known people, keyed by the exact `author` value on the post. Add jobTitle,
// url (an about/profile page) and sameAs (LinkedIn etc.) only once confirmed.
export const AUTHORS = {};

export function isPersonAuthor(name) {
  return !ORG_BYLINES.has(String(name || '').trim().toLowerCase());
}

// What the visible byline shows: name + one-line role.
export function authorByline(name) {
  if (!isPersonAuthor(name)) {
    return { name: 'Hyphening Media', role: 'Editorial team · Hyphening Media' };
  }
  const known = AUTHORS[name.trim()] || {};
  return { name: name.trim(), role: known.jobTitle ? `${known.jobTitle} · Hyphening Media` : 'Hyphening Media' };
}

export function authorSchema(name) {
  if (!isPersonAuthor(name)) {
    return { '@type': 'Organization', '@id': ORG_ID, name: 'Hyphening Media', url: SITE };
  }
  const known = AUTHORS[name.trim()] || {};
  return {
    '@type': 'Person',
    name: name.trim(),
    ...(known.jobTitle && { jobTitle: known.jobTitle }),
    ...(known.url && { url: known.url }),
    ...(known.sameAs?.length && { sameAs: known.sameAs }),
    worksFor: { '@type': 'Organization', '@id': ORG_ID, name: 'Hyphening Media' },
  };
}

const toIso = (d) => {
  if (!d) return undefined;
  // SQLite datetime('now') is "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker.
  const s = String(d);
  const t = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
};

export function articleSchema(post) {
  const published = toIso(post.published_at);
  // dateModified is never earlier than datePublished; fall back to it when
  // the row has no usable updated_at.
  const updated = toIso(post.updated_at);
  const modified = updated && (!published || updated >= published) ? updated : published;
  const url = `${SITE}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.meta_title || post.title,
    description: post.meta_description || post.excerpt || '',
    ...(post.cover_image_url && { image: post.cover_image_url }),
    author: authorSchema(post.author),
    publisher: {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: 'Hyphening Media',
      url: SITE,
      logo: { '@type': 'ImageObject', url: `${SITE}/favicon.png` },
    },
    ...(published && { datePublished: published }),
    ...(modified && { dateModified: modified }),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  };
}

// Visible "Updated" date only when it differs from the publish day.
export function wasUpdated(post) {
  const p = toIso(post.published_at);
  const u = toIso(post.updated_at);
  return Boolean(p && u && u.slice(0, 10) > p.slice(0, 10));
}
