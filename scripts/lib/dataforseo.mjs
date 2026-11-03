/**
 * DataForSEO v3, the outreach worker's only paid data source. Login comes from
 * the repo .env (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD) and is never printed.
 *
 * DataForSEO usually answers HTTP 200 and puts the real outcome in status_code,
 * at the top of the response and again per task. Every call checks both and
 * throws a DataForSeoError whose `kind` tells 007 what to do:
 *   missing  no login on this Mac          → add it to .env
 *   auth     login rejected (401xx)        → fix the login
 *   funds    balance, payment or cost cap  → top up / raise the limit (40200, 40210, 40203, HTTP 402)
 *   other    anything else
 * Docs: https://docs.dataforseo.com/v3/appendix/errors/
 */

const BASE = 'https://api.dataforseo.com/v3';

export class DataForSeoError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function classify(code, message) {
  if (code === 402 || code === 40200 || code === 40210 || code === 40203) return 'funds';
  if (code === 401 || (code >= 40100 && code < 40200)) return 'auth';
  if (/balance|payment|funds/i.test(message || '')) return 'funds';
  return 'other';
}

export function hasLogin() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

/** One live call; returns { items, cost }. `cost` is DataForSEO's own figure in USD. */
export async function dfs(path, task) {
  if (!hasLogin()) throw new DataForSeoError('missing', 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not in the Mac\'s .env');
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([task]),
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    throw new DataForSeoError('other', `DataForSEO unreachable: ${err.cause?.code || err.message}`);
  }
  const json = await res.json().catch(() => ({}));
  const top = json.status_code;
  if (!res.ok || (top && top !== 20000)) {
    const code = top && top !== 20000 ? top : res.status;
    throw new DataForSeoError(classify(code, json.status_message), `DataForSEO ${path}: ${code} ${json.status_message || res.statusText}`);
  }
  const t = json.tasks?.[0];
  if (t && t.status_code !== 20000) {
    throw new DataForSeoError(classify(t.status_code, t.status_message), `DataForSEO ${path}: ${t.status_code} ${t.status_message}`);
  }
  const result = t?.result?.[0] || {};
  return { items: result.items || [], cost: Number(json.cost) || 0 };
}
