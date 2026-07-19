const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) throw new Error('MONGO_URL must be configured');

const indexes = {
  user: [{ key: { openid: 1 }, name: 'openid' }],
  cat: [{ key: { _no: 1 }, name: 'cat_no' }, { key: { deleted: 1 }, name: 'deleted' }],
  photo: [
    { key: { cat_id: 1, verified: 1, mdate: -1 }, name: 'cat_verified_mdate' },
    { key: { _openid: 1, verified: 1 }, name: 'owner_verified' },
  ],
  comment: [{ key: { cat_id: 1, create_date: -1 }, name: 'cat_create_date' }],
  feedback: [{ key: { _openid: 1, openDate: -1 }, name: 'owner_open_date' }],
  inter: [{ key: { uid: 1, type: 1, item_id: 1 }, name: 'user_type_item' }],
  rating: [{ key: { _openid: 1, cat_id: 1 }, name: 'owner_cat' }],
  badge: [{ key: { user_openid: 1, catId: 1 }, name: 'user_cat' }],
  vaccine: [{ key: { cat_id: 1, date: -1 }, name: 'cat_date' }],
};

async function main() {
  const client = new MongoClient(mongoUrl);
  await client.connect();
  try {
    const database = client.db();
    for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
      const collection = database.collection(collectionName);
      for (const index of collectionIndexes) await collection.createIndex(index.key, { name: index.name });
      console.log(`prepared ${collectionName}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
