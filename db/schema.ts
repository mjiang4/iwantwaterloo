import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const ideas = sqliteTable(
  'ideas',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    question: text('question')
      .notNull()
      .default('What would make this work well in Waterloo?'),
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
    reason: text('reason').notNull(),
    visitorId: text('visitor_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_reports_idea').on(t.ideaId),
    index('idx_reports_comment').on(t.commentId),
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
  },
  (t) => [
    uniqueIndex('idx_idea_updates_version').on(t.ideaId, t.version),
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
