CREATE TABLE `lark_template_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member_lark_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`secret_cipher` text NOT NULL,
	`base_token` text NOT NULL,
	`targets_json` text NOT NULL,
	`revision` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_lark_base` ON `member_lark_connections` (`base_token`);--> statement-breakpoint
ALTER TABLE `lark_bid_registrations` ADD `connection_scope` text DEFAULT 'sfl' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_lark_registration_scope_mode` ON `lark_bid_registrations` (`connection_scope`,`mode`);