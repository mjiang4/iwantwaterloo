# Garden admin

Visit `/admin` and sign in with your email and password. No email provider is needed.

Only `jerry@unrepped.co` and `jerry@akatos.com` are initially allowed. Signing in requires an individually provisioned password; knowing an approved email is not enough. The two owner addresses cannot be removed in the UI.

## First owner setup

An operator generates a random 32-byte token, sets its SHA-256 hash as the Sites secret `ADMIN_BOOTSTRAP_HASH`, and sets `ADMIN_BOOTSTRAP_EXPIRES` to a short-lived Unix timestamp in milliseconds. Deploy to apply these settings. Do not commit the token or hash.

The local-only `scripts/admin-password-setup.mjs` reads the token from `/tmp/waterloo-admin-bootstrap-token`, binds to `127.0.0.1:3017`, and presents the password form. It protects the form with Host, Origin, and CSRF checks. Only the password setup request is forwarded over HTTPS; plaintext passwords are never written or logged.

Bootstrap can create exactly one initial owner password, only while no passwords exist. It cannot overwrite a password. Stop the local setup process and remove the bootstrap environment variables and local token after setup; expiry and database checks independently prevent reuse.

## Adding admins

In **Admins**, enter an email and choose **Add**. Copy the private setup link and send it to the intended person. The link expires in 24 hours, works once, and only creates that person's password. No email is sent automatically. Use the same process to set up the second owner email. Never put invitation links in public issues or commits.

Passwords must have 15–128 characters. Passwords are salted and hashed with native scrypt (N=16384, r=8, p=5; OWASP's 16 MiB profile); plaintext passwords are never persisted. Removing an admin removes their password, outstanding setup links and sessions. Password changes require the existing password and end all sessions for that account.

There is no unauthenticated reset or email recovery. If all owners lose access, an authorized operator must perform a separately reviewed credential reset; the original bootstrap cannot be reused.

## Protections

- Eight-hour sessions in HttpOnly/Secure/SameSite cookies in production; every action checks current admin membership.
- Same-origin JSON writes; sign-in/setup throttles; one-time setup tokens stored as hashes. Retired magic links no longer create sessions.
- Confirmed deletion atomically removes the selected idea and associated replies, likes and reports. Audit rows retain actor/action/target/time, not deleted text.
- Preview `/api/admin/*` remains isolated; production moderation is `/api/manage/*`.

## Checks

`npm test` tests authorization, scrypt verification, bootstrap replay, invitation expiry, password changes, revocation and scoped deletion in disposable Miniflare databases. `node tests/e2e/admin.mjs` checks desktop/mobile UI against a disposable compiled site. No production ideas are used as fixtures.
