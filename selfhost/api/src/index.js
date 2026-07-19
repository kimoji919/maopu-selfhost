const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../../.env') });
const { createDatabaseAdapter, createRuntimeContext } = require('./runtime');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const mongoUrl = process.env.MONGO_URL;
const jwtSecret = process.env.JWT_SECRET;
if (!mongoUrl || !jwtSecret) throw new Error('MONGO_URL and JWT_SECRET must be configured');

const readableCollections = new Set([
  'badge', 'badge_def', 'badge_rank', 'cat', 'comment', 'feedback', 'inter',
  'news', 'photo', 'photo_rank', 'rating', 'reward', 'science', 'setting', 'user', 'vaccine',
]);
const clientInsertCollections = new Set(['comment', 'feedback', 'inter', 'photo', 'rating']);
const privateSettingIds = ['accessToken', 'tempCOSToken'];
const allowedAggregateStages = new Set([
  '$match', '$project', '$sort', '$skip', '$limit', '$unwind', '$group', '$addFields', '$count',
]);
const unionOpEntry = [
  path.resolve(__dirname, '../functionsEMAS/unionOp/index.js'), // Docker image
  path.resolve(__dirname, '../../../functionsEMAS/unionOp/index.js'), // repository checkout
].find(fs.existsSync);
if (!unionOpEntry) throw new Error('cannot locate functionsEMAS/unionOp');

function normalizeBasePath(value) {
  const path = String(value || '/maopu/api').trim();
  if (!path.startsWith('/') || path.includes('..') || /\s/.test(path)) {
    throw new Error('API_BASE_PATH must be an absolute URL path, e.g. /maopu/api');
  }
  return path.replace(/\/+$/, '') || '/';
}

function signToken(openid) {
  return jwt.sign({ openid }, jwtSecret, { expiresIn: '7d', issuer: 'maopu-api' });
}

function createAuthMiddleware(secret) {
  return function requireAuth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'missing authorization token' });
  try {
    req.auth = jwt.verify(token, secret, { issuer: 'maopu-api' });
    next();
  } catch (_) {
    res.status(401).json({ error: 'invalid or expired authorization token' });
  }
  };
}

async function getWechatCredentials(database) {
  const fromDb = await database.collection('app_secret').findOne({});
  return {
    appid: process.env.WECHAT_APPID || fromDb?.MP_APPID,
    secret: process.env.WECHAT_APPSECRET || fromDb?.MP_SECRET,
  };
}

function restrictSettingQuery(query = {}) {
  return { $and: [query, { _id: { $nin: privateSettingIds } }] };
}

function validateReadArgs(collection, operation, args) {
  if (operation !== 'aggregate') {
    if (collection === 'setting') args[0] = restrictSettingQuery(args[0] || {});
    return;
  }
  const pipeline = args[0];
  if (!Array.isArray(pipeline) || pipeline.some((stage) => {
    const keys = Object.keys(stage || {});
    return keys.length !== 1 || !allowedAggregateStages.has(keys[0]);
  })) {
    throw new Error('aggregation contains a disallowed stage');
  }
  if (collection === 'setting') pipeline.unshift({ $match: { _id: { $nin: privateSettingIds } } });
}

function createApp({ mongoClient, tokenSecret = jwtSecret, basePath = process.env.API_BASE_PATH } = {}) {
  const databaseClient = mongoClient || new MongoClient(mongoUrl);
  const apiBasePath = normalizeBasePath(basePath);
  const app = express();
  const requireAuth = createAuthMiddleware(tokenSecret);
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get(`${apiBasePath}/healthz`, async (_req, res) => {
  try {
    await databaseClient.db().command({ ping: 1 });
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
  });

  app.post(`${apiBasePath}/auth/wechat`, async (req, res, next) => {
  try {
    const database = databaseClient.db();
    let openid;
    // Allows local Mini Program debugging without exposing an insecure production route.
    if (process.env.NODE_ENV !== 'production' && process.env.DEV_OPENID) {
      openid = process.env.DEV_OPENID;
    } else {
      const { code } = req.body || {};
      if (!code) return res.status(400).json({ error: 'wx.login code is required' });
      const { appid, secret } = await getWechatCredentials(database);
      if (!appid || !secret) return res.status(503).json({ error: 'WeChat credentials are not configured' });
      const { data } = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: { appid, secret, js_code: code, grant_type: 'authorization_code' },
        timeout: 10000,
      });
      if (!data.openid) return res.status(401).json({ error: data.errmsg || 'WeChat login failed', errcode: data.errcode });
      openid = data.openid;
    }
    res.json({ result: { token: jwt.sign({ openid }, tokenSecret, { expiresIn: '7d', issuer: 'maopu-api' }), openid, expiredAt: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 } });
  } catch (error) { next(error); }
  });

  app.post(`${apiBasePath}/functions/:name`, requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    if (name !== 'unionOp') return res.status(501).json({ error: `self-hosted function not implemented: ${name}` });
    const database = databaseClient.db();
    const unionOp = require(unionOpEntry);
    const invoke = async (functionName, args = {}) => {
      if (functionName !== 'unionOp') throw new Error(`unsupported internal function: ${functionName}`);
      return unionOp(createRuntimeContext(database, { ...args, openid: req.auth.openid }, invoke));
    };
    const args = { ...(req.body || {}), openid: req.auth.openid };
    const result = await unionOp(createRuntimeContext(database, args, invoke));
    res.json({ result });
  } catch (error) { next(error); }
  });

  app.post(`${apiBasePath}/db/:collection`, requireAuth, async (req, res, next) => {
  try {
    const { collection } = req.params;
    const { operation, args = [] } = req.body || {};
    if (!readableCollections.has(collection)) return res.status(403).json({ error: 'collection is not client-accessible' });
    validateReadArgs(collection, operation, args);
    const db = createDatabaseAdapter(databaseClient.db()).collection(collection);
    if (['find', 'findOne', 'count', 'aggregate'].includes(operation)) {
      const result = await db[operation](...args);
      return res.json(result);
    }
    if (operation === 'insertOne' && clientInsertCollections.has(collection)) {
      const document = { ...(args[0] || {}), _openid: req.auth.openid };
      return res.json(await db.insertOne(document));
    }
    res.status(403).json({ error: 'operation is not allowed by the Mini Program policy' });
  } catch (error) { next(error); }
  });

  app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'internal server error' });
  });
  app.locals.apiBasePath = apiBasePath;
  return app;
}

async function start() {
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const server = createApp({ mongoClient: client });
  server.listen(port, host, () => console.log(`maopu API listening on http://${host}:${port}`));
}

if (require.main === module) {
  start().catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { createApp, start, validateReadArgs, normalizeBasePath };
