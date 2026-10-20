CREATE TABLE `hub_room_memory` (
	`room_id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`summary` text NOT NULL,
	`through_cursor` integer DEFAULT 0 NOT NULL,
	`covered_messages` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `hub_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
