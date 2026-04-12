// ══════════════════════════════════════════════════════════
//  CONFIG
//  Values window.__ENV__ se aate hain — index.html inject karta hai
//  Vercel pe yeh Environment Variables set karo:
//    POKER_SB_URL    → Supabase project URL
//    POKER_SB_KEY    → Supabase anon key
//    POKER_ADMIN_PIN → Admin PIN (default: 2025)
// ══════════════════════════════════════════════════════════

const ENV = window.__ENV__ || {};

export const SB_URL    = ENV.SB_URL    || '';
export const SB_KEY    = ENV.SB_KEY    || '';
export const ADMIN_PIN = ENV.ADMIN_PIN || '2025';

export const APP_VERSION  = '2.0.0';
export const CACHE_KEY    = 'poker_cache_v2';
export const AUTH_KEY     = 'poker_auth_v2';
export const DEVICE_KEY   = 'poker_device_v2';
export const LOG_DAYS     = 7;

export const MAX_BUYINGS  = 100;
export const MAX_RESULT   = 9_999_999;
export const MAX_RATE     = 99_999;
export const WS_RECONNECT = 3000;
