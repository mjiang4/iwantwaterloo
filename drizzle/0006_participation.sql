CREATE TABLE `idea_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`question` text NOT NULL,
	`note` text NOT NULL,
	`credits` text DEFAULT '[]' NOT NULL,
	`visitor_id` text NOT NULL,
	`submission_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_idea_updates_version` ON `idea_updates` (`idea_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_idea_updates_submission` ON `idea_updates` (`submission_key`);--> statement-breakpoint
CREATE TABLE `organizer_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`submission_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_organizer_reviews_submission` ON `organizer_reviews` (`submission_key`);--> statement-breakpoint
CREATE INDEX `idx_organizer_reviews_idea_created` ON `organizer_reviews` (`idea_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_organizer_reviews_created` ON `organizer_reviews` (`created_at`);--> statement-breakpoint
ALTER TABLE `comments` ADD `kind` text DEFAULT 'detail' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `source` text DEFAULT 'garden' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `question` text DEFAULT 'What would make this work well in Waterloo?' NOT NULL;