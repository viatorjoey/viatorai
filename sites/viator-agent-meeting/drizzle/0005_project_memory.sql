CREATE TABLE IF NOT EXISTS `hub_project_memory` (
	`project` text PRIMARY KEY NOT NULL,
	`summary` text NOT NULL,
	`sources` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
