import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const ideas = sqliteTable(
  'ideas',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    moderationState: text('moderation_state').notNull().default('visible'),
    moderationReason: text('moderation_reason'),
    description: text('description').notNull(),
    question: text('question')
      .notNull()
      .default('What would make this work well in Waterloo?'),
    // Retired metadata: retained only to preserve stored data and applied migrations.
    // Public contracts and read queries must not expose these columns.
    category: text('category').notNull(),
    tags: text('tags').notNull().default('[]'),
    place: text('place').notNull().default(''),
    connection: text('connection').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    visitorId: text('visitor_id').notNull(),
    submissionKey: text('submission_key'),
    displayName: text('display_name'),
  },
  (t) => [
    uniqueIndex('idx_ideas_submission_key').on(t.submissionKey),
    index('idx_ideas_created').on(t.createdAt),
    index('idx_ideas_visitor_created').on(t.visitorId, t.createdAt),
  ],
);
export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    ideaId: text('idea_id').notNull(),
    parentId: text('parent_id'),
    body: text('body').notNull(),
    kind: text('kind').notNull().default('detail'),
    source: text('source').notNull().default('garden'),
    moderationReason: text('moderation_reason'),
    displayName: text('display_name'),
    createdAt: integer('created_at').notNull(),
    visitorId: text('visitor_id').notNull(),
    submissionKey: text('submission_key'),
    moderationState: text('moderation_state').notNull().default('visible'),
  },
  (t) => [
    uniqueIndex('idx_comments_submission_key').on(t.submissionKey),
    index('idx_comments_idea_created').on(t.ideaId, t.createdAt),
    index('idx_comments_parent').on(t.parentId),
  ],
);
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    ideaId: text('idea_id'),
    commentId: text('comment_id'),
    loveId: text('love_id'),
    reason: text('reason').notNull(),
    visitorId: text('visitor_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_reports_idea').on(t.ideaId),
    index('idx_reports_comment').on(t.commentId),
    index('idx_reports_love').on(t.loveId),
  ],
);
export const supports = sqliteTable(
  'supports',
  {
    ideaId: text('idea_id').notNull(),
    visitorId: text('visitor_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.visitorId] })],
);

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_rate_limits_expiry').on(t.expiresAt)],
);

// These tables are inert unless a separately provisioned preview identity matches.
export const previewIdentity = sqliteTable('preview_identity', {
  id: integer('id').primaryKey(),
  value: text('value').notNull(),
});
export const previewSessions = sqliteTable(
  'preview_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    kind: text('kind').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_preview_sessions_expiry').on(t.expiresAt)],
);
export const previewSnapshots = sqliteTable('preview_snapshots', {
  id: integer('id').primaryKey(),
  payload: text('payload').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const previewOperations = sqliteTable('preview_operations', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const previewChecks = sqliteTable(
  'preview_checks',
  {
    id: text('id').primaryKey(),
    ideaKey: text('idea_key').notNull(),
    visitorId: text('visitor_id').notNull(),
    createdAt: integer('created_at').notNull(),
    status: text('status').notNull(),
    results: text('results').notNull().default('[]'),
  },
  (t) => [index('idx_preview_checks_status_created').on(t.status, t.createdAt)],
);

// Originals remain in ideas; append-only revisions preserve authorship and credit.
export const ideaUpdates = sqliteTable(
  'idea_updates',
  {
    id: text('id').primaryKey(),
    ideaId: text('idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    question: text('question').notNull(),
    note: text('note').notNull(),
    credits: text('credits').notNull().default('[]'),
    visitorId: text('visitor_id').notNull(),
    submissionKey: text('submission_key').notNull(),
    createdAt: integer('created_at').notNull(),
    // Updates replace the public text, so new ones are screened like new ideas.
    // Writes always set the state; the default only covers rows from before screening.
    moderationState: text('moderation_state').notNull().default('visible'),
    moderationReason: text('moderation_reason'),
  },
  (t) => [
    uniqueIndex('idx_idea_updates_version').on(t.ideaId, t.version),
    index('idx_idea_updates_moderation').on(t.moderationState),
    uniqueIndex('idx_idea_updates_submission').on(t.submissionKey),
  ],
);
export const organizerReviews = sqliteTable(
  'organizer_reviews',
  {
    id: text('id').primaryKey(),
    ideaId: text('idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status').notNull(),
    submissionKey: text('submission_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_organizer_reviews_submission').on(t.submissionKey),
    index('idx_organizer_reviews_idea_created').on(t.ideaId, t.createdAt),
    index('idx_organizer_reviews_created').on(t.createdAt),
  ],
);

// Short public appreciations placed in the park; echoes are desired-state "me too".
export const loves = sqliteTable(
  'loves',
  {
    id: text('id').primaryKey(),
    body: text('body').notNull(),
    x: real('x').notNull(),
    z: real('z').notNull(),
    landmark: text('landmark'),
    displayName: text('display_name'),
    createdAt: integer('created_at').notNull(),
    visitorId: text('visitor_id').notNull(),
    submissionKey: text('submission_key'),
    moderationState: text('moderation_state').notNull().default('visible'),
    moderationReason: text('moderation_reason'),
  },
  (t) => [
    uniqueIndex('idx_loves_submission_key').on(t.submissionKey),
    index('idx_loves_moderation').on(t.moderationState),
    index('idx_loves_created').on(t.createdAt),
    index('idx_loves_visitor_created').on(t.visitorId, t.createdAt),
  ],
);
export const loveEchoes = sqliteTable(
  'love_echoes',
  {
    loveId: text('love_id')
      .notNull()
      .references(() => loves.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.loveId, t.visitorId] })],
);

// Website feedback is separate from community ideas and read by the issue-sync task.
export const websiteFeedback = sqliteTable(
  'website_feedback',
  {
    id: text('id').primaryKey(),
    body: text('body').notNull(),
    visitorId: text('visitor_id').notNull(),
    submissionKey: text('submission_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_feedback_visitor_submission').on(
      t.visitorId,
      t.submissionKey,
    ),
  ],
);

// Production moderation is independent from isolated preview controls.
export const gardenAdmins = sqliteTable('garden_admins', {
  email: text('email').primaryKey(),
  addedBy: text('added_by').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const adminTokens = sqliteTable(
  'admin_tokens',
  {
    hash: text('hash').primaryKey(),
    email: text('email').notNull(),
    kind: text('kind').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    index('idx_admin_tokens_expiry').on(t.expiresAt),
    index('idx_admin_tokens_email').on(t.email),
  ],
);
export const adminAudit = sqliteTable('admin_audit', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const adminPasswords = sqliteTable('admin_passwords', {
  email: text('email').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const moderationNotifications = sqliteTable('moderation_notifications', {
  id: text('id').primaryKey(),
  notificationId: text('notification_id').notNull(),
  pending: integer('pending').notNull(),
  nextAllowedAt: integer('next_allowed_at').notNull(),
  leaseUntil: integer('lease_until').notNull(),
});
