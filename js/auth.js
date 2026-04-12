// ══════════════════════════════════════════════════════════
//  AUTH — Phone login + Admin PIN + Device management
// ══════════════════════════════════════════════════════════
import { db }                        from './db.js';
import { AUTH_KEY, DEVICE_KEY, ADMIN_PIN } from './config.js';
import { toast }                     from './ui.js';

// ── State ────────────────────────────────────────────────
export let currentUser  = null;  // { id, name, phone, is_admin, is_active }
export let isAdmin      = false;
export let isMember     = false; // logged-in non-admin

// ── Device ID ────────────────────────────────────────────
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'dev_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// ── Load saved session ───────────────────────────────────
export function loadAuthCache() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    // Validate device match
    if (saved.deviceId !== getDeviceId()) {
      localStorage.removeItem(AUTH_KEY);
      return false;
    }
    currentUser = saved.user;
    isAdmin     = saved.isAdmin  || false;
    isMember    = saved.isMember || false;
    return true;
  } catch {
    return false;
  }
}

export function saveAuthCache() {
  localStorage.setItem(AUTH_KEY, JSON.stringify({
    deviceId: getDeviceId(),
    user:     currentUser,
    isAdmin,
    isMember,
  }));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  currentUser = null;
  isAdmin     = false;
  isMember    = false;
}

// ── Phone Login ──────────────────────────────────────────
export async function loginWithPhone(phone) {
  const result = await db.rpc('player_login', {
    p_phone:     phone,
    p_device_id: getDeviceId(),
  });

  if (!result) throw new Error('Server error');
  if (!result.success) {
    if (result.error === 'not_found')
      throw new Error('Yeh number registered nahi hai. Admin se contact karo.');
    if (result.error === 'already_logged_in')
      throw new Error('Yeh number already kisi aur device pe login hai. Pehle wahan se logout karo.');
    throw new Error('Login fail hua. Dobara try karo.');
  }

  currentUser = {
    id:       result.id,
    name:     result.name,
    is_admin: result.is_admin,
  };
  isMember = true;
  isAdmin  = false; // Admin PIN alag se lagega
  saveAuthCache();
  return currentUser;
}

// ── Admin PIN verify ─────────────────────────────────────
export function verifyAdminPin(pin) {
  if (!currentUser?.is_admin) return false;
  if (pin !== ADMIN_PIN) return false;
  isAdmin = true;
  saveAuthCache();
  return true;
}

// ── Logout ───────────────────────────────────────────────
export async function logout() {
  if (!currentUser) return;
  try {
    await db.rpc('player_logout', {
      p_phone:     currentUser.phone,
      p_device_id: getDeviceId(),
    });
  } catch { /* offline logout — still clear local */ }
  clearAuth();
}

// ── Permission helpers ───────────────────────────────────
export function canWrite()  { return isAdmin || isMember; }
export function canDelete() { return isAdmin; }
