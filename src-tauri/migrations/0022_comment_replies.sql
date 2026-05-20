CREATE TABLE IF NOT EXISTS vault_comment_replies (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(comment_id) REFERENCES vault_comments(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_comment_replies_comment
    ON vault_comment_replies(comment_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_vault_comment_replies_document
    ON vault_comment_replies(document_id, created_at ASC);
