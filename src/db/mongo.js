import { MongoClient } from 'mongodb';
import config from '../config/index.js';

let client;
let db;

export async function connectDb() {
  if (db) return db;
  if (!config.mongo.uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  client = new MongoClient(config.mongo.uri);
  await client.connect();
  db = client.db(config.mongo.db);
  console.log(`Connected to MongoDB: ${config.mongo.db}`);
  await ensureIndexes(db);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.');
  return db;
}

export function col(name) {
  return getDb().collection(name);
}

async function ensureIndexes(database) {
  await database.collection('sources').createIndex({ name: 1 }, { unique: true });

  await database.collection('scan_runs').createIndex({ source_id: 1, started_at: -1 });

  await database.collection('discoveries').createIndex({ candidate_url: 1 });
  await database.collection('discoveries').createIndex({ source_id: 1, discovered_at: -1 });
  await database.collection('discoveries').createIndex({ status: 1 });

  await database.collection('raw_pages').createIndex({ url: 1 });

  await database.collection('entities').createIndex({ canonical_domain: 1 });
  await database.collection('entities').createIndex({ name: 1 });
  await database.collection('entities').createIndex({ 'classification.is_startup': 1, updated_at: -1 });

  await database.collection('evidence').createIndex({ url: 1 });

  await database.collection('signals').createIndex({ entity_id: 1, captured_at: -1 });
  await database.collection('signals').createIndex({ signal_type: 1 });

  await database.collection('reports').createIndex({ generated_at: -1 });

  console.log('MongoDB indexes ensured');
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
