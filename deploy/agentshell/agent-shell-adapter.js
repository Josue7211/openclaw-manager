#!/usr/bin/env node
const http = require('http');
const crypto = require('crypto');

const host = process.env.AGENTSHELL_HOST || '127.0.0.1';
const port = Number(process.env.AGENTSHELL_PORT || 8077);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function sessionShape(payload, mode) {
  const now = new Date().toISOString();
  const id = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload) + mode + now)
    .digest('hex')
    .slice(0, 16);
  return {
    ok: true,
    provider: 'local-agentshell',
    mode,
    session_id: `local-${id}`,
    status: mode === 'plan' ? 'planned' : 'queued',
    created_at: now,
    request: payload,
    execution: {
      shell_execution: false,
      requires_approval: true,
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return send(res, 200, {
        ok: true,
        status: 'ok',
        provider: 'local-agentshell',
        capabilities: ['sessions.plan', 'sessions.dispatch'],
      });
    }

    if (req.method === 'POST' && url.pathname === '/v1/sessions/plan') {
      return send(res, 200, sessionShape(await readBody(req), 'plan'));
    }

    if (req.method === 'POST' && url.pathname === '/v1/sessions') {
      return send(res, 200, sessionShape(await readBody(req), 'dispatch'));
    }

    send(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    send(res, 400, { ok: false, error: err.message || 'bad request' });
  }
});

server.listen(port, host, () => {
  console.log(`local AgentShell adapter listening on http://${host}:${port}`);
});
