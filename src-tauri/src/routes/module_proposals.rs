use axum::{
    extract::{Path, State},
    routing::{get, patch},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteRow, FromRow, Row};

use crate::error::{success_json, AppError};
use crate::server::AppState;

const LOCAL_MODULE_PROPOSALS_OWNER_ID: &str = "__desktop_local__";

#[derive(Debug)]
struct ProposalRow {
    id: String,
    user_id: String,
    title: String,
    description: String,
    user_intent: String,
    target_type: String,
    install_target: String,
    category: String,
    status: String,
    proposal_json: String,
    backend_contract_requested: i64,
    backend_contract_summary: String,
    backend_contract_json: String,
    source_model: Option<String>,
    generator: Option<String>,
    installed_module_id: Option<String>,
    created_at: String,
    updated_at: String,
}

impl<'r> FromRow<'r, SqliteRow> for ProposalRow {
    fn from_row(row: &'r SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            user_id: row.try_get("user_id")?,
            title: row.try_get("title")?,
            description: row.try_get("description")?,
            user_intent: row.try_get("user_intent")?,
            target_type: row.try_get("target_type")?,
            install_target: row.try_get("install_target")?,
            category: row.try_get("category")?,
            status: row.try_get("status")?,
            proposal_json: row.try_get("proposal_json")?,
            backend_contract_requested: row.try_get("backend_contract_requested")?,
            backend_contract_summary: row.try_get("backend_contract_summary")?,
            backend_contract_json: row.try_get("backend_contract_json")?,
            source_model: row.try_get("source_model")?,
            generator: row.try_get("generator")?,
            installed_module_id: row.try_get("installed_module_id")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }
}

fn proposal_row_to_json(row: &ProposalRow) -> Value {
    let proposal_json =
        serde_json::from_str::<Value>(&row.proposal_json).unwrap_or_else(|_| json!({}));
    let backend_contract_json =
        serde_json::from_str::<Value>(&row.backend_contract_json).unwrap_or_else(|_| json!({}));
    let backend_contract_has_data = row.backend_contract_requested != 0
        || !row.backend_contract_summary.is_empty()
        || backend_contract_json
            .as_object()
            .map(|map| !map.is_empty())
            .unwrap_or(false);
    let backend_contract = if backend_contract_has_data {
        json!({
            "requested": row.backend_contract_requested != 0,
            "summary": row.backend_contract_summary,
            "models": backend_contract_json.get("models").cloned().unwrap_or_else(|| json!([])),
            "queries": backend_contract_json.get("queries").cloned().unwrap_or_else(|| json!([])),
            "mutations": backend_contract_json.get("mutations").cloned().unwrap_or_else(|| json!([])),
        })
    } else {
        Value::Null
    };
    json!({
        "id": &row.id,
        "userId": &row.user_id,
        "title": &row.title,
        "description": &row.description,
        "userIntent": &row.user_intent,
        "targetType": &row.target_type,
        "installTarget": &row.install_target,
        "category": &row.category,
        "status": &row.status,
        "proposal": proposal_json,
        "backendContract": backend_contract,
        "sourceModel": &row.source_model,
        "generator": &row.generator,
        "installedModuleId": &row.installed_module_id,
        "createdAt": &row.created_at,
        "updatedAt": &row.updated_at,
    })
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/module-proposals",
            get(list_module_proposals).post(create_module_proposal),
        )
        .route(
            "/module-proposals/{id}/status",
            patch(update_module_proposal_status),
        )
}

async fn list_module_proposals(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let rows: Vec<ProposalRow> = sqlx::query_as(
        "SELECT id, user_id, title, description, user_intent, target_type, install_target, \
         category, status, proposal_json, backend_contract_requested, backend_contract_summary, \
         backend_contract_json, source_model, generator, installed_module_id, created_at, updated_at \
         FROM module_proposals \
         WHERE user_id = ? AND deleted_at IS NULL \
         ORDER BY updated_at DESC",
    )
    .bind(LOCAL_MODULE_PROPOSALS_OWNER_ID)
    .fetch_all(&state.db)
    .await?;

    let proposals: Vec<Value> = rows.iter().map(proposal_row_to_json).collect();
    Ok(success_json(json!({ "proposals": proposals })))
}

