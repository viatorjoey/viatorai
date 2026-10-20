CREATE TABLE IF NOT EXISTS `hub_production_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`project` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`prompt` text NOT NULL,
	`negative` text DEFAULT '' NOT NULL,
	`aspect` text DEFAULT '9:16' NOT NULL,
	`quality` text DEFAULT 'high' NOT NULL,
	`duration` integer DEFAULT 10 NOT NULL,
	`seed` integer DEFAULT 42 NOT NULL,
	`guidance` integer DEFAULT 1 NOT NULL,
	`resolution` text NOT NULL,
	`model` text,
	`status` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`lease_id` text,
	`expires` integer,
	`studio_job_id` text,
	`result` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `hub_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hub_production_project_status` ON `hub_production_jobs` (`project`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hub_production_room` ON `hub_production_jobs` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hub_studio_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`hash` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_seen` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `hub_studio_key_hash` ON `hub_studio_keys` (`hash`);