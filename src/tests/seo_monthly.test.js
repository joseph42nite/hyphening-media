import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import {
  fillMonthlyReport, previousMonth, nextMonth, lastFinishedMonth, monthRange, setReportStatus, MIN_IMPRESSIONS,
  refreshMomGrowth, reportHost,
} from '../services/seoMonthly.js';

// One transaction rolled back at the end, so the local database is untouched.
beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

function makeClient({ gsc = 'sc-domain:example.test', ga4 = 'properties/123', site = 'https://www.example.test/' } = {}) {
  return db.prepare(`
    INSERT INTO crm_clients (name, client_type, is_active, website_url, gsc_property, ga4_property_id)
    VALUES (?, 'marketing', 1, ?, ?, ?)
  `).run(`Monthly client ${Math.random()}`, site, gsc, ga4).lastInsertRowid;
}

const row = (clientId, month) =>
  db.prepare('SELECT * FROM marketing_monthly_report WHERE client_id = ? AND month = ?').get(clientId, month);

// Stand-ins for the Google APIs. Month '2026-10' is "this" month, '2026-09' the one before.
function fakeSources({ failGsc = false } = {}) {
  return {
    gsc: {
      getTotals: async () => ({ clicks: 420, impressions: 15000, position: 14.237 }),
      getQueries: async (_p, { since }) => {
        if (failGsc) throw new Error('Search Console 403: no access');
        if (since === '2026-09-01') return [{ query: 'dentist hsr', clicks: 20, impressions: 300, position: 6.5 }];
        return [
          { query: 'dentist hsr', clicks: 40, impressions: 500, position: 2.4 },
          { query: 'root canal cost', clicks: 10, impressions: 200, position: 8.1 },
          { query: 'tooth whitening', clicks: 5, impressions: 400, position: 15 },
          // Too few impressions to count towards top 3 / top 10.
          { query: 'one-off search', clicks: 1, impressions: MIN_IMPRESSIONS - 1, position: 1 },
        ];
      },
    },
    getSessionMonths: async () => {
      if (failGsc) return [];
      return [
        { month: '2026-10', host: 'www.example.test', channel: 'Organic Search', sessions: 900 },
        { month: '2026-10', host: 'example.test', channel: 'Direct', sessions: 100 },
        // Another site in the same property is not counted.
        { month: '2026-10', host: 'ads.example.test', channel: 'Paid Search', sessions: 5000 },
      ];
    },
  };
}

describe('month helpers', () => {
  it('handles year boundaries and month lengths', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(lastFinishedMonth(new Date('2026-12-03T00:30:00Z'))).toBe('2026-11');
    expect(monthRange('2028-02')).toEqual({ since: '2028-02-01', until: '2028-02-29' });
  });
});

describe('fillMonthlyReport', () => {
  it('fills a new month from Search Console and GA4 and leaves it as a draft', async () => {
    const id = makeClient();
    db.prepare("INSERT INTO marketing_monthly_report (client_id, month, website_traffic) VALUES (?, '2026-09', 800)").run(id);

    const result = await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    const r = row(id, '2026-10');

    expect(result.notes).toEqual([]);
    expect(r.status).toBe('draft');
    expect(r.search_clicks).toBe(420);
    expect(r.search_impressions).toBe(15000);
    expect(r.avg_position).toBe(14.2);
    expect(r.queries_top3).toBe(1);
    expect(r.queries_top10).toBe(2);
    expect(r.website_traffic).toBe(1000);
    expect(r.mom_growth_sessions).toBe(0.25);

    const top = JSON.parse(r.top_queries);
    expect(top[0]).toMatchObject({ query: 'dentist hsr', position: 2.4, prev_position: 6.5 });
    expect(top.find(q => q.query === 'root canal cost').prev_position).toBeNull();
  });

  it('never overwrites a cell someone typed in', async () => {
    const id = makeClient();
    db.prepare("INSERT INTO marketing_monthly_report (client_id, month, search_clicks, website_traffic, gmb_views) VALUES (?, '2026-10', 999, 0, 3100)").run(id);

    const result = await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    const r = row(id, '2026-10');

    expect(r.search_clicks).toBe(999);
    expect(r.website_traffic).toBe(0);
    expect(r.gmb_views).toBe(3100);
    expect(r.search_impressions).toBe(15000);
    expect(result.filled).not.toContain('search_clicks');
    expect(result.filled).not.toContain('website_traffic');
  });

  it('writes a note, not zeros, when a client is not connected', async () => {
    const id = makeClient({ gsc: null, ga4: null });
    const result = await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    const r = row(id, '2026-10');

    expect(r.search_clicks).toBeNull();
    expect(r.website_traffic).toBeNull();
    expect(result.notes.join(' ')).toMatch(/Search Console not connected/);
    expect(result.notes.join(' ')).toMatch(/GA4 not connected/);
    expect(JSON.parse(r.auto_sources).notes).toHaveLength(2);
  });

  it('records an API error instead of failing the whole month', async () => {
    const id = makeClient();
    const result = await fillMonthlyReport(id, '2026-10', { sources: fakeSources({ failGsc: true }) });
    expect(result.notes.join(' ')).toMatch(/Search Console failed: Search Console 403/);
    expect(row(id, '2026-10').search_clicks).toBeNull();
  });

  it('counts SEO fixes that went live and blogs published that month', async () => {
    const id = makeClient({ gsc: null, ga4: null });
    const auditId = db.prepare("INSERT INTO seo_audits (client_id, audit_type, url) VALUES (?, 'full', 'https://example.test/')").run(id).lastInsertRowid;
    const live = db.prepare("INSERT INTO seo_fix_batches (client_id, night, status, deploy_finished_at) VALUES (?, '2026-10-05', 'live', '2026-10-06 01:00:00')").run(id).lastInsertRowid;
    const other = db.prepare("INSERT INTO seo_fix_batches (client_id, night, status, deploy_finished_at) VALUES (?, '2026-11-02', 'live', '2026-11-02 01:00:00')").run(id).lastInsertRowid;
    const rec = db.prepare("INSERT INTO seo_recommendations (audit_id, client_id, priority, metric, issue, action_required, status, fix_batch_id) VALUES (?, ?, 'High', 'm', 'i', 'a', 'completed', ?)");
    rec.run(auditId, id, live); rec.run(auditId, id, live); rec.run(auditId, id, other);
    db.prepare("INSERT INTO blog_agent_runs (client_id, status, published_at) VALUES (?, 'published', '2026-10-20 10:00:00')").run(id);

    await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    const r = row(id, '2026-10');
    expect(r.fixes_live).toBe(2);
    expect(r.blogs).toBe(1);
  });
});

