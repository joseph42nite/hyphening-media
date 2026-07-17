import { describe, it, expect } from 'vitest';
import seoRouter from '../routes/seo.js';
import usageRouter from '../routes/usage.js';

describe('SEO and Usage Router Authentication Middleware Tests', () => {
  it('should verify seoRouter has authenticate middleware registered', () => {
    const middlewareNames = seoRouter.stack
      .filter(layer => layer.name === 'authenticate')
      .map(layer => layer.name);
    
    expect(middlewareNames).toContain('authenticate');
  });

  it('should verify usageRouter has authenticate middleware registered', () => {
    const middlewareNames = usageRouter.stack
      .filter(layer => layer.name === 'authenticate')
      .map(layer => layer.name);
    
    expect(middlewareNames).toContain('authenticate');
  });
});
