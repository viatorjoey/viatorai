CREATE TABLE `hub_agent_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`hash` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_seen` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_key_hash` ON `hub_agent_keys` (`hash`);--> statement-breakpoint
CREATE TABLE `hub_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`project` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`room_id` text NOT NULL,
	`project` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`expires` integer,
	`next_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `hub_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `hub_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_delivery_once` ON `hub_deliveries` (`message_id`);--> statement-breakpoint
CREATE INDEX `hub_delivery_project` ON `hub_deliveries` (`project`,`status`);--> statement-breakpoint
CREATE TABLE `hub_generations` (
	`incoming_id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`status` text NOT NULL,
	`response_id` text,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`project` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`reply_to` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `hub_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_reply_once` ON `hub_messages` (`reply_to`,`sender`);--> statement-breakpoint
CREATE INDEX `hub_room_messages` ON `hub_messages` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hub_receipts` (
	`key` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`fingerprint` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`director_turns` integer DEFAULT 0 NOT NULL,
	`max_turns` integer DEFAULT 6 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
