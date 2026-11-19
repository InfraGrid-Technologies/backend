import { DrivingLicenseSchema } from "./dl.schemas.js"; // import the schema related to driving license

/**
 * Driving License Route
 * Connects the URL path to Fastify
 */

export async function drivingLicenseRoutes(fastify, { controller }) {
  fastify.post("/driving-license", {
    schema: DrivingLicenseSchema,
    handler: controller.verifyDrivingLicense,
  });
}
