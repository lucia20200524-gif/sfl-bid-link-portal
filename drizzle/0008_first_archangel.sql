CREATE TABLE `portal_credential_views` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`viewed_by` text NOT NULL,
	`viewed_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `portal_accounts` ADD `credential_cipher` text DEFAULT '' NOT NULL;