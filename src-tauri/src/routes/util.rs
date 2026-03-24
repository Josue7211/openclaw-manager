//! Shared utility functions used across multiple route modules.

/// Percent-encode a string for use in a URL query parameter.
pub fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                // Use uppercase hex digits per RFC 3986 recommendation
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

/// Generate a pseudo-UUID v4 string using the `rand` and `hex` crates.
pub fn random_uuid() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 16];
    rng.fill(&mut bytes);
    // Set version 4 and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{}-{}-{}-{}-{}",
        hex::encode(&bytes[0..4]),
        hex::encode(&bytes[4..6]),
        hex::encode(&bytes[6..8]),
        hex::encode(&bytes[8..10]),
        hex::encode(&bytes[10..16]),
    )
}

/// Decode a base64-encoded string to bytes. Supports standard base64 alphabet.
pub fn base64_decode(input: &str) -> Option<Vec<u8>> {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lookup = [255u8; 256];
    for (i, &c) in TABLE.iter().enumerate() {
        lookup[c as usize] = i as u8;
    }

    let input = input.trim_end_matches('=');
    let len = input.len();
    let mut out = Vec::with_capacity(len * 3 / 4);

    let mut i = 0;
    while i < len {
        let remaining = len - i;
        let a = lookup[input.as_bytes().get(i).copied().unwrap_or(b'A') as usize];
        let b = lookup[input.as_bytes().get(i + 1).copied().unwrap_or(b'A') as usize];
        if a == 255 || b == 255 {
            return None;
        }
        out.push((a << 2) | (b >> 4));

        if remaining > 2 {
            let c = lookup[input.as_bytes()[i + 2] as usize];
            if c == 255 {
                return None;
            }
            out.push((b << 4) | (c >> 2));
            if remaining > 3 {
                let d = lookup[input.as_bytes()[i + 3] as usize];
                if d == 255 {
                    return None;
                }
                out.push((c << 6) | d);
            }
        }
        i += 4;
    }

    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- percent_encode ----

    #[test]
    fn percent_encode_empty() {
        assert_eq!(percent_encode(""), "");
    }

    #[test]
    fn percent_encode_no_special_chars() {
        assert_eq!(percent_encode("hello"), "hello");
    }

    #[test]
    fn percent_encode_space() {
        assert_eq!(percent_encode("hello world"), "hello%20world");
    }

    #[test]
    fn percent_encode_query_chars() {
        assert_eq!(percent_encode("a&b=c"), "a%26b%3Dc");
    }

    #[test]
    fn percent_encode_unicode() {
        // U+00E9 (e-acute) is encoded as 0xC3 0xA9 in UTF-8
        let encoded = percent_encode("\u{00e9}");
        assert_eq!(encoded, "%C3%A9");
    }

    // ---- random_uuid ----

    #[test]
    fn random_uuid_length() {
        let uuid = random_uuid();
        assert_eq!(uuid.len(), 36, "UUID should be 36 chars (8-4-4-4-12 with hyphens)");
    }

    #[test]
    fn random_uuid_format() {
        let uuid = random_uuid();
        for c in uuid.chars() {
            assert!(
                c.is_ascii_hexdigit() || c == '-',
                "UUID should contain only hex chars and hyphens, found '{}'",
                c
            );
        }
        // Check hyphen positions: 8-4-4-4-12
        let parts: Vec<&str> = uuid.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
    }

    #[test]
    fn random_uuid_unique() {
        let a = random_uuid();
        let b = random_uuid();
        assert_ne!(a, b, "Two random UUIDs should differ");
    }

    // ---- base64_decode ----

    #[test]
    fn base64_decode_hello_padded() {
        let result = base64_decode("SGVsbG8=");
        assert_eq!(result, Some(b"Hello".to_vec()));
    }

    #[test]
    fn base64_decode_empty() {
        let result = base64_decode("");
        assert_eq!(result, Some(vec![]));
    }

    #[test]
    fn base64_decode_hello_no_padding() {
        let result = base64_decode("SGVsbG8");
        assert_eq!(result, Some(b"Hello".to_vec()));
    }

    #[test]
    fn base64_decode_invalid_chars() {
        let result = base64_decode("!!!!");
        assert_eq!(result, None);
    }

    // ---- percent_encode edge cases ----

    #[test]
    fn percent_encode_preserves_unreserved() {
        // RFC 3986 unreserved chars: A-Z a-z 0-9 - _ . ~
        assert_eq!(percent_encode("AZaz09-_.~"), "AZaz09-_.~");
    }

    #[test]
    fn percent_encode_encodes_slashes_and_colons() {
        assert_eq!(percent_encode("http://x"), "http%3A%2F%2Fx");
    }

    #[test]
    fn percent_encode_plus_and_at() {
        assert_eq!(percent_encode("+@"), "%2B%40");
    }

    // ---- random_uuid version/variant bits ----

    #[test]
    fn random_uuid_version_4_bits() {
        let uuid = random_uuid();
        // The 13th character (index 14 counting hyphens) should be '4' (version 4)
        let chars: Vec<char> = uuid.chars().collect();
        assert_eq!(chars[14], '4', "UUID version nibble should be 4");
    }

    #[test]
    fn random_uuid_variant_bits() {
        let uuid = random_uuid();
        // The 19th character (after third hyphen) should be 8, 9, a, or b (variant 1)
        let chars: Vec<char> = uuid.chars().collect();
        let variant_char = chars[19];
        assert!(
            ['8', '9', 'a', 'b'].contains(&variant_char),
            "UUID variant nibble should be 8/9/a/b, got '{}'",
            variant_char
        );
    }

    // ---- base64_decode additional cases ----

    #[test]
    fn base64_decode_multi_byte() {
        // "TWFu" => "Man"
        assert_eq!(base64_decode("TWFu"), Some(b"Man".to_vec()));
    }

    #[test]
    fn base64_decode_two_byte_padding() {
        // "TQ==" => "M"
        assert_eq!(base64_decode("TQ=="), Some(b"M".to_vec()));
    }

    #[test]
    fn base64_decode_one_byte_padding() {
        // "TWE=" => "Ma"
        assert_eq!(base64_decode("TWE="), Some(b"Ma".to_vec()));
    }
}
