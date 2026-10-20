CREATE TABLE IF NOT EXISTS hub_studio_progress (
 room_id text NOT NULL,
 project text NOT NULL,
 last_report_ms integer NOT NULL,
 PRIMARY KEY(room_id,project)
);
