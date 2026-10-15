/**
 * Hyphening Ops — API Configuration
 * Detects Capacitor (mobile) vs browser (web) environment
 * and exports the correct API base URL.
 */

// Detect Capacitor native environment (Android APK)
export const isNative = typeof window !== 'undefined'
  && window.Capacitor?.isNativePlatform?.() === true;

// Mobile: full URL to production server
// Web: empty string (relative URLs — Vite proxy in dev, same-origin in prod)
export const API_BASE = isNative
  ? 'https://hypheningmedia.com'
  : '';

let isRefreshing = false;
let refreshPromise = null;

/**
 * Authenticated fetch wrapper.
 * Guarantees fresh network responses (cache: 'no-store') and transparently
 * refreshes expired JWT tokens (401) without interrupting the user or requiring
 * a page reload while working on long tasks (e.g. editing scripts).
 */
export const authFetch = async (url, options = {}) => {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const mergedOptions = {
    cache: 'no-store',
    ...options,
    credentials: 'include',
  };

  let res = await fetch(fullUrl, mergedOptions);
  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      })
        .then((refreshRes) => {
          isRefreshing = false;
          refreshPromise = null;
          return refreshRes.ok;
        })
        .catch(() => {
          isRefreshing = false;
          refreshPromise = null;
          return false;
        });
    }

    const success = await refreshPromise;
    if (success) {
      res = await fetch(fullUrl, mergedOptions);
    } else {
      localStorage.removeItem('user');
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('/login') &&
        !window.location.pathname.includes('/portal')
      ) {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }
  }
  return res;
};

