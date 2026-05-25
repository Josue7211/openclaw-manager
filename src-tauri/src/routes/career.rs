use axum::{
    extract::{rejection::JsonRejection, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use std::collections::HashSet;

use super::util::random_uuid;
use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};

const ACTION_APPLY_BATCH: &str = "career.apply.batch";
const DEFAULT_DOSSIER_RECOMMENDATION: &str = "pursue";
const HARD_STOPS: &[&str] = &[
    "login_required",
    "captcha",
    "ssn",
    "payment",
    "background_check_consent",
    "unknown_sensitive_field",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/career/profile", get(get_profile).put(put_profile))
        .route("/career/sync-status", get(sync_status))
        .route(
            "/career/dossiers",
            get(list_dossiers)
                .post(upsert_dossier)
                .patch(patch_dossier)
                .delete(delete_dossier),
        )
        .route("/career/applications", get(list_applications))
        .route(
            "/career/applications/events",
            post(record_application_event),
        )
        .route(
            "/career/saved-searches",
            get(list_saved_searches)
                .post(upsert_saved_search)
                .patch(patch_saved_search)
                .delete(delete_saved_search),
        )
        .route("/career/search/run", post(run_search))
        .route("/career/search/runs", get(list_search_runs))
        .route(
            "/career/applications/prepare-batch",
            post(prepare_application_batch),
        )
        .route(
            "/career/applications/execute-batch",
            post(execute_application_batch),
        )
        .route("/career/outcomes", get(list_outcomes).post(record_outcome))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileBody {
    #[serde(default)]
    lanes: Option<Value>,
    #[serde(default)]
    pay_floors: Option<Value>,
    #[serde(default)]
    locations: Option<Value>,
    #[serde(default)]
    strengths: Option<Value>,
    #[serde(default)]
    resume_packet: Option<Value>,
    #[serde(default)]
    links: Option<Value>,
    #[serde(default)]
    availability: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DossierBody {
    #[serde(default)]
    id: Option<String>,
    company: String,
    role: String,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    lane: Option<String>,
    #[serde(default)]
    stage: Option<String>,
    #[serde(default)]
    source: Option<Value>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    score: Option<i64>,
    #[serde(default)]
    recommendation: Option<String>,
    #[serde(default)]
    next_action: Option<String>,
    #[serde(default)]
    due: Option<String>,
    #[serde(default)]
    salary_text: Option<String>,
    #[serde(default)]
    estimated_hourly_rate: Option<f64>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    tags: Option<Value>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    evaluation: Option<Value>,
    #[serde(default)]
    assets: Option<Value>,
    #[serde(default)]
    timeline: Option<Value>,
    #[serde(default)]
    fingerprint: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchDossierBody {
    id: String,
    #[serde(default)]
    company: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    lane: Option<String>,
    #[serde(default)]
    stage: Option<String>,
    #[serde(default)]
    source: Option<Value>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    score: Option<i64>,
    #[serde(default)]
    recommendation: Option<String>,
    #[serde(default)]
    next_action: Option<String>,
    #[serde(default)]
    due: Option<String>,
    #[serde(default)]
    salary_text: Option<String>,
    #[serde(default)]
    estimated_hourly_rate: Option<f64>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    tags: Option<Value>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    evaluation: Option<Value>,
    #[serde(default)]
    assets: Option<Value>,
    #[serde(default)]
    timeline: Option<Value>,
}

#[derive(Debug, Deserialize, Default)]
struct ListDossiersQuery {
    lane: Option<String>,
    stage: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct DeleteQuery {
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeleteBody {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedSearchBody {
    #[serde(default)]
    id: Option<String>,
    name: String,
    query: String,
    #[serde(default)]
    lane: Option<String>,
    #[serde(default)]
    source_set: Option<Value>,
    #[serde(default)]
    schedule: Option<Value>,
    #[serde(default)]
    filters: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchSavedSearchBody {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    lane: Option<String>,
    #[serde(default)]
    source_set: Option<Value>,
    #[serde(default)]
    schedule: Option<Value>,
    #[serde(default)]
    filters: Option<Value>,
}

#[derive(Debug)]
struct SavedSearchSyncPayload {
    id: String,
    name: String,
    query: String,
    lane: String,
    source_set: Value,
    schedule: Value,
    filters: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRunBody {
    #[serde(default)]
    lane: Option<String>,
    query: String,
    #[serde(default)]
    source_set: Option<Value>,
    #[serde(default)]
    filters: Option<Value>,
    #[serde(default)]
    jobs: Vec<SearchRunJob>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRunJob {
    #[serde(default)]
    id: Option<String>,
    #[serde(default, alias = "title")]
    role: Option<String>,
    #[serde(default)]
    company: Option<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default, alias = "url")]
    source_url: Option<String>,
    #[serde(default)]
    salary: Option<String>,
    #[serde(default)]
    salary_text: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    job_type: Option<String>,
    #[serde(default)]
    tags: Option<Value>,
    #[serde(default)]
    score: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrepareBatchBody {
    dossier_ids: Vec<String>,
    #[serde(default)]
    max_submit_count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteBatchBody {
    batch_id: String,
    capability: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationEventBody {
    application_id: String,
    event: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutcomeBody {
    #[serde(default)]
    dossier_id: Option<String>,
    #[serde(default)]
    application_id: Option<String>,
    outcome: String,
    #[serde(default)]
    callback_quality: Option<String>,
    #[serde(default)]
    pay: Option<String>,
    #[serde(default)]
    lesson: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DossierRow {
    id: String,
    company: String,
    role: String,
    location: String,
    lane: String,
    stage: String,
    source: Value,
    source_url: Option<String>,
    score: i64,
    recommendation: String,
    next_action: String,
    due: String,
    salary_text: String,
    estimated_hourly_rate: Option<f64>,
    summary: String,
    tags: Value,
    notes: String,
    evaluation: Value,
    assets: Value,
    timeline: Value,
    fingerprint: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug)]
struct DossierDbRow {
    id: String,
    company: String,
    role: String,
    location: String,
    lane: String,
    stage: String,
    source: String,
    source_url: Option<String>,
    score: i64,
    recommendation: String,
    next_action: String,
    due: String,
    salary_text: String,
    estimated_hourly_rate: Option<f64>,
    summary: String,
    tags: String,
    notes: String,
    evaluation: String,
    assets: String,
    timeline: String,
    fingerprint: String,
    created_at: String,
    updated_at: String,
}

impl DossierDbRow {
    fn from_sqlite_row(row: SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            company: row.try_get("company")?,
            role: row.try_get("role")?,
            location: row.try_get("location")?,
            lane: row.try_get("lane")?,
            stage: row.try_get("stage")?,
            source: row.try_get("source")?,
            source_url: row.try_get("source_url")?,
            score: row.try_get("score")?,
            recommendation: row.try_get("recommendation")?,
            next_action: row.try_get("next_action")?,
            due: row.try_get("due")?,
            salary_text: row.try_get("salary_text")?,
            estimated_hourly_rate: row.try_get("estimated_hourly_rate")?,
            summary: row.try_get("summary")?,
            tags: row.try_get("tags")?,
            notes: row.try_get("notes")?,
            evaluation: row.try_get("evaluation")?,
            assets: row.try_get("assets")?,
            timeline: row.try_get("timeline")?,
            fingerprint: row.try_get("fingerprint")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationRow {
    id: String,
    dossier_id: String,
    batch_id: Option<String>,
    status: String,
    submit_mode: String,
    prepared_answers: Value,
    packet_snapshot: Value,
    required_fields: Value,
    risk_flags: Value,
    audit: Value,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutcomeRow {
    id: String,
    dossier_id: Option<String>,
    application_id: Option<String>,
    outcome: String,
    callback_quality: Option<String>,
    pay: Option<String>,
    lesson: String,
    metadata: Value,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchRunRow {
    id: String,
    lane: String,
    query: String,
    source_set: Value,
    filters: Value,
    result_count: i64,
    dedupe_fingerprints: Value,
    created_dossier_ids: Value,
    created_at: String,
    updated_at: String,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn json_text(value: &Value) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|e| AppError::Internal(e.into()))
}

fn parse_json(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or_else(|_| json!({}))
}

fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn clean_string(value: Option<String>, fallback: &str) -> String {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|raw| !raw.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn normalize_lane(value: Option<String>) -> String {
    let normalized = value
        .unwrap_or_else(|| "cash-now".into())
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '_'], "-");
    match normalized.as_str() {
        "engineering" | "career-track" | "career_track" => "engineering".into(),
        "trainer" | "trainer-growth" | "trainer_growth" => "trainer".into(),
        _ => "cash-now".into(),
    }
}

fn normalize_stage(value: Option<String>) -> String {
    let normalized = value
        .unwrap_or_else(|| "sourcing".into())
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '_'], "-");
    match normalized.as_str() {
        "applied" => "applied".into(),
        "interview" | "interviewing" => "interviewing".into(),
        "offer" => "offer".into(),
        "archive" | "archived" | "rejected" | "rejection" | "ignored" => "archived".into(),
        _ => "sourcing".into(),
    }
}

fn normalize_fingerprint(
    company: &str,
    role: &str,
    location: &str,
    source_url: Option<&str>,
) -> String {
    [company, role, location, source_url.unwrap_or("")]
        .join("|")
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

fn default_profile_payload(user_id: &str) -> Value {
    json!({
        "id": format!("profile_{}", random_uuid()),
        "userId": user_id,
        "lanes": ["cash-now", "engineering", "trainer"],
        "payFloors": { "cash-now": 18, "engineering": 20, "trainer": 18 },
        "locations": ["Fort Myers, FL 33905", "Remote - US"],
        "strengths": [
            "AI automation projects",
            "computer engineering coursework",
            "personal training and coaching",
            "client-focused communication",
            "fast learner who ships practical systems"
        ],
        "resumePacket": {
            "baseBullets": [
                "Built automation-first tools for operations, outreach, and personal productivity.",
                "Comfortable with customer-facing work, fast follow-up, and practical problem solving.",
                "Personal training background with coaching, accountability, and client communication."
            ],
            "workHistory": [],
            "projectProof": [],
            "trainerPitch": "I help clients build realistic strength, consistency, and confidence while I grow a local and online coaching book.",
            "engineeringPitch": "I build practical AI, automation, and full-stack tools, and I am targeting entry engineering, IT, data, and automation roles where I can ship quickly.",
            "coverTemplates": {
                "cash-now": "I am available flexible ASAP in Fort Myers and can move quickly for part-time work at $18/hr+.",
                "engineering": "I bring hands-on AI automation and software project experience, with a bias for useful systems and fast learning.",
                "trainer": "I bring coaching energy, consistency, and client-first communication to help people start and stick with training."
            },
            "commonAnswers": {
                "availability": "Flexible ASAP",
                "authorizedToWork": "Yes",
                "desiredPay": "$18/hr+ for cash-now roles"
            }
        },
        "links": {},
        "availability": "Flexible ASAP"
    })
}

async fn log_sync(
    db: &SqlitePool,
    table: &str,
    row_id: &str,
    operation: &str,
    payload: Option<&Value>,
) -> Result<(), AppError> {
    let payload_text = match payload {
        Some(value) => Some(json_text(value)?),
        None => None,
    };
    crate::sync::log_mutation(db, table, row_id, operation, payload_text.as_deref())
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

async fn get_or_create_profile(db: &SqlitePool, user_id: &str) -> Result<Value, AppError> {
    if let Some(profile) = load_profile(db, user_id).await? {
        return Ok(profile);
    }

    let payload = default_profile_payload(user_id);
    let id = payload["id"].as_str().unwrap_or_default().to_string();
    insert_profile(db, user_id, &id, &payload).await?;
    log_sync(
        db,
        "career_profiles",
        &id,
        "INSERT",
        Some(&sqlite_profile_sync_payload(user_id, &payload)),
    )
    .await?;
    load_profile(db, user_id)
        .await?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("profile insert failed")))
}

async fn load_profile(db: &SqlitePool, user_id: &str) -> Result<Option<Value>, AppError> {
    let row = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String)>(
        "SELECT id, lanes, pay_floors, locations, strengths, resume_packet, links, availability, created_at, updated_at \
         FROM career_profiles WHERE user_id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(
        |(
            id,
            lanes,
            pay_floors,
            locations,
            strengths,
            resume_packet,
            links,
            availability,
            created_at,
            updated_at,
        )| {
            json!({
                "id": id,
                "userId": user_id,
                "lanes": parse_json(&lanes),
                "payFloors": parse_json(&pay_floors),
                "locations": parse_json(&locations),
                "strengths": parse_json(&strengths),
                "resumePacket": parse_json(&resume_packet),
                "links": parse_json(&links),
                "availability": availability,
                "createdAt": created_at,
                "updatedAt": updated_at,
            })
        },
    ))
}

async fn insert_profile(
    db: &SqlitePool,
    user_id: &str,
    id: &str,
    payload: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO career_profiles \
         (id, user_id, lanes, pay_floors, locations, strengths, resume_packet, links, availability) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(user_id)
    .bind(json_text(&payload["lanes"])?)
    .bind(json_text(&payload["payFloors"])?)
    .bind(json_text(&payload["locations"])?)
    .bind(json_text(&payload["strengths"])?)
    .bind(json_text(&payload["resumePacket"])?)
    .bind(json_text(&payload["links"])?)
    .bind(payload["availability"].as_str().unwrap_or("Flexible ASAP"))
    .execute(db)
    .await?;
    Ok(())
}

fn sqlite_profile_sync_payload(user_id: &str, payload: &Value) -> Value {
    json!({
        "id": payload["id"],
        "user_id": user_id,
        "lanes": payload["lanes"],
        "pay_floors": payload["payFloors"],
        "locations": payload["locations"],
        "strengths": payload["strengths"],
        "resume_packet": payload["resumePacket"],
        "links": payload["links"],
        "availability": payload["availability"],
        "updated_at": now(),
    })
}

fn row_to_dossier(row: DossierDbRow) -> DossierRow {
    DossierRow {
        id: row.id,
        company: row.company,
        role: row.role,
        location: row.location,
        lane: row.lane,
        stage: row.stage,
        source: parse_json(&row.source),
        source_url: row.source_url,
        score: row.score,
        recommendation: row.recommendation,
        next_action: row.next_action,
        due: row.due,
        salary_text: row.salary_text,
        estimated_hourly_rate: row.estimated_hourly_rate,
        summary: row.summary,
        tags: parse_json(&row.tags),
        notes: row.notes,
        evaluation: parse_json(&row.evaluation),
        assets: parse_json(&row.assets),
        timeline: parse_json(&row.timeline),
        fingerprint: row.fingerprint,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn row_to_application(
    row: (
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
    ),
) -> ApplicationRow {
    let (
        id,
        dossier_id,
        batch_id,
        status,
        submit_mode,
        prepared_answers,
        packet_snapshot,
        required_fields,
        risk_flags,
        audit,
        created_at,
        updated_at,
    ) = row;
    ApplicationRow {
        id,
        dossier_id,
        batch_id,
        status,
        submit_mode,
        prepared_answers: parse_json(&prepared_answers),
        packet_snapshot: parse_json(&packet_snapshot),
        required_fields: parse_json(&required_fields),
        risk_flags: parse_json(&risk_flags),
        audit: parse_json(&audit),
        created_at,
        updated_at,
    }
}

fn row_to_outcome(
    row: (
        String,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        String,
        String,
        String,
        String,
    ),
) -> OutcomeRow {
    let (
        id,
        dossier_id,
        application_id,
        outcome,
        callback_quality,
        pay,
        lesson,
        metadata,
        created_at,
        updated_at,
    ) = row;
    OutcomeRow {
        id,
        dossier_id,
        application_id,
        outcome,
        callback_quality,
        pay,
        lesson,
        metadata: parse_json(&metadata),
        created_at,
        updated_at,
    }
}

fn row_to_search_run(
    row: (
        String,
        String,
        String,
        String,
        String,
        i64,
        String,
        String,
        String,
        String,
    ),
) -> SearchRunRow {
    let (
        id,
        lane,
        query,
        source_set,
        filters,
        result_count,
        dedupe_fingerprints,
        created_dossier_ids,
        created_at,
        updated_at,
    ) = row;
    SearchRunRow {
        id,
        lane,
        query,
        source_set: parse_json(&source_set),
        filters: parse_json(&filters),
        result_count,
        dedupe_fingerprints: parse_json(&dedupe_fingerprints),
        created_dossier_ids: parse_json(&created_dossier_ids),
        created_at,
        updated_at,
    }
}

fn application_payload(user_id: &str, app: &ApplicationRow) -> Value {
    json!({
        "id": app.id,
        "user_id": user_id,
        "dossier_id": app.dossier_id,
        "batch_id": app.batch_id,
        "status": app.status,
        "submit_mode": app.submit_mode,
        "prepared_answers": app.prepared_answers,
        "packet_snapshot": app.packet_snapshot,
        "required_fields": app.required_fields,
        "risk_flags": app.risk_flags,
        "audit": app.audit,
        "updated_at": app.updated_at,
    })
}

fn dossier_payload(user_id: &str, dossier: &DossierRow) -> Value {
    json!({
        "id": dossier.id,
        "user_id": user_id,
        "company": dossier.company,
        "role": dossier.role,
        "location": dossier.location,
        "lane": dossier.lane,
        "stage": dossier.stage,
        "source": dossier.source,
        "source_url": dossier.source_url,
        "score": dossier.score,
        "recommendation": dossier.recommendation,
        "next_action": dossier.next_action,
        "due": dossier.due,
        "salary_text": dossier.salary_text,
        "estimated_hourly_rate": dossier.estimated_hourly_rate,
        "summary": dossier.summary,
        "tags": dossier.tags,
        "notes": dossier.notes,
        "evaluation": dossier.evaluation,
        "assets": dossier.assets,
        "timeline": dossier.timeline,
        "fingerprint": dossier.fingerprint,
        "updated_at": dossier.updated_at,
    })
}

async fn get_profile(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let profile = get_or_create_profile(&state.db, &session.user_id).await?;
    Ok(success_json(profile))
}

async fn sync_status(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let career_tables = [
        "career_profiles",
        "career_dossiers",
        "career_applications",
        "career_saved_searches",
        "career_outcomes",
        "career_search_runs",
    ];
    let mut sqlite_tables = serde_json::Map::new();
    for table in career_tables {
        let exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .bind(table)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0)
            > 0;
        sqlite_tables.insert(table.to_string(), json!(exists));
    }

    let supabase_url = state.secret("SUPABASE_URL").unwrap_or_default();
    let supabase_key = state
        .secret_first(&["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"])
        .unwrap_or_default();
    let supabase_configured = !supabase_url.trim().is_empty() && !supabase_key.trim().is_empty();
    let mut supabase_status = json!({
        "configured": supabase_configured,
        "reachable": false,
        "careerTablesDetected": false,
        "status": "not_configured",
    });

    if supabase_configured {
        let mut table_status = serde_json::Map::new();
        let mut missing_tables = Vec::new();
        let mut failed_tables = Vec::new();
        let mut reachable = false;
        let mut http_statuses = Vec::new();
        for table in career_tables {
            let url = format!(
                "{}/rest/v1/{table}?select=id&limit=1",
                supabase_url.trim_end_matches('/')
            );
            match state
                .http
                .get(url)
                .header("apikey", &supabase_key)
                .header("authorization", format!("Bearer {supabase_key}"))
                .send()
                .await
            {
                Ok(response) => {
                    reachable = true;
                    let status = response.status();
                    http_statuses.push(status.as_u16());
                    let body = response.text().await.unwrap_or_default();
                    let table_missing = status.as_u16() == 404 && body.contains("PGRST205");
                    if table_missing {
                        missing_tables.push(table);
                    }
                    if !status.is_success() {
                        failed_tables.push(table);
                    }
                    table_status.insert(
                        table.to_string(),
                        json!({
                            "ok": status.is_success(),
                            "httpStatus": status.as_u16(),
                            "missing": table_missing,
                        }),
                    );
                }
                Err(error) => {
                    failed_tables.push(table);
                    table_status.insert(
                        table.to_string(),
                        json!({
                            "ok": false,
                            "httpStatus": 0,
                            "missing": false,
                            "error": error.to_string(),
                        }),
                    );
                }
            }
        }
        let career_tables_detected = missing_tables.is_empty() && failed_tables.is_empty();
        supabase_status = json!({
            "configured": true,
            "reachable": reachable,
            "careerTablesDetected": career_tables_detected,
            "status": if !reachable {
                "unreachable"
            } else if !missing_tables.is_empty() {
                "career_tables_missing"
            } else if !failed_tables.is_empty() {
                "remote_probe_failed"
            } else {
                "ready"
            },
            "httpStatus": http_statuses.iter().copied().max().unwrap_or(0),
            "missingTables": missing_tables,
            "failedTables": failed_tables,
            "tables": table_status,
        });
        if !reachable {
            if let Some(error) = table_status
                .values()
                .find_map(|value| value.get("error").and_then(Value::as_str))
            {
                supabase_status = json!({
                    "configured": true,
                    "reachable": false,
                    "careerTablesDetected": false,
                    "status": "unreachable",
                    "error": error,
                    "missingTables": [],
                    "failedTables": career_tables,
                    "tables": table_status,
                });
            }
        }
    }

    Ok(success_json(json!({
        "sqliteTables": sqlite_tables,
        "migration": {
            "path": "supabase/migrations/20260512000000_career_ops.sql",
            "applyCommand": "npm run career:apply-supabase",
            "checkCommand": "npm run career:check"
        },
        "supabase": supabase_status,
    })))
}

async fn put_profile(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<ProfileBody>,
) -> Result<Json<Value>, AppError> {
    let current = get_or_create_profile(&state.db, &session.user_id).await?;
    let id = current["id"].as_str().unwrap_or_default().to_string();
    let payload = json!({
        "id": id,
        "lanes": body.lanes.unwrap_or_else(|| current["lanes"].clone()),
        "payFloors": body.pay_floors.unwrap_or_else(|| current["payFloors"].clone()),
        "locations": body.locations.unwrap_or_else(|| current["locations"].clone()),
        "strengths": body.strengths.unwrap_or_else(|| current["strengths"].clone()),
        "resumePacket": body.resume_packet.unwrap_or_else(|| current["resumePacket"].clone()),
        "links": body.links.unwrap_or_else(|| current["links"].clone()),
        "availability": body.availability.unwrap_or_else(|| current["availability"].as_str().unwrap_or("Flexible ASAP").to_string()),
    });

    sqlx::query(
        "UPDATE career_profiles \
         SET lanes = ?, pay_floors = ?, locations = ?, strengths = ?, resume_packet = ?, links = ?, availability = ?, updated_at = ? \
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(json_text(&payload["lanes"])?)
    .bind(json_text(&payload["payFloors"])?)
    .bind(json_text(&payload["locations"])?)
    .bind(json_text(&payload["strengths"])?)
    .bind(json_text(&payload["resumePacket"])?)
    .bind(json_text(&payload["links"])?)
    .bind(payload["availability"].as_str().unwrap_or("Flexible ASAP"))
    .bind(now())
    .bind(&id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    log_sync(
        &state.db,
        "career_profiles",
        &id,
        "UPDATE",
        Some(&sqlite_profile_sync_payload(&session.user_id, &payload)),
    )
    .await?;

    Ok(success_json(
        load_profile(&state.db, &session.user_id)
            .await?
            .unwrap_or(payload),
    ))
}

async fn list_dossiers(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(query): Query<ListDossiersQuery>,
) -> Result<Json<Value>, AppError> {
    let mut sql = "SELECT id, company, role, location, lane, stage, source, source_url, score, recommendation, next_action, due, salary_text, estimated_hourly_rate, summary, tags, notes, evaluation, assets, timeline, fingerprint, created_at, updated_at \
                   FROM career_dossiers WHERE user_id = ? AND deleted_at IS NULL"
        .to_string();
    if query.lane.is_some() {
        sql.push_str(" AND lane = ?");
    }
    if query.stage.is_some() {
        sql.push_str(" AND stage = ?");
    }
    sql.push_str(" ORDER BY score DESC, updated_at DESC LIMIT 500");

    let mut db_query = sqlx::query(&sql).bind(&session.user_id);
    if let Some(lane) = query.lane {
        db_query = db_query.bind(normalize_lane(Some(lane)));
    }
    if let Some(stage) = query.stage {
        db_query = db_query.bind(stage);
    }
    let dossiers: Vec<DossierRow> = db_query
        .fetch_all(&state.db)
        .await?
        .into_iter()
        .map(DossierDbRow::from_sqlite_row)
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(row_to_dossier)
        .collect();

    Ok(success_json(json!({ "dossiers": dossiers })))
}

async fn load_dossiers_by_ids(
    db: &SqlitePool,
    user_id: &str,
    ids: &[String],
) -> Result<Vec<DossierRow>, AppError> {
    let mut out = Vec::new();
    for id in ids {
        let row = sqlx::query(
            "SELECT id, company, role, location, lane, stage, source, source_url, score, recommendation, next_action, due, salary_text, estimated_hourly_rate, summary, tags, notes, evaluation, assets, timeline, fingerprint, created_at, updated_at \
             FROM career_dossiers WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(db)
        .await?;
        if let Some(row) = row {
            out.push(row_to_dossier(DossierDbRow::from_sqlite_row(row)?));
        }
    }
    Ok(out)
}

async fn upsert_dossier(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<DossierBody>,
) -> Result<Json<Value>, AppError> {
    let company = body.company.trim();
    let role = body.role.trim();
    if company.is_empty() || role.is_empty() {
        return Err(AppError::BadRequest("company and role are required".into()));
    }

    let location = clean_string(body.location, "Fort Myers, FL");
    let lane = normalize_lane(body.lane);
    let stage = normalize_stage(body.stage);
    let source_url = body.source_url.filter(|value| !value.trim().is_empty());
    let fingerprint = body
        .fingerprint
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| normalize_fingerprint(company, role, &location, source_url.as_deref()));
    let id = if let Some(id) = body.id.filter(|value| !value.trim().is_empty()) {
        id
    } else {
        sqlx::query_scalar::<_, String>(
            "SELECT id FROM career_dossiers WHERE user_id = ? AND fingerprint = ? AND deleted_at IS NULL LIMIT 1",
        )
        .bind(&session.user_id)
        .bind(&fingerprint)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_else(|| format!("dos_{}", random_uuid()))
    };

    sqlx::query(
        "INSERT INTO career_dossiers \
         (id, user_id, company, role, location, lane, stage, source, source_url, score, recommendation, next_action, due, salary_text, estimated_hourly_rate, summary, tags, notes, evaluation, assets, timeline, fingerprint) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           company = excluded.company, role = excluded.role, location = excluded.location, lane = excluded.lane, \
           stage = excluded.stage, source = excluded.source, source_url = excluded.source_url, score = excluded.score, \
           recommendation = excluded.recommendation, next_action = excluded.next_action, due = excluded.due, \
           salary_text = excluded.salary_text, estimated_hourly_rate = excluded.estimated_hourly_rate, summary = excluded.summary, \
           tags = excluded.tags, notes = excluded.notes, evaluation = excluded.evaluation, assets = excluded.assets, \
           timeline = excluded.timeline, fingerprint = excluded.fingerprint, updated_at = datetime('now'), deleted_at = NULL",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(company)
    .bind(role)
    .bind(&location)
    .bind(&lane)
    .bind(stage)
    .bind(json_text(&body.source.unwrap_or_else(|| json!({ "kind": "manual" })))?)
    .bind(&source_url)
    .bind(body.score.unwrap_or(0))
    .bind(
        body.recommendation
            .unwrap_or_else(|| DEFAULT_DOSSIER_RECOMMENDATION.into()),
    )
    .bind(body.next_action.unwrap_or_else(|| "Apply today".into()))
    .bind(body.due.unwrap_or_else(|| "Today".into()))
    .bind(body.salary_text.unwrap_or_default())
    .bind(body.estimated_hourly_rate)
    .bind(body.summary.unwrap_or_default())
    .bind(json_text(&body.tags.unwrap_or_else(|| json!([])))?)
    .bind(body.notes.unwrap_or_default())
    .bind(json_text(&body.evaluation.unwrap_or_else(|| json!({})))?)
    .bind(json_text(&body.assets.unwrap_or_else(|| json!({})))?)
    .bind(json_text(&body.timeline.unwrap_or_else(|| json!([])))?)
    .bind(&fingerprint)
    .execute(&state.db)
    .await?;

    let dossier = load_dossiers_by_ids(&state.db, &session.user_id, std::slice::from_ref(&id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("dossier upsert failed")))?;
    log_sync(
        &state.db,
        "career_dossiers",
        &id,
        "UPDATE",
        Some(&dossier_payload(&session.user_id, &dossier)),
    )
    .await?;
    Ok(success_json(json!({ "dossier": dossier })))
}

async fn patch_dossier(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchDossierBody>,
) -> Result<Json<Value>, AppError> {
    let current = load_dossiers_by_ids(&state.db, &session.user_id, std::slice::from_ref(&body.id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("dossier not found".into()))?;

    let source = body.source.unwrap_or(current.source);
    let tags = body.tags.unwrap_or(current.tags);
    let evaluation = body.evaluation.unwrap_or(current.evaluation);
    let assets = body.assets.unwrap_or(current.assets);
    let timeline = body.timeline.unwrap_or(current.timeline);
    let company = body.company.unwrap_or(current.company);
    let role = body.role.unwrap_or(current.role);
    let location = body.location.unwrap_or(current.location);
    let stage = normalize_stage(body.stage.or(Some(current.stage)));
    let source_url = body.source_url.or(current.source_url);
    let fingerprint = normalize_fingerprint(&company, &role, &location, source_url.as_deref());

    sqlx::query(
        "UPDATE career_dossiers SET company = ?, role = ?, location = ?, lane = ?, stage = ?, source = ?, source_url = ?, score = ?, recommendation = ?, next_action = ?, due = ?, salary_text = ?, estimated_hourly_rate = ?, summary = ?, tags = ?, notes = ?, evaluation = ?, assets = ?, timeline = ?, fingerprint = ?, updated_at = datetime('now') \
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(company)
    .bind(role)
    .bind(location)
    .bind(body.lane.map(|value| normalize_lane(Some(value))).unwrap_or(current.lane))
    .bind(stage)
    .bind(json_text(&source)?)
    .bind(source_url)
    .bind(body.score.unwrap_or(current.score))
    .bind(body.recommendation.unwrap_or(current.recommendation))
    .bind(body.next_action.unwrap_or(current.next_action))
    .bind(body.due.unwrap_or(current.due))
    .bind(body.salary_text.unwrap_or(current.salary_text))
    .bind(body.estimated_hourly_rate.or(current.estimated_hourly_rate))
    .bind(body.summary.unwrap_or(current.summary))
    .bind(json_text(&tags)?)
    .bind(body.notes.unwrap_or(current.notes))
    .bind(json_text(&evaluation)?)
    .bind(json_text(&assets)?)
    .bind(json_text(&timeline)?)
    .bind(fingerprint)
    .bind(&body.id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    let dossier = load_dossiers_by_ids(&state.db, &session.user_id, std::slice::from_ref(&body.id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("dossier not found".into()))?;
    log_sync(
        &state.db,
        "career_dossiers",
        &body.id,
        "UPDATE",
        Some(&dossier_payload(&session.user_id, &dossier)),
    )
    .await?;
    Ok(success_json(json!({ "dossier": dossier })))
}

async fn delete_dossier(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(query): Query<DeleteQuery>,
    body: Result<Json<DeleteBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let id = match body {
        Ok(Json(body)) => body.id,
        Err(_) => query
            .id
            .ok_or_else(|| AppError::BadRequest("id required".into()))?,
    };
    sqlx::query(
        "UPDATE career_dossiers SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(now())
    .bind(now())
    .bind(&id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;
    log_sync(&state.db, "career_dossiers", &id, "DELETE", None).await?;
    Ok(success_json(json!({ "id": id })))
}

async fn list_applications(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, String)>(
        "SELECT id, dossier_id, batch_id, status, submit_mode, prepared_answers, packet_snapshot, required_fields, risk_flags, audit, created_at, updated_at \
         FROM career_applications WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;
    let applications: Vec<ApplicationRow> = rows.into_iter().map(row_to_application).collect();
    Ok(success_json(json!({ "applications": applications })))
}

async fn record_application_event(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<ApplicationEventBody>,
) -> Result<Json<Value>, AppError> {
    let event_name = body.event.trim();
    if !matches!(
        event_name,
        "browser_opened" | "browser_open_blocked" | "fill_helper_viewed" | "hard_stop_detected"
    ) {
        return Err(AppError::BadRequest("unsupported application event".into()));
    }

    let row = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, String)>(
        "SELECT id, dossier_id, batch_id, status, submit_mode, prepared_answers, packet_snapshot, required_fields, risk_flags, audit, created_at, updated_at \
         FROM career_applications WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&body.application_id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("application not found".into()))?;
    let mut app = row_to_application(row);
    let event = json!({
        "at": now(),
        "event": event_name,
        "url": body.url.unwrap_or_default(),
        "note": body.note.unwrap_or_default(),
        "metadata": body.metadata.unwrap_or_else(|| json!({})),
    });
    let mut audit = app.audit.clone();
    if let Some(arr) = audit.as_array_mut() {
        arr.push(event);
    } else {
        audit = json!([event]);
    }
    app.audit = audit;
    if event_name == "browser_open_blocked" || event_name == "hard_stop_detected" {
        app.status = "blocked".into();
    }
    app.updated_at = now();

    sqlx::query("UPDATE career_applications SET status = ?, audit = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .bind(&app.status)
        .bind(json_text(&app.audit)?)
        .bind(&app.updated_at)
        .bind(&app.id)
        .bind(&session.user_id)
        .execute(&state.db)
        .await?;
    log_sync(
        &state.db,
        "career_applications",
        &app.id,
        "UPDATE",
        Some(&application_payload(&session.user_id, &app)),
    )
    .await?;

    Ok(success_json(json!({ "application": app })))
}

async fn list_saved_searches(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String)>(
        "SELECT id, name, query, lane, source_set, schedule, filters, created_at, updated_at \
         FROM career_saved_searches WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;
    let searches: Vec<Value> = rows
        .into_iter()
        .map(
            |(id, name, query, lane, source_set, schedule, filters, created_at, updated_at)| {
                json!({
                    "id": id,
                    "name": name,
                    "query": query,
                    "lane": lane,
                    "sourceSet": parse_json(&source_set),
                    "schedule": parse_json(&schedule),
                    "filters": parse_json(&filters),
                    "createdAt": created_at,
                    "updatedAt": updated_at,
                })
            },
        )
        .collect();
    Ok(success_json(json!({ "savedSearches": searches })))
}

async fn log_saved_search_sync(
    db: &SqlitePool,
    user_id: &str,
    payload: &SavedSearchSyncPayload,
    operation: &str,
) -> Result<(), AppError> {
    log_sync(
        db,
        "career_saved_searches",
        &payload.id,
        operation,
        Some(&json!({
            "id": payload.id,
            "user_id": user_id,
            "name": payload.name,
            "query": payload.query,
            "lane": payload.lane,
            "source_set": payload.source_set,
            "schedule": payload.schedule,
            "filters": payload.filters,
            "updated_at": now(),
        })),
    )
    .await
}

async fn upsert_saved_search(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<SavedSearchBody>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .id
        .unwrap_or_else(|| format!("search_{}", random_uuid()));
    let lane = normalize_lane(body.lane);
    let source_set = body
        .source_set
        .unwrap_or_else(|| json!(["remotive", "remoteok", "arbeitnow", "browser"]));
    let schedule = body.schedule.unwrap_or_else(|| json!({ "kind": "manual" }));
    let filters = body.filters.unwrap_or_else(|| json!({}));
    sqlx::query(
        "INSERT INTO career_saved_searches (id, user_id, name, query, lane, source_set, schedule, filters) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, query = excluded.query, lane = excluded.lane, source_set = excluded.source_set, schedule = excluded.schedule, filters = excluded.filters, updated_at = datetime('now'), deleted_at = NULL",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(&body.name)
    .bind(&body.query)
    .bind(&lane)
    .bind(json_text(&source_set)?)
    .bind(json_text(&schedule)?)
    .bind(json_text(&filters)?)
    .execute(&state.db)
    .await?;
    log_saved_search_sync(
        &state.db,
        &session.user_id,
        &SavedSearchSyncPayload {
            id: id.clone(),
            name: body.name,
            query: body.query,
            lane,
            source_set,
            schedule,
            filters,
        },
        "UPDATE",
    )
    .await?;
    let response = list_saved_searches(State(state.clone()), RequireAuth(session.clone()))
        .await?
        .0;
    Ok(success_json(response["data"]["savedSearches"][0].clone()))
}

async fn patch_saved_search(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchSavedSearchBody>,
) -> Result<Json<Value>, AppError> {
    let current = sqlx::query_as::<_, (String, String, String, String, String, String)>(
        "SELECT name, query, lane, source_set, schedule, filters FROM career_saved_searches WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&body.id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("saved search not found".into()))?;
    let name = body.name.unwrap_or(current.0);
    let query = body.query.unwrap_or(current.1);
    let lane = body
        .lane
        .map(|value| normalize_lane(Some(value)))
        .unwrap_or(current.2);
    let source_set = body.source_set.unwrap_or_else(|| parse_json(&current.3));
    let schedule = body.schedule.unwrap_or_else(|| parse_json(&current.4));
    let filters = body.filters.unwrap_or_else(|| parse_json(&current.5));
    sqlx::query(
        "UPDATE career_saved_searches SET name = ?, query = ?, lane = ?, source_set = ?, schedule = ?, filters = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(&name)
    .bind(&query)
    .bind(&lane)
    .bind(json_text(&source_set)?)
    .bind(json_text(&schedule)?)
    .bind(json_text(&filters)?)
    .bind(&body.id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;
    log_saved_search_sync(
        &state.db,
        &session.user_id,
        &SavedSearchSyncPayload {
            id: body.id.clone(),
            name,
            query,
            lane,
            source_set,
            schedule,
            filters,
        },
        "UPDATE",
    )
    .await?;
    Ok(success_json(json!({ "id": body.id })))
}

async fn delete_saved_search(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(query): Query<DeleteQuery>,
    body: Result<Json<DeleteBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let id = match body {
        Ok(Json(body)) => body.id,
        Err(_) => query
            .id
            .ok_or_else(|| AppError::BadRequest("id required".into()))?,
    };
    sqlx::query("UPDATE career_saved_searches SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .bind(now())
        .bind(now())
        .bind(&id)
        .bind(&session.user_id)
        .execute(&state.db)
        .await?;
    log_sync(&state.db, "career_saved_searches", &id, "DELETE", None).await?;
    Ok(success_json(json!({ "id": id })))
}

async fn list_search_runs(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            String,
            i64,
            String,
            String,
            String,
            String,
        ),
    >(
        "SELECT id, lane, query, source_set, filters, result_count, dedupe_fingerprints, created_dossier_ids, created_at, updated_at \
         FROM career_search_runs WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;
    let runs: Vec<SearchRunRow> = rows.into_iter().map(row_to_search_run).collect();
    Ok(success_json(json!({ "searchRuns": runs })))
}

async fn run_search(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<SearchRunBody>,
) -> Result<Json<Value>, AppError> {
    let lane = normalize_lane(body.lane);
    let source_set = body
        .source_set
        .unwrap_or_else(|| json!(["remotive", "remoteok", "arbeitnow", "browser"]));
    let filters = body
        .filters
        .unwrap_or_else(|| json!({ "location": "Fort Myers, FL", "payFloor": 18 }));
    let mut created_ids = Vec::new();
    let mut fingerprints = Vec::new();

    for job in body.jobs {
        let company = clean_string(job.company, "Unknown company");
        let role = clean_string(job.role, "Open role");
        let location = clean_string(
            job.location,
            if lane == "cash-now" {
                "Fort Myers, FL"
            } else {
                "Remote"
            },
        );
        let source_url = job.source_url.filter(|value| !value.trim().is_empty());
        let fingerprint = normalize_fingerprint(&company, &role, &location, source_url.as_deref());
        fingerprints.push(fingerprint.clone());
        let id = sqlx::query_scalar::<_, String>(
            "SELECT id FROM career_dossiers WHERE user_id = ? AND fingerprint = ? AND deleted_at IS NULL LIMIT 1",
        )
        .bind(&session.user_id)
        .bind(&fingerprint)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_else(|| format!("dos_{}", random_uuid()));
        let score = job
            .score
            .unwrap_or_else(|| if lane == "cash-now" { 88 } else { 72 });
        let source = json!({
            "kind": "search-run",
            "feedId": job.id,
            "source": job.source.unwrap_or_else(|| "public-feed".into()),
            "jobType": job.job_type,
            "query": body.query,
        });
        sqlx::query(
            "INSERT INTO career_dossiers \
             (id, user_id, company, role, location, lane, stage, source, source_url, score, recommendation, next_action, due, salary_text, summary, tags, fingerprint) \
             VALUES (?, ?, ?, ?, ?, ?, 'sourcing', ?, ?, ?, ?, ?, 'Today', ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET score = MAX(score, excluded.score), source = excluded.source, source_url = excluded.source_url, updated_at = datetime('now'), deleted_at = NULL",
        )
        .bind(&id)
        .bind(&session.user_id)
        .bind(&company)
        .bind(&role)
        .bind(&location)
        .bind(&lane)
        .bind(json_text(&source)?)
        .bind(&source_url)
        .bind(score)
        .bind(DEFAULT_DOSSIER_RECOMMENDATION)
        .bind(if lane == "cash-now" { "Apply today" } else { "Tailor packet" })
        .bind(job.salary_text.or(job.salary).unwrap_or_default())
        .bind(job.summary.unwrap_or_default())
        .bind(json_text(&job.tags.unwrap_or_else(|| json!([])))?)
        .bind(&fingerprint)
        .execute(&state.db)
        .await?;
        created_ids.push(id.clone());
        if let Some(dossier) =
            load_dossiers_by_ids(&state.db, &session.user_id, std::slice::from_ref(&id))
                .await?
                .into_iter()
                .next()
        {
            log_sync(
                &state.db,
                "career_dossiers",
                &id,
                "UPDATE",
                Some(&dossier_payload(&session.user_id, &dossier)),
            )
            .await?;
        }
    }

    let run_id = format!("run_{}", random_uuid());
    sqlx::query(
        "INSERT INTO career_search_runs (id, user_id, lane, query, source_set, filters, result_count, dedupe_fingerprints, created_dossier_ids) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&run_id)
    .bind(&session.user_id)
    .bind(&lane)
    .bind(&body.query)
    .bind(json_text(&source_set)?)
    .bind(json_text(&filters)?)
    .bind(created_ids.len() as i64)
    .bind(json_text(&json!(fingerprints))?)
    .bind(json_text(&json!(created_ids))?)
    .execute(&state.db)
    .await?;

    log_sync(
        &state.db,
        "career_search_runs",
        &run_id,
        "INSERT",
        Some(&json!({
            "id": run_id,
            "user_id": session.user_id,
            "lane": lane,
            "query": body.query,
            "source_set": source_set,
            "filters": filters,
            "result_count": created_ids.len(),
            "dedupe_fingerprints": fingerprints,
            "created_dossier_ids": created_ids,
            "updated_at": now(),
        })),
    )
    .await?;

    Ok(success_json(json!({
        "runId": run_id,
        "createdDossierIds": created_ids,
        "dedupeFingerprints": fingerprints,
    })))
}

fn prepared_answers(profile: &Value, dossier: &DossierRow) -> Value {
    let packet = &profile["resumePacket"];
    let cover = packet
        .pointer(&format!("/coverTemplates/{}", dossier.lane))
        .and_then(Value::as_str)
        .unwrap_or("I am available quickly and can bring practical, reliable work to this role.");
    json!({
        "company": dossier.company,
        "role": dossier.role,
        "coverNote": cover,
        "availability": profile["availability"].as_str().unwrap_or("Flexible ASAP"),
        "desiredPay": if dossier.lane == "cash-now" { "$18/hr+" } else { "Open based on role scope" },
        "whyFit": match dossier.lane.as_str() {
            "engineering" => packet["engineeringPitch"].as_str().unwrap_or("Hands-on automation and engineering project experience."),
            "trainer" => packet["trainerPitch"].as_str().unwrap_or("Coaching and client-first communication."),
            _ => "Flexible ASAP in Fort Myers, reliable, coachable, and ready to work."
        },
        "links": profile["links"],
    })
}

fn browser_fill_helper_script(answers: &Value) -> Result<String, AppError> {
    let payload = json!({
        "coverNote": answers["coverNote"],
        "availability": answers["availability"],
        "desiredPay": answers["desiredPay"],
        "whyFit": answers["whyFit"],
        "links": answers["links"],
        "hardStops": HARD_STOPS,
    });
    let payload_text = json_text(&payload)?;
    Ok(format!(
        r#"(() => {{
  const packet = {payload_text};
  const hardStopPattern = /(ssn|social security|password|captcha|payment|credit card|card number|cvv|routing|bank|background.?check|date of birth|birthdate)/i;
  const fields = Array.from(document.querySelectorAll('input, textarea')).filter(field => !field.disabled && !field.readOnly);
  const labelFor = (field) => {{
    const id = field.id && typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(field.id) : '';
    const label = id ? document.querySelector(`label[for="${{id}}"]`)?.innerText : '';
    return [label, field.getAttribute('aria-label'), field.name, field.id, field.placeholder, field.type].filter(Boolean).join(' ');
  }};
  const stopped = fields.filter(field => hardStopPattern.test(labelFor(field))).map(labelFor);
  if (stopped.length) {{
    console.warn('Career Ops hard stop. Review manually before entering sensitive data.', stopped);
    return {{ filled: [], stopped, submitted: false }};
  }}
  const fill = (pattern, value) => {{
    if (!value) return [];
    const filled = [];
    for (const field of fields) {{
      const label = labelFor(field);
      if (!pattern.test(label) || field.value) continue;
      field.focus();
      field.value = String(value);
      field.dispatchEvent(new Event('input', {{ bubbles: true }}));
      field.dispatchEvent(new Event('change', {{ bubbles: true }}));
      filled.push(label);
    }}
    return filled;
  }};
  const links = packet.links || {{}};
  const filled = [
    ...fill(/cover|message|note|additional|why|interest/i, packet.coverNote || packet.whyFit),
    ...fill(/avail|start|schedule/i, packet.availability),
    ...fill(/pay|salary|compensation|rate|wage/i, packet.desiredPay),
    ...fill(/linkedin/i, links.linkedin),
    ...fill(/github/i, links.github),
    ...fill(/portfolio|website/i, links.portfolio),
    ...fill(/instagram|training|coach/i, links.trainingProfile || links.instagram)
  ];
  console.info('Career Ops filled safe fields only. Review before submitting.', filled);
  return {{ filled, stopped: [], submitted: false }};
}})();"#
    ))
}

fn prepare_batch_scope(
    batch_id: &str,
    scoped_dossiers: &[&DossierRow],
    max_submit_count: usize,
) -> Value {
    let dossier_ids: Vec<Value> = scoped_dossiers
        .iter()
        .map(|dossier| json!(dossier.id.as_str()))
        .collect();
    let urls: Vec<Value> = scoped_dossiers
        .iter()
        .filter_map(|dossier| dossier.source_url.as_ref())
        .map(|url| json!(url))
        .collect();

    json!({
        "batchId": batch_id,
        "dossierIds": dossier_ids,
        "urls": urls,
        "maxSubmitCount": max_submit_count,
        "noCredentialRelease": true,
        "hardStops": HARD_STOPS,
    })
}

async fn prepare_application_batch(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PrepareBatchBody>,
) -> Result<Json<Value>, AppError> {
    if body.dossier_ids.is_empty() {
        return Err(AppError::BadRequest("dossierIds required".into()));
    }
    let max_submit_count = body
        .max_submit_count
        .unwrap_or(body.dossier_ids.len())
        .min(body.dossier_ids.len())
        .max(1);
    let profile = get_or_create_profile(&state.db, &session.user_id).await?;
    let dossiers = load_dossiers_by_ids(&state.db, &session.user_id, &body.dossier_ids).await?;
    if dossiers.is_empty() {
        return Err(AppError::NotFound("no matching dossiers found".into()));
    }

    let batch_id = format!("batch_{}", random_uuid());
    let mut applications = Vec::new();
    let scoped_dossiers: Vec<&DossierRow> = dossiers.iter().take(max_submit_count).collect();
    for dossier in &scoped_dossiers {
        let app_id = format!("app_{}", random_uuid());
        let answers = prepared_answers(&profile, dossier);
        let packet_snapshot = json!({
            "profileId": profile["id"],
            "lane": dossier.lane,
            "resumePacket": profile["resumePacket"],
            "links": profile["links"],
            "dossier": dossier,
        });
        let required_fields = json!(["name", "email", "phone", "resume", "availability"]);
        let risk_flags = json!(HARD_STOPS);
        let audit = json!([{
            "at": now(),
            "event": "prepared",
            "note": "Batch packet prepared. Submit still requires scoped approval and browser hard-stop checks."
        }]);
        sqlx::query(
            "INSERT INTO career_applications \
             (id, user_id, dossier_id, batch_id, status, submit_mode, prepared_answers, packet_snapshot, required_fields, risk_flags, audit) \
             VALUES (?, ?, ?, ?, 'prepared', 'browser-assisted', ?, ?, ?, ?, ?)",
        )
        .bind(&app_id)
        .bind(&session.user_id)
        .bind(&dossier.id)
        .bind(&batch_id)
        .bind(json_text(&answers)?)
        .bind(json_text(&packet_snapshot)?)
        .bind(json_text(&required_fields)?)
        .bind(json_text(&risk_flags)?)
        .bind(json_text(&audit)?)
        .execute(&state.db)
        .await?;
        let app = ApplicationRow {
            id: app_id.clone(),
            dossier_id: dossier.id.clone(),
            batch_id: Some(batch_id.clone()),
            status: "prepared".into(),
            submit_mode: "browser-assisted".into(),
            prepared_answers: answers,
            packet_snapshot,
            required_fields,
            risk_flags,
            audit,
            created_at: now(),
            updated_at: now(),
        };
        log_sync(
            &state.db,
            "career_applications",
            &app_id,
            "INSERT",
            Some(&application_payload(&session.user_id, &app)),
        )
        .await?;
        applications.push(json!({
            "application": app,
            "dossier": dossier,
        }));
    }

    let approval_id = format!("appr_{}", random_uuid());
    let expires_at = (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339();
    let scope = prepare_batch_scope(&batch_id, &scoped_dossiers, max_submit_count);
    let diff = json!({ "applications": applications });
    let summary = format!(
        "Career Ops will open/fill up to {max_submit_count} approved applications and stop on login, captcha, SSN, payment, background-check consent, or unknown sensitive fields."
    );
    sqlx::query(
        "INSERT INTO approval_requests \
         (id, user_id, source, requester, action, target, risk, scope, summary, diff, policy, nonce_hash, status, expires_at, raw) \
         VALUES (?, ?, 'clawctrl', ?, ?, ?, 'high', ?, ?, ?, ?, ?, 'pending', ?, ?)",
    )
    .bind(&approval_id)
    .bind(&session.user_id)
    .bind(json_text(&json!({ "kind": "career_ops", "id": "career-ops", "display_name": "Career Ops" }))?)
    .bind(ACTION_APPLY_BATCH)
    .bind(json_text(&json!({ "kind": "career_application_batch", "batchId": batch_id }))?)
    .bind(json_text(&scope)?)
    .bind(&summary)
    .bind(json_text(&diff)?)
    .bind(json_text(&json!({ "decision": "ask", "rule_id": ACTION_APPLY_BATCH }))?)
    .bind(sha256_hex(&format!("nonce_{}", random_uuid())))
    .bind(&expires_at)
    .bind(json_text(&json!({ "createdBy": "career_ops" }))?)
    .execute(&state.db)
    .await?;

    Ok(success_json(json!({
        "batchId": batch_id,
        "applications": applications,
        "approval": {
            "id": format!("clawctrl:{approval_id}"),
            "action": ACTION_APPLY_BATCH,
            "summary": summary,
            "risk": "high",
            "status": "pending",
            "expiresAt": expires_at,
            "scope": scope,
        }
    })))
}

fn expiry_is_past(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&chrono::Utc) <= chrono::Utc::now())
        .unwrap_or(false)
}

fn string_set_from_json(value: &Value) -> HashSet<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn application_source_url(app: &ApplicationRow) -> Option<&str> {
    app.packet_snapshot
        .pointer("/dossier/sourceUrl")
        .or_else(|| app.packet_snapshot.pointer("/dossier/source_url"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|url| !url.is_empty())
}

fn validate_application_scope(
    scope: &Value,
    applications: &[ApplicationRow],
) -> Result<(), AppError> {
    let max_submit_count = scope["maxSubmitCount"]
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(0);
    if max_submit_count == 0 || applications.len() > max_submit_count {
        return Err(AppError::Forbidden(
            "capability max submit count exceeded".into(),
        ));
    }

    let approved_dossier_ids = string_set_from_json(&scope["dossierIds"]);
    if approved_dossier_ids.is_empty()
        || applications
            .iter()
            .any(|app| !approved_dossier_ids.contains(&app.dossier_id))
    {
        return Err(AppError::Forbidden(
            "capability dossier scope mismatch".into(),
        ));
    }

    let approved_urls = string_set_from_json(&scope["urls"]);
    for app in applications {
        if let Some(url) = application_source_url(app) {
            if !approved_urls.contains(url) {
                return Err(AppError::Forbidden("capability URL scope mismatch".into()));
            }
        }
    }

    Ok(())
}

fn stage_for_outcome(outcome: &str) -> Option<&'static str> {
    match outcome {
        "callback" | "interview" => Some("interviewing"),
        "offer" => Some("offer"),
        "rejection" | "ignored" => Some("archived"),
        _ => None,
    }
}

async fn list_outcomes(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<
        _,
        (
            String,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
            Option<String>,
            String,
            String,
            String,
            String,
        ),
    >(
        "SELECT id, dossier_id, application_id, outcome, callback_quality, pay, lesson, metadata, created_at, updated_at \
         FROM career_outcomes WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;
    let outcomes: Vec<OutcomeRow> = rows.into_iter().map(row_to_outcome).collect();
    Ok(success_json(json!({ "outcomes": outcomes })))
}

async fn execute_application_batch(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<ExecuteBatchBody>,
) -> Result<Json<Value>, AppError> {
    if body.capability.trim().is_empty() {
        return Err(AppError::Forbidden("approval capability required".into()));
    }
    let token_hash = sha256_hex(body.capability.trim());
    let cap = sqlx::query_as::<_, (String, String, String, String, String, String)>(
        "SELECT id, approval_id, action, scope, status, expires_at FROM capability_grants \
         WHERE token_hash = ? AND user_id = ? LIMIT 1",
    )
    .bind(token_hash)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Forbidden("approval capability not found".into()))?;
    let (capability_id, approval_id, action, scope_text, status, expires_at) = cap;
    if status != "active" {
        return Err(AppError::Forbidden(format!("capability is {status}")));
    }
    if expiry_is_past(&expires_at) {
        sqlx::query("UPDATE capability_grants SET status = 'expired' WHERE id = ? AND user_id = ?")
            .bind(&capability_id)
            .bind(&session.user_id)
            .execute(&state.db)
            .await?;
        return Err(AppError::Forbidden("capability expired".into()));
    }
    if action != ACTION_APPLY_BATCH {
        return Err(AppError::Forbidden("capability action mismatch".into()));
    }
    let scope = parse_json(&scope_text);
    if scope["batchId"].as_str() != Some(body.batch_id.as_str()) {
        return Err(AppError::Forbidden(
            "capability batch scope mismatch".into(),
        ));
    }

    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, String)>(
        "SELECT id, dossier_id, batch_id, status, submit_mode, prepared_answers, packet_snapshot, required_fields, risk_flags, audit, created_at, updated_at \
         FROM career_applications WHERE user_id = ? AND batch_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
    )
    .bind(&session.user_id)
    .bind(&body.batch_id)
    .fetch_all(&state.db)
    .await?;
    let mut applications: Vec<ApplicationRow> = rows.into_iter().map(row_to_application).collect();
    if applications.is_empty() {
        return Err(AppError::NotFound("batch applications not found".into()));
    }
    validate_application_scope(&scope, &applications)?;

    let event = json!({
        "at": now(),
        "event": "queued_for_browser_execution",
        "note": "Approved capability consumed. Browser executor may open/fill approved URLs and must stop on configured hard stops."
    });
    for app in &mut applications {
        let mut audit = app.audit.clone();
        if let Some(arr) = audit.as_array_mut() {
            arr.push(event.clone());
        } else {
            audit = json!([event]);
        }
        app.status = "queued_for_browser_submit".into();
        app.audit = audit;
        app.updated_at = now();
        sqlx::query(
            "UPDATE career_applications SET status = ?, audit = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        )
        .bind(&app.status)
        .bind(json_text(&app.audit)?)
        .bind(&app.updated_at)
        .bind(&app.id)
        .bind(&session.user_id)
        .execute(&state.db)
        .await?;
        log_sync(
            &state.db,
            "career_applications",
            &app.id,
            "UPDATE",
            Some(&application_payload(&session.user_id, app)),
        )
        .await?;
    }

    sqlx::query(
        "UPDATE capability_grants SET status = 'consumed', consumed_at = datetime('now'), consumed_by = 'career_ops', result_summary = ? WHERE id = ? AND user_id = ? AND status = 'active'",
    )
    .bind(format!("Queued {} Career Ops applications for browser execution", applications.len()))
    .bind(&capability_id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;
    sqlx::query(
        "UPDATE approval_requests SET status = 'consumed', resolved_at = COALESCE(resolved_at, datetime('now')), resolution_reason = 'career batch queued' WHERE id = ? AND user_id = ?",
    )
    .bind(&approval_id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    let mut browser_tasks = Vec::new();
    for app in &applications {
        let Some(url) = application_source_url(app) else {
            continue;
        };
        browser_tasks.push(json!({
            "applicationId": app.id,
            "dossierId": app.dossier_id,
            "company": app.packet_snapshot.pointer("/dossier/company").and_then(Value::as_str).unwrap_or(""),
            "role": app.packet_snapshot.pointer("/dossier/role").and_then(Value::as_str).unwrap_or(""),
            "url": url,
            "answers": app.prepared_answers,
            "requiredFields": app.required_fields,
            "hardStops": HARD_STOPS,
            "fillMode": "safe-no-submit-helper",
            "fillInstructions": "Paste this helper in the job page console only after reviewing the approved packet. It fills common non-sensitive fields, never submits, and stops when sensitive fields are detected.",
            "fillScript": browser_fill_helper_script(&app.prepared_answers)?,
        }));
    }

    Ok(success_json(json!({
        "batchId": body.batch_id,
        "status": "queued_for_browser_submit",
        "hardStops": HARD_STOPS,
        "applications": applications,
        "browserTasks": browser_tasks
    })))
}

async fn record_outcome(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<OutcomeBody>,
) -> Result<Json<Value>, AppError> {
    let outcome = body.outcome.trim().to_string();
    if outcome.is_empty() {
        return Err(AppError::BadRequest("outcome required".into()));
    }
    let id = format!("out_{}", random_uuid());
    let lesson = body.lesson.clone().unwrap_or_default();
    let metadata = body.metadata.unwrap_or_else(|| json!({}));
    sqlx::query(
        "INSERT INTO career_outcomes (id, user_id, dossier_id, application_id, outcome, callback_quality, pay, lesson, metadata) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(&body.dossier_id)
    .bind(&body.application_id)
    .bind(&outcome)
    .bind(&body.callback_quality)
    .bind(&body.pay)
    .bind(&lesson)
    .bind(json_text(&metadata)?)
    .execute(&state.db)
    .await?;
    if let Some(dossier_id) = body.dossier_id.as_ref() {
        if let Some(stage) = stage_for_outcome(&outcome) {
            sqlx::query(
                "UPDATE career_dossiers SET stage = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
            )
            .bind(stage)
            .bind(dossier_id)
            .bind(&session.user_id)
            .execute(&state.db)
            .await?;
        }
    }
    log_sync(
        &state.db,
        "career_outcomes",
        &id,
        "INSERT",
        Some(&json!({
            "id": id,
            "user_id": session.user_id,
            "dossier_id": body.dossier_id,
            "application_id": body.application_id,
            "outcome": outcome,
            "callback_quality": body.callback_quality,
            "pay": body.pay,
            "lesson": lesson,
            "metadata": metadata,
            "updated_at": now(),
        })),
    )
    .await?;
    Ok(success_json(json!({ "id": id })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_collapses_same_role_shape() {
        assert_eq!(
            normalize_fingerprint(
                "Planet Fitness",
                "Front Desk",
                "Fort Myers, FL",
                Some("https://x.test/job")
            ),
            normalize_fingerprint(
                "planet fitness",
                "Front Desk!",
                "Fort Myers FL",
                Some("https://x.test/job")
            )
        );
    }

    #[test]
    fn lanes_default_to_cash_now() {
        assert_eq!(normalize_lane(None), "cash-now");
        assert_eq!(normalize_lane(Some("career-track".into())), "engineering");
        assert_eq!(normalize_lane(Some("Trainer Growth".into())), "trainer");
    }

    #[test]
    fn stages_normalize_to_valid_pipeline_values() {
        assert_eq!(normalize_stage(None), "sourcing");
        assert_eq!(normalize_stage(Some("interview".into())), "interviewing");
        assert_eq!(normalize_stage(Some("rejected".into())), "archived");
        assert_eq!(normalize_stage(Some("follow-up".into())), "sourcing");
    }

    #[test]
    fn default_profile_sets_cash_now_floor() {
        let profile = default_profile_payload("user_1");
        assert_eq!(profile["payFloors"]["cash-now"], json!(18));
        assert_eq!(profile["availability"], json!("Flexible ASAP"));
    }

    #[test]
    fn default_dossier_recommendation_matches_frontend_domain() {
        assert_eq!(DEFAULT_DOSSIER_RECOMMENDATION, "pursue");
    }

    #[test]
    fn application_row_preserves_audit_events() {
        let app = row_to_application((
            "app_1".into(),
            "dos_1".into(),
            Some("batch_1".into()),
            "queued_for_browser_submit".into(),
            "browser-assisted".into(),
            json!({}).to_string(),
            json!({ "dossier": { "sourceUrl": "https://example.com/apply" } }).to_string(),
            json!(["resume"]).to_string(),
            json!([]).to_string(),
            json!([{ "event": "browser_opened" }]).to_string(),
            "2026-05-13T12:00:00Z".into(),
            "2026-05-13T12:00:00Z".into(),
        ));

        assert_eq!(app.audit[0]["event"], json!("browser_opened"));
    }

    fn test_application(dossier_id: &str, url: &str) -> ApplicationRow {
        ApplicationRow {
            id: format!("app_{dossier_id}"),
            dossier_id: dossier_id.to_string(),
            batch_id: Some("batch_1".into()),
            status: "prepared".into(),
            submit_mode: "browser-assisted".into(),
            prepared_answers: json!({}),
            packet_snapshot: json!({
                "dossier": {
                    "company": "Test Co",
                    "role": "Front Desk",
                    "sourceUrl": url,
                }
            }),
            required_fields: json!([]),
            risk_flags: json!([]),
            audit: json!([]),
            created_at: now(),
            updated_at: now(),
        }
    }

    fn test_dossier(id: &str, url: Option<&str>) -> DossierRow {
        DossierRow {
            id: id.to_string(),
            company: "Test Co".into(),
            role: "Front Desk".into(),
            location: "Fort Myers, FL".into(),
            lane: "cash-now".into(),
            stage: "sourcing".into(),
            source: json!({ "kind": "manual", "label": "Test" }),
            source_url: url.map(ToOwned::to_owned),
            score: 80,
            recommendation: "pursue".into(),
            next_action: "Apply today".into(),
            due: "Today".into(),
            salary_text: "$18/hr".into(),
            estimated_hourly_rate: Some(18.0),
            summary: "Fast-hire test role".into(),
            tags: json!(["cash-now"]),
            notes: String::new(),
            evaluation: json!({}),
            assets: json!({}),
            timeline: json!([]),
            fingerprint: format!("fp_{id}"),
            created_at: now(),
            updated_at: now(),
        }
    }

    #[test]
    fn prepare_batch_scope_uses_only_prepared_dossiers() {
        let first = test_dossier("dos_1", Some("https://approved.example/job"));
        let second = test_dossier("dos_2", Some("https://not-in-this-batch.example/job"));
        let scoped = vec![&first];
        let scope = prepare_batch_scope("batch_1", &scoped, 1);

        assert_eq!(scope["dossierIds"], json!(["dos_1"]));
        assert_eq!(scope["urls"], json!(["https://approved.example/job"]));
        assert_eq!(scope["maxSubmitCount"], json!(1));
        assert_eq!(scope["noCredentialRelease"], json!(true));
        assert_eq!(scope["hardStops"], json!(HARD_STOPS));
        assert!(!scope["dossierIds"]
            .as_array()
            .unwrap()
            .contains(&json!(second.id)));
    }

    #[test]
    fn application_scope_rejects_unapproved_url() {
        let scope = json!({
            "dossierIds": ["dos_1"],
            "urls": ["https://approved.example/job"],
            "maxSubmitCount": 1,
        });
        let apps = vec![test_application("dos_1", "https://other.example/job")];

        assert!(validate_application_scope(&scope, &apps).is_err());
    }

    #[test]
    fn application_scope_rejects_unapproved_dossier_and_over_limit_batch() {
        let scope = json!({
            "dossierIds": ["dos_1"],
            "urls": ["https://approved.example/job"],
            "maxSubmitCount": 1,
        });

        assert!(validate_application_scope(
            &scope,
            &[test_application("dos_2", "https://approved.example/job")]
        )
        .is_err());
        assert!(validate_application_scope(
            &scope,
            &[
                test_application("dos_1", "https://approved.example/job"),
                test_application("dos_1", "https://approved.example/job"),
            ],
        )
        .is_err());
    }

    #[test]
    fn application_scope_accepts_exact_dossier_and_url() {
        let scope = json!({
            "dossierIds": ["dos_1"],
            "urls": ["https://approved.example/job"],
            "maxSubmitCount": 1,
            "noCredentialRelease": true,
            "hardStops": HARD_STOPS,
        });
        let apps = vec![test_application("dos_1", "https://approved.example/job")];

        assert_eq!(scope["noCredentialRelease"], json!(true));
        assert_eq!(scope["hardStops"], json!(HARD_STOPS));
        assert!(validate_application_scope(&scope, &apps).is_ok());
    }

    #[test]
    fn browser_fill_helper_never_submits_and_has_hard_stops() {
        let script = browser_fill_helper_script(&json!({
            "coverNote": "Fast hire note",
            "availability": "Flexible ASAP",
            "desiredPay": "$18/hr+",
            "links": { "github": "https://github.com/example" }
        }))
        .expect("script");

        assert!(script.contains("submitted: false"));
        assert!(script.contains("hardStopPattern"));
        assert!(script.contains("social security"));
        assert!(!script.contains(".submit("));
    }

    #[test]
    fn outcome_stage_mapping_uses_valid_pipeline_stages() {
        assert_eq!(stage_for_outcome("callback"), Some("interviewing"));
        assert_eq!(stage_for_outcome("interview"), Some("interviewing"));
        assert_eq!(stage_for_outcome("offer"), Some("offer"));
        assert_eq!(stage_for_outcome("rejection"), Some("archived"));
        assert_eq!(stage_for_outcome("ignored"), Some("archived"));
        assert_eq!(stage_for_outcome("unknown"), None);
    }

    #[test]
    fn outcome_row_parses_metadata_for_learning_loop() {
        let outcome = row_to_outcome((
            "out_1".into(),
            Some("dos_1".into()),
            None,
            "callback".into(),
            Some("good".into()),
            Some("$18/hr".into()),
            "Evening server roles got callbacks.".into(),
            json!({ "lane": "cash-now", "source": "Indeed", "query": "server part time" })
                .to_string(),
            "2026-05-12T12:00:00Z".into(),
            "2026-05-12T12:00:00Z".into(),
        ));

        assert_eq!(outcome.outcome, "callback");
        assert_eq!(outcome.metadata["query"], json!("server part time"));
    }

    #[test]
    fn search_run_row_parses_audit_payloads() {
        let run = row_to_search_run((
            "run_1".into(),
            "cash-now".into(),
            "part time Fort Myers $18".into(),
            json!(["remotive", "browser"]).to_string(),
            json!({ "source": "public-feeds-plus-browser-links" }).to_string(),
            12,
            json!(["fingerprint-1"]).to_string(),
            json!(["dos_1"]).to_string(),
            "2026-05-13T12:00:00Z".into(),
            "2026-05-13T12:00:00Z".into(),
        ));

        assert_eq!(run.lane, "cash-now");
        assert_eq!(run.result_count, 12);
        assert_eq!(run.source_set, json!(["remotive", "browser"]));
        assert_eq!(run.created_dossier_ids, json!(["dos_1"]));
    }

    #[test]
    fn career_migrations_cover_local_and_supabase_schema() {
        const LOCAL: &str = include_str!("../../migrations/0023_career_ops.sql");
        const SUPABASE: &str =
            include_str!("../../../supabase/migrations/20260512000000_career_ops.sql");
        let required_tables = [
            "career_profiles",
            "career_dossiers",
            "career_applications",
            "career_saved_searches",
            "career_outcomes",
            "career_search_runs",
        ];

        for table in required_tables {
            assert!(LOCAL.contains(&format!("CREATE TABLE IF NOT EXISTS {table}")));
            assert!(SUPABASE.contains(&format!("CREATE TABLE IF NOT EXISTS {table}")));
            assert!(SUPABASE.contains(&format!("ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")));
            assert!(SUPABASE.contains(&format!("GRANT SELECT")));
        }

        for lane in ["cash-now", "engineering", "trainer"] {
            assert!(LOCAL.contains(lane));
            assert!(SUPABASE.contains(lane));
        }

        for stage in ["sourcing", "applied", "interviewing", "offer", "archived"] {
            assert!(LOCAL.contains(stage));
            assert!(SUPABASE.contains(stage));
        }

        assert!(SUPABASE.contains("REFERENCES auth.users(id)"));
        assert!(SUPABASE.contains("auth.uid() = user_id"));
        assert!(SUPABASE.contains("GRANT SELECT, INSERT, UPDATE, DELETE"));
    }
}
