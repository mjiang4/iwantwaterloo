CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`display_name` text,
	`created_at` integer NOT NULL,
	`visitor_id` text NOT NULL,
	`submission_key` text,
	`moderation_state` text DEFAULT 'visible' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comments_submission_key` ON `comments` (`submission_key`);--> statement-breakpoint
CREATE INDEX `idx_comments_idea_created` ON `comments` (`idea_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comments_parent` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text,
	`comment_id` text,
	`reason` text NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reports_idea` ON `reports` (`idea_id`);--> statement-breakpoint
CREATE INDEX `idx_reports_comment` ON `reports` (`comment_id`);--> statement-breakpoint
ALTER TABLE `ideas` ADD `display_name` text;