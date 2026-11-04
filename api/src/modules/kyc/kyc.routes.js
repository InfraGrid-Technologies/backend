import {
  drivingLicenseSchema,
  bankAccountSchema,
  rcSchema,
  aadhaarInitiateSchema,
  aadhaarStatusSchema,
  challanSchema,
  clearCacheSchema,
} from './kyc.schemas.js';

/**
 * KYC Module Routes
 * Mounted under /v1/kyc
 */
export async function kycRoutes(fastify, { controller }) {
  // 1. Driving License Verification
  fastify.post('/driving-license', {
    schema: drivingLicenseSchema,
    handler: controller.verifyDrivingLicense,
  });

  // 2. Bank Account Verification (Penny Drop)
  fastify.post('/bank-account', {
    schema: bankAccountSchema,
    handler: controller.verifyBankAccount,
  });

  // 3. Vehicle RC (PUC, Fitness, Insurance)
  fastify.post('/rc', {
    schema: rcSchema,
    handler: controller.verifyRc,
  });

  // 4. Vehicle E-Challan Verification
  fastify.post('/challan', {
    schema: challanSchema,
    handler: controller.verifyChallan,
  });

  // 5. DigiLocker Aadhaar Session Initiation
  fastify.post('/aadhaar/initiate', {
    schema: aadhaarInitiateSchema,
    handler: controller.initiateAadhaar,
  });

  // 6. DigiLocker Aadhaar Status & Details Fetch
  fastify.get('/aadhaar/:clientId', {
    schema: aadhaarStatusSchema,
    handler: controller.getAadhaarDetails,
  });

  // 7. Verification History lookup
  fastify.get('/history/:type/:idNumber', {
    schema: {
      tags: ['KYC'],
      summary: 'Get verification audit history',
      params: {
        type: 'object',
        required: ['type', 'idNumber'],
        properties: {
          type: { type: 'string', enum: ['driving_license', 'bank_account', 'rc', 'aadhaar', 'challan'] },
          idNumber: { type: 'string' },
        },
      },
    },
    handler: controller.getHistory,
  });

  // 8. Clear Cache (₹0 cost)
  fastify.delete('/cache', {
    schema: clearCacheSchema,
    handler: controller.clearCache,
  });
}

