ALTER TABLE `comments` ADD `moderation_reason` text;--> statement-breakpoint
ALTER TABLE `ideas` ADD `moderation_state` text DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `moderation_reason` text;