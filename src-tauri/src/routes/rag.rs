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
    conversation_history: Option<Vec<RagChatMessage>>,
    history_turns: Option<usize>,
}

#[derive(Debug, Deserialize, Clone)]
struct RagChatMessage {
    role: String,
    content: String,
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

fn normalize_graph_label_query(query: &str) -> String {
    query
        .split(|ch: char| !(ch.is_alphanumeric() || ch == '-' || ch == '_' || ch == '.'))
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn rag_request(state: &AppState, method: reqwest::Method, url: String) -> reqwest::RequestBuilder {
    let mut req = state.http.request(method, url);
    if let Some(api_key) = rag_api_key(state) {
        req = req
            .header("Authorization", format!("Bearer {api_key}"))
            .header("X-API-Key", api_key);
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

    let results = search_lightrag(&state, &base_url, &body, query, limit).await?;
    Ok(Json(json!({
        "ok": true,
        "backend": "lightrag",
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
        let normalized = normalize_graph_label_query(q);
        let search = if normalized.is_empty() {
            q
        } else {
            &normalized
        };
        format!(
            "{base_url}/graph/label/search?q={}&limit={limit}",
            urlencoding::encode(search)
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
    let mode = body.mode.as_deref().unwrap_or("mix");
    let payload = json!({
        "query": query,
        "project": body.project.clone(),
        "namespace": body.namespace.clone(),
        "mode": mode,
        "limit": limit,
        "top_k": 40,
        "chunk_top_k": 10,
        "max_entity_tokens": 10000,
        "max_relation_tokens": 10000,
        "max_total_tokens": 32000,
        "only_need_context": false,
        "only_need_prompt": false,
        "response_type": "Multiple Paragraphs",
        "stream": true,
        "conversation_history": lightrag_conversation_history(body),
        "history_turns": body.history_turns.unwrap_or(0),
        "include_references": true,
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
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| {
                    if source.is_empty() {
                        format!("LightRAG result {}", index + 1)
                    } else {
                        source.to_string()
                    }
                });
            json!({
                "name": name,
                "path": source,
                "content": content,
                "snippet": snippet(&content),
                "score": item.get("score").and_then(Value::as_f64).unwrap_or(0.0),
                "backend": item.get("backend").and_then(Value::as_str).unwrap_or("lightrag"),
                "references": item.get("references").cloned().unwrap_or_else(|| json!([])),
            })
        })
        .collect())
}

async fn search_lightrag(
    state: &AppState,
    base_url: &str,
    body: &RagSearchBody,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, AppError> {
    let payload = lightrag_ui_query_payload(body, query);
    let value = post_lightrag_ndjson(state, format!("{base_url}/query/stream"), payload).await?;
    Ok(normalize_lightrag_answer(value, limit))
}

fn lightrag_ui_query_payload(body: &RagSearchBody, query: &str) -> Value {
    let history_turns = body.history_turns.unwrap_or(0);
    let conversation_history = lightrag_conversation_history(body);

    json!({
        "query": query,
        "mode": body.mode.as_deref().unwrap_or("mix"),
        "top_k": 40,
        "chunk_top_k": 10,
        "max_entity_tokens": 10000,
        "max_relation_tokens": 10000,
        "max_total_tokens": 32000,
        "only_need_context": false,
        "only_need_prompt": false,
        "response_type": "Multiple Paragraphs",
        "stream": true,
        "conversation_history": conversation_history,
        "history_turns": history_turns,
        "include_references": true,
    })
}

fn lightrag_conversation_history(body: &RagSearchBody) -> Vec<Value> {
    let history_turns = body.history_turns.unwrap_or(0);
    if history_turns == 0 {
        return Vec::new();
    }
    body.conversation_history
        .clone()
        .unwrap_or_default()
        .into_iter()
        .rev()
        .take(history_turns.saturating_mul(2))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|message| {
            json!({
                "role": message.role,
                "content": message.content,
            })
        })
        .collect()
}

async fn post_json(state: &AppState, url: String, payload: Value) -> Result<Value, AppError> {
    let response = rag_request(state, reqwest::Method::POST, url)
        .timeout(Duration::from_secs(30))
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

async fn post_lightrag_ndjson(
    state: &AppState,
    url: String,
    payload: Value,
) -> Result<Value, AppError> {
    let response = rag_request(state, reqwest::Method::POST, url)
        .timeout(Duration::from_secs(120))
        .header("Content-Type", "application/json")
        .header("Accept", "application/x-ndjson")
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(error = %error, "LightRAG query stream request failed");
            AppError::BadRequest("LightRAG query failed".into())
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(%status, body = %crate::routes::gateway::sanitize_error_body(&body), "LightRAG query stream returned non-success");
        return Err(AppError::BadRequest("LightRAG query failed".into()));
    }

    let text = response
        .text()
        .await
        .map_err(|error| AppError::Internal(error.into()))?;
    parse_lightrag_ndjson(&text)
}

fn parse_lightrag_ndjson(text: &str) -> Result<Value, AppError> {
    let mut answer = String::new();
    let mut references: Vec<Value> = Vec::new();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let value: Value = serde_json::from_str(line)
            .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))?;
        if let Some(error) = value.get("error").and_then(Value::as_str) {
            return Err(AppError::BadRequest(error.to_string()));
        }
        if let Some(chunk) = value.get("response").and_then(Value::as_str) {
            answer.push_str(chunk);
        }
        if let Some(items) = value.get("references").and_then(Value::as_array) {
            references.extend(items.iter().cloned());
        }
    }
    Ok(json!({
        "response": answer,
        "references": references,
    }))
}

fn normalize_lightrag_answer(value: Value, _limit: usize) -> Vec<Value> {
    let text = value
        .get("response")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        return Vec::new();
    }

    vec![json!({
        "name": "LightRAG answer",
        "path": "",
        "content": text,
        "snippet": snippet(&text),
        "score": 1.0,
        "backend": "lightrag",
        "references": value.get("references").cloned().unwrap_or_else(|| json!([])),
    })]
}

fn snippet(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= 240 {
        trimmed.to_string()
    } else {
        format!("{}...", trimmed.chars().take(240).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lightrag_payload_matches_webui_chat_defaults() {
        let body = RagSearchBody {
            query: "what is in the media vm".to_string(),
            limit: Some(12),
            project: None,
            namespace: None,
            mode: None,
            conversation_history: None,
            history_turns: None,
        };
        let payload = lightrag_ui_query_payload(&body, &body.query);

        assert_eq!(payload["query"], "what is in the media vm");
        assert_eq!(payload["mode"], "mix");
        assert_eq!(payload["top_k"], 40);
        assert_eq!(payload["chunk_top_k"], 10);
        assert_eq!(payload["max_entity_tokens"], 10000);
        assert_eq!(payload["max_relation_tokens"], 10000);
        assert_eq!(payload["max_total_tokens"], 32000);
        assert_eq!(payload["response_type"], "Multiple Paragraphs");
        assert_eq!(payload["stream"], true);
        assert_eq!(payload["only_need_context"], false);
        assert_eq!(payload["only_need_prompt"], false);
        assert_eq!(payload["history_turns"], 0);
        assert_eq!(payload["conversation_history"], json!([]));
        assert_eq!(payload["include_references"], true);
        assert!(payload.get("enable_rerank").is_none());
    }

    #[test]
    fn lightrag_payload_caps_conversation_history_by_turns() {
        let body = RagSearchBody {
            query: "and what runs there".to_string(),
            limit: Some(12),
            project: None,
            namespace: None,
            mode: None,
            history_turns: Some(1),
            conversation_history: Some(vec![
                RagChatMessage {
                    role: "user".to_string(),
                    content: "old question".to_string(),
                },
                RagChatMessage {
                    role: "assistant".to_string(),
                    content: "old answer".to_string(),
                },
                RagChatMessage {
                    role: "user".to_string(),
                    content: "recent question".to_string(),
                },
                RagChatMessage {
                    role: "assistant".to_string(),
                    content: "recent answer".to_string(),
                },
            ]),
        };
        let payload = lightrag_ui_query_payload(&body, &body.query);

        assert_eq!(payload["history_turns"], 1);
        assert_eq!(
            payload["conversation_history"],
            json!([
                {"role": "user", "content": "recent question"},
                {"role": "assistant", "content": "recent answer"},
            ])
        );
    }

    #[test]
    fn lightrag_ndjson_chunks_combine_into_answer_with_references() {
        let parsed = parse_lightrag_ndjson(
            "{\"references\":[{\"file_path\":\"media.md\"}]}\n{\"response\":\"The Media VM \"}\n{\"response\":\"runs Plex.\"}\n",
        )
        .expect("ndjson parses");

        assert_eq!(parsed["response"], "The Media VM runs Plex.");
        assert_eq!(parsed["references"][0]["file_path"], "media.md");
    }

    #[test]
    fn lightrag_chat_answer_is_single_answer_result() {
        let results = normalize_lightrag_answer(
            json!({
                "response": "The Media VM runs Plex, Sonarr, and Radarr.",
                "references": [{"file_path": "media.md"}],
            }),
            12,
        );

        assert_eq!(results.len(), 1);
        assert_eq!(results[0]["name"], "LightRAG answer");
        assert_eq!(results[0]["backend"], "lightrag");
        assert_eq!(
            results[0]["content"],
            "The Media VM runs Plex, Sonarr, and Radarr."
        );
    }
}
