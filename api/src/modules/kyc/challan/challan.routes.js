import { challanSchema } from "./challan.schema.js";

/**
 * Vehicle E-Challan Routes
 * Mounted under Fastify
 */
export async function challanRoutes(fastify, { controller }) {
  fastify.post("/challan", {
    schema: challanSchema,
    handler: controller.verifyChallan,
  });
}
