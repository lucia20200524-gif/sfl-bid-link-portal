CREATE TABLE `defense_browser_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`mode` text NOT NULL,
	`source_id` text NOT NULL,
	`state_json` text NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_defense_browser_slot` ON `defense_browser_jobs` (`created_by`,`mode`,`source_id`);