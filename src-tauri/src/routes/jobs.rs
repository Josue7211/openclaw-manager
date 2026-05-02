use std::cmp::Ordering;

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

/// Build the job search router.
///
/// The backend aggregates a few reputable public feeds so the frontend can
/// search live openings without cross-origin browser issues.
pub fn router() -> Router<AppState> {
    Router::new().route("/jobs/search", get(search_jobs))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum JobSourceKey {
    Remotive,
    RemoteOk,
    Arbeitnow,
}

impl JobSourceKey {
    fn all() -> [Self; 3] {
        [Self::Remotive, Self::RemoteOk, Self::Arbeitnow]
    }

    fn from_list(raw: Option<String>) -> Vec<Self> {
        let parsed: Vec<Self> = raw
            .unwrap_or_default()
            .split(',')
            .filter_map(|value| match value.trim().to_lowercase().as_str() {
                "remotive" => Some(Self::Remotive),
                "remoteok" | "remote-ok" | "remote ok" => Some(Self::RemoteOk),
                "arbeitnow" => Some(Self::Arbeitnow),
                _ => None,
            })
            .collect();

        if parsed.is_empty() {
            Self::all().to_vec()
        } else {
            parsed
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Remotive => "Remotive",
            Self::RemoteOk => "Remote OK",
            Self::Arbeitnow => "Arbeitnow",
        }
    }

    fn prefix(self) -> &'static str {
        match self {
            Self::Remotive => "remotive",
            Self::RemoteOk => "remoteok",
            Self::Arbeitnow => "arbeitnow",
        }
    }
}

