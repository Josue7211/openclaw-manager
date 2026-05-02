#[tokio::main]
async fn main() {
    openclaw::initialize_process_runtime();
    openclaw::initialize_logging();
    openclaw::log_runtime_integrity_warnings();

    let secrets = openclaw::secrets::load_secrets();

    if let Err(err) = openclaw::server::start(None, secrets).await {
        tracing::error!("Headless backend error: {err}");
        std::process::exit(1);
    }
}
