use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};

pub fn hash(password: &str) -> Result<String, ()> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| ())
}

pub fn verify(password: &str, password_hash: &str) -> bool {
    PasswordHash::new(password_hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_then_verify_succeeds() {
        let hashed = hash("correct-horse").expect("hash should succeed");
        assert!(verify("correct-horse", &hashed));
    }

    #[test]
    fn verify_rejects_wrong_password() {
        let hashed = hash("correct-horse").expect("hash should succeed");
        assert!(!verify("wrong-password", &hashed));
    }

    #[test]
    fn verify_rejects_malformed_hash() {
        assert!(!verify("correct-horse", "not-a-valid-hash"));
    }

    #[test]
    fn same_password_produces_different_hashes() {
        let first = hash("correct-horse").expect("hash should succeed");
        let second = hash("correct-horse").expect("hash should succeed");
        assert_ne!(first, second, "salts should differ between hash calls");
        assert!(verify("correct-horse", &first));
        assert!(verify("correct-horse", &second));
    }
}
