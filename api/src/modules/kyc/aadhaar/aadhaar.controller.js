/**
 * Its Role (The Waiter for DigiLocker):

Handles the two HTTP endpoints:

initiate(request, reply): Reads request.body (consent & redirectUrl), passes them to service.initiate(), and returns HTTP 200.
getDetails(request, reply): Reads request.params.clientId from the URL, calls service.getDetails(clientId), and returns the final verified Aadhaar details.
 */

/**
 * Aadhaar DigiLocker Controller
 * HTTP Adapter: Unpacks requests and delegates to AadhaarService
 */
export function createAadhaarController(service) {
  const getClientMeta = (request) => ({
    ip: request.ip,
    userAgent: request.headers['user-agent'] || null,
  });

  return {
    async initiate(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const clientMeta = getClientMeta(request);

      const result = await service.initiate(request.body || {}, actorId, clientMeta);

      return reply.code(200).send(result);
    },

    async getDetails(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const { clientId } = request.params;

      const result = await service.getDetails(clientId, actorId);

      return reply.code(200).send(result);
    },
  };
}