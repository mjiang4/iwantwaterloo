CREATE TABLE `preview_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_key` text NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`results` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_preview_checks_status_created` ON `preview_checks` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `preview_identity` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preview_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preview_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_preview_sessions_expiry` ON `preview_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `preview_snapshots` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
