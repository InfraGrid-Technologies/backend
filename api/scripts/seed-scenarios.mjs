import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DL_SCENARIOS, RC_SCENARIOS, CHALLAN_SCENARIOS } from '../src/modules/kyc/providers/mock-scenarios.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  process.loadEnvFile(path.resolve(__dirname, '../.env'));
} catch (e) {}

export async function seedTestScenarios(poolInstance) {
  const pool = poolInstance || new pg.Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5434),
    database: process.env.PGDATABASE || 'equiprent_model',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 5000,
  });

  const shouldClose = !poolInstance;

  try {
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS kyc;
      CREATE TABLE IF NOT EXISTS kyc.test_scenarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(20) NOT NULL,
        scenario_code VARCHAR(50) NOT NULL UNIQUE,
        match_number VARCHAR(50) NOT NULL,
        title VARCHAR(100) NOT NULL,
        expected_verdict VARCHAR(20) NOT NULL,
        response_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
    `);

    // 1. Seed DL Scenarios
    for (const [number, sc] of Object.entries(DL_SCENARIOS)) {
      await pool.query(`
        INSERT INTO kyc.test_scenarios (category, scenario_code, match_number, title, expected_verdict, response_data)
        VALUES ('dl', $1, $2, $3, $4, $5)
        ON CONFLICT (scenario_code) DO UPDATE SET
          match_number = EXCLUDED.match_number,
          title = EXCLUDED.title,
          expected_verdict = EXCLUDED.expected_verdict,
          response_data = EXCLUDED.response_data;
      `, [sc.scenarioCode, number, sc.title, sc.expectedVerdict, JSON.stringify(sc.data)]);
    }

    // 2. Seed RC Scenarios
    for (const [number, sc] of Object.entries(RC_SCENARIOS)) {
      await pool.query(`
        INSERT INTO kyc.test_scenarios (category, scenario_code, match_number, title, expected_verdict, response_data)
        VALUES ('rc', $1, $2, $3, $4, $5)
        ON CONFLICT (scenario_code) DO UPDATE SET
          match_number = EXCLUDED.match_number,
          title = EXCLUDED.title,
          expected_verdict = EXCLUDED.expected_verdict,
          response_data = EXCLUDED.response_data;
      `, [sc.scenarioCode, number, sc.title, sc.expectedVerdict, JSON.stringify(sc.data)]);
    }

    // 3. Seed Challan Scenarios
    for (const [number, sc] of Object.entries(CHALLAN_SCENARIOS)) {
      await pool.query(`
        INSERT INTO kyc.test_scenarios (category, scenario_code, match_number, title, expected_verdict, response_data)
        VALUES ('challan', $1, $2, $3, $4, $5)
        ON CONFLICT (scenario_code) DO UPDATE SET
          match_number = EXCLUDED.match_number,
          title = EXCLUDED.title,
          expected_verdict = EXCLUDED.expected_verdict,
          response_data = EXCLUDED.response_data;
      `, [sc.scenarioCode, number, sc.title, sc.expectedVerdict, JSON.stringify(sc.data)]);
    }

    console.log('✅ KYC Test Scenarios successfully seeded in PostgreSQL kyc.test_scenarios table');
  } catch (err) {
    console.warn('⚠️ Notice: Could not seed kyc.test_scenarios into PostgreSQL (Mock provider will use in-memory store):', err.message);
  } finally {
    if (shouldClose) {
      await pool.end();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await seedTestScenarios();
}
