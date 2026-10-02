# Submission screening

Ideas and replies are checked server-side with OpenAI omni-moderation-latest before storage. Only submitted text (including the optional byline) is sent; no cookie, IP, or browser identifier. OPENAI_API_KEY must be a server-only secret. A missing key, timeout, or invalid response saves the submission as pending.

The policy in server/moderation.ts is intentionally gentle: a category must be flagged and meet its review threshold. Generic mentions of violence, self-harm, or illegal activity do not alone trigger a hold. Scores are model signals, not probabilities. This is not a reliable detector of trolling, impersonation, or factual accuracy.

Pending ideas are excluded from public lists, counts, gardens, shared pages/images, and support/reply endpoints. Pending replies are excluded from discussions and counts. Authors receive an awaiting-review receipt; retries retain the same submission. /admin offers Approve and Keep hidden. Neither action deletes text. Existing content remains unchanged.

Thresholds should be adjusted using reviewed false positives, not political viewpoint. Periodically review both held and visible samples. Screening failure reasons are visible only to admins. The migration adds columns without rewriting previous migrations or existing data.

## PR #5 integration

The integration retains zordhalo's signed visitor cookies, optional Cloudflare Turnstile checks, visitor-establishment and new-support rate limits, and idea state-filter/PATCH administration API. The existing OpenAI screening, combined idea/reply review queue, pending receipts, and moderation reasons remain authoritative; the alternative keyword reject list is not used. The existing `0008_warm_juggernaut.sql` supplies the moderation columns; do not also apply the PR's duplicate `0008_confused_triathlon.sql`.

Set both `TURNSTILE_SITEKEY` and `TURNSTILE_SECRET` to enable the challenge. With either missing, both client and server leave it disabled. Verification failures reject the action without establishing a cookie. Automated tests stub the verification service; a real configured widget still needs an operational check.

Signed cookies use the existing `RATE_LIMIT_SECRET`. Old unsigned identities cannot safely be trusted or upgraded in place: returning browsers establish a fresh identity. Existing ideas and likes remain stored, but their anonymous ownership no longer belongs to that browser, and a returning person can like an idea again. Signing and IP limits reduce abuse; they do not prove one person per vote. The additional support limit counts new support rows, including a new identity liking the same idea; shared networks share the budget.
