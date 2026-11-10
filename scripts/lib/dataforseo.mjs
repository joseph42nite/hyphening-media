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

/**
 * Whether DataForSEO answers for this login right now, for the SEO worker's
 * capabilities report (src/routes/seo.js reads report_json.capabilities.dataforseo
 * to unlock the DataForSEO, Maps and Backlink gap cards). Uses appendix/user_data,
 * which is free. Never throws: { available, reason?, balance? }.
 */
export async function probe() {
  if (!hasLogin()) return { available: false, reason: 'missing' };
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
  try {
    const res = await fetch(`${BASE}/appendix/user_data`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    const task = body.tasks?.[0];
    const code = task?.status_code ?? body.status_code ?? res.status;
    if (code !== 20000) return { available: false, reason: classify(code, task?.status_message || body.status_message) };
    const balance = task.result?.[0]?.money?.balance;
    if (typeof balance === 'number' && balance <= 0) return { available: false, reason: 'funds', balance };
    return { available: true, balance };
  } catch (err) {
    return { available: false, reason: 'other', error: err.message };
  }
}

/**
 * One live call; returns { items, cost }. `cost` is DataForSEO's own figure in USD.
 * A server error on their side (HTTP 5xx or 5xxxx) is tried once more.
 */
export async function dfs(path, task, { retryDelayMs = 3000 } = {}) {
  try {
    return await dfsOnce(path, task);
  } catch (err) {
    if (!err.retryable) throw err;
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    return dfsOnce(path, task);
  }
}

async function dfsOnce(path, task) {
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
    throw Object.assign(new DataForSeoError('other', `DataForSEO unreachable: ${err.cause?.code || err.message}`), { retryable: true });
  }
  const json = await res.json().catch(() => ({}));
  const t = json.tasks?.[0];
  // The most specific failure wins: the call's, then the task's, then HTTP's.
  const failed = [[json.status_code, json.status_message], [t?.status_code, t?.status_message]]
    .find(([code]) => code && code !== 20000);
  if (failed || !res.ok) {
    const [code, message] = failed || [res.status, `HTTP error ${res.statusText || ''}`.trim()];
    const err = new DataForSeoError(classify(code, message), `DataForSEO ${path}: ${code} ${message || ''}`.trim());
    err.retryable = (code >= 500 && code < 600) || (code >= 50000 && code < 60000);
    throw err;
  }
  const result = t?.result?.[0] || {};
  return { items: result.items || [], cost: Number(json.cost) || 0 };
}
