use regex::Regex;

const SECRET_PATTERNS: &[&str] = &[
    r#"(?i)(?:api[_-]?key|token|secret|password|bearer)\s*[:=]\s*["']?([a-zA-Z0-9_\-./+]{20,})["']?"#,
    r"\b(sk-[a-zA-Z0-9]{20,})\b",
    r"\b(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+)\b",
    r"\b([a-f0-9]{32,})\b",
];

pub fn redact(input: &str) -> String {
    let mut result = input.to_string();
    for pattern_str in SECRET_PATTERNS {
        if let Ok(re) = Regex::new(pattern_str) {
            result = re.replace_all(&result, |caps: &regex::Captures| {
                let full = caps.get(0).unwrap().as_str().to_string();
                if let Some(group) = caps.get(1) {
                    let g = group.as_str();
                    if g.len() > 8 {
                        let redacted = format!("{}***{}", &g[..4], &g[g.len()-4..]);
                        return full.replace(g, &redacted);
                    }
                }
                // Fallback
                let re2 = Regex::new(r"[a-zA-Z0-9]{4,}").unwrap();
                re2.replace_all(&full, |m: &regex::Captures| {
                    let s = m.get(0).unwrap().as_str();
                    format!("{}***", &s[..std::cmp::min(2, s.len())])
                }).into_owned()
            }).into_owned();
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redacts_openai_key() {
        let input = "key: sk-abcdefghij1234567890extra";
        let result = redact(input);
        assert!(result.contains("***"));
        assert!(!result.contains("abcdefghij1234567890"));
    }

    #[test]
    fn test_redacts_hex_string() {
        let hex = "a".repeat(42);
        let result = redact(&hex);
        assert!(result.contains("***"));
    }

    #[test]
    fn test_preserves_normal_text() {
        let input = "Hello, this is a normal message.";
        assert_eq!(redact(input), input);
    }
}
