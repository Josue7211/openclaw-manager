import { describe, expect, it } from 'vitest'
import { verifyEncryptedVaultBackup } from '../vaultBackup'

describe('encrypted vault backup verifier', () => {
  it('accepts supported encrypted vault backups', () => {
    expect(verifyEncryptedVaultBackup({
      format: 'clawcontrol-encrypted-vault-backup',
      version: 1,
      created_at: '2026-05-12T00:00:00Z',
      encryption: {
        algorithm: 'AES-256-GCM',
        kdf: 'Argon2id',
        salt: 'salt',
        nonce: 'nonce',
      },
      ciphertext: 'ciphertext',
    })).toEqual({ ok: true, errors: [] })
  })

  it('rejects unsupported or incomplete backups', () => {
    const result = verifyEncryptedVaultBackup({
      format: 'other',
      version: 2,
      encryption: {
        algorithm: 'plain',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'Backup format is not supported',
      'Backup version is not supported',
      'Backup encryption algorithm is not supported',
      'Backup ciphertext is missing',
    ]))
  })
})
