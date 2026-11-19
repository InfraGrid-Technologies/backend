import Fastify from "fastify";
import cors from "@fastify/cors";
import ratelimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import path from "node:path";
import { fileURLToPath } from "node:url";
import kycModule from "../src/modules/kyc/index.js";
import { loadConfig } from "../src/config.js";
import pg from "pg";
import { seedTestScenarios } from "./seed-scenarios.mjs";
import { request } from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
try {
  process.loadEnvFile(path.resolve(__dirname, "../.env"));
} catch (e) {}

let config;
try {
  config = loadConfig();
} catch (e) {
  config = {
    kycProvider: process.env.KYC_PROVIDER || "surepass",
    surepassToken: process.env.SUREPASS_TOKEN,
    surepassBaseUrl:
      process.env.SUREPASS_BASE_URL || "https://sandbox.surepass.app/api/v1",
    port: 3100,
    host: "0.0.0.0",
    logLevel: "info",
  };
}

const app = Fastify({
  bodyLimit: 15 * 1024 * 1024, // 15MB limit for high-res camera photos and document uploads
  logger: {
    level: config.logLevel || "info",
    transport: {
      targets: [
        // 1. Outputs pretty colored text to your console
        {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
        // 2. Automatically saves every log into logs/kyc.log on disk!
        {
          target: "pino/file",
          options: {
            destination: "./logs/kyc.log",
            mkdir: true, // Automatically creates the logs folder if needed
          },
        },
      ],
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.imageBase64",
        "req.body.frontDocument.fileBase64",
        "req.body.backDocument.fileBase64",
        "*.imageBase64",
        "*.fileBase64",
        "*.aadhaar_xml_data",
      ],
      censor: "[REDACTED_PII]",
    },
  },
  ajv: {
    customOptions: {
      removeAdditional: false,
      coerceTypes: false,
      useDefaults: false,
      allErrors: true,
    },
  },
});

// Enable CORS for mobile apps & web clients
await app.register(cors, { origin: true, credentials: true });

