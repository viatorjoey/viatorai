CREATE TABLE IF NOT EXISTS `hub_external_agents` (
	`project` text NOT NULL,
	`agent` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_seen` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project`,`agent`)
);
