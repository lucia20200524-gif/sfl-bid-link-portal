CREATE TABLE `discovery_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`data` text NOT NULL,
	`recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_discovery_revisions_candidate` ON `discovery_revisions` (`candidate_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `procurement_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`profile` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_procurement_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_saved_searches_user` ON `saved_procurement_searches` (`user_id`);--> statement-breakpoint
ALTER TABLE `bids` ADD `workflow` text DEFAULT '{}' NOT NULL;