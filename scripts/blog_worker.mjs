#!/usr/bin/env node
/**
 * Night blog worker.
 *
 * Pulls queued blog runs from the Ops Center (claim_blog_runs), writes each
 * post with the claude-blog plugin in one headless Claude run, checks it
 * itself (quality gate, cover image, duplicate title), renders narration if
 * the client has audio on, and posts the draft back (submit_blog_draft). It
 * never publishes: 007 approves in the Blog tab and the server publishes.
 * Same pull model and HMAC channel as seo_worker.mjs.
 *
 * Runs on the Mac with the Claude CLI, the claude-blog plugin, the vault and
 * Kokoro. The Mac connector starts it (`--once`) when the 01:00 IST schedule
 * or a "Draft now" click queues a run.
 *
 *   HYPHENING_API_URL      Ops Center base URL        (default http://localhost:3000)
 *   HYPHENING_HMAC_SECRET  shared webhook secret      (required)
 *   BLOG_WORKER_ID         name in the logs           (default hostname)
 *   BLOG_CLAUDE_BIN        Claude CLI binary          (default 'claude')
 *   BLOG_MODEL             model that writes the post (default claude-sonnet-5-5)
 *   BLOG_PYTHON            Python with the plugin's dependencies (default: Leiter's blogvenv)
 *   BLOG_TIMEOUT_MINUTES   one post's Claude run      (default 45)
 *   VAULT_DIR              vault root                 (default /Volumes/Mac Valhalla/Vault)
 *
 * Usage:
 *   node scripts/blog_worker.mjs --once     # drain the queue and exit (it always does;
 *                                           # --once is accepted for the connector's sake)
 */

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, readFile, writeFile, mkdir, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import dotenv from 'dotenv';
import { hook, API } from './lib/hook.mjs';
import { run } from './lib/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
dotenv.config({ path: path.join(REPO, '.env') });

const SECRET = process.env.HYPHENING_HMAC_SECRET || process.env.OPENCLAW_HMAC_SECRET;
const WORKER = process.env.BLOG_WORKER_ID || os.hostname();
const CLAUDE_BIN = process.env.BLOG_CLAUDE_BIN || 'claude';
const MODEL = process.env.BLOG_MODEL || 'claude-sonnet-5-5';
const HOME = os.homedir();
const PLUGIN = path.join(HOME, '.claude/plugins/marketplaces/agricidaniel-blog');
const PYTHON = process.env.BLOG_PYTHON || path.join(HOME, '.openmausbot/workspaces/3ee73451-c9f3-402f-9f9a-2677050c11e5/blogvenv/bin/python');
const VAULT = process.env.VAULT_DIR || '/Volumes/Mac Valhalla/Vault';
const AUDIO_QUEUE = path.join(VAULT, 'Companies/Hyphening/Content/_audio-queue');
const KOKORO = path.join(HOME, '.hyphening-tts/kokoro-render');
const NIGHT_REPORT = path.join(VAULT, 'Companies/Hyphening/Docs/Hyphening - Night Report.md');
const ALLOWED_TOOLS = 'WebSearch,WebFetch,Skill,Read,Write,Edit,Glob,Grep';
const CLAUDE_TIMEOUT_MS = (Number(process.env.BLOG_TIMEOUT_MINUTES) || 45) * 60 * 1000;

if (!SECRET) {
  console.error('[blog-worker] HYPHENING_HMAC_SECRET is not set. Every request would 401.');
  process.exit(1);
}


async function log(runId, line) {
  console.log(`[blog-worker] #${runId} ${line}`);
  try { await hook('blog_run_log', { run_id: runId, log: line }); } catch { /* a lost log line must not kill the run */ }
}