#[derive(Debug, Deserialize)]
struct JobSearchQuery {
    q: Option<String>,
    limit: Option<u32>,
    sources: Option<String>,
    smart_filter: Option<bool>,
    max_age_days: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct RemotiveResponse {
    #[serde(rename = "job-count")]
    _job_count: u32,
    jobs: Vec<RemotiveJob>,
}

#[derive(Debug, Deserialize)]
struct RemotiveJob {
    id: u64,
    url: String,
    title: String,
    company_name: String,
    category: String,
    #[serde(default)]
    job_type: Option<String>,
    #[serde(default)]
    publication_date: Option<String>,
    #[serde(default)]
    candidate_required_location: Option<String>,
    #[serde(default)]
    salary: Option<String>,
    description: String,
    #[serde(default)]
    company_logo: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RemoteOkJob {
    #[serde(default)]
    id: Option<u64>,
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    company: Option<String>,
    #[serde(default)]
    position: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    apply_url: Option<String>,
    #[serde(default)]
    salary_min: Option<f64>,
    #[serde(default)]
    salary_max: Option<f64>,
    #[serde(default)]
    company_logo: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ArbeitnowResponse {
    data: Vec<ArbeitnowJob>,
}

#[derive(Debug, Deserialize)]
struct ArbeitnowJob {
    slug: String,
    company_name: String,
    title: String,
    description: String,
    remote: bool,
    url: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    created_at: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
struct JobSearchResult {
    id: String,
    source: String,
    source_id: String,
    title: String,
    company: String,
    category: String,
    job_type: String,
    location: String,
    salary: Option<String>,
    published_at: Option<String>,
    url: String,
    company_logo: Option<String>,
    summary: String,
}

#[derive(Debug, Clone)]
struct JobCandidate {
    job: JobSearchResult,
    published_at: Option<DateTime<Utc>>,
    search_blob: String,
    query_score: usize,
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;

    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }

    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn summarize_description(html: &str) -> String {
    let plain = strip_html_tags(html);
    let trimmed = plain.trim();
    if trimmed.len() <= 180 {
        return trimmed.to_string();
    }

    let end = trimmed
        .char_indices()
        .nth(180)
        .map(|(idx, _)| idx)
        .unwrap_or(trimmed.len());
    format!("{}...", &trimmed[..end])
}

fn parse_rfc3339_utc(value: Option<&str>) -> Option<DateTime<Utc>> {
    value
        .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
        .map(|dt| dt.with_timezone(&Utc))
}

fn parse_epoch_utc(value: Option<u64>) -> Option<DateTime<Utc>> {
    value.and_then(|epoch| Utc.timestamp_opt(epoch as i64, 0).single())
}

fn normalize_terms(query: &str) -> Vec<String> {
    const STOPWORDS: &[&str] = &[
        "a",
        "an",
        "and",
        "at",
        "for",
        "from",
        "in",
        "into",
        "job",
        "jobs",
        "local",
        "no",
        "of",
        "on",
        "or",
        "part",
        "position",
        "positions",
        "remote",
        "role",
        "roles",
        "the",
        "to",
        "with",
        "work",
        "working",
        "experience",
        "entry",
        "level",
        "intern",
        "hybrid",
        "usa",
        "us",
        "fort",
        "myers",
        "fl",
        "33905",
    ];

    query
        .to_lowercase()
        .split(|ch: char| !ch.is_alphanumeric())
        .map(str::trim)
        .filter(|token| token.len() >= 2)
        .filter(|token| !STOPWORDS.contains(token))
        .map(ToOwned::to_owned)
        .collect()
}

fn build_search_blob(job: &JobSearchResult) -> String {
    [
        job.title.as_str(),
        job.company.as_str(),
        job.category.as_str(),
        job.job_type.as_str(),
        job.location.as_str(),
        job.salary.as_deref().unwrap_or_default(),
        job.summary.as_str(),
    ]
    .join(" ")
    .to_lowercase()
}

fn query_score(blob: &str, terms: &[String]) -> usize {
    let tokens = blob
        .split_whitespace()
        .collect::<std::collections::HashSet<_>>();
    terms
        .iter()
        .filter(|term| tokens.contains(term.as_str()))
        .count()
}

fn should_keep_job(
    candidate: &JobCandidate,
    terms: &[String],
    smart_filter: bool,
    max_age_days: u32,
) -> bool {
    if candidate.job.title.trim().is_empty() || candidate.job.company.trim().is_empty() {
        return false;
    }

    if candidate.job.url.trim().is_empty() {
        return false;
    }

    if !terms.is_empty() && candidate.query_score == 0 {
        return false;
    }

    if smart_filter {
        let age_limit = chrono::Duration::days(i64::from(max_age_days));
        let recent_enough = candidate
            .published_at
            .map(|published| Utc::now().signed_duration_since(published) <= age_limit)
            .unwrap_or(true);
        if !recent_enough {
            return false;
        }

        if candidate.job.summary.trim().len() < 24 {
            return false;
        }
    }

    true
}

fn make_candidate(
    source: JobSourceKey,
    source_id: String,
    title: String,
    company: String,
    category: String,
    job_type: String,
    location: String,
    salary: Option<String>,
    published_at: Option<DateTime<Utc>>,
    url: String,
    company_logo: Option<String>,
    summary: String,
) -> JobCandidate {
    let job = JobSearchResult {
        id: format!("{}-{}", source.prefix(), source_id),
        source: source.label().to_string(),
        source_id,
        title,
        company,
        category,
        job_type,
        location,
        salary,
        published_at: published_at
            .map(|dt| dt.to_rfc3339())
            .or(Some(String::new()))
            .filter(|value| !value.is_empty()),
        url,
        company_logo,
        summary,
    };
    let search_blob = build_search_blob(&job);
    JobCandidate {
        query_score: 0,
        published_at,
        search_blob,
        job,
    }
}

fn filter_and_score(mut candidate: JobCandidate, terms: &[String]) -> JobCandidate {
    candidate.query_score = query_score(&candidate.search_blob, terms);
    candidate
}

fn sort_candidates(mut candidates: Vec<JobCandidate>) -> Vec<JobCandidate> {
    candidates.sort_by(|a, b| {
        b.query_score
            .cmp(&a.query_score)
            .then_with(|| match (a.published_at, b.published_at) {
                (Some(left), Some(right)) => right.cmp(&left),
                (None, Some(_)) => Ordering::Greater,
                (Some(_), None) => Ordering::Less,
                (None, None) => Ordering::Equal,
            })
            .then_with(|| a.job.source.cmp(&b.job.source))
            .then_with(|| a.job.title.cmp(&b.job.title))
    });
    candidates
}

fn format_salary_range(min: Option<f64>, max: Option<f64>) -> Option<String> {
    let low = min.filter(|value| *value > 0.0);
    let high = max.filter(|value| *value > 0.0);

    match (low, high) {
        (Some(l), Some(h)) if (l - h).abs() < f64::EPSILON => Some(format_salary_value(l)),
        (Some(l), Some(h)) => Some(format!(
            "{} - {}",
            format_salary_value(l),
            format_salary_value(h)
        )),
        (Some(l), None) => Some(format!("From {}", format_salary_value(l))),
        (None, Some(h)) => Some(format!("Up to {}", format_salary_value(h))),
        _ => None,
    }
}

fn format_salary_value(value: f64) -> String {
    if value >= 1000.0 {
        let annual = if value >= 10000.0 {
            value
        } else {
            value * 1000.0
        };
        if annual >= 10_000.0 {
            format!("${:.0}k", annual / 1000.0)
        } else {
            format!("${:.0}", annual)
        }
    } else {
        format!("${:.0}", value)
    }
}

async fn fetch_remotive_jobs(
    client: &reqwest::Client,
    query: &str,
    limit: u32,
    terms: &[String],
    smart_filter: bool,
    max_age_days: u32,
) -> Result<Vec<JobCandidate>, AppError> {
    let mut url = reqwest::Url::parse("https://remotive.com/api/remote-jobs")
        .map_err(|e| AppError::Internal(e.into()))?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("limit", &limit.to_string());
        if !query.is_empty() {
            pairs.append_pair("search", query);
        }
    }

    let response = client.get(url).send().await?.error_for_status()?;
    let remotive: RemotiveResponse = response.json().await?;

    let jobs = remotive
        .jobs
        .into_iter()
        .map(|job| {
            let published_at = parse_rfc3339_utc(job.publication_date.as_deref());
            let salary = job.salary;
            let category = job.category;
            let location = job
                .candidate_required_location
                .unwrap_or_else(|| "Remote".to_string());
            let summary = summarize_description(&job.description);
            let candidate = make_candidate(
                JobSourceKey::Remotive,
                job.id.to_string(),
                job.title,
                job.company_name.trim().to_string(),
                category,
                job.job_type.unwrap_or_else(|| "full_time".to_string()),
                location,
                salary,
                published_at,
                job.url,
                job.company_logo,
                summary,
            );
            filter_and_score(candidate, terms)
        })
        .filter(|candidate| should_keep_job(candidate, terms, smart_filter, max_age_days))
        .collect();

    Ok(jobs)
}

async fn fetch_remoteok_jobs(
    client: &reqwest::Client,
    terms: &[String],
    smart_filter: bool,
    max_age_days: u32,
) -> Result<Vec<JobCandidate>, AppError> {
    let response = client
        .get("https://remoteok.com/remote-jobs.json")
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0")
        .send()
        .await?
        .error_for_status()?;
    let raw: Vec<RemoteOkJob> = response.json().await?;

    let jobs = raw
        .into_iter()
        .filter_map(|job| {
            let source_id = job.id.map(|id| id.to_string()).or(job.slug.clone())?;
            let title = job.position?.trim().to_string();
            let company = job.company?.trim().to_string();
            let published_at = parse_rfc3339_utc(job.date.as_deref());
            let description = job.description.unwrap_or_default();
            let summary = summarize_description(&description);
            let salary = format_salary_range(job.salary_min, job.salary_max);
            let location = job.location.unwrap_or_else(|| "Remote".to_string());
            let url = job
                .apply_url
                .or(job.url)
                .unwrap_or_else(|| format!("https://remoteok.com/remote-jobs/{}", source_id));
            let category = job
                .tags
                .as_ref()
                .and_then(|tags| tags.first().cloned())
                .unwrap_or_else(|| "Remote".to_string());
            let job_type = if description.to_lowercase().contains("part-time") {
                "part_time".to_string()
            } else if description.to_lowercase().contains("contract") {
                "contract".to_string()
            } else {
                "full_time".to_string()
            };

            let candidate = make_candidate(
                JobSourceKey::RemoteOk,
                source_id,
                title,
                company,
                category,
                job_type,
                location,
                salary,
                published_at,
                url,
                job.company_logo,
                summary,
            );
            Some(filter_and_score(candidate, terms))
        })
        .filter(|candidate| should_keep_job(candidate, terms, smart_filter, max_age_days))
        .collect();

    Ok(jobs)
}

async fn fetch_arbeitnow_jobs(
    client: &reqwest::Client,
    terms: &[String],
    smart_filter: bool,
    max_age_days: u32,
) -> Result<Vec<JobCandidate>, AppError> {
    let response = client
        .get("https://www.arbeitnow.com/api/job-board-api?page=1")
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0")
        .send()
        .await?
        .error_for_status()?;
    let arbeitnow: ArbeitnowResponse = response.json().await?;

    let jobs = arbeitnow
        .data
        .into_iter()
        .map(|job| {
            let published_at = parse_epoch_utc(job.created_at);
            let category = job
                .tags
                .first()
                .cloned()
                .unwrap_or_else(|| "General".to_string());
            let summary = summarize_description(&job.description);
            let location = if job.remote {
                "Remote".to_string()
            } else {
                job.location.unwrap_or_else(|| "Onsite".to_string())
            };
            let candidate = make_candidate(
                JobSourceKey::Arbeitnow,
                job.slug,
                job.title,
                job.company_name,
                category,
                if job.remote {
                    "remote".to_string()
                } else {
                    "onsite".to_string()
                },
                location,
                None,
                published_at,
                job.url,
                None,
                summary,
            );
            filter_and_score(candidate, terms)
        })
        .filter(|candidate| should_keep_job(candidate, terms, smart_filter, max_age_days))
        .collect();

    Ok(jobs)
}

async fn search_jobs(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<JobSearchQuery>,
) -> Result<Json<Value>, AppError> {
    let query = params.q.unwrap_or_default().trim().to_string();
    let limit = params.limit.unwrap_or(24).clamp(1, 50);
    let smart_filter = params.smart_filter.unwrap_or(true);
    let max_age_days = params.max_age_days.unwrap_or(21).clamp(3, 60);
    let sources = JobSourceKey::from_list(params.sources);
    let terms = normalize_terms(&query);
    let client = state.http.clone();

    let mut jobs: Vec<JobCandidate> = Vec::new();
    for source in sources {
        let fetched = match source {
            JobSourceKey::Remotive => {
                fetch_remotive_jobs(&client, &query, limit, &terms, smart_filter, max_age_days)
                    .await?
            }
            JobSourceKey::RemoteOk => {
                fetch_remoteok_jobs(&client, &terms, smart_filter, max_age_days).await?
            }
            JobSourceKey::Arbeitnow => {
                fetch_arbeitnow_jobs(&client, &terms, smart_filter, max_age_days).await?
            }
        };
        jobs.extend(fetched);
    }

    let jobs = sort_candidates(jobs)
        .into_iter()
        .take(limit as usize)
        .map(|candidate| candidate.job)
        .collect::<Vec<_>>();

    Ok(Json(json!({
        "query": query,
        "count": jobs.len(),
        "jobs": jobs,
    })))
}
