import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://hyphening.com';

/**
 * Dynamic SEO Head Component
 * Manages document title, meta tags, and ensures exactly ONE canonical tag exists in <head>
 * without duplicate or conflicting canonical links across route transitions.
 */
export default function SEOHead({
  title = 'Hyphening Media | Creative Operations & Marketing Performance Agency',
  description = 'Hyphening Media is a creative operations and marketing agency scaling D2C, F&B, and healthcare brands. We build high-performance content calendars, videos, web apps, and automated marketing dashboards.',
  canonicalUrl,
  ogImage = 'https://hyphening.com/favicon.png',
  ogType = 'website',
  keywords
}) {
  const location = useLocation();

  useEffect(() => {
    // 1. Update document title
    if (title) {
      document.title = title;
    }

    // 2. Compute canonical URL (strip trailing slashes except for root '/')
    let rawPath = canonicalUrl || location.pathname;
    if (rawPath.startsWith('http')) {
      try {
        const parsed = new URL(rawPath);
        rawPath = parsed.pathname;
      } catch (e) {
        // Fallback to raw string
      }
    }
    const cleanPath = rawPath === '/' ? '/' : rawPath.replace(/\/$/, '');
    const fullCanonical = `${SITE_URL}${cleanPath}`;

    // 3. Ensure single <link rel="canonical"> in <head>
    const existingCanonicals = document.querySelectorAll('link[rel="canonical"]');
    if (existingCanonicals.length > 0) {
      existingCanonicals[0].setAttribute('href', fullCanonical);
      // Remove any extra canonical tags
      for (let i = 1; i < existingCanonicals.length; i++) {
        existingCanonicals[i].remove();
      }
    } else {
      const link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('href', fullCanonical);
      document.head.appendChild(link);
    }

    // Helper function to create or update meta tags
    const setMeta = (attrName, attrValue, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrValue);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // 4. Update primary meta tags
    setMeta('name', 'description', description);
    if (keywords) setMeta('name', 'keywords', keywords);

    // 5. Update OpenGraph tags
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', fullCanonical);
    setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:type', ogType);

    // 6. Update Twitter Card tags
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:url', fullCanonical);
    setMeta('name', 'twitter:image', ogImage);

  }, [title, description, canonicalUrl, ogImage, ogType, keywords, location.pathname]);

  return null;
}
