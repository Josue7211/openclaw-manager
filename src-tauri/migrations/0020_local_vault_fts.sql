CREATE VIRTUAL TABLE IF NOT EXISTS vault_documents_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    tags,
    properties,
    folder,
    tokenize = 'unicode61'
);
