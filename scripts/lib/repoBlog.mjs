/**
 * Blogs that live in a client's code repo (blog_publish_target 'repo_file').
 * The repo's deploy manifest says where and in what format:
 *
 *   "blog": {
 *     "type": "repo_file",
 *     "format": "next_blogs_data",          // the only format so far (Dr. Divya's site)
 *     "file": "src/lib/blogs-data.ts",      // the posts array
 *     "array": "replicatedBlogs",           // its exported name
 *     "covers_dir": "public/blog-covers",   // where a generated cover goes
 *     "url_prefix": "/blogs/",              // a post's URL path before the slug
 *     "site_url": "https://www.drdivyasharma.com",
 *     "author": "Dr. Divya Sharma, MBBS, MD"
 *   }
 *
 * next_blogs_data: a TypeScript file exporting an array of BlogArticle
 * objects written as JSON (src/lib/cms-store.ts in that repo). New posts go at
 * the top, which is where the site's blog list shows them first.
 */

import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { markdownToHtml } from '../../src/services/markdown.js';

export const REPO_BLOG_FORMATS = ['next_blogs_data'];

const rel = (p) => typeof p === 'string' && p.trim() && !p.startsWith('/') && !p.split('/').includes('..');

/** Problems with a manifest's blog section for repo_file; empty when fine. */
export function validateRepoBlog(b) {
  if (b?.type !== 'repo_file') return [];
  const errors = [];
  if (!REPO_BLOG_FORMATS.includes(b.format)) errors.push(`blog.format must be one of ${REPO_BLOG_FORMATS.join(', ')}`);
  if (!rel(b.file)) errors.push('blog.file must be the posts file, relative to the repo');
  if (typeof b.array !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(b.array)) errors.push('blog.array must be the exported array name');
  if (!rel(b.covers_dir)) errors.push('blog.covers_dir must be a folder relative to the repo (e.g. "public/blog-covers")');
  if (typeof b.url_prefix !== 'string' || !b.url_prefix.startsWith('/') || !b.url_prefix.endsWith('/')) errors.push('blog.url_prefix must look like "/blogs/"');
  if (typeof b.site_url !== 'string' || !/^https:\/\/[^/]+$/.test(b.site_url)) errors.push('blog.site_url must be the site origin, e.g. "https://www.example.com"');
  return errors;
}

const unquote = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };

/** The posts already in the file: [{ title, slug, url, cover }]. */
export function parsePosts(text, blog) {
  const posts = [];
  const re = /"title":\s*"((?:[^"\\]|\\.)*)",\s*"slug":\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text))) {
    const slug = unquote(m[2]);
    const after = text.slice(m.index, m.index + 4000);
    const img = /"singleImage":\s*"((?:[^"\\]|\\.)*)"/.exec(after);
    posts.push({ title: unquote(m[1]), slug, url: `${blog.site_url}${blog.url_prefix}${slug}`, cover: img ? unquote(img[1]) : null });
  }
  return posts;
}

export async function readRepoPosts(repo, blog) {
  return parsePosts(await readFile(path.join(repo, blog.file), 'utf8'), blog);
}

/** "Nov 22, 2026" in IST, the format the site's existing posts use. */
export function siteDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', year: 'numeric' }).format(d);
}

const slugify = (s) => String(s || 'post').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100) || 'post';

/** Links on the client's own site, as the site's { title, href } with a root-relative href. */
export function siteLinks(links, siteUrl) {
  const host = new URL(siteUrl).hostname.replace(/^www\./, '');
  const out = [];
  for (const l of Array.isArray(links) ? links : []) {
    if (!l?.url || !l?.anchor) continue;
    let href = null;
    if (l.url.startsWith('/')) href = l.url;
    else {
      try {
        const u = new URL(l.url);
        if (u.hostname.replace(/^www\./, '') === host) href = u.pathname + u.search;
      } catch { /* not a URL */ }
    }
    if (href && !out.some((o) => o.href === href)) out.push({ title: String(l.anchor).slice(0, 80), href });
  }
  return out.slice(0, 4);
}

/** The BlogArticle object for a draft. `image` is the cover path or URL. */
export function toArticle(runId, post, blog, { image, slug, date = new Date() }) {
  // The page prints the title itself; the draft's own "# Title" would be a second H1.
  const body = String(post.content || '').replace(/^\s*#\s+[^\n]*\n+/, '');
  const words = body.split(/\s+/).filter(Boolean).length;
  const tags = Array.isArray(post.tags) ? post.tags.map(String).filter(Boolean) : [];
  return {
    id: `blog-run-${runId}`,
    title: post.title,
    slug,
    excerpt: post.excerpt || post.meta_description || '',
    category: post.category || 'Clinical Dermatology',
    readTime: `${Math.max(1, Math.round(words / 200))} min read`,
    author: blog.author || 'Editorial team',
    date: siteDate(date),
    imageMode: 'single',
    ...(image ? { singleImage: image } : {}),
    internalLinks: siteLinks(post.internal_links, blog.site_url),
    content: markdownToHtml(body),
    tags: tags.length ? tags.slice(0, 6) : [post.category || 'Dermatology'],
    published: true,
  };
}

/** Put `article` at the top of the array in the file's text. Throws if the array isn't there. */
export function insertArticle(text, blog, article) {
  const start = new RegExp(`export\\s+const\\s+${blog.array}\\b[^=]*=\\s*\\[`).exec(text);
  if (!start) throw new Error(`${blog.file} has no "export const ${blog.array} = [" to add the post to`);
  const at = start.index + start[0].length;
  const json = JSON.stringify(article, null, 2).split('\n').map((l) => `  ${l}`).join('\n');
  const rest = text.slice(at);
  const empty = /^\s*\]/.test(rest);
  return `${text.slice(0, at)}\n${json}${empty ? '\n' : ','}${rest}`;
}

/**
 * Write the post (and its cover, when `cover` bytes are given) into the
 * worktree. Returns { slug, url, files } — the paths it changed, for git add.
 */
export async function addPostToRepo(wt, blog, runId, post, { cover = null } = {}) {
  const file = path.join(wt, blog.file);
  const text = await readFile(file, 'utf8');
  const taken = new Set(parsePosts(text, blog).map((p) => p.slug));
  let slug = slugify(post.slug || post.title);
  for (let n = 2; taken.has(slug); n++) slug = `${slugify(post.slug || post.title)}-${n}`;

  const files = [blog.file];
  let image = /^https:\/\//.test(post.cover_image_url || '') ? post.cover_image_url : null;
  if (cover?.buf) {
    const ext = cover.mime === 'image/png' ? 'png' : cover.mime === 'image/webp' ? 'webp' : 'jpg';
    const name = `${slug}.${ext}`;
    await mkdir(path.join(wt, blog.covers_dir), { recursive: true });
    await writeFile(path.join(wt, blog.covers_dir, name), cover.buf);
    files.push(path.join(blog.covers_dir, name));
    // public/ is the web root in a Next site: public/blog-covers/x.jpg is served at /blog-covers/x.jpg.
    image = `/${blog.covers_dir.replace(/^public\//, '')}/${name}`;
  }

  await writeFile(file, insertArticle(text, blog, toArticle(runId, post, blog, { image, slug })), 'utf8');
  return { slug, url: `${blog.site_url}${blog.url_prefix}${slug}`, files };
}