/** Published posts on Hyphening's own blog, for duplicates and internal links. */
async function hypheningLivePosts() {
  const posts = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${API}/api/blog?limit=50&page=${page}`);
    if (!res.ok) break;
    const data = await res.json();
    const batch = data.posts || [];
    posts.push(...batch.map(p => ({ title: p.title, url: `${API}/blog/${p.slug}`, cover: p.cover_image_url })));
    if (batch.length < 50) break;
  }
  return posts;
}

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The prompt. The model writes files; the worker checks them and talks to
 * the Ops Center. Same reasoning as seo_worker.mjs: asking a model to sign
 * and POST is unreliable, asking it to write two files is not.
 */
function buildPrompt(job, livePosts) {
  const { config, topic } = job;
  const c = config.client;
  const p = config.pipeline;
  const o = config.onboarding;
  const prefs = config.preferences;
  const healthcare = p.blog_compliance_profile === 'healthcare';

  return [
    `You are writing ONE blog post for **${c.name}** (client_id ${c.id}), for their blog at ${p.blog_site_url || c.website_url || 'their website'}.`,
    'Work only in the current directory: write files only here. Do not publish anything, call any webhook or API that writes, open any .env file, or touch any git repository. You have web search, web fetch, the claude-blog skills and file tools; there is no shell.',
    '',
    '## Topic',
    `- Topic: ${topic?.topic || '(none given: pick the strongest gap from the brand keywords)'}`,
    topic?.target_keyword ? `- Target keyword: ${topic.target_keyword}` : '',
    topic?.notes ? `- Notes: ${topic.notes}` : '',
    job.previous_rejections?.length ? `- An earlier draft of this topic was REJECTED. Fix these:\n${job.previous_rejections.map(r => `  - ${r}`).join('\n')}` : '',
    '',
    '## Brand and voice (from the client\'s onboarding)',
    '```json',
    JSON.stringify(o, null, 2),
    '```',
    prefs?.blog_pref_topics_avoid ? `Topics the client asked us to avoid: ${prefs.blog_pref_topics_avoid}` : '',
    p.blog_author_name ? `Byline: ${p.blog_author_name}.` : '',
    p.blog_reviewer_name ? `Reviewed by: ${p.blog_reviewer_name}.` : '',
    '',
    '## Steps (use the claude-blog plugin skills; each one is required)',
    '1. `blog-cannibalization`-style check: compare the topic with the live posts below; if it overlaps one, take a clearly different angle and say which in evidence.',
    '2. `blog-brief`: real WebSearch, then WebFetch the top 3-5 ranking pages (headings, length, gaps) and People Also Ask.',
    '3. `blog-outline`: link 2-4 of the LIVE posts below and one service/treatment page on the client\'s site. Write these internal links as root-relative paths (`/blog/some-post`), not full URLs.',
    `4. \`blog-write\` in the voice above, answer-first, about 1,000-1,500 words${p.blog_languages?.length > 1 ? ', in English (translations are separate)' : ''}.`,
    '5. `blog-factcheck`: every statistic and factual claim has a real source you opened, cited INLINE where the claim is, as a Markdown link (`[Source name](https://...)`). Prefer primary and official sources; use at least 3. No invented numbers, quotes, credentials or first-hand experience.',
    healthcare ? `6. Healthcare compliance: read "${path.join(VAULT, 'Shared/Healthcare Advertising Compliance.md')}" and follow it. No health, efficacy or before/after claims without a source. No guarantees.` : '6. (General client: no compliance step beyond honesty.)',
    '7. `blog-seo-check`: title, meta title (60 chars max), meta description (155 chars max), one H1, logical H2s, slug, alt text.',
    '8. `blog-geo`: answer-first sections and a short FAQ from real questions people ask.',
    `9. \`blog-schema\`: BlogPosting JSON-LD${healthcare ? ' (with the reviewer if given)' : ''}; FAQPage only if the FAQ is real.`,
    '10. Cover: one Unsplash photo URL (https://images.unsplash.com/photo-...?w=1200&q=80) that fits the post, not used by a live post below, with alt text.',
    p.blog_audio_enabled ? '11. Audio: a spoken summary of the post, 180-230 words (the narrator refuses anything over two minutes), plain sentences, no headings or URLs.' : '',
    '',
    '## Live posts (for duplicates and internal links)',
    livePosts.length ? livePosts.map(l => `- ${l.title} — ${l.url}`).join('\n') : `(none listed: fetch ${p.blog_site_url || c.website_url} yourself to find them)`,
    '',
    '## Output: write exactly these files in the current directory, then stop',
    '- `post.md`: the article only, starting with `# Title` and ending with `## FAQ` and then `## Sources` (a numbered list of Markdown links). No front matter, no notes.',
    p.blog_audio_enabled ? '- `audio_script.txt`: the spoken summary.' : '',
    '- `meta.json`:',
    '```json',
    JSON.stringify({
      title: 'string', slug: 'kebab-case', excerpt: '1-2 sentences', meta_title: '<=60 chars', meta_description: '<=155 chars',
      meta_keywords: 'comma, separated', category: 'string', tags: ['string'],
      internal_links: [{ url: 'https://...', anchor: 'string' }],
      cover_image_url: 'https://images.unsplash.com/...', cover_alt: 'string',
      schema_json: { '@context': 'https://schema.org', '@type': 'BlogPosting' },
      evidence: { serp_urls: ['https://...'], sources_checked: 0, closest_live_posts: ['string'], angle: 'string', skills_run: ['blog-brief'] },
      blockers: ['only what 007 must check or fix before publishing: an unverified claim, a source you could not open, a missing fact; empty if none'],
      notes: ['how you worked, plainly (tools you could not use, pages you skipped); not problems with the post'],
    }, null, 2),
    '```',
  ].filter(s => s !== '').join('\n');
}

