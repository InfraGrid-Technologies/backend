import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import kycModule from '../src/modules/kyc/index.js';
import { loadConfig } from '../src/config.js';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.resolve(__dirname, '.kyc-local-store.json');

function loadStore() {
  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf8');
      const data = JSON.parse(raw);
      return {
        consents: data.consents || {},
        verifications: Array.isArray(data.verifications) ? data.verifications : [],
      };
    }
  } catch (err) {
    console.error('Failed to read local store:', err.message);
  }
  return { consents: {}, verifications: [] };
}

function saveStore(store) {
  try {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save local store:', err.message);
  }
}

let config;
try {
  config = loadConfig();
} catch (e) {
  config = {
    kycProvider: process.env.KYC_PROVIDER || 'surepass',
    surepassToken: process.env.SUREPASS_TOKEN,
    surepassBaseUrl: process.env.SUREPASS_BASE_URL || 'https://sandbox.surepass.app/api/v1',
    port: 3100,
    host: '127.0.0.1',
    logLevel: 'info',
  };
}

const app = Fastify({
  logger: { level: config.logLevel || 'info' },
  ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false, allErrors: true } },
});

// Setup Swagger UI documentation
await app.register(swagger, {
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'EquipRent KYC Verification API',
      version: '1.0.0',
      description: 'Pluggable KYC & Identity verification module supporting Driving License, Bank Account (Penny Drop), Vehicle RC, E-Challan, and DigiLocker Aadhaar.',
    },
  },
});

await app.register(swaggerUI, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'full', deepLinking: true },
});

// Attempt PostgreSQL connection, fallback gracefully to in-memory store if DB is offline
let db;
try {
  const pool = new pg.Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 55440),
    database: process.env.PGDATABASE || 'equiprent_model',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    connectionTimeoutMillis: 1500,
  });
  // Test connection
  await pool.query('SELECT 1');
  db = { pool };
  app.log.info('Connected to PostgreSQL database for KYC cache.');
} catch (err) {
  app.log.warn('PostgreSQL is offline (port 55440). Using persistent local JSON store (.kyc-local-store.json) so you can test KYC immediately!');
  db = {
    pool: {
      query: async (sql, params = []) => {
        const store = loadStore();

        // 1. Consent insertion
        if (sql.includes('INSERT INTO kyc.consents')) {
          const consentRecord = {
            id: randomUUID(),
            actor_id: params[0] || null,
            consent_type: params[1],
            purpose: params[2],
            notice_version: params[3],
            notice_text: params[4],
            ip_address: params[5],
            user_agent: params[6],
            status: 'GRANTED',
            granted_at: new Date().toISOString(),
            revoked_at: null,
          };
          store.consents[consentRecord.id] = consentRecord;
          saveStore(store);
          return { rows: [consentRecord] };
        }

        // 2. Consent lookup by ID
        if (sql.includes('SELECT') && sql.includes('kyc.consents')) {
          const consentId = params[0];
          const consent = store.consents[consentId];
          return { rows: consent ? [consent] : [] };
        }

        // 3. Consent revocation
        if (sql.includes('UPDATE kyc.consents')) {
          const consentId = params[0];
          const consent = store.consents[consentId];
          if (consent && consent.status === 'GRANTED') {
            consent.status = 'REVOKED';
            consent.revoked_at = new Date().toISOString();
            saveStore(store);
            return { rows: [{ id: consent.id, status: consent.status, revoked_at: consent.revoked_at }] };
          }
          return { rows: [] };
        }

        // 4. Verifications lookup (findRecentVerification and getHistory)
        if (sql.includes('SELECT') && sql.includes('kyc.verifications')) {
          const targetType = (params[0] || '').replaceAll('-', '_').toLowerCase();
          const targetId = (params[1] || '').replaceAll(/[\s-]/g, '').toUpperCase();

          const matches = store.verifications.filter(v => {
            const vType = (v.verification_type || '').replaceAll('-', '_').toLowerCase();
            const vId = (v.id_number || '').replaceAll(/[\s-]/g, '').toUpperCase();
            return vType === targetType && vId === targetId;
          });

          // If checking recent cache (has LIMIT 1 or status = 'verified')
          if (sql.includes('LIMIT 1') || sql.includes("status = 'verified'")) {
            const verified = matches.find(v => v.status === 'verified');
            return { rows: verified ? [verified] : [] };
          }

          // Otherwise it's getHistory -> return all matches
          return { rows: matches };
        }

        // 5. Verification insert
        if (sql.includes('INSERT INTO kyc.verifications')) {
          const record = {
            id: 'ver-' + Date.now(),
            verification_type: (params[0] || '').replaceAll('-', '_').toLowerCase(),
            id_number: (params[1] || '').replaceAll(/[\s-]/g, '').toUpperCase(),
            status: params[2],
            provider: params[3],
            response_data: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
            raw_provider_response: params[5] ? (typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5]) : null,
            actor_id: params[6] || null,
            consent_id: params[7] || null,
            created_at: new Date().toISOString(),
          };
          store.verifications.unshift(record);
          saveStore(store);
          return { rows: [record] };
        }

        // 6. Verification delete (clearCache)
        if (sql.includes('DELETE FROM kyc.verifications')) {
          if (params && params.length >= 2) {
            const targetType = (params[0] || '').replaceAll('-', '_').toLowerCase();
            const targetId = (params[1] || '').replaceAll(/[\s-]/g, '').toUpperCase();
            store.verifications = store.verifications.filter(v => {
              const vType = (v.verification_type || '').replaceAll('-', '_').toLowerCase();
              const vId = (v.id_number || '').replaceAll(/[\s-]/g, '').toUpperCase();
              return !(vType === targetType && vId === targetId);
            });
          } else if (params && params.length === 1) {
            const targetType = (params[0] || '').replaceAll('-', '_').toLowerCase();
            store.verifications = store.verifications.filter(v => {
              const vType = (v.verification_type || '').replaceAll('-', '_').toLowerCase();
              return vType !== targetType;
            });
          } else {
            store.verifications = [];
          }
          saveStore(store);
          return { rowCount: 1 };
        }

        // 7. API logs
        if (sql.includes('INSERT INTO kyc.api_logs')) {
          return { rowCount: 1 };
        }

        return { rows: [] };
      },
    },
  };
}

// Register KYC Module
await app.register(kycModule, { config, db });

// Health check
app.get('/health', async () => ({ status: 'ok', kycProvider: config.kycProvider }));

const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '127.0.0.1';

try {
  await app.listen({ port, host });
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 KYC API Server running at: http://${host}:${port}`);
  console.log(`📖 Open Interactive Swagger UI at: http://${host}:${port}/docs`);
  console.log('='.repeat(60) + '\n');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

