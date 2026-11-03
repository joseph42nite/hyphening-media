import { describe, it, expect } from 'vitest';
import db from '../../database.js';
import clientsRouter from '../routes/clients.js';
import automationRouter, { SCOPES } from '../routes/automation.js';
import {
  validatePipelineInput, validatePreferenceInput, validateCredentialInput,
  buildBlogConfig, saveCredential, KeyMissingError, QUALITY_BAR,
} from '../services/blogPipeline.js';

const routes = (router) => router.stack.filter(l => l.route).map(l => `${Object.keys(l.route.methods)} ${l.route.path}`);

describe('client blog pipeline routes', () => {
  it('registers blog-config, pipeline and credential routes', () => {
    const r = routes(clientsRouter);
    for (const route of [
      'get /:id/blog-config', 'get /:id/blog-pipeline', 'put /:id/blog-pipeline',
      'put /:id/publish-credential', 'delete /:id/publish-credential', 'post /:id/publish-credential/test',
    ]) expect(r).toContain(route);
  });

  it('serves every fleet the scheduler checks, behind authenticate', () => {
    expect(automationRouter.stack.map(l => l.name)).toContain('authenticate');
    expect(SCOPES).toEqual(['ads', 'seo', 'blog']);
  });
});

describe('pipeline input', () => {
  it('normalises languages, numbers and blanks', () => {
    const { updates } = validatePipelineInput({ blog_languages: 'en, hi, en', blog_posts_per_month: '4', repo_path: '', blog_audio_enabled: true });
    expect(updates).toEqual({ repo_path: null, blog_languages: '["en","hi"]', blog_audio_enabled: 1, blog_posts_per_month: 4 });
  });

  it('has no auto-publish mode (decision 0.3)', () => {
    expect(validatePipelineInput({ blog_publish_mode: 'auto_after_gates' }).error).toMatch(/blog_publish_mode/);
  });

  it('rejects bad targets, language names and relative repo paths', () => {
    expect(validatePipelineInput({ blog_publish_target: 'ftp' }).error).toBeTruthy();
    expect(validatePipelineInput({ blog_languages: 'english' }).error).toBeTruthy();
    expect(validatePipelineInput({ repo_path: 'Projects/site' }).error).toBeTruthy();
    expect(validatePipelineInput({ blog_posts_per_month: 500 }).error).toBeTruthy();
  });

  it('ignores fields the portal may not set', () => {
    const { updates } = validatePreferenceInput({ blog_pref_requests: ' Hindi too ', blog_publish_mode: 'approve_each' });
    expect(updates).toEqual({ blog_pref_requests: 'Hindi too' });
  });

  it('sets the quality bar by compliance profile (decision 0.4)', () => {
    expect(QUALITY_BAR).toEqual({ general: 71, healthcare: 80 });
  });
});

describe('publishing key', () => {
  it('needs https and a WordPress username', () => {
    expect(validateCredentialInput({ kind: 'wordpress', endpoint_url: 'http://a.com', username: 'u', secret: '12345678' }).error).toMatch(/https/);
    expect(validateCredentialInput({ kind: 'wordpress', endpoint_url: 'https://a.com', secret: '12345678' }).error).toMatch(/username/);
    expect(validateCredentialInput({ kind: 'custom', endpoint_url: 'https://a.com/', secret: 'short' }).error).toMatch(/8 characters/);
  });

  it('refuses to store anything without the server key', () => {
    const saved = process.env.CLIENT_CREDENTIALS_KEY;
    delete process.env.CLIENT_CREDENTIALS_KEY;
    try {
      expect(() => saveCredential(999999, { kind: 'custom', endpoint_url: 'https://a.com', secret: '12345678' })).toThrow(KeyMissingError);
    } finally {
      if (saved !== undefined) process.env.CLIENT_CREDENTIALS_KEY = saved;
    }
  });
});

describe('blog-config', () => {
  it('returns null for a client that does not exist', () => {
    expect(buildBlogConfig(999999)).toBeNull();
  });

  it('has everything a worker needs and no secret', () => {
    const client = db.prepare('SELECT id FROM crm_clients ORDER BY id LIMIT 1').get();
    if (!client) return;
    const config = buildBlogConfig(client.id);
    expect(Object.keys(config)).toEqual(['generated_at', 'client', 'flags', 'automation', 'onboarding', 'pipeline', 'preferences', 'publish_credential']);
    expect(Array.isArray(config.pipeline.blog_languages)).toBe(true);
    expect([71, 80]).toContain(config.pipeline.quality_bar);
    const json = JSON.stringify(config);
    expect(json).not.toMatch(/secret_enc|"secret"|"username"/);
  });
});
