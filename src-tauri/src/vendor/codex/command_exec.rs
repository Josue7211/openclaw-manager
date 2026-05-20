//! Copied/adapted from Codex `codex-rs/app-server/src/command_exec.rs`
//! and `app-server-protocol/src/protocol/v2/command_exec.rs`.
//!
//! ClawControl uses this bounded one-shot subset for local provider bridges.
//! It preserves the important Codex lifecycle semantics here: generated vs.
//! client process id discipline, timeout exit handling, output caps, stderr
//! surfacing, and kill-on-drop cleanup.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

const EXEC_TIMEOUT_EXIT_CODE: i32 = 124;
const DEFAULT_OUTPUT_BYTES_CAP: usize = 256 * 1024;

static NEXT_GENERATED_PROCESS_ID: AtomicI64 = AtomicI64::new(1);

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InternalProcessId {
    Generated(i64),
    Client(String),
}

impl InternalProcessId {
    pub fn new(process_id: Option<String>) -> Self {
        process_id.map_or_else(
            || Self::Generated(NEXT_GENERATED_PROCESS_ID.fetch_add(1, Ordering::Relaxed)),
            Self::Client,
        )
    }

    pub fn error_repr(&self) -> String {
        match self {
            Self::Generated(id) => id.to_string(),
            Self::Client(id) => serde_json::to_string(id).unwrap_or_else(|_| format!("{id:?}")),
        }
    }
}

#[derive(Clone, Debug)]
pub struct OneShotCommand {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub process_id: Option<String>,
    pub timeout: Duration,
    pub output_bytes_cap: usize,
    pub stdin: Option<Vec<u8>>,
}