/** `](https://example.com/` or `](https://www.example.com/` for the client's own host. */
function sameSiteLink(host) {
  const bare = host.replace(/^www\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\]\\(https?://(www\\.)?${bare}/`, 'g');
}

/** Score with the plugin's own analyzer. It needs front matter, which post.md deliberately lacks. */
async function qualityScore(dir, meta, body, bar, { author, siteHost }) {
  if (!existsSync(PYTHON)) return { score: null, note: `quality gate skipped: no Python at ${PYTHON}` };
  const file = path.join(dir, 'score.md');
  const fm = `---\ntitle: ${JSON.stringify(meta.title)}\ndescription: ${JSON.stringify(meta.meta_description || meta.excerpt || '')}\n`
    + `date: ${new Date().toISOString().slice(0, 10)}\nauthor: ${JSON.stringify(author)}\n---\n\n`;
  // The analyzer only counts relative links as internal; full URLs to the
  // client's own site are internal links too.
  const scored = siteHost ? body.replace(sameSiteLink(siteHost), '](/') : body;
  await writeFile(file, fm + scored, 'utf8');
  const res = await run(PYTHON, ['-I', path.join(PLUGIN, 'scripts/quality_gate.py'), '--format', 'json', '--threshold', String(bar), file]);
  try {
    const data = JSON.parse(res.out);
    const checked = data.checked?.[0] || {};
    return { score: Number.isFinite(checked.score) ? Math.round(checked.score) : null, issues: (checked.issues || []).map(i => i.issue).slice(0, 10) };
  } catch {
    return { score: null, note: `quality gate gave no JSON: ${(res.err || res.out).slice(0, 200)}` };
  }
}

async function checkCover(url, livePosts) {
  if (!url || !/^https:\/\//.test(url)) return 'no cover image URL';
  if (livePosts.some(l => l.cover && l.cover.split('?')[0] === url.split('?')[0])) return 'cover image is already used by a live post';
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) return `cover image returned HTTP ${res.status} ${type}`;
    return null;
  } catch (err) {
    return `cover image unreachable (${err.message})`;
  }
}

/** The first sentences of `text` that fit in `max` words. */
function trimToWords(text, max) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).split(/\s+/).filter(Boolean).length > max) break;
    out += sentence;
  }
  return out.trim() || text.split(/\s+/).slice(0, max).join(' ');
}

