CREATE TABLE IF NOT EXISTS `hub_meeting_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`project` text NOT NULL,
	`source_message_id` text NOT NULL UNIQUE,
	`summary` text NOT NULL,
	`decision` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `hub_rooms`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hub_meeting_reports_room` ON `hub_meeting_reports` (`room_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hub_action_items` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`room_id` text NOT NULL,
	`project` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`action_type` text NOT NULL,
	`assignee` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`production_job_id` text,
	`error` text,
	`approved_by` text,
	`approved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `hub_meeting_reports`(`id`),
	FOREIGN KEY (`room_id`) REFERENCES `hub_rooms`(`id`),
	FOREIGN KEY (`production_job_id`) REFERENCES `hub_production_jobs`(`id`),
	UNIQUE (`report_id`,`ordinal`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hub_action_items_room_status` ON `hub_action_items` (`room_id`,`status`);
