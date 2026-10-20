CREATE TABLE IF NOT EXISTS hub_project_archives (id text PRIMARY KEY,name text NOT NULL,deleted_at text NOT NULL,deletion_key text NOT NULL);
CREATE TABLE IF NOT EXISTS hub_project_archive_rooms (project text NOT NULL,room_id text NOT NULL,PRIMARY KEY(project,room_id));