describe('publishing', () => {
  it('drafts stay hidden until published; existing rows start published', async () => {
    const id = makeClient({ gsc: null, ga4: null });
    db.prepare("INSERT INTO marketing_monthly_report (client_id, month) VALUES (?, '2026-08')").run(id);
    expect(row(id, '2026-08').status).toBe('published');

    await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    const visible = () => db.prepare("SELECT month FROM marketing_monthly_report WHERE client_id = ? AND status = 'published'").all(id).map(r => r.month);
    expect(visible()).toEqual(['2026-08']);

    expect(setReportStatus(id, '2026-10', 'published')).toBe(1);
    expect(visible().sort()).toEqual(['2026-08', '2026-10']);
    expect(() => setReportStatus(id, '2026-10', 'live')).toThrow();
  });
});

describe('which site GA4 traffic counts', () => {
  it('uses the Search Console site, not an ads landing page in website_url', () => {
    expect(reportHost({ gsc_property: 'https://dentalchemy.in/', website_url: 'https://ads.dentalchemy.in' })).toBe('dentalchemy.in');
    expect(reportHost({ gsc_property: 'sc-domain:www.Example.test', website_url: null })).toBe('example.test');
    expect(reportHost({ gsc_property: null, website_url: 'https://www.shop.test/x' })).toBe('shop.test');
  });

  it('counts only that site, leaving out other sites sharing the tag and localhost', async () => {
    const id = makeClient({ gsc: 'https://main.test/', site: 'https://ads.main.test' });
    const sources = {
      ...fakeSources(),
      getSessionMonths: async () => [
        { month: '2026-10', host: 'main.test', channel: 'Organic Search', sessions: 170 },
        { month: '2026-10', host: 'www.main.test', channel: 'Direct', sessions: 30 },
        { month: '2026-10', host: 'ads.main.test', channel: 'Paid Search', sessions: 900 },
        { month: '2026-10', host: 'other-agency.biz', channel: 'Direct', sessions: 10 },
        { month: '2026-10', host: 'localhost', channel: 'Direct', sessions: 1 },
      ],
    };
    await fillMonthlyReport(id, '2026-10', { sources });
    expect(row(id, '2026-10').website_traffic).toBe(200);
  });

  it('leaves traffic empty with a note when GA4 has nothing for the site', async () => {
    const id = makeClient({ gsc: 'https://main.test/' });
    const sources = {
      ...fakeSources(),
      getSessionMonths: async () => [{ month: '2026-10', host: 'other-agency.biz', channel: 'Direct', sessions: 10 }],
    };
    const result = await fillMonthlyReport(id, '2026-10', { sources });
    expect(row(id, '2026-10').website_traffic).toBeNull();
    expect(result.notes.join(' ')).toMatch(/GA4 has no sessions for main\.test/);
  });
});

describe('month-on-month growth', () => {
  it('is filled in whatever order the months are filled', async () => {
    const id = makeClient();
    // The later month first: no earlier month yet, so no growth.
    await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    expect(row(id, '2026-10').mom_growth_sessions).toBeNull();

    // Filling September afterwards works out October's growth too.
    const sept = { ...fakeSources(), getSessionMonths: async () => [{ month: '2026-09', host: 'example.test', channel: 'Direct', sessions: 800 }] };
    await fillMonthlyReport(id, '2026-09', { sources: sept });
    expect(row(id, '2026-10').mom_growth_sessions).toBe(0.25);
  });

  it('covers map views and follows edits to the month before', () => {
    const id = makeClient({ gsc: null, ga4: null });
    const ins = db.prepare('INSERT INTO marketing_monthly_report (client_id, month, website_traffic, map_views) VALUES (?, ?, ?, ?)');
    ins.run(id, '2026-06', 100, 400);
    ins.run(id, '2026-07', 150, 300);
    refreshMomGrowth(id, '2026-07');
    expect(row(id, '2026-07')).toMatchObject({ mom_growth_sessions: 0.5, mom_growth_gmb_views: -0.25 });

    db.prepare("UPDATE marketing_monthly_report SET website_traffic = 50 WHERE client_id = ? AND month = '2026-06'").run(id);
    refreshMomGrowth(id, '2026-06');
    expect(row(id, '2026-07').mom_growth_sessions).toBe(2);
  });
});

describe('fill record', () => {
  it('keeps what earlier runs filled when a rerun finds nothing empty', async () => {
    const id = makeClient();
    await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    const second = await fillMonthlyReport(id, '2026-10', { sources: fakeSources() });
    expect(second.filled).toEqual([]);
    expect(JSON.parse(row(id, '2026-10').auto_sources).filled).toContain('search_clicks');
  });
});
