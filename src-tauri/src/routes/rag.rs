use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use std::time::Duration;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

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
            "configured": true,
            "reachable": true,
            "backend": "memd-local",
            "baseUrl": null,
            "health": {
                "ok": true,
                "provider": "local",
                "storage": "memd",
            },
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
    RequireAuth(session): RequireAuth,
    Json(body): Json<RagSearchBody>,
) -> Result<Json<Value>, AppError> {
    let query = body.query.trim();
    if query.len() < 2 {
        return Err(AppError::BadRequest(
            "query must be at least 2 characters".into(),
        ));
    }
    let limit = body.limit.unwrap_or(10).clamp(1, 50);
    let Some(base_url) = rag_base_url(&state) else {
        let results = search_local_memd(&state, &session.user_id, query, limit).await?;
        return Ok(Json(json!({
            "ok": true,
            "backend": "memd-local",
            "results": results,
            "data": { "results": results },
        })));
    };

    if let Ok(results) = search_sidecar(&state, &base_url, &body, query, limit).await {
        return Ok(Json(json!({
            "ok": true,
            "backend": "memd-sidecar",
            "results": results,
            "data": { "results": results },
        })));
    }

    let (backend, results) = match search_lightrag(&state, &base_url, query, limit).await {
        Ok(results) => ("lightrag", results),
        Err(error) => {
            tracing::warn!("External RAG failed, falling back to local memd: {error:?}");
            (
                "memd-local",
                search_local_memd(&state, &session.user_id, query, limit).await?,
            )
        }
    };
    Ok(Json(json!({
        "ok": true,
        "backend": backend,
        "results": results,
        "data": { "results": results },
    })))
}

