-- Allow private upload intents without changing existing records. Apply before deploying direct uploads.
ALTER TABLE acies_portal.records DROP CONSTRAINT IF EXISTS records_collection_check;
ALTER TABLE acies_portal.records ADD CONSTRAINT records_collection_check CHECK (collection IN ('users','sessions','creativeProfiles','invitations','notices','messages','media','challenges','invites','audit','enquiries','profiles','work','packages','limits','lessons','learningProgress','learningSubmissions','pendingUploads'));
ALTER TABLE acies_portal.records ENABLE ROW LEVEL SECURITY;
