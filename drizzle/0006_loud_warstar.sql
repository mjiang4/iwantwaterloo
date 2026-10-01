CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_tokens_expiry` ON `admin_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_admin_tokens_email` ON `admin_tokens` (`email`);--> statement-breakpoint
CREATE TABLE `garden_admins` (
	`email` text PRIMARY KEY NOT NULL,
	`added_by` text NOT NULL,
	`created_at` integer NOT NULL
);
