export interface VaultBackupVerification {
  ok: boolean
  errors: string[]
}

const BACKUP_FORMAT = 'clawctrl-encrypted-vault-backup'
const BACKUP_VERSION = 1

export function verifyEncryptedVaultBackup(input: unknown): VaultBackupVerification {
  const errors: string[] = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Backup is not a JSON object'] }
  }

  const backup = input as Record<string, unknown>
  if (backup.format !== BACKUP_FORMAT) {
    errors.push('Backup format is not supported')
  }
  if (backup.version !== BACKUP_VERSION) {
    errors.push('Backup version is not supported')
  }
  if (typeof backup.created_at !== 'string' || !backup.created_at) {
    errors.push('Backup is missing created_at')
  }

  const encryption = backup.encryption
  if (!encryption || typeof encryption !== 'object' || Array.isArray(encryption)) {
    errors.push('Backup is missing encryption metadata')
  } else {
    const meta = encryption as Record<string, unknown>
    if (meta.algorithm !== 'AES-256-GCM') errors.push('Backup encryption algorithm is not supported')
    if (meta.kdf !== 'Argon2id') errors.push('Backup key derivation is not supported')
    if (typeof meta.salt !== 'string' || !meta.salt) errors.push('Backup salt is missing')
    if (typeof meta.nonce !== 'string' || !meta.nonce) errors.push('Backup nonce is missing')
  }

  if (typeof backup.ciphertext !== 'string' || !backup.ciphertext) {
    errors.push('Backup ciphertext is missing')
  }

  return { ok: errors.length === 0, errors }
}
