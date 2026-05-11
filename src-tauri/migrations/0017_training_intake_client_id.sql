ALTER TABLE training_intake_links ADD COLUMN client_id TEXT NOT NULL DEFAULT '';
ALTER TABLE training_intake_submissions ADD COLUMN client_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_training_intake_links_client ON training_intake_links(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_training_intake_submissions_client ON training_intake_submissions(user_id, client_id);
