CREATE TABLE `lark_bid_registrations` (
	`key` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`client_token` text NOT NULL,
	`state` text DEFAULT 'ready' NOT NULL,
	`record_id` text DEFAULT '' NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
