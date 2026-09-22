CREATE TABLE `portal_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`login_id` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`credential_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_portal_account_login` ON `portal_accounts` (`login_id`);--> statement-breakpoint
CREATE TABLE `portal_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_portal_login_expiry` ON `portal_login_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `portal_member_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`credential_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `portal_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_portal_session_account` ON `portal_member_sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_portal_session_expiry` ON `portal_member_sessions` (`expires_at`);