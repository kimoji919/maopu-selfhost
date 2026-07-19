// Import one JSON array or JSONL file per collection. This script refuses empty
// exports so a migration cannot accidentally replace a real database with the
// placeholder files committed in this repository.
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const sourceDir = process.argv[2];
const mongoUrl = process.env.MONGO_URL;
if (!sourceDir || !mongoUrl) {
  console.error('Usage: MONGO_URL=... node src/import-data.js /path/to/export-directory');
  process.exit(1);
}

function readDocuments(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) throw new Error(`${path.basename(file)} is empty`);
  if (raw.startsWith('[')) {
    const documents = JSON.parse(raw);
    if (!Array.isArray(documents)) throw new Error(`${path.basename(file)} must contain a JSON array`);
    return documents;
  }
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function main() {
  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.json'));
  if (!files.length) throw new Error('no .json export files found');
  const client = new MongoClient(mongoUrl);
  await client.connect();
  try {
    const database = client.db();
    for (const file of files) {
      const documents = readDocuments(path.join(sourceDir, file));
      if (!documents.length) continue;
      const collection = path.basename(file, '.json').replace(/_processed$/, '');
      await database.collection(collection).deleteMany({});
      await database.collection(collection).insertMany(documents, { ordered: false });
      console.log(`${collection}: imported ${documents.length} records`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
