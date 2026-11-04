import { getKycProvider } from './providers/provider.factory.js';
import { createKycRepository } from './kyc.repository.js';
import { createKycService } from './kyc.service.js';
import { createKycController } from './kyc.controller.js';
import { kycRoutes } from './kyc.routes.js';

/**
 * KYC Module Entry Point (Fastify Plugin)
 * Pluggable module: cleanly mounts under /v1/kyc
 */
export default async function kycModule(fastify, opts = {}) {
  const db = opts.db || fastify.database;
  const config = opts.config || {};
  const logger = fastify.log;

  // 1. Resolve Provider (Mock or Surepass or future provider based on .env)
  const provider = getKycProvider(config, logger);

  // 2. Instantiate Repository, Service, and Controller
  const repo = createKycRepository(db);
  const service = createKycService(provider, repo, logger);
  const controller = createKycController(service);

  // 3. Register Routes under /v1/kyc
  await fastify.register(kycRoutes, {
    prefix: '/v1/kyc',
    controller,
  });

  logger.info('[KYC Module] Initialized and mounted at /v1/kyc');
}

