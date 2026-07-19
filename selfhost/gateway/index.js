const http = require('http');
const https = require('https');

function parseTarget(value, name) {
  try {
    const target = new URL(value);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('unsupported protocol');
    return target;
  } catch (error) {
    throw new Error(`${name} must be an absolute http(s) URL: ${error.message}`);
  }
}

function isApiRequest(url, apiBasePath) {
  return url === apiBasePath || url.startsWith(`${apiBasePath}/`);
}

function createGateway({
  apiBasePath = process.env.API_BASE_PATH || '/maopu/api',
  apiTarget = process.env.API_TARGET || 'http://127.0.0.1:8788',
  legacyTarget = process.env.LEGACY_TARGET || 'http://127.0.0.1:8789',
} = {}) {
  const api = parseTarget(apiTarget, 'API_TARGET');
  const legacy = parseTarget(legacyTarget, 'LEGACY_TARGET');
  const normalizedApiPath = apiBasePath.replace(/\/+$/, '') || '/';

  const server = http.createServer((request, response) => {
    const target = isApiRequest(request.url || '/', normalizedApiPath) ? api : legacy;
    const transport = target.protocol === 'https:' ? https : http;
    const upstream = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: request.method,
      path: request.url,
      headers: {
        ...request.headers,
        host: target.host,
        'x-forwarded-host': request.headers.host || '',
        'x-forwarded-proto': 'http',
      },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', (error) => {
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'upstream unavailable', detail: error.code || error.message }));
      } else response.destroy(error);
    });
    request.pipe(upstream);
  });

  server.on('upgrade', (request, socket, head) => {
    const target = isApiRequest(request.url || '/', normalizedApiPath) ? api : legacy;
    const transport = target.protocol === 'https:' ? https : http;
    const upstream = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: request.method,
      path: request.url,
      headers: request.headers,
    });
    upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
      socket.write(`HTTP/1.1 ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}\r\n`);
      for (const [name, value] of Object.entries(upstreamResponse.headers)) socket.write(`${name}: ${value}\r\n`);
      socket.write('\r\n');
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
    });
    upstream.on('error', () => socket.destroy());
    upstream.end();
  });
  return server;
}

function start() {
  const port = Number(process.env.GATEWAY_PORT || 8787);
  const host = process.env.GATEWAY_HOST || '127.0.0.1';
  const server = createGateway();
  server.listen(port, host, () => console.log(`maopu gateway listening on http://${host}:${port}`));
}

if (require.main === module) start();

module.exports = { createGateway, isApiRequest };
