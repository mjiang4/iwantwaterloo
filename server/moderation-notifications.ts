import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { OWNER_EMAILS, digest } from '@/server/admin-auth';
import { emailConfigured } from '@/server/admin-email';

export async function pendingSubmissionCount() {
  const row = await database()
    .prepare(`SELECT
    (SELECT count(*) FROM ideas WHERE moderation_state='pending') +
    (SELECT count(*) FROM comments WHERE moderation_state='pending') AS total`)
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

/** Disabled until the recipient policy and exact template have been approved. */
export async function notifyModerators() {
  if (
    env.MODERATION_ALERT_EMAILS_ENABLED !== 'true' ||
    env.GARDEN_ENV === 'preview' ||
    !emailConfigured()
  )
    return;
  const db = database();
  let notificationId: string | undefined;
  try {
    if (!(await pendingSubmissionCount())) return;
    const url = new URL(
      '/admin',
      env.ADMIN_ORIGIN || 'https://iwantwaterloo.com',
    );
    if (url.protocol !== 'https:') return;
    const now = Date.now();
    // Atomic lease coalesces simultaneous submissions. Failed attempts retain their
    // notification ID so Resend can deduplicate retries to each recipient.
    const claim = await db
      .prepare(`INSERT INTO moderation_notifications
      (id,notification_id,pending,next_allowed_at,lease_until) VALUES ('review',?,1,0,?)
      ON CONFLICT(id) DO UPDATE SET
        notification_id=CASE WHEN pending=1 THEN notification_id ELSE excluded.notification_id END,
        pending=1,lease_until=excluded.lease_until
      WHERE next_allowed_at<=? AND lease_until<=?
      RETURNING notification_id AS notificationId`)
      .bind(crypto.randomUUID(), now + 30000, now, now)
      .first<{ notificationId: string }>();
    if (!claim) return;
    notificationId = claim.notificationId;
    const admins = await db
      .prepare('SELECT email FROM garden_admins')
      .all<{ email: string }>();
    const recipients = [
      ...new Set([...OWNER_EMAILS, ...admins.results.map((a) => a.email)]),
    ];
    const results = await Promise.allSettled(
      recipients.map(async (email) => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `moderation-${notificationId}-${await digest(email)}`,
          },
          body: JSON.stringify({
            from: env.ADMIN_EMAIL_FROM,
            to: [email],
            subject: 'I Want Waterloo: submissions awaiting review',
            text: `There are submissions awaiting review in I Want Waterloo.\n\nReview them here:\n${url.href}\n\nHeld submissions stay hidden until an admin approves them.`,
          }),
        });
        if (!response.ok) throw new Error('Delivery failed');
      }),
    );
    if (results.some((r) => r.status === 'rejected'))
      throw new Error('Delivery failed');
    await db
      .prepare(
        "UPDATE moderation_notifications SET pending=0,next_allowed_at=?,lease_until=0 WHERE id='review' AND notification_id=?",
      )
      .bind(Date.now() + 3600000, notificationId)
      .run();
  } catch {
    // Saving a contribution must succeed even if email is unavailable. A later
    // pending submission or authenticated queue refresh retries after this delay.
    if (notificationId) {
      await db
        .prepare(
          "UPDATE moderation_notifications SET lease_until=? WHERE id='review' AND notification_id=?",
        )
        .bind(Date.now() + 60000, notificationId)
        .run()
        .catch(() => {});
    }
    console.error('Moderation alert delivery failed; queued for retry.');
  }
}