async fn rag_graph_labels(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<RagLabelsQuery>,
) -> Result<Json<Value>, AppError> {
    let Some(base_url) = rag_base_url(&state) else {
        let labels =
            local_memd_labels(&state, &session.user_id, params.q.as_deref(), params.limit).await?;
        return Ok(Json(json!({
            "ok": true,
            "backend": "memd-local",
            "labels": labels,
        })));
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
    let (backend, labels) = match fetch_json(&state, url).await {
        Ok(labels) => ("lightrag", labels),
        Err(error) => {
            tracing::warn!(error = %error, "LightRAG graph labels request failed; using local memd labels");
            (
                "memd-local",
                json!(
                    local_memd_labels(&state, &session.user_id, params.q.as_deref(), params.limit)
                        .await?
                ),
            )
        }
    };
    Ok(Json(json!({
        "ok": true,
        "backend": backend,
        "labels": labels,
    })))
}

async fn rag_graph(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<RagGraphQuery>,
) -> Result<Json<Value>, AppError> {
    let label = params.label.trim();
    if label.is_empty() {
        return Err(AppError::BadRequest("graph label required".into()));
    }
    let Some(base_url) = rag_base_url(&state) else {
        let graph = local_memd_graph(&state, &session.user_id, label, params.max_nodes).await?;
        return Ok(Json(json!({
            "ok": true,
            "backend": "memd-local",
            "label": label,
            "graph": graph,
        })));
    };

    let max_depth = params.max_depth.unwrap_or(2).clamp(1, 5);
    let max_nodes = params.max_nodes.unwrap_or(120).clamp(1, 500);
    let url = format!(
        "{base_url}/graphs?label={}&max_depth={max_depth}&max_nodes={max_nodes}",
        urlencoding::encode(label)
    );
    let (backend, graph) = match fetch_json(&state, url).await {
        Ok(graph) => ("lightrag", graph),
        Err(error) => {
            tracing::warn!(error = %error, "LightRAG graph request failed; using local memd graph");
            (
                "memd-local",
                local_memd_graph(&state, &session.user_id, label, params.max_nodes).await?,
            )
        }
    };
    Ok(Json(json!({
        "ok": true,
        "backend": backend,
        "label": label,
        "graph": graph,
    })))
}

async fn search_local_memd(
    state: &AppState,
    user_id: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT e.id, e.kind, e.title, e.content, e.summary, e.source, e.confidence, \
         e.priority, e.updated_at, s.scope_kind, s.scope_name \
         FROM memd_entries e \
         JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
         WHERE e.user_id = ? AND e.status = 'active' \
         ORDER BY e.priority DESC, e.updated_at DESC \
         LIMIT 250",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    let needle = query.trim().to_lowercase();
    let mut scored = Vec::new();
    for row in rows {
        let title: String = row.try_get("title")?;
        let content: String = row.try_get("content")?;
        let summary: String = row.try_get("summary")?;
        let kind: String = row.try_get("kind")?;
        let source: String = row.try_get("source")?;
        let scope_kind: String = row.try_get("scope_kind")?;
        let scope_name: String = row.try_get("scope_name")?;
        let haystack =
            format!("{title} {summary} {content} {kind} {source} {scope_kind} {scope_name}")
                .to_lowercase();
        if !haystack.contains(&needle) {
            continue;
        }

        let priority: i64 = row.try_get("priority")?;
        let confidence: i64 = row.try_get("confidence")?;
        let mut score = priority.max(0) as f64 / 100.0 + confidence.max(0) as f64 / 100.0;
        if title.to_lowercase().contains(&needle) {
            score += 0.7;
        }
        if summary.to_lowercase().contains(&needle) {
            score += 0.45;
        }
        if content.to_lowercase().contains(&needle) {
            score += 0.25;
        }
        if kind.to_lowercase().contains(&needle) || scope_name.to_lowercase().contains(&needle) {
            score += 0.15;
        }

        let id: String = row.try_get("id")?;
        let body = if summary.trim().is_empty() {
            content.clone()
        } else {
            summary.clone()
        };
        scored.push((
            score,
            json!({
                "name": title,
                "path": format!("memd/{scope_kind}/{scope_name}/{id}"),
                "content": content,
                "snippet": snippet(&body),
                "score": score,
                "backend": "memd-local",
                "kind": kind,
                "source": source,
                "scope": {
                    "kind": scope_kind,
                    "name": scope_name,
                },
            }),
        ));
    }

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    Ok(scored
        .into_iter()
        .take(limit)
        .map(|(_, value)| value)
        .collect())
}

async fn local_memd_labels(
    state: &AppState,
    user_id: &str,
    query: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<String>, AppError> {
    let limit = limit.unwrap_or(50).clamp(1, 100);
    let rows = sqlx::query(
        "SELECT e.title, e.kind, s.scope_name \
         FROM memd_entries e \
         JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
         WHERE e.user_id = ? AND e.status = 'active' \
         ORDER BY e.priority DESC, e.updated_at DESC \
         LIMIT 300",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    let needle = query.unwrap_or_default().trim().to_lowercase();
    let mut labels: Vec<String> = Vec::new();
    for row in rows {
        for key in ["title", "kind", "scope_name"] {
            let value: String = row.try_get(key)?;
            let label = value.trim();
            if label.is_empty() || labels.iter().any(|existing| existing == label) {
                continue;
            }
            if !needle.is_empty() && !label.to_lowercase().contains(&needle) {
                continue;
            }
            labels.push(label.to_string());
            if labels.len() >= limit {
                return Ok(labels);
            }
        }
    }
    Ok(labels)
}

async fn local_memd_graph(
    state: &AppState,
    user_id: &str,
    label: &str,
    max_nodes: Option<usize>,
) -> Result<Value, AppError> {
    let max_nodes = max_nodes.unwrap_or(120).clamp(1, 500);
    let needle = label.trim().to_lowercase();
    let rows = sqlx::query(
        "SELECT e.id, e.kind, e.title, e.summary, e.content, s.scope_kind, s.scope_name \
         FROM memd_entries e \
         JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
         WHERE e.user_id = ? AND e.status = 'active' \
         ORDER BY e.priority DESC, e.updated_at DESC \
         LIMIT 300",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    let mut nodes = vec![json!({
        "id": label,
        "labels": [label],
        "properties": {
            "description": "Local memd graph seed",
            "entity_type": "seed",
        },
    })];
    let mut edges = Vec::new();
    let mut is_truncated = false;

    for row in rows {
        if nodes.len() >= max_nodes {
            is_truncated = true;
            break;
        }
        let id: String = row.try_get("id")?;
        let title: String = row.try_get("title")?;
        let summary: String = row.try_get("summary")?;
        let content: String = row.try_get("content")?;
        let kind: String = row.try_get("kind")?;
        let scope_kind: String = row.try_get("scope_kind")?;
        let scope_name: String = row.try_get("scope_name")?;
        let haystack =
            format!("{title} {summary} {content} {kind} {scope_kind} {scope_name}").to_lowercase();
        if !needle.is_empty() && !haystack.contains(&needle) {
            continue;
        }

        let entry_node_id = format!("memd:{id}");
        nodes.push(json!({
            "id": entry_node_id,
            "labels": [title],
            "properties": {
                "description": if summary.trim().is_empty() { snippet(&content) } else { summary },
                "entity_type": kind,
            },
        }));
        edges.push(json!({
            "id": format!("seed:{id}"),
            "source": label,
            "target": entry_node_id,
            "properties": {
                "description": "matches",
                "weight": 1.0,
            },
        }));

        if nodes.len() >= max_nodes {
            is_truncated = true;
            break;
        }
        let scope_node_id = format!("scope:{scope_kind}:{scope_name}");
        if !nodes
            .iter()
            .any(|node| node.get("id").and_then(Value::as_str) == Some(scope_node_id.as_str()))
        {
            nodes.push(json!({
                "id": scope_node_id,
                "labels": [scope_name],
                "properties": {
                    "description": scope_kind,
                    "entity_type": "scope",
                },
            }));
        }
        edges.push(json!({
            "id": format!("scope:{id}"),
            "source": entry_node_id,
            "target": scope_node_id,
            "properties": {
                "description": "stored in",
                "weight": 0.6,
            },
        }));
    }

    Ok(json!({
        "nodes": nodes,
        "edges": edges,
        "is_truncated": is_truncated,
    }))
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