#[derive(Debug, Deserialize)]
struct CreateModuleProposalBody {
    proposal: Value,
    status: Option<String>,
}

async fn create_module_proposal(
    State(state): State<AppState>,
    Json(body): Json<CreateModuleProposalBody>,
) -> Result<Json<Value>, AppError> {
    let title = body
        .proposal
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let description = body
        .proposal
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let user_intent = body
        .proposal
        .get("userIntent")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let target_type = body
        .proposal
        .get("targetType")
        .and_then(Value::as_str)
        .unwrap_or("widget")
        .to_string();
    let install_target = body
        .proposal
        .get("installTarget")
        .and_then(Value::as_str)
        .unwrap_or("dashboard")
        .to_string();
    let category = body
        .proposal
        .get("category")
        .and_then(Value::as_str)
        .unwrap_or("custom")
        .to_string();
    let backend_contract = body
        .proposal
        .get("backendContract")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let backend_contract_requested = backend_contract
        .get("requested")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let backend_contract_summary = backend_contract
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let source_model = body
        .proposal
        .get("sourceModel")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let generator = body
        .proposal
        .get("generator")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);

    if title.is_empty() {
        return Err(AppError::BadRequest("proposal.title required".into()));
    }

    let status = body.status.unwrap_or_else(|| "draft".to_string());
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let proposal_json = body.proposal.to_string();
    let backend_contract_json = backend_contract.to_string();

    sqlx::query(
        "INSERT INTO module_proposals \
         (id, user_id, title, description, user_intent, target_type, install_target, category, \
          status, proposal_json, backend_contract_requested, backend_contract_summary, backend_contract_json, \
          source_model, generator, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(LOCAL_MODULE_PROPOSALS_OWNER_ID)
    .bind(&title)
    .bind(&description)
    .bind(&user_intent)
    .bind(&target_type)
    .bind(&install_target)
    .bind(&category)
    .bind(&status)
    .bind(&proposal_json)
    .bind(if backend_contract_requested { 1 } else { 0 })
    .bind(&backend_contract_summary)
    .bind(&backend_contract_json)
    .bind(source_model.as_deref())
    .bind(generator.as_deref())
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(success_json(json!({
        "proposal": {
            "id": id,
            "userId": LOCAL_MODULE_PROPOSALS_OWNER_ID,
            "title": title,
            "description": description,
            "userIntent": user_intent,
            "targetType": target_type,
            "installTarget": install_target,
            "category": category,
            "status": status,
            "proposal": body.proposal,
            "backendContract": backend_contract,
            "sourceModel": source_model,
            "generator": generator,
            "installedModuleId": Value::Null,
            "createdAt": now,
            "updatedAt": now,
        }
    })))
}

#[derive(Debug, Deserialize)]
struct UpdateModuleProposalStatusBody {
    status: String,
    #[serde(rename = "installedModuleId")]
    installed_module_id: Option<String>,
}

async fn update_module_proposal_status(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<UpdateModuleProposalStatusBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&id)?;

    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE module_proposals \
         SET status = ?, installed_module_id = COALESCE(?, installed_module_id), updated_at = ? \
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(&body.status)
    .bind(body.installed_module_id.as_deref())
    .bind(&now)
    .bind(&id)
    .bind(LOCAL_MODULE_PROPOSALS_OWNER_ID)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Proposal not found".into()));
    }

    let row: ProposalRow = sqlx::query_as(
        "SELECT id, user_id, title, description, user_intent, target_type, install_target, \
         category, status, proposal_json, backend_contract_requested, backend_contract_summary, \
         backend_contract_json, source_model, generator, installed_module_id, created_at, updated_at \
         FROM module_proposals WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(&id)
    .bind(LOCAL_MODULE_PROPOSALS_OWNER_ID)
    .fetch_one(&state.db)
    .await?;

    Ok(success_json(
        json!({ "proposal": proposal_row_to_json(&row) }),
    ))
}
