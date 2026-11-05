/**
 * KYC Controller
 * Connects Fastify HTTP requests to the KYC Service.
 */
export function createKycController(service) {
  const getClientMeta = (request) => ({
    ip: request.ip,
    userAgent: request.headers['user-agent'] || null,
  });

  return {
    async verifyDrivingLicense(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyDrivingLicense(request.body, actorId, getClientMeta(request));
      return reply.code(200).send(result);
    },

    async verifyBankAccount(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyBankAccount(request.body, actorId, getClientMeta(request));
      return reply.code(200).send(result);
    },

    async verifyRc(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyRc(request.body, actorId, getClientMeta(request));
      return reply.code(200).send(result);
    },

    async initiateAadhaar(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.initiateAadhaar(request.body || {}, actorId, getClientMeta(request));
      return reply.code(200).send(result);
    },

    async getAadhaarDetails(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.getAadhaarDetails(request.params.clientId, actorId);
      return reply.code(200).send(result);
    },

    async verifyChallan(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyChallan(request.body, actorId, getClientMeta(request));
      return reply.code(200).send(result);
    },

    async getHistory(request, reply) {
      const { type, idNumber } = request.params;
      const normalizedType = type.replaceAll('-', '_').toLowerCase();
      const cleanId = idNumber.replaceAll(/[\s-]/g, '').toUpperCase();
      const history = await service.getHistory(normalizedType, cleanId);
      return reply.code(200).send({
        success: true,
        count: history.length,
        data: history,
      });
    },

    async clearCache(request, reply) {
      const { type, idNumber } = request.query || {};
      const normalizedType = type ? type.replaceAll('-', '_').toLowerCase() : undefined;
      const cleanId = idNumber ? idNumber.replaceAll(/[\s-]/g, '').toUpperCase() : undefined;
      const result = await service.clearCache(normalizedType, cleanId);
      return reply.code(200).send(result);
    },

    async getConsent(request, reply) {
      const { consentId } = request.params;
      const result = await service.getConsent(consentId);
      return reply.code(200).send(result);
    },

    async revokeConsent(request, reply) {
      const { consentId } = request.params;
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.revokeConsent(consentId, actorId);
      return reply.code(200).send(result);
    },
  };
}

