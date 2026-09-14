// Friday Night Rewind — /admin queue
//
// Rendered server-side by the Worker rather than added to the React bundle:
// the lead data and the D1 queries never reach the public site's JavaScript,
// and there is no admin code to discover in the shipped assets.

const STATUSES = ['new', 'reviewing', 'quoted', 'in_progress', 'delivered', 'archived', 'spam'];
const SESSION_HOURS = 12;
const COOKIE = 'fnr_admin';

const enc = new TextEncoder();

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- session token: HMAC(expiry) keyed by the admin password ------------------

async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']);
}

async function sign(secret, exp) {
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(String(exp)));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${exp}.${hex}`;
}

async function valid(secret, token) {
  if (!token || !token.includes('.')) return false;
  const [exp] = token.split('.');
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return false;
  // Re-sign and compare: crypto.subtle.verify is already constant-time.
  const expected = await sign(secret, exp);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

function cookieValue(request) {
  const raw = request.headers.get('cookie') || '';
  const hit = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : '';
}

// --- views --------------------------------------------------------------------

const CSS = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;padding:1rem;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#12151a;color:#e9edf2}
h1{font-size:1.25rem;margin:0}
a{color:#7fb4ff}
header{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}
.filters{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem}
.filters a{padding:.35rem .7rem;border:1px solid #2c333e;border-radius:999px;text-decoration:none;font-size:.85rem;color:#cbd5e1}
.filters a.on{background:#7fb4ff;color:#0b0e12;border-color:#7fb4ff;font-weight:600}
.card{background:#1a1f27;border:1px solid #2c333e;border-radius:10px;padding:.9rem;margin-bottom:.8rem}
.card h2{font-size:1rem;margin:0 0 .15rem}
.meta{font-size:.8rem;color:#98a4b3;margin-bottom:.6rem}
.tag{display:inline-block;padding:.1rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.t-preview{background:#1e3a5f;color:#9ec8ff}
.t-nomination{background:#3d2f5c;color:#cbb6ff}
.t-contact{background:#2b3f33;color:#a7e0bd}
dl{display:grid;grid-template-columns:auto 1fr;gap:.2rem .7rem;margin:.5rem 0;font-size:.88rem}
dt{color:#98a4b3}
dd{margin:0;word-break:break-word}
.msg{white-space:pre-wrap;background:#12151a;border-left:3px solid #2c333e;padding:.5rem .7rem;border-radius:0 6px 6px 0;font-size:.88rem;margin:.5rem 0}
.consent{display:flex;gap:.4rem;flex-wrap:wrap;margin:.5rem 0;font-size:.78rem}
.yes{color:#7ee2a8}.no{color:#7c8794}
form.status{display:flex;gap:.4rem;margin-top:.6rem}
select,button,input{font:inherit;padding:.45rem .6rem;border-radius:7px;border:1px solid #2c333e;background:#12151a;color:#e9edf2}
button{background:#7fb4ff;color:#0b0e12;font-weight:600;border:0;cursor:pointer}
.empty{color:#98a4b3;padding:2rem 0;text-align:center}
.login{max-width:22rem;margin:15vh auto}
.err{color:#ff9d9d;font-size:.9rem}
`;

