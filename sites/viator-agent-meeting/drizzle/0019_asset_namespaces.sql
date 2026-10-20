CREATE TABLE IF NOT EXISTS hub_asset_namespaces(project text NOT NULL,kind text NOT NULL,id text NOT NULL,storage_project text NOT NULL,PRIMARY KEY(project,kind,id));
