CREATE TABLE `discovery_cache` (
	`url` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discovery_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`changed_at` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`deadline` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_discovery_deadline` ON `discovery_candidates` (`deadline`);--> statement-breakpoint
CREATE TABLE `discovery_reviews` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`candidate_id` text NOT NULL,
	`state` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`reviewed_version` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_discovery_review_user_mode` ON `discovery_reviews` (`user_id`,`mode`);--> statement-breakpoint
CREATE TABLE `discovery_runtime` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`lease` text DEFAULT '' NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
