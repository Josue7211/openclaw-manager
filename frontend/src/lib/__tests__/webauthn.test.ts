import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isWebAuthnSupported, registerWebAuthnKey, authenticateWebAuthnKey } from '../webauthn'
import type { WebAuthnCreationOptions, WebAuthnRequestOptions } from '../webauthn'

/* ─── isWebAuthnSupported ─────────────────────────────────────────── */

describe('isWebAuthnSupported', () => {
  const originalCredentials = navigator.credentials
  const originalPKC = window.PublicKeyCredential

  afterEach(() => {
    Object.defineProperty(navigator, 'credentials', {
      value: originalCredentials,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: originalPKC,
      writable: true,
      configurable: true,
    })
  })

  it('returns true when both navigator.credentials and PublicKeyCredential exist', () => {
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn(), get: vi.fn() },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: function () {},
      writable: true,
      configurable: true,
    })
    expect(isWebAuthnSupported()).toBe(true)
  })

  it('returns false when navigator.credentials is missing', () => {
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    expect(isWebAuthnSupported()).toBe(false)
  })

  it('returns false when PublicKeyCredential is missing', () => {
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn(), get: vi.fn() },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    expect(isWebAuthnSupported()).toBe(false)
  })
})

/* ─── registerWebAuthnKey ─────────────────────────────────────────── */

describe('registerWebAuthnKey', () => {
  const mockCreationOptions: WebAuthnCreationOptions = {
    challenge: 'dGVzdC1jaGFsbGVuZ2U', // "test-challenge" in base64url
    rp: { name: 'OpenClaw Manager', id: 'localhost' },
    user: {
      id: 'dXNlci1pZA', // "user-id" in base64url
      name: 'user@test.com',
      displayName: 'Test User',
    },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 60000,
  }

  it('throws when navigator.credentials.create returns null', async () => {
    const mockCreate = vi.fn().mockResolvedValue(null)
    Object.defineProperty(navigator, 'credentials', {
      value: { create: mockCreate },
      writable: true,
      configurable: true,
    })

    await expect(registerWebAuthnKey(mockCreationOptions)).rejects.toThrow('No credential returned from authenticator')
  })

  it('calls navigator.credentials.create with converted ArrayBuffers', async () => {
    const mockRawId = new Uint8Array([1, 2, 3]).buffer
    const mockAttestationObject = new Uint8Array([4, 5, 6]).buffer
    const mockClientDataJSON = new Uint8Array([7, 8, 9]).buffer

    const mockCredential = {
      id: 'cred-id',
      rawId: mockRawId,
      type: 'public-key',
      response: {
        attestationObject: mockAttestationObject,
        clientDataJSON: mockClientDataJSON,
      },
    }

    const mockCreate = vi.fn().mockResolvedValue(mockCredential)
    Object.defineProperty(navigator, 'credentials', {
      value: { create: mockCreate },
      writable: true,
      configurable: true,
    })

    const result = await registerWebAuthnKey(mockCreationOptions)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.publicKey).toBeDefined()
    expect(callArgs.publicKey.challenge).toBeInstanceOf(ArrayBuffer)
    expect(callArgs.publicKey.user.id).toBeInstanceOf(ArrayBuffer)

    expect(result.id).toBe('cred-id')
    expect(result.type).toBe('public-key')
    expect(typeof result.rawId).toBe('string')
    expect(typeof result.response.attestationObject).toBe('string')
    expect(typeof result.response.clientDataJSON).toBe('string')
  })
})

/* ─── authenticateWebAuthnKey ─────────────────────────────────────── */

describe('authenticateWebAuthnKey', () => {
  const mockRequestOptions: WebAuthnRequestOptions = {
    challenge: 'dGVzdC1jaGFsbGVuZ2U',
    timeout: 60000,
    rpId: 'localhost',
    allowCredentials: [
      { id: 'Y3JlZC1pZA', type: 'public-key' },
    ],
  }

  it('throws when navigator.credentials.get returns null', async () => {
    const mockGet = vi.fn().mockResolvedValue(null)
    Object.defineProperty(navigator, 'credentials', {
      value: { get: mockGet },
      writable: true,
      configurable: true,
    })

    await expect(authenticateWebAuthnKey(mockRequestOptions)).rejects.toThrow('No credential returned from authenticator')
  })

  it('calls navigator.credentials.get with converted ArrayBuffers', async () => {
    const mockRawId = new Uint8Array([1, 2, 3]).buffer
    const mockAuthenticatorData = new Uint8Array([4, 5, 6]).buffer
    const mockClientDataJSON = new Uint8Array([7, 8, 9]).buffer
    const mockSignature = new Uint8Array([10, 11, 12]).buffer

    const mockCredential = {
      id: 'cred-id',
      rawId: mockRawId,
      type: 'public-key',
      response: {
        authenticatorData: mockAuthenticatorData,
        clientDataJSON: mockClientDataJSON,
        signature: mockSignature,
      },
    }

    const mockGet = vi.fn().mockResolvedValue(mockCredential)
    Object.defineProperty(navigator, 'credentials', {
      value: { get: mockGet },
      writable: true,
      configurable: true,
    })

    const result = await authenticateWebAuthnKey(mockRequestOptions)

    expect(mockGet).toHaveBeenCalledTimes(1)
    const callArgs = mockGet.mock.calls[0][0]
    expect(callArgs.publicKey).toBeDefined()
    expect(callArgs.publicKey.challenge).toBeInstanceOf(ArrayBuffer)
    expect(callArgs.publicKey.allowCredentials).toHaveLength(1)
    expect(callArgs.publicKey.allowCredentials[0].id).toBeInstanceOf(ArrayBuffer)

    expect(result.id).toBe('cred-id')
    expect(result.type).toBe('public-key')
    expect(typeof result.rawId).toBe('string')
    expect(typeof result.response.authenticatorData).toBe('string')
    expect(typeof result.response.clientDataJSON).toBe('string')
    expect(typeof result.response.signature).toBe('string')
  })

  it('handles empty allowCredentials', async () => {
    const options: WebAuthnRequestOptions = {
      challenge: 'dGVzdA',
      timeout: 60000,
    }

    const mockCredential = {
      id: 'cred-id',
      rawId: new Uint8Array([1]).buffer,
      type: 'public-key',
      response: {
        authenticatorData: new Uint8Array([2]).buffer,
        clientDataJSON: new Uint8Array([3]).buffer,
        signature: new Uint8Array([4]).buffer,
      },
    }

    const mockGet = vi.fn().mockResolvedValue(mockCredential)
    Object.defineProperty(navigator, 'credentials', {
      value: { get: mockGet },
      writable: true,
      configurable: true,
    })

    const result = await authenticateWebAuthnKey(options)
    expect(result.id).toBe('cred-id')
  })
})

/* ─── Type exports ────────────────────────────────────────────────── */

describe('type exports', () => {
  it('WebAuthnCreationOptions has required fields', () => {
    const options: WebAuthnCreationOptions = {
      challenge: 'test',
      rp: { name: 'Test' },
      user: { id: 'id', name: 'name', displayName: 'Name' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    }
    expect(options.challenge).toBe('test')
  })

  it('WebAuthnRequestOptions has required fields', () => {
    const options: WebAuthnRequestOptions = {
      challenge: 'test',
    }
    expect(options.challenge).toBe('test')
  })
})