/** Kokoro narration via the vault's audio queue. Returns { mp3 } or { problem }. */
async function renderAudio(clientName, slug, script) {
  if (!existsSync(KOKORO)) return { problem: 'audio skipped: Kokoro renderer not installed' };
  const folder = path.join(AUDIO_QUEUE, clientName, slug);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'script.txt'), script.trim() + '\n', 'utf8');
  // Foreground: a render can take 15+ minutes and nothing else needs the Mac at night.
  await run(KOKORO, [clientName, slug], { timeoutMs: 40 * 60 * 1000 });
  let report = {};
  try { report = JSON.parse(await readFile(path.join(folder, 'report.json'), 'utf8')); } catch { /* handled below */ }
  if (report.status !== 'ok') return { problem: `audio not used: render status ${report.status || 'missing'}${report.issues?.length ? ` (${report.issues.slice(0, 2).join('; ')})` : ''}` };
  return { mp3: await readFile(path.join(folder, 'narration.mp3')) };
}

async function appendNightReport(line) {
  try {
    if (!existsSync(NIGHT_REPORT)) {
      await writeFile(NIGHT_REPORT, '---\ntype: night-report\ncompany: "Hyphening"\n---\n# Hyphening: night report\n\n'
        + 'Appended by `scripts/blog_worker.mjs` (and later the SEO worker), newest at the bottom. Do not hand-edit. '
        + 'Approve posts in the portal\'s Blog Monitor tab.\n\n', 'utf8');
    }
    await appendFile(NIGHT_REPORT, `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${line}\n`, 'utf8');
  } catch (err) {
    console.error(`[blog-worker] Could not write the night report: ${err.message}`);
  }
}

