import { vehicleRcSchema } from './rc.schema.js';

/**
 * Vehicle RC Route
 * Connects the URL path to Fastify
 */
export async function vehicleRcRoutes(fastify, { controller }) {
  fastify.post('/rc', {
    schema: vehicleRcSchema,
    handler: controller.verifyRc,
  });
}