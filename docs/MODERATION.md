# Submission screening

Ideas and replies are checked server-side with OpenAI omni-moderation-latest before storage. Only submitted text (including the optional byline) is sent; no cookie, IP, or browser identifier. OPENAI_API_KEY must be a server-only secret. A missing key, timeout, or invalid response saves the submission as pending.

The policy in server/moderation.ts is intentionally gentle: a category must be flagged and meet its review threshold. Generic mentions of violence, self-harm, or illegal activity do not alone trigger a hold. Scores are model signals, not probabilities. This is not a reliable detector of trolling, impersonation, or factual accuracy.

Pending ideas are excluded from public lists, counts, gardens, shared pages/images, and support/reply endpoints. Pending replies are excluded from discussions and counts. Authors receive an awaiting-review receipt; retries retain the same submission. /admin offers Approve and Keep hidden. Neither action deletes text. Existing content remains unchanged.

Thresholds should be adjusted using reviewed false positives, not political viewpoint. Periodically review both held and visible samples. Screening failure reasons are visible only to admins. The migration adds columns without rewriting previous migrations or existing data.
