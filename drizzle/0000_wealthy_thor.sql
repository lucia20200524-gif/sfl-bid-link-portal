CREATE TABLE `bids` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`agency` text NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`deadline` text DEFAULT '' NOT NULL,
	`announced_on` text DEFAULT '' NOT NULL,
	`contract_method` text DEFAULT '' NOT NULL,
	`budget` text DEFAULT '' NOT NULL,
	`qualifications` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`match_reason` text DEFAULT '' NOT NULL,
	`concerns` text DEFAULT '' NOT NULL,
	`official_url` text DEFAULT '' NOT NULL,
	`fit` text DEFAULT 'B' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`submitted_on` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`dedupe_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bids_dedupe` ON `bids` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_bids_status_deadline` ON `bids` (`status`,`deadline`);--> statement-breakpoint
CREATE INDEX `idx_bids_submitted` ON `bids` (`submitted_on`);--> statement-breakpoint
CREATE TABLE `bid_members` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bid_members_user` ON `bid_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `bid_research_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`status` text NOT NULL,
	`filters_json` text NOT NULL,
	`response_id` text,
	`result_json` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bid_research_user_created` ON `bid_research_jobs` (`created_by`,`created_at`);