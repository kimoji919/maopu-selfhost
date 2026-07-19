const axios = require('axios');

function normalizeOptions(options = {}) {
  const normalized = { ...options };
  if (normalized.projection) normalized.projection = normalized.projection;
  return normalized;
}

function mutationResult(result) {
  return {
    acknowledged: result.acknowledged,
    insertedId: result.insertedId,
    insertedCount: result.insertedCount,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    deletedCount: result.deletedCount,
    upsertedId: result.upsertedId,
  };
}

// EMAS handlers return / consume { result }, whereas the MongoDB driver returns
// values directly. This deliberately small adapter lets the existing handlers run
// without rewriting their business rules.
function createDatabaseAdapter(database) {
  return {
    collection(name) {
      const collection = database.collection(name);
      return {
        async find(filter = {}, options = {}) {
          const cursor = collection.find(filter, normalizeOptions(options));
          return { result: await cursor.toArray() };
        },
        async findOne(filter = {}, options = {}) {
          return { result: await collection.findOne(filter, normalizeOptions(options)) };
        },
        async count(filter = {}) {
          return { result: await collection.countDocuments(filter) };
        },
        async aggregate(pipeline = [], options = {}) {
          return { result: await collection.aggregate(pipeline, normalizeOptions(options)).toArray() };
        },
        async insertOne(document) {
          return { result: mutationResult(await collection.insertOne(document)) };
        },
        async insertMany(documents, options = {}) {
          return { result: mutationResult(await collection.insertMany(documents, options)) };
        },
        async updateOne(filter, update, options = {}) {
          return { result: mutationResult(await collection.updateOne(filter, update, options)) };
        },
        async updateMany(filter, update, options = {}) {
          return { result: mutationResult(await collection.updateMany(filter, update, options)) };
        },
        async deleteOne(filter, options = {}) {
          return { result: mutationResult(await collection.deleteOne(filter, options)) };
        },
        async deleteMany(filter, options = {}) {
          return { result: mutationResult(await collection.deleteMany(filter, options)) };
        },
        async findOneAndUpdate(filter, update, options = {}) {
          const result = await collection.findOneAndUpdate(filter, update, {
            returnDocument: 'after',
            ...options,
          });
          return { result };
        },
      };
    },
  };
}

function createRuntimeContext(database, args, invoke) {
  return {
    args,
    mpserverless: {
      db: createDatabaseAdapter(database),
      function: { invoke },
      // File deletion used by legacy handlers is intentionally disabled until
      // storage migration is completed in step three.
      file: {
        async uploadFile() { throw new Error('Self-hosted file upload is not configured'); },
        async deleteFile() { throw new Error('Self-hosted file deletion is not configured'); },
      },
    },
    httpclient: {
      async request(url, options = {}) {
        const response = await axios({
          url,
          method: options.method || 'GET',
          headers: options.headers,
          data: options.data,
          timeout: options.timeout || 15000,
          validateStatus: () => true,
        });
        return { status: response.status, data: response.data };
      },
    },
  };
}

module.exports = { createDatabaseAdapter, createRuntimeContext };
