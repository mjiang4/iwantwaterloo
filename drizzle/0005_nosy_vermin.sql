CREATE TABLE `website_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`visitor_id` text NOT NULL,
	`submission_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feedback_visitor_submission` ON `website_feedback` (`visitor_id`,`submission_key`);