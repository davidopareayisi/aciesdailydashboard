CREATE SCHEMA IF NOT EXISTS acies_portal;
REVOKE ALL ON SCHEMA acies_portal FROM PUBLIC;
CREATE TABLE IF NOT EXISTS acies_portal.records (
  collection text NOT NULL CHECK (collection IN ('users','sessions','creativeProfiles','invitations','notices','messages','media','challenges','invites','audit','enquiries','profiles','work','packages','limits','lessons','learningProgress','learningSubmissions')),
  id text NOT NULL,
  data jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
-- Add learning collections to existing installations without changing stored records.
ALTER TABLE acies_portal.records DROP CONSTRAINT IF EXISTS records_collection_check;
ALTER TABLE acies_portal.records ADD CONSTRAINT records_collection_check CHECK (collection IN ('users','sessions','creativeProfiles','invitations','notices','messages','media','challenges','invites','audit','enquiries','profiles','work','packages','limits','lessons','learningProgress','learningSubmissions'));
CREATE TABLE IF NOT EXISTS acies_portal.files (
  storage_key text PRIMARY KEY,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA acies_portal FROM PUBLIC;
ALTER TABLE acies_portal.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE acies_portal.files ENABLE ROW LEVEL SECURITY;
-- The trusted server connects as the table owner. Browser clients never receive this connection.
CREATE INDEX IF NOT EXISTS acies_records_user_id ON acies_portal.records ((data->>'userId')) WHERE data ? 'userId';
CREATE INDEX IF NOT EXISTS acies_records_client_id ON acies_portal.records ((data->>'clientId')) WHERE data ? 'clientId';
