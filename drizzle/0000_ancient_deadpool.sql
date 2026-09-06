CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`connection` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`visitor_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ideas_created` ON `ideas` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ideas_visitor_created` ON `ideas` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `supports` (
	`idea_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`idea_id`, `visitor_id`)
);
