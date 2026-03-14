use serde::Serialize;
use serde_json::Value;
use std::process::Command;

/// A Tailscale peer with its IP addresses, hostname, and online status.
#[derive(Debug, Clone, Serialize)]
pub struct TailscalePeer {
    pub ip: String,
    pub hostname: String,
    pub online: bool,
}

/// Run `tailscale status --json` and parse the peer list.
///
/// Each peer may have multiple Tailscale IPs (IPv4 + IPv6); we return one
/// `TailscalePeer` entry per IP so callers can look up by any address.
pub fn get_tailscale_peers() -> Result<Vec<TailscalePeer>, String> {
    let output = Command::new("tailscale")
        .args(["status", "--json"])
        .output()
        .map_err(|e| format!("Failed to run tailscale: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tailscale status failed: {stderr}"));
    }

    let json: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse tailscale output: {e}"))?;

    let mut peers = Vec::new();
    if let Some(peer_map) = json.get("Peer").and_then(|p| p.as_object()) {
        for (_key, peer) in peer_map {
            let hostname = peer
                .get("HostName")
                .and_then(|h| h.as_str())
                .unwrap_or("")
                .to_string();
            let online = peer
                .get("Online")
                .and_then(|o| o.as_bool())
                .unwrap_or(false);
            let ips: Vec<String> = peer
                .get("TailscaleIPs")
                .and_then(|t| t.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            for ip in ips {
                peers.push(TailscalePeer {
                    ip,
                    hostname: hostname.clone(),
                    online,
                });
            }
        }
    }
    Ok(peers)
}

/// Verify that a Tailscale IP belongs to the expected hostname.
///
/// Returns `Ok(true)` if the IP maps to the expected hostname (case-insensitive),
/// `Ok(false)` if it maps to a different hostname, and `Err` if the IP is not
/// found in the peer list or `tailscale status` fails.
pub fn verify_peer(ip: &str, expected_hostname: &str) -> Result<bool, String> {
    let peers = get_tailscale_peers()?;
    if let Some(peer) = peers.iter().find(|p| p.ip == ip) {
        Ok(peer.hostname.to_lowercase() == expected_hostname.to_lowercase())
    } else {
        Err(format!("No Tailscale peer found with IP {ip}"))
    }
}

