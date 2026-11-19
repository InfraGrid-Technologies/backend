import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.resolve(__dirname, '../.env'));
} catch (e) {}

const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5434),
  database: process.env.PGDATABASE || 'equiprent_model',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
});

try {
  const res = await pool.query(
    "SELECT created_at, endpoint, request_payload, response_payload FROM kyc.api_logs WHERE endpoint LIKE '%challan%' ORDER BY created_at DESC LIMIT 3"
  );
  console.log(JSON.stringify(res.rows, null, 2));
} catch (e) {
  console.error(e);
} finally {
  await pool.end();
}

