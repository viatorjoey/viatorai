CREATE TABLE IF NOT EXISTS hub_voice_topics (
  id text NOT NULL, actor text NOT NULL, project text NOT NULL,
  fingerprint text NOT NULL, status text NOT NULL,
  transcript text, title text, room_id text, error text,
  created_at text NOT NULL, updated_at text NOT NULL,
  PRIMARY KEY (actor,id)
);
