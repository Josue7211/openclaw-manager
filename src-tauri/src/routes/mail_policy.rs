use crate::error::AppError;

pub fn mail_action_allowed(action: &str) -> Result<(), AppError> {
    match action.trim() {
        "read_thread" | "summarize_thread" | "classify_thread" | "draft_reply" => Ok(()),
        "send_reply" | "forward_message" | "delete_message" | "contact_new_recipient" => Err(
            AppError::BadRequest("mail action blocked by AgentShell draft-only policy".into()),
        ),
        _ => Err(AppError::BadRequest("unknown mail action".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_mail_draft_action() {
        assert!(mail_action_allowed("draft_reply").is_ok());
    }

    #[test]
    fn rejects_mail_send_action() {
        assert!(mail_action_allowed("send_reply").is_err());
    }
}
