import {
  drivingLicenseSchema,
  bankAccountSchema,
  rcSchema,
  aadhaarInitiateSchema,
  aadhaarStatusSchema,
  challanSchema,
  clearCacheSchema,
  getHistorySchema,
  getConsentSchema,
  revokeConsentSchema,
} from './kyc.schemas.js';

/**
 * KYC Module Routes
 * Mounted under /v1/kyc
 */
export async function kycRoutes(fastify, { controller }) {
  // 1. Driving License Verification (with DPDP consent)
  fastify.post('/driving-license', {
    schema: drivingLicenseSchema,
    handler: controller.verifyDrivingLicense,
  });

  // 2. Bank Account Verification (Penny Drop with DPDP consent)
  fastify.post('/bank-account', {
    schema: bankAccountSchema,
    handler: controller.verifyBankAccount,
  });

  // 3. Vehicle RC (PUC, Fitness, Insurance with DPDP consent)
  fastify.post('/rc', {
    schema: rcSchema,
    handler: controller.verifyRc,
  });

  // 4. Vehicle E-Challan Verification (with DPDP consent)
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

  // 7. Verification History lookup (₹0 cost - internal database query)
  fastify.get('/history/:type/:idNumber', {
    schema: getHistorySchema,
    handler: controller.getHistory,
  });

  // 8. Clear Cache (₹0 cost)
  fastify.delete('/cache', {
    schema: clearCacheSchema,
    handler: controller.clearCache,
  });

  // 9. Get DPDP Consent Artifact Details
  fastify.get('/consents/:consentId', {
    schema: getConsentSchema,
    handler: controller.getConsent,
  });

  // 10. Revoke Consent under DPDP Act Section 6(4)
  fastify.post('/consents/:consentId/revoke', {
    schema: revokeConsentSchema,
    handler: controller.revokeConsent,
  });
}

