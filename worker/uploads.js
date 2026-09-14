// Friday Night Rewind — customer footage uploads (R2 multipart)
//
// A Worker request body is capped well below the size of a digitized game tape,
// so the browser splits the file into parts and uploads them one at a time
// through R2's multipart API. Three endpoints: create, part, complete.
//
// Authorization is the `upload_token` issued by /api/submit. Only the person who
// just completed a form — and confirmed they hold the rights — can attach files
// to that submission, and only to that submission.

const MAX_BYTES = 5 * 1024 * 1024 * 1024;   // 5 GB per file
const MIN_PART = 5 * 1024 * 1024;           // R2 multipart minimum (except last)
export const PART_SIZE = 16 * 1024 * 1024;  // what we ask the browser to send
const MAX_FILES = 12;
const RETENTION_DAYS = 90;

// Tape captures and phone video. Deliberately narrow: no archives, no
// executables, nothing that would make this bucket interesting to abuse.
const ALLOWED = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv', 'video/webm': 'webm', 'video/mpeg': 'mpg',
  'video/x-ms-wmv': 'wmv', 'video/3gpp': '3gp',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const safeName = (name) =>
  String(name || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

// Constant-time compare so a wrong token can't be discovered by timing.
function tokensMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(env, url, body = {}) {
  const id = String(body.submission_id || url.searchParams.get('submission_id') || '');
  const token = String(body.token || url.searchParams.get('token') || '');
  if (!id || !token) return null;

  const row = await env.DB.prepare(
    'SELECT id, upload_token, rights_confirmed FROM submissions WHERE id = ?'
  ).bind(id).first();

  if (!row || !row.upload_token || !tokensMatch(row.upload_token, token)) return null;
  // Belt and braces: the submit handler already refuses without this.
  if (!row.rights_confirmed) return null;
  return row;
}

async function create(request, env, url) {
  const body = await request.json().catch(() => ({}));
  const submission = await authorize(env, url, body);
  if (!submission) return json({ error: 'This upload link is not valid.' }, 403);

  const filename = safeName(body.filename);
  const size = Number(body.size) || 0;
  const type = String(body.content_type || '');

  if (!ALLOWED[type]) {
    return json({ error: 'That file type is not accepted. Send video or photo files.' }, 415);
  }
  if (size <= 0 || size > MAX_BYTES) {
    return json({ error: 'Files must be under 5 GB. For anything larger, contact us first.' }, 413);
  }

  const { count } = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM uploads WHERE submission_id = ? AND status != 'aborted'"
  ).bind(submission.id).first();
  if (count >= MAX_FILES) {
    return json({ error: `A maximum of ${MAX_FILES} files can be attached to one request.` }, 409);
  }

  const id = crypto.randomUUID();
  const key = `submissions/${submission.id}/${id}-${filename}`;
  const multipart = await env.UPLOADS.createMultipartUpload(key, {
    httpMetadata: { contentType: type },
  });

  const now = new Date();
  const expires = new Date(now.getTime() + RETENTION_DAYS * 864e5);

  await env.DB.prepare(
    `INSERT INTO uploads (id, submission_id, key, filename, content_type, size_bytes,
                          status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(id, submission.id, key, filename, type, size,
         now.toISOString(), expires.toISOString()).run();

  return json({ id, key, upload_id: multipart.uploadId, part_size: PART_SIZE });
}

async function part(request, env, url) {
  const submission = await authorize(env, url);
  if (!submission) return json({ error: 'This upload link is not valid.' }, 403);

  const key = url.searchParams.get('key') || '';
  const uploadId = url.searchParams.get('upload_id') || '';
  const partNumber = Number(url.searchParams.get('part'));

  if (!key.startsWith(`submissions/${submission.id}/`)) {
    return json({ error: 'This upload link is not valid.' }, 403);
  }
  if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return json({ error: 'Bad part request.' }, 400);
  }

  const multipart = env.UPLOADS.resumeMultipartUpload(key, uploadId);
  const uploaded = await multipart.uploadPart(partNumber, request.body);
  return json({ part: uploaded.partNumber, etag: uploaded.etag });
}

async function complete(request, env, url) {
  const body = await request.json().catch(() => ({}));
  const submission = await authorize(env, url, body);
  if (!submission) return json({ error: 'This upload link is not valid.' }, 403);

  const key = String(body.key || '');
  const uploadId = String(body.upload_id || '');
  const parts = Array.isArray(body.parts) ? body.parts : [];

  if (!key.startsWith(`submissions/${submission.id}/`) || !uploadId || !parts.length) {
    return json({ error: 'Bad completion request.' }, 400);
  }

  const multipart = env.UPLOADS.resumeMultipartUpload(key, uploadId);
  try {
    const object = await multipart.complete(
      parts.map((p) => ({ partNumber: Number(p.part), etag: String(p.etag) }))
    );
    await env.DB.prepare(
      "UPDATE uploads SET status = 'complete', completed_at = ?, size_bytes = ? WHERE key = ?"
    ).bind(new Date().toISOString(), object.size, key).run();
    return json({ ok: true, size: object.size });
  } catch (err) {
    console.error('multipart complete failed', err);
    await env.DB.prepare("UPDATE uploads SET status = 'aborted' WHERE key = ?").bind(key).run();
    return json({ error: 'That upload could not be finished. Please try again.' }, 500);
  }
}

export async function handleUpload(request, env, url) {
  if (!env.UPLOADS || !env.DB) return json({ error: 'Uploads are not configured.' }, 503);
  if (request.method !== 'POST' && request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  switch (url.pathname) {
    case '/api/upload/create':   return create(request, env, url);
    case '/api/upload/part':     return part(request, env, url);
    case '/api/upload/complete': return complete(request, env, url);
    default:                     return json({ error: 'Not found.' }, 404);
  }
}

// Scheduled sweep: delete footage past its retention date. Without this the
// promise in the FAQ — that we are not a permanent storage provider — is just
// words in a paragraph.
export async function sweepExpired(env) {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    "SELECT key FROM uploads WHERE status = 'complete' AND expires_at < ? LIMIT 500"
  ).bind(now).all();

  for (const { key } of results) {
    try {
      await env.UPLOADS.delete(key);
      await env.DB.prepare("UPDATE uploads SET status = 'deleted' WHERE key = ?").bind(key).run();
    } catch (err) {
      console.error('retention delete failed', key, err);
    }
  }
  return results.length;
}