/// Extract the host (IP or hostname) from a URL string.
///
/// Given `http://100.64.0.3:1234/api`, returns `"100.64.0.3"`.
/// Given `http://my-server:8080`, returns `"my-server"`.
pub fn extract_host_from_url(url: &str) -> Option<String> {
    // Try standard URL parsing first
    if let Ok(parsed) = url::Url::parse(url) {
        return parsed.host_str().map(String::from);
    }
    // Fallback: strip scheme and path manually
    let without_scheme = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .unwrap_or(url);
    let host_port = without_scheme.split('/').next()?;
    let host = host_port.split(':').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// Check whether an IP looks like a Tailscale CGNAT address (100.x.y.z)
/// or a Tailscale IPv6 ULA address (fd7a:115c:a1e0::/48).
pub fn is_tailscale_ip(ip: &str) -> bool {
    // IPv6 tailscale ULA prefix
    if ip.starts_with("fd7a:115c:a1e0:") {
        return true;
    }
    // IPv4 CGNAT range 100.64.0.0/10 (100.64.x.x - 100.127.x.x)
    // Tailscale uses the full 100.x.y.z range
    if let Some(first_octet) = ip.split('.').next() {
        first_octet == "100"
    } else {
        false
    }
}

/// Result of verifying a single service's Tailscale peer identity.
#[derive(Debug, Clone, Serialize)]
pub struct PeerVerification {
    pub peer_hostname: Option<String>,
    pub peer_verified: Option<bool>,
}

/// Look up the Tailscale peer for a service URL and compare against an expected hostname.
///
/// - If the URL's host is not a Tailscale IP, returns `None` fields (not applicable).
/// - If no expected hostname is configured, returns the actual peer hostname but `peer_verified = None`.
/// - Otherwise compares and returns `peer_verified = Some(true/false)`.
pub fn verify_service_peer(
    url: &str,
    expected_hostname: Option<&str>,
    peers: &[TailscalePeer],
) -> PeerVerification {
    let host = match extract_host_from_url(url) {
        Some(h) => h,
        None => {
            return PeerVerification {
                peer_hostname: None,
                peer_verified: None,
            }
        }
    };

    if !is_tailscale_ip(&host) {
        return PeerVerification {
            peer_hostname: None,
            peer_verified: None,
        };
    }

    let peer = peers.iter().find(|p| p.ip == host);
    let actual_hostname = peer.map(|p| p.hostname.clone());

    let verified = match (expected_hostname, &actual_hostname) {
        (Some(expected), Some(actual)) => {
            Some(actual.to_lowercase() == expected.to_lowercase())
        }
        _ => None,
    };

    PeerVerification {
        peer_hostname: actual_hostname,
        peer_verified: verified,
    }
}

/// Run startup peer verification for all configured services.
///
/// Logs warnings for any mismatches but never blocks. Returns silently on
/// any error (e.g. tailscale not installed, not logged in).
pub fn startup_verify(secrets: &std::collections::HashMap<String, String>) {
    let peers = match get_tailscale_peers() {
        Ok(p) => p,
        Err(e) => {
            tracing::debug!("Tailscale peer verification skipped: {e}");
            return;
        }
    };

    let services: &[(&str, &str, &str)] = &[
        ("BlueBubbles", "BLUEBUBBLES_HOST", "BLUEBUBBLES_EXPECTED_HOST"),
        ("OpenClaw", "OPENCLAW_API_URL", "OPENCLAW_EXPECTED_HOST"),
    ];

    for (name, url_key, host_key) in services {
        let url = match secrets.get(*url_key).filter(|s| !s.is_empty()) {
            Some(u) => u,
            None => continue,
        };
        let expected = secrets.get(*host_key).filter(|s| !s.is_empty()).map(|s| s.as_str());
        let result = verify_service_peer(url, expected, &peers);

        match (result.peer_verified, &result.peer_hostname) {
            (Some(true), Some(hostname)) => {
                tracing::info!(
                    service = name,
                    hostname = hostname.as_str(),
                    "Tailscale peer verified for {name}"
                );
            }
            (Some(false), Some(hostname)) => {
                tracing::warn!(
                    service = name,
                    expected = expected.unwrap_or("(none)"),
                    actual = hostname.as_str(),
                    "Tailscale peer MISMATCH for {name}: expected '{}', got '{hostname}'",
                    expected.unwrap_or("(none)")
                );
            }
            (None, Some(hostname)) => {
                tracing::info!(
                    service = name,
                    hostname = hostname.as_str(),
                    "Tailscale peer for {name}: {hostname} (no expected hostname configured)"
                );
            }
            _ => {
                let host = extract_host_from_url(url).unwrap_or_default();
                if is_tailscale_ip(&host) {
                    tracing::warn!(
                        service = name,
                        ip = host.as_str(),
                        "Tailscale peer for {name} IP {host} not found in peer list"
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_host_basic() {
        assert_eq!(
            extract_host_from_url("http://100.64.0.3:1234/api"),
            Some("100.64.0.3".into())
        );
        assert_eq!(
            extract_host_from_url("http://my-server:8080"),
            Some("my-server".into())
        );
        assert_eq!(
            extract_host_from_url("https://example.com/path"),
            Some("example.com".into())
        );
    }

    #[test]
    fn is_tailscale_ip_check() {
        assert!(is_tailscale_ip("100.64.0.1"));
        assert!(is_tailscale_ip("100.115.92.5"));
        assert!(!is_tailscale_ip("192.168.1.1"));
        assert!(!is_tailscale_ip("10.0.0.1"));
        assert!(is_tailscale_ip("fd7a:115c:a1e0::1"));
    }

    #[test]
    fn verify_service_peer_match() {
        let peers = vec![
            TailscalePeer {
                ip: "100.64.0.3".into(),
                hostname: "macbook".into(),
                online: true,
            },
            TailscalePeer {
                ip: "100.64.0.5".into(),
                hostname: "openclaw-vm".into(),
                online: true,
            },
        ];

        let result = verify_service_peer(
            "http://100.64.0.3:1234",
            Some("macbook"),
            &peers,
        );
        assert_eq!(result.peer_verified, Some(true));
        assert_eq!(result.peer_hostname, Some("macbook".into()));
    }

    #[test]
    fn verify_service_peer_mismatch() {
        let peers = vec![TailscalePeer {
            ip: "100.64.0.3".into(),
            hostname: "macbook".into(),
            online: true,
        }];

        let result = verify_service_peer(
            "http://100.64.0.3:1234",
            Some("wrong-host"),
            &peers,
        );
        assert_eq!(result.peer_verified, Some(false));
        assert_eq!(result.peer_hostname, Some("macbook".into()));
    }

    #[test]
    fn verify_service_peer_non_tailscale() {
        let peers = vec![];
        let result = verify_service_peer(
            "http://192.168.1.50:1234",
            Some("macbook"),
            &peers,
        );
        assert_eq!(result.peer_verified, None);
        assert_eq!(result.peer_hostname, None);
    }

    #[test]
    fn verify_service_peer_no_expected() {
        let peers = vec![TailscalePeer {
            ip: "100.64.0.3".into(),
            hostname: "macbook".into(),
            online: true,
        }];

        let result = verify_service_peer("http://100.64.0.3:1234", None, &peers);
        assert_eq!(result.peer_verified, None);
        assert_eq!(result.peer_hostname, Some("macbook".into()));
    }
}