function loginPage(error = '') {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Admin — Friday Night Rewind</title><style>${CSS}</style></head><body>
<div class="login"><h1>Friday Night Rewind</h1><p class="meta">Submission queue</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="POST" action="/admin/login">
<p><input type="password" name="password" placeholder="Password" required autofocus style="width:100%"></p>
<p><button type="submit" style="width:100%">Sign in</button></p>
</form></div></body></html>`, error ? 401 : 200);
}

function flag(on, label) {
  return `<span class="${on ? 'yes' : 'no'}">${on ? '✓' : '✗'} ${esc(label)}</span>`;
}

function row(r) {
  const pair = (label, value) => (value ? `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : '');
  const when = new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' });

  return `<article class="card">
<header style="margin:0 0 .4rem"><div>
<h2>${esc(r.name)}${r.nominee ? ` → ${esc(r.nominee)}` : ''}</h2>
<div class="meta"><span class="tag t-${esc(r.type)}">${esc(r.type)}</span> · ${esc(when)}</div>
</div></header>
<dl>
${pair('Email', r.email)}${pair('Phone', r.phone)}${pair('Prefers', r.contact_method)}
${pair('City', r.city)}${pair('School', r.school)}${pair('Team', r.team)}
${pair('Sport', r.sport)}${pair('Position', r.position)}${pair('Year', r.year)}
${pair('Format', r.format)}${pair('Length', r.length)}${pair('Wants', r.service_wanted)}
${r.media_link ? `<dt>Link</dt><dd><a href="${esc(r.media_link)}" rel="noopener noreferrer nofollow" target="_blank">${esc(r.media_link)}</a></dd>` : ''}
</dl>
${r.message ? `<div class="msg">${esc(r.message)}</div>` : ''}
<div class="consent">
${flag(r.rights_confirmed, 'owns/has rights')}
${flag(r.contact_ok, 'contact ok')}
${flag(r.public_use_ok, 'public use')}
${flag(r.portfolio_use_ok, 'portfolio use')}
</div>
<div class="meta">consent recorded ${esc(r.consent_at)} from ${esc(r.consent_ip)}</div>
<form class="status" method="POST" action="/admin/status">
<input type="hidden" name="id" value="${esc(r.id)}">
<select name="status" aria-label="Status">
${STATUSES.map((s) => `<option value="${s}"${s === r.status ? ' selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
</select>
<button type="submit">Save</button>
</form></article>`;
}

async function listPage(env, url) {
  const filter = url.searchParams.get('type');
  const status = url.searchParams.get('status');

  let sql = 'SELECT * FROM submissions';
  const where = [];
  const binds = [];
  if (filter && ['preview', 'nomination', 'contact'].includes(filter)) {
    where.push('type = ?'); binds.push(filter);
  }
  if (status && STATUSES.includes(status)) {
    where.push('status = ?'); binds.push(status);
  } else if (!status) {
    where.push("status NOT IN ('archived','spam')");
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ' ORDER BY created_at DESC LIMIT 200';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  const tab = (label, params, active) =>
    `<a class="${active ? 'on' : ''}" href="/admin${params}">${label}</a>`;
  const none = !filter && !status;

  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Queue — Friday Night Rewind</title><style>${CSS}</style></head><body>
<header><h1>Submission queue</h1><a href="/admin/logout">Sign out</a></header>
<div class="filters">
${tab('Open', '', none)}
${tab('Previews', '?type=preview', filter === 'preview')}
${tab('Nominations', '?type=nomination', filter === 'nomination')}
${tab('Contact', '?type=contact', filter === 'contact')}
${tab('Archived', '?status=archived', status === 'archived')}
${tab('Spam', '?status=spam', status === 'spam')}
</div>
${results.length ? results.map(row).join('') : '<p class="empty">Nothing here yet.</p>'}
</body></html>`);
}

// --- router -------------------------------------------------------------------

export async function handleAdmin(request, env, url) {
  if (!env.ADMIN_PASSWORD) {
    return html('<p>Admin is not configured. Set the ADMIN_PASSWORD secret.</p>', 503);
  }

  if (url.pathname === '/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    if (String(form.get('password') || '') !== env.ADMIN_PASSWORD) return loginPage('Incorrect password.');
    const token = await sign(env.ADMIN_PASSWORD, Date.now() + SESSION_HOURS * 3600e3);
    return new Response('', {
      status: 303,
      headers: {
        location: '/admin',
        'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`,
      },
    });
  }

  if (url.pathname === '/admin/logout') {
    return new Response('', {
      status: 303,
      headers: { location: '/admin', 'set-cookie': `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0` },
    });
  }

  if (!(await valid(env.ADMIN_PASSWORD, cookieValue(request)))) return loginPage();

  if (url.pathname === '/admin/status' && request.method === 'POST') {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    const status = String(form.get('status') || '');
    if (id && STATUSES.includes(status)) {
      await env.DB.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind(status, id).run();
    }
    return new Response('', { status: 303, headers: { location: request.headers.get('referer') || '/admin' } });
  }

  if (url.pathname === '/admin') return listPage(env, url);
  return html('<p>Not found.</p>', 404);
}
