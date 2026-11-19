/**
 * KYC OCR Controller
 * Unpacks HTTP request parameters, forwards to OCR service, and formats HTTP responses
 */
export function createOcrController(ocrService) {
  return {
    async ocrVehicleRc(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const clientMeta = {
        ip: request.ip,
        userAgent: request.headers['user-agent'] || null,
      };

      const result = await ocrService.ocrVehicleRc(request.body, actorId, clientMeta);
      return reply.code(200).send(result);
    },

    async ocrDrivingLicense(request, reply) {
      const actorId = request.headers['x-actor-id'] || null;
      const clientMeta = {
        ip: request.ip,
        userAgent: request.headers['user-agent'] || null,
      };

      const result = await ocrService.ocrDrivingLicense(request.body, actorId, clientMeta);
      return reply.code(200).send(result);
    },
  };
}

