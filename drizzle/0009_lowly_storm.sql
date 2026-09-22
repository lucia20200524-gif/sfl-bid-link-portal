ALTER TABLE `discovery_candidates` ADD `search_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_candidates` ADD `search_data` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_candidates` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_candidates` ADD `search_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_candidates` ADD `search_body` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_candidates` ADD `search_title_words` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_candidates` ADD `search_body_words` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_discovery_search_version` ON `discovery_candidates` (`search_version`,`id`);