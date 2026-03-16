use sqlx::SqlitePool;

/// Initialize the local SQLite database, running pending migrations.
pub async fn init() -> anyhow::Result<SqlitePool> {
    let db_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mission-control")
        .join("local.db");

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

    // Enable WAL mode for concurrent reads + busy timeout
    sqlx::query("PRAGMA journal_mode=WAL").execute(&pool).await?;
    sqlx::query("PRAGMA busy_timeout=5000").execute(&pool).await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    // Restrict database file permissions to owner only
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&db_path, std::fs::Permissions::from_mode(0o600));
    }

    Ok(pool)
}
