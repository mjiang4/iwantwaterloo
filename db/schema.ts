import {sqliteTable,text,integer,index,primaryKey} from 'drizzle-orm/sqlite-core';
export const ideas=sqliteTable('ideas',{
 id:text('id').primaryKey(),title:text('title').notNull(),description:text('description').notNull(),category:text('category').notNull(),tags:text('tags').notNull().default('[]'),place:text('place').notNull().default(''),connection:text('connection').notNull().default(''),createdAt:integer('created_at').notNull(),visitorId:text('visitor_id').notNull(),
},t=>[index('idx_ideas_created').on(t.createdAt),index('idx_ideas_visitor_created').on(t.visitorId,t.createdAt)]);
export const supports=sqliteTable('supports',{
 ideaId:text('idea_id').notNull(),visitorId:text('visitor_id').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.ideaId,t.visitorId]})]);
