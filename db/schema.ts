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
    category: text('category').notNull(),
    tags: text('tags').notNull().default('[]'),
    place: text('place').notNull().default(''),
    connection: text('connection').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    visitorId: text('visitor_id').notNull(),
    submissionKey: text('submission_key'),
  },
  (t) => [
    uniqueIndex('idx_ideas_submission_key').on(t.submissionKey),
    index('idx_ideas_created').on(t.createdAt),
    index('idx_ideas_visitor_created').on(t.visitorId, t.createdAt),
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
