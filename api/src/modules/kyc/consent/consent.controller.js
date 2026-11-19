import { ApiError } from '../../../errors.js';

/**
 * Consent Controller
 * Manages DPDP Act 2023 Consent Audit & Revocation
 */
export function createConsentController(repo) {
  return {
    async getConsent(request, reply) {
      const { consentId } = request.params;
      const consent = await repo.getConsentById(consentId);

      if (!consent) {
        throw new ApiError(404, 'CONSENT_NOT_FOUND', `Consent record with ID ${consentId} not found.`);
      }

      return reply.code(200).send({
        success: true,
        data: consent,
      });
    },

    async revokeConsent(request, reply) {
      const { consentId } = request.params;
      const actorId = request.headers['x-actor-id'] || null;

      const revoked = await repo.revokeConsent(consentId, actorId);
      if (!revoked) {
        throw new ApiError(404, 'CONSENT_NOT_FOUND', `Active consent with ID ${consentId} not found or already revoked.`);
      }

      return reply.code(200).send({
        success: true,
        message: 'User consent revoked successfully under DPDP Act 2023 Section 6(4).',
        data: revoked,
      });
    },
  };
}

