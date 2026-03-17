use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use zeroize::Zeroizing;

/// Derive a 32-byte encryption key from a password using Argon2id.
///
/// Parameters: m_cost=65536 (64 MiB), t_cost=3 iterations, p=4 parallelism.
/// These follow OWASP recommendations for interactive logins.
///
/// The `salt` must be a random, per-user value stored in `user_profiles.encryption_salt`
/// (base64-encoded 16-byte random salt). Never use deterministic values like user IDs.
/// Truncates or zero-pads the UTF-8 salt bytes to exactly 16 bytes before
/// passing them to Argon2, which requires a salt of at least 8 bytes.
pub fn derive_key(password: &str, salt: &str) -> Zeroizing<Vec<u8>> {
    let params = Params::new(
        65536, // 64 MiB memory cost
        3,     // 3 iterations
        4,     // 4 degrees of parallelism
        Some(32), // 32-byte output key
    )
    .expect("valid argon2 params");

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    // Decode base64 salt (from user_profiles.encryption_salt), falling back
    // to raw UTF-8 bytes for legacy/test salts that aren't base64-encoded.
    let salt_bytes = STANDARD.decode(salt)
        .unwrap_or_else(|_| salt.as_bytes().to_vec());
    let mut salt_fixed = [0u8; 16];
    let copy_len = salt_bytes.len().min(16);
    salt_fixed[..copy_len].copy_from_slice(&salt_bytes[..copy_len]);

    let mut output = vec![0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), &salt_fixed, &mut output)
        .expect("argon2 key derivation");
    Zeroizing::new(output)
}

/// Encrypt `plaintext` with AES-256-GCM using the provided 32-byte `key`.
///
/// Returns `(ciphertext_base64, nonce_base64)`. A fresh random 12-byte nonce
/// is generated for every call, so identical plaintexts produce different
/// ciphertexts.
pub fn encrypt(plaintext: &[u8], key: &[u8]) -> anyhow::Result<(String, String)> {
    anyhow::ensure!(key.len() == 32, "key must be 32 bytes");

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| anyhow::anyhow!("invalid key: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| anyhow::anyhow!("encryption failed: {}", e))?;

    Ok((STANDARD.encode(&ciphertext), STANDARD.encode(&nonce_bytes)))
}

/// Decrypt `ciphertext_b64` with AES-256-GCM using the provided 32-byte `key`.
///
/// Returns the original plaintext on success, or an error if the key is wrong
/// or the ciphertext has been tampered with.
pub fn decrypt(ciphertext_b64: &str, nonce_b64: &str, key: &[u8]) -> anyhow::Result<Vec<u8>> {
    anyhow::ensure!(key.len() == 32, "key must be 32 bytes");

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| anyhow::anyhow!("invalid key: {}", e))?;

    let ciphertext = STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| anyhow::anyhow!("invalid ciphertext base64: {}", e))?;
    let nonce_bytes = STANDARD
        .decode(nonce_b64)
        .map_err(|e| anyhow::anyhow!("invalid nonce base64: {}", e))?;

    anyhow::ensure!(nonce_bytes.len() == 12, "nonce must be 12 bytes");
    let nonce = Nonce::from_slice(&nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| anyhow::anyhow!("decryption failed (wrong key or corrupted data): {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_key_produces_32_bytes() {
        let key = derive_key("password123", "user-salt");
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn derive_key_is_deterministic() {
        let key1 = derive_key("password123", "user-salt");
        let key2 = derive_key("password123", "user-salt");
        assert_eq!(key1, key2);
    }

    #[test]
    fn derive_key_differs_with_different_salt() {
        let key1 = derive_key("password123", "salt-a");
        let key2 = derive_key("password123", "salt-b");
        assert_ne!(key1, key2);
    }

    #[test]
    fn derive_key_differs_with_different_password() {
        let key1 = derive_key("password1", "salt");
        let key2 = derive_key("password2", "salt");
        assert_ne!(key1, key2);
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = derive_key("test-password", "test-salt");
        let plaintext = b"secret credentials json";

        let (ciphertext, nonce) = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&ciphertext, &nonce, &key).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn decrypt_fails_with_wrong_key() {
        let key1 = derive_key("correct-password", "salt");
        let key2 = derive_key("wrong-password", "salt");

        let (ciphertext, nonce) = encrypt(b"secret", &key1).unwrap();
        let result = decrypt(&ciphertext, &nonce, &key2);

        assert!(result.is_err());
    }

    #[test]
    fn encrypt_produces_different_ciphertext_each_time() {
        let key = derive_key("password", "salt");
        let plaintext = b"same plaintext";

        let (ct1, _) = encrypt(plaintext, &key).unwrap();
        let (ct2, _) = encrypt(plaintext, &key).unwrap();

        // Different nonces → different ciphertext (with overwhelming probability)
        assert_ne!(ct1, ct2);
    }

    #[test]
    fn decrypt_fails_with_corrupted_ciphertext() {
        let key = derive_key("password", "salt");
        let (mut ciphertext, nonce) = encrypt(b"secret", &key).unwrap();

        // Flip the first byte of the ciphertext to corrupt it
        let mut bytes = STANDARD.decode(&ciphertext).unwrap();
        if !bytes.is_empty() {
            bytes[0] ^= 0xFF;
        }
        ciphertext = STANDARD.encode(&bytes);

        let result = decrypt(&ciphertext, &nonce, &key);
        assert!(result.is_err());
    }
}
