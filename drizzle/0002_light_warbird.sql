CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `ideas` ADD `submission_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ideas_submission_key` ON `ideas` (`submission_key`);