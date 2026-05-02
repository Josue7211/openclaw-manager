use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

use crate::error::AppError;
use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/rag/status", get(rag_status))
        .route("/rag/search", post(rag_search))
        .route("/rag/graph/labels", get(rag_graph_labels))
        .route("/rag/graph", get(rag_graph))
}

#[derive(Debug, Deserialize)]
struct RagSearchBody {
    query: String,
    limit: Option<usize>,
    project: Option<String>,
    namespace: Option<String>,
    mode: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RagLabelsQuery {
    q: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct RagGraphQuery {
    label: String,
    max_depth: Option<usize>,
    max_nodes: Option<usize>,
}

fn rag_base_url(state: &AppState) -> Option<String> {
    ["LIGHTRAG_BASE_URL", "MEMD_RAG_URL", "RAG_URL"]
        .iter()
        .filter_map(|key| state.secret(key))
        .chain(
            ["LIGHTRAG_BASE_URL", "MEMD_RAG_URL", "RAG_URL"]
                .iter()
                .filter_map(|key| dotenvy::var(key).ok()),
        )
        .chain(
            ["LIGHTRAG_BASE_URL", "MEMD_RAG_URL", "RAG_URL"]
                .iter()
                .filter_map(|key| read_dev_env_value(key)),
        )
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .find(|value| !value.is_empty())
}

fn rag_api_key(state: &AppState) -> Option<String> {
    state
        .secret("LIGHTRAG_API_KEY")
        .or_else(|| dotenvy::var("LIGHTRAG_API_KEY").ok())
        .or_else(|| read_dev_env_value("LIGHTRAG_API_KEY"))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_dev_env_value(key: &str) -> Option<String> {
    for path in [".env.local", "../.env.local"] {
        let Ok(iter) = dotenvy::from_filename_iter(path) else {
            continue;
        };
        for item in iter.flatten() {
            if item.0 == key && !item.1.trim().is_empty() {
                return Some(item.1);
            }
        }
    }
    None
}

fn rag_request(state: &AppState, method: reqwest::Method, url: String) -> reqwest::RequestBuilder {
    let mut req = state.http.request(method, url);
    if let Some(api_key) = rag_api_key(state) {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }
    req
}

async fn fetch_json(state: &AppState, url: String) -> Result<Value, reqwest::Error> {
    rag_request(state, reqwest::Method::GET, url)
        .timeout(Duration::from_secs(5))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}

async fn rag_status(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let Some(base_url) = rag_base_url(&state) else {
        return Ok(Json(json!({
            "ok": true,
            "configured": false,
            "reachable": false,
            "backend": null,
            "baseUrl": null,
        })));
    };

    let sidecar_url = format!("{base_url}/healthz");
    if let Ok(health) = fetch_json(&state, sidecar_url).await {
        return Ok(Json(json!({
            "ok": true,
            "configured": true,
            "reachable": true,
            "backend": "memd-sidecar",
            "baseUrl": base_url,
            "health": health,
        })));
    }

    let health = fetch_json(&state, format!("{base_url}/health")).await.ok();
    let counts = fetch_json(&state, format!("{base_url}/documents/status_counts"))
        .await
        .ok();
    let reachable = health.is_some() || counts.is_some();

    Ok(Json(json!({
        "ok": true,
        "configured": true,
        "reachable": reachable,
        "backend": if reachable { "lightrag" } else { "unknown" },
        "baseUrl": base_url,
        "health": health,
        "statusCounts": counts,
    })))
}

async fn rag_search(
    State(state): State<AppState>,
    Json(body): Json<RagSearchBody>,
) -> Result<Json<Value>, AppError> {
    let query = body.query.trim();
    if query.len() < 2 {
        return Err(AppError::BadRequest(
            "query must be at least 2 characters".into(),
        ));
    }
    let Some(base_url) = rag_base_url(&state) else {
        return Err(AppError::BadRequest(
            "LightRAG is not configured. Set LIGHTRAG_BASE_URL or MEMD_RAG_URL.".into(),
        ));
    };

    let limit = body.limit.unwrap_or(10).clamp(1, 50);
    if let Ok(results) = search_sidecar(&state, &base_url, &body, query, limit).await {
        return Ok(Json(json!({
            "ok": true,
            "backend": "memd-sidecar",
            "results": results,
            "data": { "results": results },
        })));
    }

    let results = search_lightrag(&state, &base_url, query, limit).await?;
    Ok(Json(json!({
        "ok": true,
        "backend": "lightrag",
        "results": results,
        "data": { "results": results },
    })))
}

async fn rag_graph_labels(
    State(state): State<AppState>,
    Query(params): Query<RagLabelsQuery>,
) -> Result<Json<Value>, AppError> {
    let Some(base_url) = rag_base_url(&state) else {
        return Err(AppError::BadRequest(
            "LightRAG is not configured. Set LIGHTRAG_BASE_URL or MEMD_RAG_URL.".into(),
        ));
    };

    let limit = params.limit.unwrap_or(50).clamp(1, 100);
    let url = if let Some(q) = params.q.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        format!(
            "{base_url}/graph/label/search?q={}&limit={limit}",
            urlencoding::encode(q)
        )
    } else {
        format!("{base_url}/graph/label/popular?limit={limit}")
    };
    let labels = fetch_json(&state, url).await.map_err(|error| {
        tracing::warn!(error = %error, "LightRAG graph labels request failed");
        AppError::BadRequest("LightRAG graph labels are unreachable".into())
    })?;
    Ok(Json(json!({
        "ok": true,
        "backend": "lightrag",
        "labels": labels,
    })))
}

async fn rag_graph(
    State(state): State<AppState>,
    Query(params): Query<RagGraphQuery>,
) -> Result<Json<Value>, AppError> {
    let label = params.label.trim();
    if label.is_empty() {
        return Err(AppError::BadRequest("graph label required".into()));
    }
    let Some(base_url) = rag_base_url(&state) else {
        return Err(AppError::BadRequest(
            "LightRAG is not configured. Set LIGHTRAG_BASE_URL or MEMD_RAG_URL.".into(),
        ));
    };

    let max_depth = params.max_depth.unwrap_or(2).clamp(1, 5);
    let max_nodes = params.max_nodes.unwrap_or(120).clamp(1, 500);
    let url = format!(
        "{base_url}/graphs?label={}&max_depth={max_depth}&max_nodes={max_nodes}",
        urlencoding::encode(label)
    );
    let graph = fetch_json(&state, url).await.map_err(|error| {
        tracing::warn!(error = %error, "LightRAG graph request failed");
        AppError::BadRequest("LightRAG graph is unreachable".into())
    })?;
    Ok(Json(json!({
        "ok": true,
        "backend": "lightrag",
        "label": label,
        "graph": graph,
    })))
}

async fn search_sidecar(
    state: &AppState,
    base_url: &str,
    body: &RagSearchBody,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, AppError> {
    let mode = body.mode.as_deref().unwrap_or("auto");
    let payload = json!({
        "query": query,
        "project": body.project.clone(),
        "namespace": body.namespace.clone(),
        "mode": mode,
        "limit": limit,
        "include_cross_modal": true,
    });
    let value = post_json(state, format!("{base_url}/v1/retrieve"), payload).await?;
    let items = value
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(items
        .into_iter()
        .enumerate()
        .map(|(index, item)| {
            let content = item
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let source = item.get("source").and_then(Value::as_str).unwrap_or("");
            json!({
                "name": if source.is_empty() { format!("LightRAG result {}", index + 1) } else { source.to_string() },
                "path": source,
                "content": content,
                "snippet": snippet(&content),
                "score": item.get("score").and_then(Value::as_f64).unwrap_or(0.0),
            })
        })
        .collect())
}

async fn search_lightrag(
    state: &AppState,
    base_url: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, AppError> {
    let payload = json!({
        "query": query,
        "mode": "hybrid",
        "top_k": limit,
    });
    let value = post_json(state, format!("{base_url}/query"), payload).await?;
    Ok(normalize_lightrag_results(value, limit))
}

async fn post_json(state: &AppState, url: String, payload: Value) -> Result<Value, AppError> {
    let response = rag_request(state, reqwest::Method::POST, url)
        .timeout(Duration::from_secs(45))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(error = %error, "RAG request failed");
            AppError::BadRequest("LightRAG is unreachable".into())
        })?;

    if response.status() == StatusCode::NOT_FOUND {
        return Err(AppError::BadRequest("RAG endpoint not found".into()));
    }
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(%status, body = %crate::routes::gateway::sanitize_error_body(&body), "RAG request returned non-success");
        return Err(AppError::BadRequest("LightRAG request failed".into()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| AppError::Internal(error.into()))
}

fn normalize_lightrag_results(value: Value, limit: usize) -> Vec<Value> {
    if let Some(results) = value
        .get("results")
        .or_else(|| value.get("items"))
        .and_then(Value::as_array)
    {
        return results
            .iter()
            .take(limit)
            .enumerate()
            .map(|(index, item)| normalize_result_item(item, index))
            .collect();
    }

    let text = value
        .as_str()
        .map(str::to_string)
        .or_else(|| {
            value
                .get("response")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            value
                .get("answer")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            value
                .get("data")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| value.to_string());

    if text.trim().is_empty() {
        Vec::new()
    } else {
        vec![json!({
            "name": "LightRAG answer",
            "path": "",
            "content": text,
            "snippet": snippet(&text),
            "score": 1.0,
        })]
    }
}

fn normalize_result_item(item: &Value, index: usize) -> Value {
    let content = ["content", "text", "chunk_content", "snippet", "description"]
        .iter()
        .filter_map(|key| item.get(*key).and_then(Value::as_str))
        .find(|value| !value.trim().is_empty())
        .unwrap_or("")
        .to_string();
    let source = ["source", "source_id", "file_path", "path", "id"]
        .iter()
        .filter_map(|key| item.get(*key).and_then(Value::as_str))
        .find(|value| !value.trim().is_empty())
        .unwrap_or("");
    json!({
        "name": if source.is_empty() { format!("LightRAG result {}", index + 1) } else { source.to_string() },
        "path": source,
        "content": content,
        "snippet": snippet(&content),
        "score": item.get("score").or_else(|| item.get("similarity")).and_then(Value::as_f64).unwrap_or(0.0),
    })
}

fn snippet(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= 240 {
        trimmed.to_string()
    } else {
        format!("{}...", trimmed.chars().take(240).collect::<String>())
    }
}
