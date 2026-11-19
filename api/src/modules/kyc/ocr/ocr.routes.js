import { ocrRcSchema, ocrDrivingLicenseSchema } from './ocr.schema.js';

/**
 * KYC OCR Routes
 * Endpoints for extracting text from uploaded images using AI OCR
 */
export async function ocrRoutes(fastify, opts) {
  const { controller } = opts;

  // 1. Vehicle RC OCR
  fastify.post('/ocr/rc', {
    schema: ocrRcSchema,
    handler: (req, reply) => controller.ocrVehicleRc(req, reply),
  });

  // 2. Driving License OCR
  fastify.post('/ocr/driving-license', {
    schema: ocrDrivingLicenseSchema,
    handler: (req, reply) => controller.ocrDrivingLicense(req, reply),
  });
}

