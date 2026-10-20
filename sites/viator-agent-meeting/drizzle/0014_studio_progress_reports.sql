CREATE TABLE IF NOT EXISTS hub_studio_progress_reports (id text PRIMARY KEY NOT NULL,room_id text NOT NULL,project text NOT NULL,body text NOT NULL,created_at text NOT NULL);
CREATE INDEX IF NOT EXISTS hub_progress_report_room ON hub_studio_progress_reports(project,room_id,created_at);
