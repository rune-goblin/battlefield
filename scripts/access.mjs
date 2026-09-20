const COOKIE = 'battlefield_access';
const LOGIN = '/__access';
const TTL = 60 * 60 * 24 * 14;
const bytes = new TextEncoder();

const store = { 'cache-control': 'no-store' };

function equal(a, b) {
  const x = bytes.encode(a);
  const y = bytes.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// The password is part of what is signed, so changing it ends every session that was opened
// with the old one. The key stays the random secret, which a memorable password could not
// replace without weakening the signature.
async function sign(expiry, secret, password) {
  const digest = await crypto.subtle.digest('SHA-256', bytes.encode(password));
  const fingerprint = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, bytes.encode(`v1.${expiry}.${fingerprint}`));
  return `v1.${expiry}.${btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

async function valid(token, secret, password, now) {
  const parts = String(token || '').split('.');
  const expiry = Number(parts[1]);
  if (parts.length !== 3 || parts[0] !== 'v1' || !Number.isSafeInteger(expiry) || expiry * 1000 <= now) return false;
  return equal(token, await sign(expiry, secret, password));
}

function cookie(request) {
  const match = (request.headers.get('cookie') || '').split(';').find((part) => part.trim().startsWith(`${COOKIE}=`));
  return match ? match.trim().slice(COOKIE.length + 1) : '';
}

// An open redirect here would hand the session cookie to another site.
function destination(value) {
  const path = String(value || '');
  return /^\/(?!\/)[^\\]*$/.test(path) && path !== LOGIN ? path : '/';
}

function page(next, message, status) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Field Battles</title><style>
:root{--ink:#1f1a17;--paper:#f8f4ec;--rule:#b9ab93;--accent:#7a2e1f;--muted:#6b5f52;--band:#efe7d8}
@media (prefers-color-scheme:dark){:root{--ink:#e8e1d5;--paper:#1d1a17;--rule:#4c4338;--accent:#d98b6e;--muted:#a79a8a;--band:#2a2520}}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--paper);color:var(--ink);
font:17px/1.55 Georgia,"Iowan Old Style","Palatino Linotype",serif}
form{width:100%;max-width:26rem;background:var(--band);border:1px solid var(--rule);border-left:4px solid var(--accent);padding:2rem}
h1{font-size:2.1rem;line-height:1.1;letter-spacing:-.01em;margin:0 0 .25rem}
p{color:var(--muted);font-style:italic;margin:0 0 1.75rem}
label{display:block;font-size:.85rem;font-style:normal;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin:0 0 .5rem}
input{box-sizing:border-box;width:100%;font:inherit;font-size:16px;padding:.6rem .75rem;padding-right:2.9rem;
border:1px solid var(--rule);background:var(--paper);color:inherit}
input::-ms-reveal{display:none}
.field{position:relative}
.reveal{position:absolute;top:1px;right:1px;bottom:1px;width:2.75rem;display:grid;place-items:center;padding:0;border:0;background:none;color:var(--muted);cursor:pointer}
.reveal[hidden],.reveal[aria-pressed="true"] .open,.reveal[aria-pressed="false"] .shut{display:none}
button[type="submit"]{width:100%;margin-top:1rem;font:inherit;font-weight:600;color:var(--paper);background:var(--accent);border:0;padding:.65rem;cursor:pointer}
input:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.reveal:focus-visible{outline-offset:0}
.alert{color:var(--accent);font-style:normal;font-weight:600}
</style>
<form method="post" action="${LOGIN}">
<h1>Field Battles</h1>
<p>${message ? `<span class="alert">${message}</span>` : 'This playtest is private. Enter the shared password to continue.'}</p>
<input type="hidden" name="next" value="${next.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}">
<label for="password">Password</label>
<div class="field">
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="button" class="reveal" aria-label="Show password" aria-pressed="false" aria-controls="password" hidden>
<svg class="open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
<svg class="shut" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>
</button>
</div>
<button type="submit">Continue</button>
</form>
<script>
const field = document.getElementById('password');
const reveal = document.querySelector('.reveal');
reveal.hidden = false;
reveal.addEventListener('click', () => {
  const show = field.type === 'password';
  field.type = show ? 'text' : 'password';
  reveal.setAttribute('aria-pressed', String(show));
  field.focus();
});
// Submitting a text field lets the browser keep the password in its autofill history.
reveal.form.addEventListener('submit', () => { field.type = 'password'; });
</script>`, { status, headers: { ...store, 'content-type': 'text/html; charset=utf-8' } });
}

// Returns a response to block the request, or null to let it reach the site.
export async function gate(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const password = env.ACCESS_PASSWORD || '';
  const secret = env.ACCESS_SECRET || '';
  if (password.length < 8 || secret.length < 32) {
    return new Response('Access is not configured.', { status: 503, headers: store });
  }
  if (url.pathname === LOGIN) {
    if (request.method !== 'POST') return page('/', null, 405);
    const form = new URLSearchParams(await request.text());
    const next = destination(form.get('next'));
    if (!equal(form.get('password') || '', password)) {
      // Slow repeated guesses; the edge keeps no state to count them.
      await new Promise((done) => setTimeout(done, 500));
      return page(next, 'That password is not correct.', 401);
    }
    const token = await sign(Math.floor(now / 1000) + TTL, secret, password);
    return new Response(null, {
      status: 303,
      headers: { ...store, location: next, 'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}` },
    });
  }
  if (await valid(cookie(request), secret, password, now)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 401, headers: store });
  return page(destination(url.pathname + url.search), null, 401);
}
