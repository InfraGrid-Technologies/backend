import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function inspect() {
  console.log('\n================ DATABASE INSPECTION ================');
  console.log(`Connected to: ${process.env.PGDATABASE || 'equiprent_model'} on port ${process.env.PGPORT || 55440}\n`);

  // 1. List Schemas
  const schemasRes = await pool.query(`
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY schema_name;
  `);
  console.log('📌 AVAILABLE SCHEMAS:');
  console.log(schemasRes.rows.map(r => '  - ' + r.schema_name).join('\n'));

  // 2. List Tables in KYC Schema
  const kycTablesRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'kyc'
    ORDER BY table_name;
  `);
  console.log('\n📌 TABLES IN "kyc" SCHEMA:');
  if (kycTablesRes.rows.length === 0) {
    console.log('  (No tables found in kyc schema yet)');
  } else {
    console.log(kycTablesRes.rows.map(r => '  - kyc.' + r.table_name).join('\n'));
  }

  // 3. Inspect kyc.verifications
  try {
    const verificationsRes = await pool.query(`
      SELECT id_number, verification_type, status, is_authentic, is_compliant, provider, created_at 
      FROM kyc.verifications 
      ORDER BY created_at DESC 
      LIMIT 10;
    `);
    console.log(`\n📄 DATA IN "kyc.verifications" (Total rows fetched: ${verificationsRes.rows.length}):`);
    if (verificationsRes.rows.length === 0) {
      console.log('  [Empty table - No verifications yet]');
    } else {
      console.table(verificationsRes.rows);
    }
  } catch (err) {
    console.log('  Could not query kyc.verifications:', err.message);
  }

  // 4. Inspect kyc.consents
  try {
    const consentsRes = await pool.query(`
      SELECT id, consent_type, purpose, status, granted_at 
      FROM kyc.consents 
      ORDER BY granted_at DESC 
      LIMIT 10;
    `);
    console.log(`\n📄 DATA IN "kyc.consents" (Total rows fetched: ${consentsRes.rows.length}):`);
    if (consentsRes.rows.length === 0) {
      console.log('  [Empty table - No consents yet]');
    } else {
      console.table(consentsRes.rows);
    }
  } catch (err) {
    console.log('  Could not query kyc.consents:', err.message);
  }

  // 5. Inspect kyc.api_logs
  try {
    const apiLogsRes = await pool.query(`
      SELECT id, provider, endpoint, http_status, cost_estimate, created_at 
      FROM kyc.api_logs 
      ORDER BY created_at DESC 
      LIMIT 10;
    `);
    console.log(`\n📄 DATA IN "kyc.api_logs" (Total rows fetched: ${apiLogsRes.rows.length}):`);
    if (apiLogsRes.rows.length === 0) {
      console.log('  [Empty table - No API logs yet]');
    } else {
      console.table(apiLogsRes.rows);
    }
  } catch (err) {
    console.log('  Could not query kyc.api_logs:', err.message);
  }

  console.log('\n======================================================\n');
  await pool.end();
}

inspect().catch(err => {
  console.error('Inspection failed:', err.message);
  process.exit(1);
});

