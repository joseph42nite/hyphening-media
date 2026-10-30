import { describe, it, expect } from 'vitest';
import statusRouter from '../routes/status.js';

describe('Status Router', () => {
  it('registers authenticate middleware', () => {
    expect(statusRouter.stack.map(l => l.name)).toContain('authenticate');
  });

  it('exposes GET /clients only', () => {
    const routes = statusRouter.stack.filter(l => l.route).map(l => `${Object.keys(l.route.methods)} ${l.route.path}`);
    expect(routes).toEqual(['get /clients']);
  });
});
