# Garden admin

Visit `/admin`. Only `jerry@unrepped.co` and `jerry@akatos.com` are allowed initially. Signed-in admins can add or revoke other admins. The two owner addresses cannot be removed from the UI.

## Email setup

1. Create a Resend account and verify a domain you control (for example `iwantwaterloo.com`) using the DNS records Resend supplies.
2. Create a sending-only API key restricted to that domain.
3. Set these **Sites production runtime** variables, not browser variables or Git files:
   - `RESEND_API_KEY` — secret API key.
   - `ADMIN_EMAIL_FROM` — verified sender, e.g. `I Want Waterloo <admin@iwantwaterloo.com>`.
   - `ADMIN_ORIGIN` — `https://iwantwaterloo.com` (the default).
4. Redeploy. Request a link at `/admin` and confirm delivery and sign-in.

No external email is sent by tests. Without email configuration, login returns a clear unavailable message and no session is issued. There is no development backdoor, password, or public bootstrap endpoint.

## Behaviour

- Links expire in 15 minutes and are single-use, including concurrent attempts. The token travels in a URL fragment, is removed from browser history on arrival, and requires an explicit Sign in click. Email scanners do not consume the link with a GET.
- Only token hashes are stored. Sessions expire after eight hours, use HttpOnly/Secure/SameSite cookies in production, and require current allowlist membership on every action.
- Admin mutations require a same-origin JSON request. Sign-in requests are rate limited per email, network and globally. Non-allowlisted emails receive the same success message but no email.
- Removing an admin invalidates their outstanding links and sessions. Adding an admin does not email them; they request a link themselves.
- Deletion requires confirmation and atomically removes the selected idea, replies, likes and reports. Unrelated ideas are preserved. The audit table records actor, action, target ID/email and time, without retaining deleted idea text.
- Existing `/api/admin/*` preview controls retain their separate preview-only protection. Production moderation uses `/api/manage/*`.

## Checks

`node --experimental-strip-types --test tests/production-admin.mjs`

Tests use Miniflare with disposable databases and mocked email delivery. Real delivery must be verified after sender setup.
