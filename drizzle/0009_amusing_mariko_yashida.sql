CREATE TABLE `moderation_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`pending` integer NOT NULL,
	`next_allowed_at` integer NOT NULL,
	`lease_until` integer NOT NULL
);
