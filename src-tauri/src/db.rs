use sqlx::SqlitePool;

#[cfg(debug_assertions)]
async fn repair_dev_migration_checksums(
    pool: &SqlitePool,
    migrator: &sqlx::migrate::Migrator,
) -> anyhow::Result<()> {
    for migration in migrator.iter() {
        let result = sqlx::query(
            "UPDATE _sqlx_migrations SET description = ?, checksum = ? WHERE version = ? AND success = 1 AND checksum != ?",
        )
        .bind(&*migration.description)
        .bind(migration.checksum.as_ref())
        .bind(migration.version)
        .bind(migration.checksum.as_ref())
        .execute(pool)
        .await?;

        if result.rows_affected() > 0 {
            tracing::warn!(
                version = migration.version,
                description = %migration.description,
                "repaired local dev migration checksum drift"
            );
        }
    }

    Ok(())
}

async fn ensure_module_proposal_backend_contract_columns(pool: &SqlitePool) -> anyhow::Result<()> {
    let table_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'module_proposals'",
    )
    .fetch_optional(pool)
    .await?;

    if table_exists.is_none() {
        return Ok(());
    }

    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('module_proposals')")
            .fetch_all(pool)
            .await?;

    if !columns
        .iter()
        .any(|column| column == "backend_contract_requested")
    {
        sqlx::query(
            "ALTER TABLE module_proposals ADD COLUMN backend_contract_requested INTEGER NOT NULL DEFAULT 0",
        )
        .execute(pool)
        .await?;
    }
    if !columns
        .iter()
        .any(|column| column == "backend_contract_summary")
    {
        sqlx::query(
            "ALTER TABLE module_proposals ADD COLUMN backend_contract_summary TEXT NOT NULL DEFAULT ''",
        )
        .execute(pool)
        .await?;
    }
    if !columns
        .iter()
        .any(|column| column == "backend_contract_json")
    {
        sqlx::query(
            "ALTER TABLE module_proposals ADD COLUMN backend_contract_json TEXT NOT NULL DEFAULT '{}'",
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}

async fn ensure_generated_module_table_names(pool: &SqlitePool) -> anyhow::Result<()> {
    let tables: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table'")
            .fetch_all(pool)
            .await?;

    let has_bjorn_modules = tables.iter().any(|table| table == "bjorn_modules");
    let has_generated_modules = tables.iter().any(|table| table == "generated_modules");
    let has_bjorn_versions = tables.iter().any(|table| table == "bjorn_module_versions");
    let has_generated_versions = tables
        .iter()
        .any(|table| table == "generated_module_versions");

    if has_bjorn_modules && !has_generated_modules {
        sqlx::query("ALTER TABLE bjorn_modules RENAME TO generated_modules")
            .execute(pool)
            .await?;
    }
    if has_bjorn_versions && !has_generated_versions {
        sqlx::query("ALTER TABLE bjorn_module_versions RENAME TO generated_module_versions")
            .execute(pool)
            .await?;
    }

    sqlx::query("DROP INDEX IF EXISTS idx_bjorn_modules_user")
        .execute(pool)
        .await?;
    sqlx::query("DROP INDEX IF EXISTS idx_bjorn_modules_enabled")
        .execute(pool)
        .await?;
    sqlx::query("DROP INDEX IF EXISTS idx_bjorn_versions_module")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_generated_modules_user ON generated_modules(user_id)",
    )
    .execute(pool)
    .await
    .ok();
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_generated_modules_enabled ON generated_modules(enabled)",
    )
    .execute(pool)
    .await
    .ok();
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_generated_versions_module ON generated_module_versions(module_id)",
    )
    .execute(pool)
    .await
    .ok();

    Ok(())
}

/// Initialize the local SQLite database, running pending migrations.
pub async fn init() -> anyhow::Result<SqlitePool> {
    let db_path = crate::app_paths::resolve_app_data_dir().join("local.db");

    let db_dir = db_path.parent().unwrap();
    std::fs::create_dir_all(db_dir)?;

    // Restrict directory permissions to owner only
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(db_dir, std::fs::Permissions::from_mode(0o700));
    }

    let url = format!("sqlite://{}?mode=rwc", db_path.display());
    let pool = SqlitePool::connect(&url).await?;
    let migrations_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let migrator = sqlx::migrate::Migrator::new(migrations_path.as_path()).await?;

    // Enable WAL mode for concurrent reads + busy timeout
    sqlx::query("PRAGMA journal_mode=WAL")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA busy_timeout=5000")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA secure_delete=ON")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys=ON").execute(&pool).await?;

    #[cfg(debug_assertions)]
    repair_dev_migration_checksums(&pool, &migrator).await?;

    ensure_generated_module_table_names(&pool).await?;
    ensure_module_proposal_backend_contract_columns(&pool).await?;

    migrator.run(&pool).await?;

    // Restrict database file permissions to owner only
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&db_path, std::fs::Permissions::from_mode(0o600));
    }

    Ok(pool)
}
