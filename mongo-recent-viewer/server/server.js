// server/server.js
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Env ---
const {
  PORT = 3000,
  MONGO_URI,
  MONGO_DB = 'psp',
  MONGO_COLLECTION = 'livedata',
  TIMESTAMP_FIELD = 'ts',
  STATIC_DIR = '../public',
  PUBLIC_KEY,
  PRIVATE_KEY
} = process.env;

if (!MONGO_URI) {
  console.error('❌ Missing MONGO_URI in .env');
  process.exit(1);
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('tiny'));
app.use(express.json());

// Serve static viewer
app.use('/', express.static(path.join(__dirname, STATIC_DIR)));

let client;
let col;

// Connect to MongoDB and prep index for fast "latest"
async function initMongo() {
  client = new MongoClient(MONGO_URI, { ignoreUndefined: true });
  await client.connect();
  const db = client.db(MONGO_DB);
  col = db.collection(MONGO_COLLECTION);
  await col.createIndex({ [TIMESTAMP_FIELD]: -1 });
  console.log(`✅ Mongo connected → db="${MONGO_DB}" coll="${MONGO_COLLECTION}" (timestamp="${TIMESTAMP_FIELD}")`);
}
await initMongo();

// (Optional) sanity check that keys exist on server (not exposed to client)
app.get('/api/keys/status', (_req, res) => {
  res.json({
    ok: true,
    publicKeyPresent: Boolean(PUBLIC_KEY),
    privateKeyPresent: Boolean(PRIVATE_KEY)
  });
});

// Single latest document
app.get('/api/latest-one', async (_req, res) => {
  try {
    const doc = await col.find({}).sort({ [TIMESTAMP_FIELD]: -1 }).limit(1).next();
    res.json({ ok: true, doc: doc || null });
  } catch (e) {
    console.error('Error in /api/latest-one:', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// (Optional) latest N for debugging
app.get('/api/latest', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const docs = await col.find({}).sort({ [TIMESTAMP_FIELD]: -1 }).limit(limit).toArray();
    res.json({ ok: true, count: docs.length, docs });
  } catch (e) {
    console.error('Error in /api/latest:', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
