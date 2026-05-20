ALTER TABLE vault_attachments ADD COLUMN trashed_at INTEGER;
ALTER TABLE vault_attachments ADD COLUMN trash_origin_path TEXT;
