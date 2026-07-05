import { describe, it, expect } from 'vitest';
import db from '../../database.js';
import { getEntityId, logQuotaUsage } from '../services/composioService.js';
import { runAutoPublisher } from '../services/autoPublisher.js';

describe('Composio Social Integration & Auto-Publisher Unit Tests', () => {
  it('should generate correct Composio Entity ID format', () => {
    const entityId = getEntityId(12);
    expect(entityId).toBe('hyphening_client_12');
  });

  it('should log quota usage to sys_composio_quota_logs table', () => {
    logQuotaUsage('TEST_ACTION', 1, 19999);

    const log = db.prepare(`
      SELECT * FROM sys_composio_quota_logs
      WHERE action_name = 'TEST_ACTION' AND client_id = 1
      ORDER BY id DESC LIMIT 1
    `).get();

    expect(log).toBeDefined();
    expect(log.action_name).toBe('TEST_ACTION');
    expect(log.client_id).toBe(1);
  });

  it('should verify migration 032 added new columns to marketing_content_tracker', () => {
    const tableInfo = db.prepare("PRAGMA table_info('marketing_content_tracker')").all();
    const columnNames = tableInfo.map(col => col.name);

    expect(columnNames).toContain('platform_post_id');
    expect(columnNames).toContain('facebook_post_id');
    expect(columnNames).toContain('linkedin_post_id');
    expect(columnNames).toContain('x_tweet_id');
    expect(columnNames).toContain('platform_metadata');
  });

  it('should verify migration 034 added is_trial column to marketing_content_tracker', () => {
    const tableInfo = db.prepare("PRAGMA table_info('marketing_content_tracker')").all();
    const columnNames = tableInfo.map(col => col.name);

    expect(columnNames).toContain('is_trial');
  });

  it('should run autoPublisher without throwing errors on empty queue', async () => {
    await expect(runAutoPublisher()).resolves.not.toThrow();
  });
});
