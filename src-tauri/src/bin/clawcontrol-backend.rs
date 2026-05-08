#[tokio::main]
async fn main() {
    clawctrl::initialize_process_runtime();
    clawctrl::initialize_logging();
    clawctrl::log_runtime_integrity_warnings();

    let secrets = clawctrl::secrets::load_secrets();

    if let Err(err) = clawctrl::server::start(None, secrets).await {
        tracing::error!("Headless backend error: {err}");
        std::process::exit(1);
    }
}
