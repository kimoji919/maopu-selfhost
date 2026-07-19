const assert = require('assert');
const http = require('http');
const { createGateway } = require('../index');

function upstream(label) {
  return http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ label, url: request.url }));
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function main() {
  const api = upstream('api');
  const legacy = upstream('legacy');
  const apiPort = await listen(api);
  const legacyPort = await listen(legacy);
  const gateway = createGateway({ apiTarget: `http://127.0.0.1:${apiPort}`, legacyTarget: `http://127.0.0.1:${legacyPort}` });
  const gatewayPort = await listen(gateway);
  try {
    const apiResult = await (await fetch(`http://127.0.0.1:${gatewayPort}/maopu/api/healthz`)).json();
    const legacyResult = await (await fetch(`http://127.0.0.1:${gatewayPort}/chat`)).json();
    assert.deepEqual(apiResult, { label: 'api', url: '/maopu/api/healthz' });
    assert.deepEqual(legacyResult, { label: 'legacy', url: '/chat' });
    console.log('gateway smoke test passed');
  } finally {
    await Promise.all([api, legacy, gateway].map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