impl OneShotCommand {
    pub fn new(program: impl Into<String>, cwd: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            cwd: cwd.into(),
            process_id: None,
            timeout: Duration::from_secs(180),
            output_bytes_cap: DEFAULT_OUTPUT_BYTES_CAP,
            stdin: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct OneShotCommandOutput {
    pub process_id: InternalProcessId,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
}

#[derive(Clone, Debug)]
pub enum OneShotCommandError {
    Spawn {
        process_id: InternalProcessId,
        message: String,
    },
    Wait {
        process_id: InternalProcessId,
        message: String,
    },
    Timeout {
        process_id: InternalProcessId,
        timeout: Duration,
        exit_code: i32,
    },
    NonZeroExit {
        process_id: InternalProcessId,
        exit_code: Option<i32>,
        stdout: String,
        stderr: String,
        stdout_truncated: bool,
        stderr_truncated: bool,
    },
}

impl OneShotCommandError {
    pub fn user_message(&self, label: &str) -> String {
        match self {
            Self::Spawn { message, .. } => {
                format!("{label} is not installed or could not be started: {message}")
            }
            Self::Wait { message, .. } => {
                format!("{label} failed while waiting for output: {message}")
            }
            Self::Timeout {
                process_id,
                timeout,
                ..
            } => format!(
                "{label} timed out after {} seconds and process {} was terminated",
                timeout.as_secs(),
                process_id.error_repr()
            ),
            Self::NonZeroExit {
                exit_code, stderr, ..
            } => format!(
                "{label} exited with {}{}",
                exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "signal".to_string()),
                if stderr.trim().is_empty() {
                    String::new()
                } else {
                    format!(": {}", stderr.trim())
                }
            ),
        }
    }
}

pub async fn run_one_shot_command(
    request: OneShotCommand,
) -> Result<OneShotCommandOutput, OneShotCommandError> {
    let process_id = InternalProcessId::new(request.process_id);
    let mut command = Command::new(&request.program);
    command
        .args(&request.args)
        .current_dir(&request.cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if request.stdin.is_some() {
        command.stdin(Stdio::piped());
    }

    let mut child = command.spawn().map_err(|err| OneShotCommandError::Spawn {
        process_id: process_id.clone(),
        message: err.to_string(),
    })?;

    if let Some(stdin) = request.stdin {
        if let Some(mut child_stdin) = child.stdin.take() {
            child_stdin
                .write_all(&stdin)
                .await
                .map_err(|err| OneShotCommandError::Wait {
                    process_id: process_id.clone(),
                    message: format!("failed to write stdin: {err}"),
                })?;
            child_stdin
                .shutdown()
                .await
                .map_err(|err| OneShotCommandError::Wait {
                    process_id: process_id.clone(),
                    message: format!("failed to close stdin: {err}"),
                })?;
        }
    }

    let output = match timeout(request.timeout, child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(err)) => {
            return Err(OneShotCommandError::Wait {
                process_id,
                message: err.to_string(),
            });
        }
        Err(_) => {
            return Err(OneShotCommandError::Timeout {
                process_id,
                timeout: request.timeout,
                exit_code: EXEC_TIMEOUT_EXIT_CODE,
            });
        }
    };

    let (stdout, stdout_truncated) = cap_output_bytes(&output.stdout, request.output_bytes_cap);
    let (stderr, stderr_truncated) = cap_output_bytes(&output.stderr, request.output_bytes_cap);
    let result = OneShotCommandOutput {
        process_id: process_id.clone(),
        exit_code: output.status.code(),
        stdout,
        stderr,
        stdout_truncated,
        stderr_truncated,
    };

    if !output.status.success() {
        return Err(OneShotCommandError::NonZeroExit {
            process_id,
            exit_code: result.exit_code,
            stdout: result.stdout,
            stderr: result.stderr,
            stdout_truncated: result.stdout_truncated,
            stderr_truncated: result.stderr_truncated,
        });
    }

    Ok(result)
}

fn cap_output_bytes(bytes: &[u8], cap: usize) -> (String, bool) {
    if bytes.len() <= cap {
        return (String::from_utf8_lossy(bytes).into_owned(), false);
    }
    let safe_cap = cap.saturating_sub(32).min(bytes.len());
    let mut capped = String::from_utf8_lossy(&bytes[..safe_cap]).into_owned();
    capped.push_str("\n[output truncated]");
    (capped, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn write_executable_script(dir: &std::path::Path, name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let path = dir.join(name);
        std::fs::write(&path, body).expect("write fake command");
        let mut permissions = std::fs::metadata(&path).expect("metadata").permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).expect("chmod fake command");
        path
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn one_shot_command_reads_stdout_and_stderr() {
        let dir = tempfile::tempdir().expect("temp dir");
        let fake = write_executable_script(
            dir.path(),
            "fake-ok",
            "#!/bin/sh\nprintf out\nprintf err >&2\n",
        );
        let mut request = OneShotCommand::new(fake.to_string_lossy(), dir.path());
        request.process_id = Some("client-process".to_string());

        let output = run_one_shot_command(request)
            .await
            .expect("command succeeds");

        assert_eq!(
            output.process_id,
            InternalProcessId::Client("client-process".to_string())
        );
        assert_eq!(output.exit_code, Some(0));
        assert_eq!(output.stdout, "out");
        assert_eq!(output.stderr, "err");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn one_shot_command_writes_stdin() {
        let dir = tempfile::tempdir().expect("temp dir");
        let fake = write_executable_script(dir.path(), "fake-stdin", "#!/bin/sh\ncat\n");
        let mut request = OneShotCommand::new(fake.to_string_lossy(), dir.path());
        request.stdin = Some(b"hello stdin".to_vec());

        let output = run_one_shot_command(request)
            .await
            .expect("command succeeds");

        assert_eq!(output.stdout, "hello stdin");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn one_shot_command_generates_distinct_process_ids() {
        let dir = tempfile::tempdir().expect("temp dir");
        let fake = write_executable_script(dir.path(), "fake-ok", "#!/bin/sh\nprintf ok\n");

        let first = run_one_shot_command(OneShotCommand::new(fake.to_string_lossy(), dir.path()))
            .await
            .expect("first command succeeds");
        let second = run_one_shot_command(OneShotCommand::new(fake.to_string_lossy(), dir.path()))
            .await
            .expect("second command succeeds");

        match (&first.process_id, &second.process_id) {
            (InternalProcessId::Generated(first_id), InternalProcessId::Generated(second_id)) => {
                assert_ne!(first_id, second_id);
            }
            other => panic!("expected generated process ids: {other:?}"),
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn one_shot_command_caps_output() {
        let dir = tempfile::tempdir().expect("temp dir");
        let fake = write_executable_script(
            dir.path(),
            "fake-large",
            "#!/bin/sh\nprintf 'abcdefghijklmnopqrstuvwxyz'\n",
        );
        let mut request = OneShotCommand::new(fake.to_string_lossy(), dir.path());
        request.output_bytes_cap = 16;

        let output = run_one_shot_command(request)
            .await
            .expect("command succeeds");

        assert!(output.stdout_truncated);
        assert!(output.stdout.contains("[output truncated]"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn one_shot_command_surfaces_nonzero_stderr() {
        let dir = tempfile::tempdir().expect("temp dir");
        let fake = write_executable_script(
            dir.path(),
            "fake-fail",
            "#!/bin/sh\nprintf nope >&2\nexit 7\n",
        );
        let request = OneShotCommand::new(fake.to_string_lossy(), dir.path());

        let error = run_one_shot_command(request)
            .await
            .expect_err("command should fail");

        match error {
            OneShotCommandError::NonZeroExit {
                exit_code, stderr, ..
            } => {
                assert_eq!(exit_code, Some(7));
                assert_eq!(stderr, "nope");
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn one_shot_command_caps_nonzero_stderr() {
        let dir = tempfile::tempdir().expect("temp dir");
        let fake = write_executable_script(
            dir.path(),
            "fake-large-fail",
            "#!/bin/sh\nprintf 'abcdefghijklmnopqrstuvwxyz' >&2\nexit 9\n",
        );
        let mut request = OneShotCommand::new(fake.to_string_lossy(), dir.path());
        request.output_bytes_cap = 16;

        let error = run_one_shot_command(request)
            .await
            .expect_err("command should fail");

        match error {
            OneShotCommandError::NonZeroExit {
                exit_code,
                stderr,
                stderr_truncated,
                ..
            } => {
                assert_eq!(exit_code, Some(9));
                assert!(stderr_truncated);
                assert!(stderr.contains("[output truncated]"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn one_shot_command_timeout_terminates_child() {
        let dir = tempfile::tempdir().expect("temp dir");
        let completed = dir.path().join("completed");
        let fake = write_executable_script(
            dir.path(),
            "fake-slow",
            &format!(
                "#!/bin/sh\nsleep 0.2\nprintf done > {}\n",
                completed.to_string_lossy()
            ),
        );
        let mut request = OneShotCommand::new(fake.to_string_lossy(), dir.path());
        request.timeout = Duration::from_millis(25);

        let error = run_one_shot_command(request)
            .await
            .expect_err("command should time out");

        match error {
            OneShotCommandError::Timeout { exit_code, .. } => {
                assert_eq!(exit_code, EXEC_TIMEOUT_EXIT_CODE);
            }
            other => panic!("unexpected error: {other:?}"),
        }
        tokio::time::sleep(Duration::from_millis(350)).await;
        assert!(!completed.exists());
    }
}
