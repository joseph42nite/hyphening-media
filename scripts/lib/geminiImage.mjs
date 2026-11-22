/**
 * Blog cover images from Google's Gemini image model, called over its REST
 * API (not the Gemini CLI: the CLI has no image tool of its own, and its image
 * extension needs the same API key anyway).
 *
 *   GEMINI_API_KEY       Google AI Studio key with billing on (required; no key → no cover, Unsplash is used)
 *   GEMINI_IMAGE_MODEL   image model id (default gemini-2.5-flash-image)
 *
 * Claude writes the picture's subject (meta.json cover_prompt); coverPrompt()
 * wraps it in the house rules, and healthcare clients get stricter ones.
 */

import os from 'os';
import path from 'path';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { run } from './proc.mjs';

export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const HOUSE_RULES = [
  'Wide 16:9 blog cover image.',
  'Editorial photograph or clean, modern illustration; natural light; uncluttered composition with room to breathe.',
  'No text, letters, numbers, captions, logos, watermarks or brand marks anywhere in the image.',
  'No recognisable real people, celebrities or trademarked products.',
];

const HEALTHCARE_RULES = [
  'This is for a medical clinic: no patients, no faces, no bodies or body parts shown with a condition, no skin close-ups, no before/after, no wounds, needles in skin or procedures being performed.',
  'Prefer calm still life: clinic textures, plants, skincare bottles without labels, soft fabrics, abstract shapes.',
];

/** The full prompt sent to Gemini for Claude's `subject`. */
export function coverPrompt(subject, { healthcare = false, brand = '' } = {}) {
  return [
    `Subject: ${String(subject).trim().slice(0, 800)}`,
    brand ? `Brand feel: ${String(brand).trim().slice(0, 300)}` : '',
    ...HOUSE_RULES,
    ...(healthcare ? HEALTHCARE_RULES : []),
  ].filter(Boolean).join('\n');
}

/** First inline image in a generateContent response, or null. */
export function imageFromResponse(body) {
  for (const cand of body?.candidates || []) {
    for (const part of cand?.content?.parts || []) {
      const data = part.inlineData || part.inline_data;
      if (data?.data && /^image\//.test(data.mimeType || data.mime_type || '')) {
        return { buf: Buffer.from(data.data, 'base64'), mime: data.mimeType || data.mime_type };
      }
    }
  }
  return null;
}

/** PNG → JPEG with macOS sips, so a cover is ~300 KB rather than ~2 MB. Keeps the original if sips can't. */
export async function shrink(img) {
  if (process.platform !== 'darwin' || img.mime !== 'image/png') return img;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cover-'));
  try {
    await writeFile(path.join(dir, 'in.png'), img.buf);
    const res = await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', 'in.png', '--out', 'out.jpg'], { cwd: dir, timeoutMs: 60000 });
    if (res.code !== 0) return img;
    return { buf: await readFile(path.join(dir, 'out.jpg')), mime: 'image/jpeg' };
  } catch {
    return img;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * One cover. Resolves { buf, mime, model } or { problem } (never throws), so a
 * failed image never costs the post: the caller falls back to Unsplash.
 */
export async function generateCover(prompt, { apiKey = process.env.GEMINI_API_KEY, model = IMAGE_MODEL, fetchFn = fetch } = {}) {
  if (!apiKey) return { problem: 'no GEMINI_API_KEY in .env' };
  try {
    const res = await fetchFn(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { problem: `Gemini ${model} HTTP ${res.status}: ${String(body?.error?.message || '').slice(0, 200)}` };
    const img = imageFromResponse(body);
    if (!img) {
      const why = body?.promptFeedback?.blockReason || body?.candidates?.[0]?.finishReason || 'no image in the response';
      return { problem: `Gemini ${model} returned no image (${why})` };
    }
    return { ...(await shrink(img)), model };
  } catch (err) {
    return { problem: `Gemini ${model} call failed: ${err.message}` };
  }
}
