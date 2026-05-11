CREATE TABLE IF NOT EXISTS training_intake_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_intake_links_user ON training_intake_links(user_id);
CREATE INDEX IF NOT EXISTS idx_training_intake_links_token ON training_intake_links(token);

CREATE TABLE IF NOT EXISTS training_intake_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  token TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  answers_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  applied_at TEXT,
  FOREIGN KEY (link_id) REFERENCES training_intake_links(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_intake_submissions_user ON training_intake_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_training_intake_submissions_link ON training_intake_submissions(link_id);
