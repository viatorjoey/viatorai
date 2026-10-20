CREATE TABLE IF NOT EXISTS `hub_publication_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`production_id` text NOT NULL UNIQUE,
	`room_id` text NOT NULL,
	`project` text NOT NULL,
	`platform` text NOT NULL,
	`account` text NOT NULL,
	`caption` text NOT NULL,
	`status` text NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` text NOT NULL,
	`lease_id` text,
	`expires` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`result` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`production_id`) REFERENCES `hub_production_jobs`(`id`),
	FOREIGN KEY (`room_id`) REFERENCES `hub_rooms`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hub_publication_project_status` ON `hub_publication_jobs` (`project`,`status`);
