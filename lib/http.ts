import https from 'https'
import http from 'http'
import fs from 'fs'

/**
 * TLS agent for homelab devices with self-signed certs.
 *
 * Set HOMELAB_CA_CERT to a PEM file path to verify against a custom CA
 * instead of disabling TLS verification entirely.
 *
 * Falls back to rejectUnauthorized: false when no CA is provided.
 */
const caPath = process.env.HOMELAB_CA_CERT || ''
const caData = caPath ? (() => { try { return fs.readFileSync(caPath) } catch { return undefined } })() : undefined

export const insecureTlsAgent = new https.Agent(
  caData
    ? { ca: caData }
    : { rejectUnauthorized: false }
)

/**
 * Fetch wrapper that actually uses the custom TLS agent for self-signed certs.
 * Next.js fetch ignores the `agent` option, so we use Node's native http/https.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function homelabFetch(url: string, options: { headers?: Record<string, string> } = {}): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const req = mod.request(url, {
      method: 'GET',
      headers: options.headers,
      agent: parsed.protocol === 'https:' ? insecureTlsAgent : undefined,
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        resolve({
          ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
          status: res.statusCode ?? 500,
          json: () => Promise.resolve(JSON.parse(body)),
        })
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(new Error('Timeout')) })
    req.end()
  })
}
