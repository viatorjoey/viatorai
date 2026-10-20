CREATE TABLE IF NOT EXISTS hub_meeting_documents (
 id text PRIMARY KEY NOT NULL,
 project text NOT NULL,
 room_id text NOT NULL,
 report_id text UNIQUE,
 title text NOT NULL,
 body text NOT NULL,
 kind text NOT NULL,
 created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS hub_documents_project ON hub_meeting_documents(project);
CREATE INDEX IF NOT EXISTS hub_documents_room ON hub_meeting_documents(project,room_id);
