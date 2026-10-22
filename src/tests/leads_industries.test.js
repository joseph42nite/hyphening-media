import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import leadsRouter from '../routes/leads.js';

describe('Leads and Industry Management Tests', () => {
  it('should verify leadsRouter has authenticate middleware registered', () => {
    const middlewareNames = leadsRouter.stack
      .filter(layer => layer.name === 'authenticate')
      .map(layer => layer.name);

    expect(middlewareNames).toContain('authenticate');
  });

  it('should have lead_industries table initialized with defaults', () => {
    const industries = db.prepare('SELECT name FROM lead_industries ORDER BY id ASC').all().map(r => r.name);
    expect(industries).toContain('FnB');
    expect(industries).toContain('Healthcare');
    expect(industries).toContain('Interior Designers');
  });

  it('should allow inserting a lead and renaming its industry across tables', () => {
    // 1. Insert a custom industry
    db.prepare('INSERT OR IGNORE INTO lead_industries (name) VALUES (?)').run('Test Segment A');

    // 2. Insert a lead referencing that industry
    const info = db.prepare(`
      INSERT INTO leads (
        client_name, company_name, location, phone, email, website, notes, follow_up_date, status, industry, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run('Jane Doe', 'Alpha Design', 'Goa', '+91 9123456780', 'jane@alphadesign.com', null, 'Inquiry test', '2026-10-30', 'New', 'Test Segment A', 1);

    const leadId = info.lastInsertRowid;
    let fetched = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    expect(fetched.industry).toBe('Test Segment A');

    // 3. Rename industry in lead_industries and leads table
    db.prepare("UPDATE lead_industries SET name = 'Test Segment Renamed', updated_at = datetime('now') WHERE name = 'Test Segment A'").run();
    db.prepare("UPDATE leads SET industry = 'Test Segment Renamed', updated_at = datetime('now') WHERE industry = 'Test Segment A'").run();

    fetched = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    expect(fetched.industry).toBe('Test Segment Renamed');

    const indCheck = db.prepare("SELECT name FROM lead_industries WHERE name = 'Test Segment Renamed'").get();
    expect(indCheck).toBeDefined();
    expect(indCheck.name).toBe('Test Segment Renamed');

    // Cleanup
    db.prepare('DELETE FROM leads WHERE id = ?').run(leadId);
    db.prepare("DELETE FROM lead_industries WHERE name = 'Test Segment Renamed'").run();
  });
});
