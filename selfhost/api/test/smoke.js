const assert = require('assert');
const { createApp } = require('../src/index');

const data = {
  cat: [{ _id: 'cat-1', name: '阿橘' }],
  setting: [{ _id: 'public', title: '公开配置' }, { _id: 'accessToken', accessToken: 'secret-token' }],
};

function matches(document, query = {}) {
  if (query.$and) return query.$and.every((part) => matches(document, part));
  return Object.entries(query).every(([key, value]) => {
    if (value && value.$nin) return !value.$nin.includes(document[key]);
    return document[key] === value;
  });
}

function fakeDatabase() {
  return {
    async command() { return { ok: 1 }; },
    collection(name) {
      const documents = data[name] || (data[name] = []);
      return {
        find(query = {}, options = {}) {
          let result = documents.filter((item) => matches(item, query));
          if (options.limit) result = result.slice(0, options.limit);
          return { toArray: async () => result };
        },
        findOne: async (query = {}) => documents.find((item) => matches(item, query)) || null,
        countDocuments: async (query = {}) => documents.filter((item) => matches(item, query)).length,
        aggregate: () => ({ toArray: async () => [] }),
        insertOne: async (item) => { documents.push(item); return { acknowledged: true, insertedId: item._id || 'generated' }; },
        insertMany: async () => ({ acknowledged: true }),
        updateOne: async () => ({ acknowledged: true }),
        updateMany: async () => ({ acknowledged: true }),
        deleteOne: async () => ({ acknowledged: true }),
        deleteMany: async () => ({ acknowledged: true }),
        findOneAndUpdate: async () => null,
      };
    },
  };
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  return { status: response.status, body: await response.json() };
}

async function main() {
  const database = fakeDatabase();
  const basePath = '/maopu/api';
  const app = createApp({ mongoClient: { db: () => database }, tokenSecret: process.env.JWT_SECRET, basePath });
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await request(base, `${basePath}/healthz`)).status, 200);
    const login = await request(base, `${basePath}/auth/wechat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(login.body.result.openid, 'test-openid');
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${login.body.result.token}` };
    const cats = await request(base, `${basePath}/db/cat`, { method: 'POST', headers, body: JSON.stringify({ operation: 'find', args: [{}] }) });
    assert.equal(cats.body.result[0].name, '阿橘');
    const settings = await request(base, `${basePath}/db/setting`, { method: 'POST', headers, body: JSON.stringify({ operation: 'find', args: [{}] }) });
    assert.deepEqual(settings.body.result.map((item) => item._id), ['public']);
    const cloud = await request(base, `${basePath}/functions/unionOp`, { method: 'POST', headers, body: JSON.stringify({ deploy_test: true }) });
    assert.equal(cloud.body.result, 'v1.5');
    const forbidden = await request(base, `${basePath}/db/app_secret`, { method: 'POST', headers, body: JSON.stringify({ operation: 'find', args: [{}] }) });
    assert.equal(forbidden.status, 403);
    console.log('self-hosted API smoke test passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
