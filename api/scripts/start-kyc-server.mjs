import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import kycModule from '../src/modules/kyc/index.js';
import { loadConfig } from '../src/config.js';
import pg from 'pg';

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
  app.log.warn('PostgreSQL is offline (port 55440). Using in-memory cache so you can test KYC immediately!');
  const memoryCache = new Map();
  db = {
    pool: {
      query: async (sql, params) => {
        // Simple in-memory fallback for queries
        if (sql.includes('SELECT') && sql.includes('kyc.verifications')) {
          const key = `${params[0]}_${params[1]}`;
          const cached = memoryCache.get(key);
          return { rows: cached ? [cached] : [] };
        }
        if (sql.includes('INSERT INTO kyc.verifications')) {
          const key = `${params[0]}_${params[1]}`;
          const record = {
            id: 'mem-' + Date.now(),
            verification_type: params[0],
            id_number: params[1],
            status: params[2],
            provider: params[3],
            response_data: JSON.parse(params[4]),
            raw_provider_response: params[5] ? JSON.parse(params[5]) : null,
            created_at: new Date(),
          };
          memoryCache.set(key, record);
          return { rows: [record] };
        }
        if (sql.includes('DELETE FROM kyc.verifications')) {
          if (params && params.length >= 2) {
            memoryCache.delete(`${params[0]}_${params[1]}`);
          } else if (params && params.length === 1) {
            for (const k of memoryCache.keys()) {
              if (k.startsWith(`${params[0]}_`)) memoryCache.delete(k);
            }
          } else {
            memoryCache.clear();
          }
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

