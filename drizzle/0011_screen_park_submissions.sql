ALTER TABLE `idea_updates` ADD `moderation_state` text DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE `idea_updates` ADD `moderation_reason` text;--> statement-breakpoint
CREATE INDEX `idx_idea_updates_moderation` ON `idea_updates` (`moderation_state`);--> statement-breakpoint
ALTER TABLE `loves` ADD `moderation_reason` text;--> statement-breakpoint
CREATE INDEX `idx_loves_moderation` ON `loves` (`moderation_state`);