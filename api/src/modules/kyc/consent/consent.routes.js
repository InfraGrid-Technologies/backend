import { getConsentSchema, revokeConsentSchema } from './consent.schema.js';

/**
 * Consent Routes
 * DPDP Act 2023 Consent Audit & Revocation
 */
export async function consentRoutes(fastify, { controller }) {
  // 1. Get consent artifact
  fastify.get('/consents/:consentId', {
    schema: getConsentSchema,
    handler: controller.getConsent,
  });

  // 2. Revoke user consent
  fastify.post('/consents/:consentId/revoke', {
    schema: revokeConsentSchema,
    handler: controller.revokeConsent,
  });
}