async function runJob(job) {
  const started = Date.now();
  const { config } = job;
  const name = config.client.name;
  const fail = async (error) => {
    await log(job.run_id, `Failed: ${error}`);
    await hook('fail_blog_run', { run_id: job.run_id, error });
    await appendNightReport(`FAILED · ${name} · ${job.topic?.topic || 'no topic'} · ${error}`);
  };

  if (!config.client.is_active || !config.flags.blog_enabled) return fail('client inactive or Blog switched off');
  await log(job.run_id, `Writing "${job.topic?.topic || 'next topic'}" for ${name} with ${MODEL}.`);

  const dir = await mkdtemp(path.join(os.tmpdir(), 'blog-run-'));
  try {
    const livePosts = config.pipeline.blog_publish_target === 'hyphening_webhook' ? await hypheningLivePosts() : [];
    await writeFile(path.join(dir, 'prompt.md'), buildPrompt(job, livePosts), 'utf8');

    // Only what writing a post needs: search, fetch, the plugin's skills, and
    // files in this temp directory. No shell; the worker runs the checks itself.
    // In -p mode any other tool is refused rather than prompted.
    const res = await run(CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', MODEL, '--allowedTools', ALLOWED_TOOLS],
      { input: await readFile(path.join(dir, 'prompt.md'), 'utf8'), timeoutMs: CLAUDE_TIMEOUT_MS, cwd: dir });
    if (res.code !== 0) return fail(`claude exited ${res.code}: ${(res.err || res.out).trim().slice(-400)}`);

    let meta;
    let body;
    try {
      meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8'));
      body = await readFile(path.join(dir, 'post.md'), 'utf8');
    } catch {
      return fail(`the run did not write post.md and meta.json. Last output: ${res.out.trim().slice(-300)}`);
    }
    if (!meta.title || body.trim().length < 1500) return fail('post.md is missing or too short');

    const blockers = Array.isArray(meta.blockers) ? meta.blockers.filter(Boolean).map(String) : [];
    const slug = slugify(meta.slug || meta.title);

    // Our checks, not the model's word for it.
    const bar = config.pipeline.quality_bar;
    const siteUrl = config.pipeline.blog_site_url || config.client.website_url || '';
    const quality = await qualityScore(dir, meta, body, bar, {
      author: config.pipeline.blog_author_name || name,
      siteHost: siteUrl ? new URL(siteUrl).hostname : null,
    });
    if (quality.note) blockers.push(quality.note);
    else if (quality.score < bar) blockers.push(`quality score ${quality.score} is below the bar of ${bar}`);
    const coverProblem = await checkCover(meta.cover_image_url, livePosts);
    if (coverProblem) blockers.push(coverProblem);
    const dup = livePosts.find(l => normTitle(l.title) === normTitle(meta.title));
    if (dup) blockers.push(`same title as a live post: ${dup.url}`);
    if ((meta.meta_title || '').length > 60) blockers.push(`meta title is ${meta.meta_title.length} characters (max 60)`);
    if ((meta.meta_description || '').length > 155) blockers.push(`meta description is ${meta.meta_description.length} characters (max 155)`);

    await hook('submit_blog_draft', {
      run_id: job.run_id, model: MODEL,
      title: meta.title, slug, excerpt: meta.excerpt, content: body,
      category: meta.category, tags: meta.tags, meta_title: meta.meta_title, meta_description: meta.meta_description,
      meta_keywords: meta.meta_keywords, internal_links: meta.internal_links,
      cover_image_url: meta.cover_image_url, cover_alt: meta.cover_alt, schema_json: meta.schema_json,
      quality_score: quality.score, blockers,
      evidence: {
        ...(meta.evidence || {}), quality_issues: quality.issues || [], duration_seconds: Math.round((Date.now() - started) / 1000),
        worker_notes: Array.isArray(meta.notes) ? meta.notes.filter(Boolean).map(String) : [],
      },
    });

    if (config.pipeline.blog_audio_enabled) {
      let script = '';
      try { script = await readFile(path.join(dir, 'audio_script.txt'), 'utf8'); } catch { /* reported below */ }
      if (!script.trim()) {
        await log(job.run_id, 'No audio script written; post saved without audio.');
      } else {
        await log(job.run_id, 'Rendering narration with Kokoro...');
        let audio = await renderAudio(name, slug, script);
        // The renderer refuses scripts over ~120 s. Trim at a sentence end to
        // about 230 words and try once more rather than lose the narration.
        if (!audio.mp3 && /too long/i.test(audio.problem || '')) {
          await log(job.run_id, 'Script too long for the narrator; trimming and rendering again...');
          audio = await renderAudio(name, slug, trimToWords(script, 230));
        }
        if (audio.mp3) {
          await hook('attach_blog_audio', { run_id: job.run_id, mp3_base64: audio.mp3.toString('base64') });
          await log(job.run_id, 'Narration attached.');
        } else {
          await log(job.run_id, audio.problem);
        }
      }
    }

    const scoreText = quality.score == null ? 'no score' : `${quality.score}/${bar}`;
    await log(job.run_id, `Done in ${Math.round((Date.now() - started) / 60000)} min: "${meta.title}" (${scoreText}${blockers.length ? `, ${blockers.length} problem(s)` : ''}).`);
    const firstProblems = blockers.slice(0, 2).map(b => (b.length > 110 ? `${b.slice(0, 107)}...` : b)).join('; ');
    await appendNightReport(`READY · ${name} · "${meta.title}" · ${scoreText}${blockers.length ? ` · ${blockers.length} problem(s): ${firstProblems}` : ''}`);
  } catch (err) {
    try { await fail(err.message.slice(0, 1000)); } catch (inner) {
      console.error(`[blog-worker] #${job.run_id} could not report its own failure: ${inner.message}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The health check gates the whole night: blocked means nothing gets written. */
async function healthBlocked() {
  const script = path.join(REPO, 'scripts/health-check.sh');
  if (!existsSync(script)) return null;
  const res = await run('bash', [script, '--write']);
  return res.code === 2 ? (res.out.split('\n').find(l => l.includes('[BLOCKED]')) || 'health check BLOCKED').trim() : null;
}

async function main() {
  console.log(`[blog-worker] ${WORKER} -> ${API}, model ${MODEL}`);
  const blocked = await healthBlocked();
  let handled = 0;
  for (;;) {
    const res = await hook('claim_blog_runs', { worker_id: WORKER, limit: 1 });
    const runs = res?.data?.runs || [];
    if (runs.length === 0) break;
    for (const job of runs) {
      handled++;
      if (blocked) {
        await hook('fail_blog_run', { run_id: job.run_id, error: `Health check: ${blocked}` });
        await appendNightReport(`FAILED · ${job.config.client.name} · health check: ${blocked}`);
      } else {
        await runJob(job);
      }
    }
  }
  console.log(`[blog-worker] Handled ${handled} run(s).`);
}

main().catch(err => { console.error('[blog-worker] Fatal:', err); process.exit(1); });
