use sqlx::SqlitePool;

/// Initialize the local SQLite database, running pending migrations.
pub async fn init() -> anyhow::Result<SqlitePool> {
    let db_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mission-control")
        .join("local.db");

    std::fs::create_dir_all(db_path.parent().unwrap())?;

    let url = format!("sqlite://{}?mode=rwc", db_path.display());
    let pool = SqlitePool::connect(&url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
