/**
 * Vehicle E-Challan Controller
 * HTTP Adapter: Unpacks incoming Fastify request, delegates to Service, and sends HTTP reply.
 */
export function createChallanController(service) {
  const getClientMeta = (request) => ({
    ip: request.ip,
    userAgent: request.headers["user-agent"] || null,
  });

  return {
    async verifyChallan(request, reply) {
      const actorId = request.headers["x-actor-id"] || null;
      const clientMeta = getClientMeta(request);
      const providerOverride = request.headers['x-kyc-provider'] || request.body?.provider || null;

      const result = await service.verify({ ...request.body, providerOverride }, actorId, clientMeta);

      return reply.code(200).send(result);
    },
  };
}
