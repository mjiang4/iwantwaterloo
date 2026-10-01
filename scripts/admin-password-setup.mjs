// Local-only owner bootstrap. No password or bearer token is logged or written.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
const token = (
  await readFile('/tmp/waterloo-admin-bootstrap-token', 'utf8')
).trim();
if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Missing bootstrap token.');
const csrf = randomBytes(32).toString('hex');
const origin = 'http://127.0.0.1:3017';
let used = false,
  busy = false;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set your admin password</title><style>body{font:17px system-ui;background:#fafbf7;color:#29432f;margin:0}main{max-width:430px;margin:8vh auto;padding:24px}h1{font-size:28px}form{display:grid;gap:14px}input,select,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #ccd5c7;min-height:44px;box-sizing:border-box}button{background:#294d38;color:white;cursor:pointer}p{line-height:1.5}small{color:#53664e}output{display:block;margin-top:18px}</style><main><h1>Set your admin password</h1><p>Choose your first admin account. You can set up the other email from the Admins section afterward.</p><form id="form"><label for="email">Email</label><select id="email" name="email"><option>jerry@unrepped.co</option><option>jerry@akatos.com</option></select><label for="password">Password</label><input id="password" type="password" autocomplete="new-password" minlength="15" maxlength="128" required><label for="repeat">Confirm password</label><input id="repeat" type="password" autocomplete="new-password" required><small>At least 15 characters. A memorable passphrase works well.</small><button>Set password</button></form><output id="status" role="status"></output><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const p=document.querySelector('#password'),r=document.querySelector('#repeat'),o=document.querySelector('output'),b=document.querySelector('button');if(p.value!==r.value){o.textContent='Passwords do not match.';return}b.disabled=true;o.textContent='Saving…';try{const response=await fetch('/setup',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-CSRF':'${csrf}'},body:JSON.stringify({email:document.querySelector('#email').value,password:p.value})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save.');p.value='';r.value='';document.querySelector('form').hidden=true;o.textContent='Password saved. ';const a=document.createElement('a');a.href='https://iwantwaterloo.com/admin';a.textContent='Sign in to your admin page';o.append(a);}catch(e){o.textContent=e.message;b.disabled=false;}};</script></main></html>`;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (req.headers.host !== '127.0.0.1:3017') {
    json(403, { error: 'Use the local setup address.' });
    return;
  }
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (req.url !== '/setup' || req.method !== 'POST') {
    json(404, {});
    return;
  }
  const candidate = String(req.headers['x-setup-csrf'] || '');
  if (
    req.headers.origin !== origin ||
    candidate.length !== csrf.length ||
    !timingSafeEqual(Buffer.from(candidate), Buffer.from(csrf))
  ) {
    json(403, { error: 'Use this setup form.' });
    return;
  }
  if (used || busy) {
    json(409, { error: 'Setup is already in progress or completed.' });
    return;
  }
  busy = true;
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) throw new Error('Form is too large.');
    }
    const { email, password } = JSON.parse(body);
    if (
      !['jerry@unrepped.co', 'jerry@akatos.com'].includes(email) ||
      typeof password !== 'string' ||
      password.length < 15 ||
      password.length > 128
    )
      throw new Error('Choose your email and use 15–128 characters.');
    const result = await fetch('https://iwantwaterloo.com/api/manage/setup', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://iwantwaterloo.com',
      },
      body: JSON.stringify({ email, password, token }),
    });
    let data;
    try {
      data = await result.json();
    } catch {
      throw new Error('The site did not respond. Please try again.');
    }
    if (!result.ok) throw new Error(data.error || 'Setup failed.');
    used = true;
    await writeFile(
      '/tmp/waterloo-admin-setup-result.json',
      JSON.stringify({ ok: true, email, at: new Date().toISOString() }),
      { mode: 0o600 },
    );
    json(200, { ok: true });
  } catch (error) {
    json(400, { error: error.message });
  } finally {
    busy = false;
  }
});
server.listen(3017, '127.0.0.1', () =>
  console.log('Private password setup: ' + origin),
);
