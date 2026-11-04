/**
 * KYC Controller
 * Connects Fastify HTTP requests to the KYC Service.
 */
export function createKycController(service) {
  return {
    async verifyDrivingLicense(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyDrivingLicense(request.body, actorId);
      return reply.code(200).send(result);
    },

    async verifyBankAccount(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyBankAccount(request.body, actorId);
      return reply.code(200).send(result);
    },

    async verifyRc(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyRc(request.body, actorId);
      return reply.code(200).send(result);
    },

    async initiateAadhaar(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.initiateAadhaar(request.body || {}, actorId);
      return reply.code(200).send(result);
    },

    async getAadhaarDetails(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.getAadhaarDetails(request.params.clientId, actorId);
      return reply.code(200).send(result);
    },

    async verifyChallan(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const result = await service.verifyChallan(request.body, actorId);
      return reply.code(200).send(result);
    },

    async getHistory(request, reply) {
      const { type, idNumber } = request.params;
      const history = await service.getHistory(type, idNumber);
      return reply.code(200).send({ data: history });
    },

    async clearCache(request, reply) {
      const { type, idNumber } = request.query || {};
      const result = await service.clearCache(type, idNumber);
      return reply.code(200).send(result);
    },
  };
}

