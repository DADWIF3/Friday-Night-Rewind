// Friday Night Rewind — Worker
//
// Serves the built React app (via the ASSETS binding) and handles form intake
// at POST /api/submit. Everything else falls through to static assets so the
// SPA router keeps working.

import { handleAdmin } from './admin.js';
import { handleUpload, sweepExpired } from './uploads.js';

const TYPES = new Set(['preview', 'nomination', 'contact']);

// Fields we accept, per form type. Anything not listed is dropped rather than
// stored, so a tampered form can't write arbitrary columns.
const FIELDS = {
  preview: ['name', 'email', 'phone', 'city', 'team', 'sport', 'year', 'format',
            'length', 'service_wanted', 'media_link', 'contact_method', 'message'],
  nomination: ['name', 'email', 'phone', 'nominee', 'school', 'city', 'sport',
               'position', 'year', 'media_link', 'message'],
  contact: ['name', 'email', 'phone', 'message'],
};

const REQUIRED = {
  preview: ['name', 'email', 'phone', 'city', 'sport', 'format', 'service_wanted', 'message'],
  nomination: ['name', 'email', 'nominee', 'city', 'sport', 'year', 'message'],
  contact: ['name', 'email', 'message'],
};

const CONSENT = ['rights_confirmed', 'contact_ok', 'public_use_ok', 'portfolio_use_ok'];

const MAX_FIELD = 4000;
const RATE_LIMIT = 5;              // submissions per IP...
const RATE_WINDOW_MS = 60 * 60e3;  // ...per hour

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const clean = (v) =>
  typeof v === 'string' ? v.trim().slice(0, MAX_FIELD) : '';

const looksLikeEmail = (v) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

async function underRateLimit(db, ip) {
  const now = Date.now();
  const row = await db.prepare('SELECT count, window_at FROM rate_limit WHERE ip = ?')
    .bind(ip).first();

  if (!row || now - Date.parse(row.window_at) > RATE_WINDOW_MS) {
    await db.prepare(
      `INSERT INTO rate_limit (ip, count, window_at) VALUES (?, 1, ?)
       ON CONFLICT(ip) DO UPDATE SET count = 1, window_at = excluded.window_at`
    ).bind(ip, new Date(now).toISOString()).run();
    return true;
  }

  if (row.count >= RATE_LIMIT) return false;

  await db.prepare('UPDATE rate_limit SET count = count + 1 WHERE ip = ?').bind(ip).run();
  return true;
}

async function notify(env, record) {
  // Email is best-effort: a delivery failure must never cost us the lead,
  // because the row is already committed by the time we get here.
  if (!env.RESEND_API_KEY || !env.NOTIFY_TO) return;

  const label = {
    preview: 'Free preview request',
    nomination: 'Local Legend nomination',
    contact: 'Contact message',
  }[record.type];

  // upload_token authorizes writes to the bucket — it never belongs in an email.
  const lines = Object.entries(record)
    .filter(([k, v]) => k !== 'upload_token' && v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || 'Friday Night Rewind <onboarding@resend.dev>',
        to: [env.NOTIFY_TO],
        reply_to: record.email,
        subject: `${label} — ${record.name}`,
        text: `${label}\n\n${lines}\n`,
      }),
    });
  } catch (err) {
    console.error('notify failed', err);
  }
}

async function handleSubmit(request, env, ctx) {
  if (!env.DB) return json({ error: 'Storage is not configured.' }, 503);

  let body;
  try {
    body = await readBody(request);
  } catch {
    return json({ error: 'Could not read that submission.' }, 400);
  }

  const type = clean(body.type);
  if (!TYPES.has(type)) return json({ error: 'Unknown form.' }, 400);

  // Honeypot: a real browser leaves this hidden field empty. Bots fill it.
  // Answer 200 so the bot believes it succeeded and doesn't retry.
  if (clean(body.website)) return json({ ok: true });

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await underRateLimit(env.DB, ip))) {
    return json({ error: 'Too many submissions from this connection. Please try again later.' }, 429);
  }

  const record = { type, status: 'new' };
  for (const field of FIELDS[type]) record[field] = clean(body[field]);

  const missing = REQUIRED[type].filter((f) => !record[f]);
  if (missing.length) {
    return json({ error: 'Some required fields are missing.', fields: missing }, 400);
  }
  if (!looksLikeEmail(record.email)) {
    return json({ error: 'That email address does not look valid.', fields: ['email'] }, 400);
  }

  // Both forms that touch customer footage require a rights confirmation.
  const consent = {};
  for (const key of CONSENT) consent[key] = body[key] ? 1 : 0;
  if (type !== 'contact' && !consent.rights_confirmed) {
    return json({ error: 'Please confirm you own this footage or have permission to submit it.', fields: ['rights_confirmed'] }, 400);
  }

  const now = new Date().toISOString();
  // Only footage-bearing requests get an upload token; a contact message
  // has no reason to be able to write to the bucket.
  const uploadToken = type === 'contact' ? null : crypto.randomUUID().replace(/-/g, '');
  const row = {
    id: crypto.randomUUID(),
    ...record,
    ...consent,
    consent_at: now,
    consent_ip: ip,
    upload_token: uploadToken,
    source_page: clean(body.source_page),
    user_agent: (request.headers.get('user-agent') || '').slice(0, 500),
    created_at: now,
  };

  const columns = Object.keys(row);
  const sql = `INSERT INTO submissions (${columns.join(', ')})
               VALUES (${columns.map(() => '?').join(', ')})`;

  try {
    await env.DB.prepare(sql).bind(...columns.map((c) => row[c])).run();
  } catch (err) {
    console.error('insert failed', err);
    return json({ error: 'We could not save that submission. Please try again or email us directly.' }, 500);
  }

  ctx.waitUntil(notify(env, row));
  return json({ ok: true, id: row.id, upload_token: uploadToken });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/submit') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      return handleSubmit(request, env, ctx);
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      if (!env.DB) return new Response('Storage is not configured.', { status: 503 });
      return handleAdmin(request, env, url);
    }

    if (url.pathname.startsWith('/api/upload/')) {
      return handleUpload(request, env, url);
    }

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        db: Boolean(env.DB),
        email: Boolean(env.RESEND_API_KEY),
        uploads: Boolean(env.UPLOADS),
      });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sweepExpired(env));
  },
};