// Rate limiting block
await app.register(ratelimit, {
  max: 50, // maximum 50 request per IP per window
  timeWindow: "1 minute", // window duration
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: "Too many requests",
    message: `Rate limit exceeded for your TP. Ypou can only make ${context.max} requests per minute. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
  }),
});

// helmet
await app.register(helmet, {
  contentSecurityPolicy: false, // Keeps Content-Security-Policy off so Swagger UI (/docs) scripts & styles load cleanly
});
/**
 * Why contentSecurityPolicy: false? Helmet's default Content Security Policy is so strict that it blocks inline scripts and CSS required by the Swagger UI dashboard (/docs). Disabling CSP specifically keeps your Swagger documentation working cleanly while keeping all other 10+ critical security headers fully active!
 */

// compress block of code.
await app.register(compress, {
  global: true, // Automatically compresses all routes
  threshold: 1024, // Only compress responses larger than 1KB
  encodings: ["br", "gzip", "deflate"], // Prioritizes ultra-fast Brotli, then Gzip
});

// ---------------------------------------------------------------------------
// Server-Timing Diagnostic Hooks (W3C Standard)
// ---------------------------------------------------------------------------
app.addHook("onRequest", async (request) => {
  request.timingStart = performance.now();
  request.serverTimings = [];

  // Helper method so any route or module can record custom timings:
  // e.g. request.recordTiming('db', 12.5, 'PostgreSQL Query');
  request.recordTiming = (name, durationMs, description) => {
    request.serverTimings.push({
      name,
      dur: Number(durationMs.toFixed(2)),
      desc: description,
    });
  };
});

app.addHook("onSend", async (request, reply, payload) => {
  const totalDuration = (
    performance.now() - (request.timingStart || performance.now())
  ).toFixed(2);

  const timingEntries = [
    `total;dur=${totalDuration};desc="Total Server Processing"`,
    ...request.serverTimings.map((t) =>
      t.desc
        ? `${t.name};dur=${t.dur};desc="${t.desc}"`
        : `${t.name};dur=${t.dur}`,
    ),
  ];

  reply.header("Server-Timing", timingEntries.join(", "));
  return payload;
});

// Setup Swagger UI documentation
await app.register(swagger, {
  openapi: {
    openapi: "3.0.3",
    info: {
      title: "EquipRent KYC Verification API",
      version: "2.0.0",
      description:
        "Modular KYC verification system: Driving License, Vehicle RC, E-Challan, and DigiLocker Aadhaar.",
    },
  },
});

await app.register(swaggerUI, {
  routePrefix: "/docs",
  uiConfig: { docExpansion: "list", deepLinking: true },
});

// Connect to PostgreSQL database
const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5434),
  database: process.env.PGDATABASE || "equiprent_model",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 5000,
});

try {
  await pool.query("SELECT 1");
  app.log.info("Connected to PostgreSQL database for KYC.");

  // Ensure KYC schema and tables exist
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS kyc;
    CREATE TABLE IF NOT EXISTS kyc.consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id UUID NULL,
      consent_type TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'IDENTITY_AND_COMPLIANCE_VERIFICATION',
      notice_version TEXT NOT NULL,
      notice_text TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NULL,
      status TEXT NOT NULL DEFAULT 'GRANTED',
      granted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      revoked_at TIMESTAMPTZ NULL
    );
    CREATE TABLE IF NOT EXISTS kyc.verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      verification_type TEXT NOT NULL,
      id_number TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      raw_provider_response JSONB NULL,
      actor_id UUID NULL,
      consent_id UUID NULL REFERENCES kyc.consents(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    -- Add authenticity and compliance columns if they don't exist
    ALTER TABLE kyc.verifications 
    ADD COLUMN IF NOT EXISTS is_authentic BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_compliant BOOLEAN NOT NULL DEFAULT false;
      
    CREATE TABLE IF NOT EXISTS kyc.api_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      http_status INTEGER NOT NULL,
      cost_estimate NUMERIC(10, 2) DEFAULT 0.00,
      request_payload JSONB NULL,
      response_payload JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    -- Dedicated Document Storage for Camera & Browse Uploads
    CREATE TABLE IF NOT EXISTS kyc.rc_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rc_verification_id UUID NULL,
      actor_id UUID NULL,
      document_side VARCHAR(10) NOT NULL DEFAULT 'FRONT',
      original_filename TEXT NOT NULL,
      mime_type VARCHAR(50) NOT NULL,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      sha256_checksum VARCHAR(64) NULL,
      storage_type VARCHAR(20) NOT NULL DEFAULT 'DATABASE_BLOB',
      storage_path TEXT NULL,
      file_data BYTEA NULL,
      ocr_extracted_data JSONB NULL,
      ocr_confidence NUMERIC(5, 2) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE IF NOT EXISTS kyc.dl_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dl_verification_id UUID NULL,
      actor_id UUID NULL,
      document_side VARCHAR(10) NOT NULL DEFAULT 'FRONT',
      original_filename TEXT NOT NULL,
      mime_type VARCHAR(50) NOT NULL,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      sha256_checksum VARCHAR(64) NULL,
      storage_type VARCHAR(20) NOT NULL DEFAULT 'DATABASE_BLOB',
      storage_path TEXT NULL,
      file_data BYTEA NULL,
      ocr_extracted_data JSONB NULL,
      ocr_confidence NUMERIC(5, 2) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );


    -- driving license class of vehicle (COV) categories.
    DROP TABLE IF EXISTS kyc.cov_categories;
    CREATE TABLE IF NOT EXISTS kyc.cov_categories(
      code TEXT PRIMARY KEY,
      description TEXT,
      is_heavy_equipment BOOLEAN NOT NULL DEFAULT true,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    --Seed standard parivahan COV codes
    INSERT INTO kyc.cov_categories (code, description, is_heavy_equipment)
    VALUES
      ('TRANS', 'Transport Commercial Vehicle', true),
      ('TRANS-HV', 'Transport Heavy Vehicle', true),
      ('HGMV', 'Heavy Goods Motor Vehicle (Tippers, Dumpers)', true),
      ('HMV', 'Heavy Motor Vehicle', true),
      ('HTV', 'Heavy Transport Vehicle', true),
      ('HPMV', 'Heavy Passenger Motor Vehicle', true),
      ('MGV', 'Medium Goods Vehicle', true),
      ('MMV', 'Medium Motor Vehicle', true),
      ('CHGVA', 'Commercial Heavy Goods Vehicle', true),
      ('CRANE', 'Mobile / Tower Cranes', true),
      ('EXCAVATOR', 'Excavators / Earthmovers / Backhoe Loaders', true),
      ('LOADER', 'Heavy Loaders', true),
      ('FORKLIFT', 'Industrial Forklifts', true),
      ('ROAD_ROLLER', 'Road Rollers / Compactors', true),
      ('CONSTRUCTION_EQUIPMENT', 'Construction Equipment Vehicles (CEV)', true),
      ('CONSTRN', 'Construction Equipment abbreviation', true),
      ('CEV', 'Construction Equipment Vehicle code', true),
      ('TRACTOR', 'Commercial Tractors / Haulers', true),
      ('LMV', 'Light Motor Vehicle (Cars, Jeeps)', false),
      ('MCWG', 'Motor Cycle With Gear', false)
    ON CONFLICT (code) DO NOTHING;
    
  `);

  // Auto-seed offline scenario catalog (₹0 token spend for DL, RC, Challan)
  await seedTestScenarios(pool);
} catch (err) {
  app.log.error(
    { error: err.message },
    "Failed to connect to PostgreSQL on port 55440. Please ensure Docker/Postgres is running.",
  );
  process.exit(1);
}

const db = { pool };

// Register Modular KYC Module
await app.register(kycModule, { config, db });

// Health check
app.get("/health", async () => ({
  status: "ok",
  kycProvider: config.kycProvider,
}));

const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log("\n" + "=".repeat(60));
  console.log(`🚀 KYC API Server running at: http://0.0.0.0:${port}`);
  console.log(
    `📖 Open Interactive Swagger UI at: http://127.0.0.1:${port}/docs`,
  );
  console.log("=".repeat(60) + "\n");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
