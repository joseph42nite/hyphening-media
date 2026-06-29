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
