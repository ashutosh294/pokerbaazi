// api/env.js — Vercel Serverless Function
// Frontend is file se config fetch karta hai
// Sirf POKER_ prefix wale vars expose hote hain — safe

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');

  const config = {
    SB_URL:    process.env.POKER_SB_URL    || '',
    SB_KEY:    process.env.POKER_SB_KEY    || '',
    ADMIN_PIN: process.env.POKER_ADMIN_PIN || '2025',
  };

  // window.__ENV__ set karo
  res.send(`window.__ENV__ = ${JSON.stringify(config)};`);
}
