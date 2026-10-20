CREATE TABLE IF NOT EXISTS hub_api_participants (
 project text NOT NULL, room_id text NOT NULL, chief_id text NOT NULL, agent text NOT NULL,
 status text NOT NULL, model text NOT NULL, message_id text, error text, updated_at text NOT NULL,
 PRIMARY KEY(room_id,chief_id,agent)
);
