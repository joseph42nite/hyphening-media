import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import { sameSite, pickProperty, checkGoogleAccess, getGoogleAccess, markGbpInviteSent } from '../services/googleAccess.js';

beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

function makeClient(website = 'https://www.dentalchemy.test/') {
  return db.prepare("INSERT INTO crm_clients (name, client_type, is_active, website_url) VALUES (?, 'marketing', 1, ?)")
    .run(`Access client ${Math.random()}`, website).lastInsertRowid;
}

const SITES = [
  { siteUrl: 'https://dentalchemy.test/' },
  { siteUrl: 'sc-domain:dentalchemy.test' },
  { siteUrl: 'sc-domain:otherclient.test' },
];

// GA4 property 111 belongs to this client, 222 to someone else.
function sources({ failGa4 = false } = {}) {
  return {
    listSites: async () => SITES,
    getSessionMonths: async (pid) => {
      if (failGa4) throw new Error('The service account has no access to this GA4 property: add it as a Viewer. GA4 403: denied');
      if (pid === '111') return [{ month: '2026-10', host: 'ads.dentalchemy.test', channel: 'Paid', sessions: 40 }];
      return [{ month: '2026-10', host: 'otherclient.test', channel: 'Organic', sessions: 900 }];
    },
  };
}

const row = (id) => db.prepare('SELECT gsc_property, ga4_property_id FROM crm_clients WHERE id = ?').get(id);

describe('matching a website', () => {
  it('treats subdomains as the same site, but not lookalikes', () => {
    expect(sameSite('ads.dentalchemy.test', 'dentalchemy.test')).toBe(true);
    expect(sameSite('notdentalchemy.test', 'dentalchemy.test')).toBe(false);
  });

  it('prefers a domain property, and never picks another client\'s', () => {
    expect(pickProperty(SITES, 'https://www.dentalchemy.test')).toBe('sc-domain:dentalchemy.test');
    expect(pickProperty([{ siteUrl: 'https://dentalchemy.test/' }], 'https://ads.dentalchemy.test')).toBe('https://dentalchemy.test/');
    expect(pickProperty(SITES, 'https://unknown.test')).toBeNull();
  });
});

describe('checkGoogleAccess', () => {
  it('finds and saves the Search Console property and a GA4 property that records this site', async () => {
    const id = makeClient();
    const r = await checkGoogleAccess(id, { ga4_property_id: 'properties/111' }, { sources: sources() });
    expect(r.search_console.ok).toBe(true);
    expect(r.ga4.ok).toBe(true);
    expect(row(id)).toEqual({ gsc_property: 'sc-domain:dentalchemy.test', ga4_property_id: '111' });
    expect(r.access.ga4.connected).toBe(true);
  });

  it('refuses a GA4 property for someone else\'s site, without naming that site', async () => {
    const id = makeClient();
    const r = await checkGoogleAccess(id, { ga4_property_id: '222' }, { sources: sources() });
    expect(r.ga4.ok).toBe(false);
    expect(r.ga4.message).not.toMatch(/otherclient/);
    expect(row(id).ga4_property_id).toBeNull();
  });

  it('explains what to do when we have no access yet', async () => {
    const id = makeClient('https://newclinic.test');
    const r = await checkGoogleAccess(id, { ga4_property_id: '333' }, { sources: sources({ failGa4: true }) });
    expect(r.search_console.message).toMatch(/Users and permissions/);
    expect(r.search_console.message).not.toMatch(/otherclient|dentalchemy/);
    expect(r.ga4.message).toMatch(/Property access management/);
    expect(row(id)).toEqual({ gsc_property: null, ga4_property_id: null });
  });

  it('asks for the GA4 ID when none is given or saved', async () => {
    const r = await checkGoogleAccess(makeClient(), {}, { sources: sources() });
    expect(r.ga4.message).toMatch(/Enter your GA4 property ID/);
  });
});

describe('Business Profile invite', () => {
  it('records that the client sent the invite', () => {
    const id = makeClient();
    expect(getGoogleAccess(id).business_profile.invite_sent_at).toBeNull();
    expect(markGbpInviteSent(id).business_profile.invite_sent_at).toBeTruthy();
  });
});
