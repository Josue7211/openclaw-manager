// ── Constants ────────────────────────────────────────────────────────────────

pub(super) const REGISTRY_PATH: &str = "/tmp/agent-registry.json";
pub(super) const MC_BASE_URL: &str = "http://localhost:3000";
pub(super) const MAX_RETRIES: u32 = 3;

// ── Status constants (mirrors lib/constants.ts) ──────────────────────────────

pub(super) mod status {
    pub mod agent {
        pub const ACTIVE: &str = "active";
        pub const IDLE: &str = "idle";
    }
    pub mod mission {
        #[allow(dead_code)] // completes the status enum; will be used when mission creation is wired
        pub const PENDING: &str = "pending";
        pub const ACTIVE: &str = "active";
        pub const DONE: &str = "done";
        pub const FAILED: &str = "failed";
        pub const AWAITING_REVIEW: &str = "awaiting_review";
    }
    pub mod review {
        pub const PENDING: &str = "pending";
        pub const APPROVED: &str = "approved";
        pub const REJECTED: &str = "rejected";
    }
}

// ── Agent routing table ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(super) struct AgentRoute {
    pub agent_id: &'static str,
    pub model: &'static str,
    pub flags: &'static str,
    pub log_prefix: &'static str,
    pub display_name: &'static str,
    pub emoji: &'static str,
}

pub(super) const ROMAN: AgentRoute = AgentRoute {
    agent_id: "fast",
    model: "claude-haiku-4-5",
    flags: "--dangerously-skip-permissions",
    log_prefix: "roman",
    display_name: "Roman",
    emoji: "\u{26A1}",
};

pub(super) const SONNET: AgentRoute = AgentRoute {
    agent_id: "sonnet",
    model: "claude-sonnet-4-6",
    flags: "--dangerously-skip-permissions",
    log_prefix: "sonnet",
    display_name: "Sonnet",
    emoji: "\u{1F9E9}",
};

pub(super) const GUNTHER: AgentRoute = AgentRoute {
    agent_id: "koda",
    model: "claude-opus-4-6",
    flags: "--verbose --output-format stream-json --dangerously-skip-permissions",
    log_prefix: "gunther",
    display_name: "Gunther",
    emoji: "\u{1F6E0}\u{FE0F}",
};

pub(super) const JIRAIYA: AgentRoute = AgentRoute {
    agent_id: "deep",
    model: "claude-opus-4-6",
    flags: "--dangerously-skip-permissions",
    log_prefix: "jiraiya",
    display_name: "Jiraiya",
    emoji: "\u{1F9E0}",
};

pub(super) const CODEX: AgentRoute = AgentRoute {
    agent_id: "review",
    model: "claude-haiku-4-5",
    flags: "--dangerously-skip-permissions",
    log_prefix: "codex",
    display_name: "Codex",
    emoji: "\u{1F50D}",
};

pub(super) fn routing_table(name: &str) -> Option<&'static AgentRoute> {
    match name {
        "roman" => Some(&ROMAN),
        "sonnet" => Some(&SONNET),
        "gunther" => Some(&GUNTHER),
        "jiraiya" => Some(&JIRAIYA),
        "codex" => Some(&CODEX),
        _ => None,
    }
}

/// Escalation chain: roman -> sonnet -> jiraiya
pub(super) fn escalation_target(name: &str) -> Option<&'static str> {
    match name {
        "roman" => Some("sonnet"),
        "sonnet" => Some("jiraiya"),
        _ => None,
    }
}

/// Route a task to an agent based on complexity and task type.
/// - code tasks -> gunther
/// - complexity 0-40 -> roman (haiku)
/// - complexity 41-70 -> sonnet
/// - complexity 71+ -> jiraiya (opus)
pub(super) fn route_agent(complexity: u32, task_type: &str) -> &'static str {
    if task_type == "code" {
        return "gunther";
    }
    if complexity <= 40 {
        "roman"
    } else if complexity <= 70 {
        "sonnet"
    } else {
        "jiraiya"
    }
}
