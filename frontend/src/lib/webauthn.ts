/**
 * WebAuthn/FIDO2 utility functions for hardware key registration and authentication.
 * Handles the browser WebAuthn API and base64url encoding needed for server communication.
 */

/** Convert a base64url-encoded string to an ArrayBuffer (WebAuthn uses ArrayBuffer) */
function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Convert an ArrayBuffer to a base64url-encoded string */
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Check if the browser supports WebAuthn/FIDO2 */
export function isWebAuthnSupported(): boolean {
  return !!(navigator.credentials && window.PublicKeyCredential)
}

/** Server-provided creation options (base64url-encoded where needed) */
export interface WebAuthnCreationOptions {
  challenge: string
  rp: { id?: string; name: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: Array<{ alg: number; type: string }>
  timeout?: number
  attestation?: AttestationConveyancePreference
  authenticatorSelection?: AuthenticatorSelectionCriteria
  excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>
}

/** Server-provided request options (base64url-encoded where needed) */
export interface WebAuthnRequestOptions {
  challenge: string
  timeout?: number
  rpId?: string
  userVerification?: UserVerificationRequirement
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>
}

/** Attestation response to send back to the server */
export interface WebAuthnRegistrationResponse {
  id: string
  rawId: string
  type: string
  response: {
    attestationObject: string
    clientDataJSON: string
  }
}

/** Assertion response to send back to the server */
export interface WebAuthnAuthenticationResponse {
  id: string
  rawId: string
  type: string
  response: {
    authenticatorData: string
    clientDataJSON: string
    signature: string
  }
}

/**
 * Register a new hardware key using the browser WebAuthn API.
 * Takes server-provided creation options (with base64url strings),
 * converts them to ArrayBuffers, prompts the user, and returns
 * the attestation response with base64url-encoded fields.
 */
export async function registerWebAuthnKey(
  creationOptions: WebAuthnCreationOptions,
): Promise<WebAuthnRegistrationResponse> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...creationOptions,
    challenge: base64urlToBuffer(creationOptions.challenge),
    user: {
      ...creationOptions.user,
      id: base64urlToBuffer(creationOptions.user.id),
    },
    excludeCredentials: (creationOptions.excludeCredentials || []).map(c => ({
      ...c,
      id: base64urlToBuffer(c.id),
      type: c.type as PublicKeyCredentialType,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    pubKeyCredParams: creationOptions.pubKeyCredParams.map(p => ({
      alg: p.alg,
      type: p.type as PublicKeyCredentialType,
    })),
  }

  const credential = await navigator.credentials.create({ publicKey })
  if (!credential) throw new Error('No credential returned from authenticator')

  const pkc = credential as PublicKeyCredential
  const response = pkc.response as AuthenticatorAttestationResponse

  return {
    id: pkc.id,
    rawId: bufferToBase64url(pkc.rawId),
    type: pkc.type,
    response: {
      attestationObject: bufferToBase64url(response.attestationObject),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
    },
  }
}

/**
 * Authenticate with a hardware key using the browser WebAuthn API.
 * Takes server-provided request options (with base64url strings),
 * converts them to ArrayBuffers, prompts the user, and returns
 * the assertion response with base64url-encoded fields.
 */
export async function authenticateWebAuthnKey(
  requestOptions: WebAuthnRequestOptions,
): Promise<WebAuthnAuthenticationResponse> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...requestOptions,
    challenge: base64urlToBuffer(requestOptions.challenge),
    allowCredentials: (requestOptions.allowCredentials || []).map(c => ({
      ...c,
      id: base64urlToBuffer(c.id),
      type: c.type as PublicKeyCredentialType,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  }

  const credential = await navigator.credentials.get({ publicKey })
  if (!credential) throw new Error('No credential returned from authenticator')

  const pkc = credential as PublicKeyCredential
  const response = pkc.response as AuthenticatorAssertionResponse

  return {
    id: pkc.id,
    rawId: bufferToBase64url(pkc.rawId),
    type: pkc.type,
    response: {
      authenticatorData: bufferToBase64url(response.authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
    },
  }
}
