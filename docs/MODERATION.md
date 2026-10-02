# Submission screening

Ideas and replies are checked server-side with OpenAI omni-moderation-latest before storage. Only submitted text (including the optional byline) is sent; no cookie, IP, or browser identifier. OPENAI_API_KEY must be a server-only secret. A missing key, timeout, or invalid response saves the submission as pending.

The policy in server/moderation.ts is intentionally gentle: a category must be flagged and meet its review threshold. Generic mentions of violence, self-harm, or illegal activity do not alone trigger a hold. Scores are model signals, not probabilities. This is not a reliable detector of trolling, impersonation, or factual accuracy.

Pending ideas are excluded from public lists, counts, gardens, shared pages/images, and support/reply endpoints. Pending replies are excluded from discussions and counts. Authors receive an awaiting-review receipt; retries retain the same submission. /admin offers Approve and Keep hidden. Neither action deletes text. Existing content remains unchanged.

Thresholds should be adjusted using reviewed false positives, not political viewpoint. Periodically review both held and visible samples. Screening failure reasons are visible only to admins. The migration adds columns without rewriting previous migrations or existing data.

## PR #5 integration

The integration retains zordhalo's signed visitor cookies, optional Cloudflare Turnstile checks, visitor-establishment and new-support rate limits, and idea state-filter/PATCH administration API. The existing OpenAI screening, combined idea/reply review queue, pending receipts, and moderation reasons remain authoritative; the alternative keyword reject list is not used. The existing `0008_warm_juggernaut.sql` supplies the moderation columns; do not also apply the PR's duplicate `0008_confused_triathlon.sql`.

Set both `TURNSTILE_SITEKEY` and `TURNSTILE_SECRET` to enable the challenge. With either missing, both client and server leave it disabled. Verification failures reject the action without establishing a cookie. Automated tests stub the verification service; a real configured widget still needs an operational check.

Signed cookies use the existing `RATE_LIMIT_SECRET`. Old unsigned identities cannot safely be trusted or upgraded in place: returning browsers establish a fresh identity. Existing ideas and likes remain stored, but their anonymous ownership no longer belongs to that browser, and a returning person can like an idea again. Signing and IP limits reduce abuse; they do not prove one person per vote. The additional support limit counts new support rows, including a new identity liking the same idea; shared networks share the budget.

## Admin notifications

The signed-in admin page shows the full count of pending ideas and replies above both admin sections. It refreshes every minute while visible and when the browser regains focus. The review list shows the oldest 100 items, loading the next items as decisions are made. Failed refreshes retain the last count with an explicit stale-count warning.

Email delivery is disabled unless `MODERATION_ALERT_EMAILS_ENABLED=true`, `RESEND_API_KEY`, and `ADMIN_EMAIL_FROM` are configured. Do not enable it before Jerry approves the template and recipient policy. Recipients are the owner accounts in `OWNER_EMAILS` plus current `garden_admins`, deduplicated; each receives a separate message. The email contains only a generic alert and the `/admin` link, never submitted text or other recipients' addresses.

New held submissions and authenticated queue reads attempt delivery while items are pending, at most once per hour after successful delivery. A database lease prevents concurrent attempts; per-recipient provider idempotency keys protect retries. Delivery failures do not fail the contribution; later held submissions or queue refreshes retry after one minute. There is no background retry scheduler. An idle site with no further submissions or admin visits will not retry until activity resumes.

Migration `0009_amusing_mariko_yashida.sql` adds notification delivery state and must be applied before enabling email. Tests use an isolated database and mocked email delivery; they never send live alerts.
