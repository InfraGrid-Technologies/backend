import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import kycModule from '../src/modules/kyc/index.js';
import { MockKycProvider } from '../src/modules/kyc/providers/mock.provider.js';
import { createKycService } from '../src/modules/kyc/kyc.service.js';
import {
  evaluateVehicleCompliance,
  evaluateDriverLicenseCompliance,
  evaluateChallanCompliance,
  evaluateAadhaarCompliance,
} from '../src/modules/kyc/kyc.compliance.js';

// In-memory mock repository to test caching, DB queries, and consent records without requiring a live Postgres instance
function createMockRepository() {
  const verifications = [];
  const logs = [];
  const consents = [];

  return {
    verifications,
    logs,
    consents,
    async findRecentVerification(verificationType, idNumber) {
      return verifications.find(
        v => v.verification_type === verificationType && v.id_number === idNumber
      ) || null;
    },
    async recordConsent({ actorId, consentType, purpose, noticeVersion, noticeText, ipAddress, userAgent }) {
      const record = {
        id: randomUUID(),
        actor_id: actorId || null,
        consent_type: consentType,
        purpose: purpose || 'IDENTITY_AND_COMPLIANCE_VERIFICATION',
        notice_version: noticeVersion,
        notice_text: noticeText || 'Standard platform compliance consent',
        ip_address: ipAddress || '0.0.0.0',
        user_agent: userAgent || null,
        status: 'GRANTED',
        granted_at: new Date().toISOString(),
        revoked_at: null,
      };
      consents.push(record);
      return record;
    },
    async getConsentById(consentId) {
      return consents.find(c => c.id === consentId) || null;
    },
    async revokeConsent(consentId, actorId) {
      const record = consents.find(c => c.id === consentId && c.status === 'GRANTED');
      if (!record) return null;
      if (actorId && record.actor_id && record.actor_id !== actorId) return null;
      record.status = 'REVOKED';
      record.revoked_at = new Date().toISOString();
      return { id: record.id, status: record.status, revoked_at: record.revoked_at };
    },
    async saveVerification({ verificationType, idNumber, status, provider, responseData, rawResponse, actorId, consentId }) {
      const record = {
        id: 'mock-uuid-' + (verifications.length + 1),
        verification_type: verificationType,
        id_number: idNumber,
        status,
        provider,
        response_data: responseData,
        raw_provider_response: rawResponse,
        actor_id: actorId,
        consent_id: consentId || null,
        created_at: new Date().toISOString(),
      };
      verifications.push(record);
      return record;
    },
    async logApiCall(logEntry) {
      logs.push({ ...logEntry, id: 'log-' + (logs.length + 1), created_at: new Date().toISOString() });
    },
    async getHistory(verificationType, idNumber) {
      return verifications.filter(v => v.verification_type === verificationType && v.id_number === idNumber);
    },
    async getHeavyEquipmentCovCodes() {
      return ['TRANS', 'HGMV', 'HMV', 'HTV', 'CRANE', 'EXCAVATOR', 'LOADER', 'FORKLIFT', 'ROAD_ROLLER', 'CONSTRUCTION_EQUIPMENT', 'CEV'];
    },
    async clearCache(verificationType, idNumber) {
      if (verificationType && idNumber) {
        const idx = verifications.findIndex(v => v.verification_type === verificationType && v.id_number === idNumber);
        if (idx !== -1) verifications.splice(idx, 1);
      } else {
        verifications.length = 0;
      }
    },
  };
}

// Helper to build a test Fastify app
async function buildTestApp(customRepo) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false, allErrors: true } },
  });

  const repo = customRepo || createMockRepository();

  await app.register(kycModule, {
    config: { kycProvider: 'mock' },
    repo,
  });

  await app.ready();
  return { app, repo };
}

test('KYC Mock Provider - Unit Tests', async (t) => {
  const provider = new MockKycProvider();

  await t.test('Driving License returns active license and vehicle classes', async () => {
    const res = await provider.verifyDrivingLicense({ dlNumber: 'MH1420110062821', dob: '1990-05-15' });
    assert.equal(res.success, true);
    assert.equal(res.provider, 'mock');
    assert.equal(res.data.name, 'RAJESH KUMAR SHARMA');
    assert.equal(res.data.status, 'ACTIVE');
    assert.ok(Array.isArray(res.data.vehicleClasses));
    assert.equal(res.data.vehicleClasses.length, 3);
  });

  await t.test('Bank Account returns beneficiary name and account existence', async () => {
    const res = await provider.verifyBankAccount({ accountNumber: '123456789012', ifsc: 'HDFC0000240' });
    assert.equal(res.success, true);
    assert.equal(res.provider, 'mock');
    assert.equal(res.data.accountExists, true);
    assert.equal(res.data.beneficiaryName, 'RAJESH KUMAR SHARMA');
    assert.equal(res.data.bankName, 'HDFC BANK LIMITED');
  });

  await t.test('RC returns registration, PUC, Fitness, and Insurance compliance', async () => {
    const res = await provider.verifyRc({ vehicleNumber: 'MH12AB1234' });
    assert.equal(res.success, true);
    assert.equal(res.provider, 'mock');
    assert.equal(res.data.vehicleNumber, 'MH12AB1234');
    assert.equal(res.data.fitness.status, 'ACTIVE');
    assert.equal(res.data.insurance.status, 'ACTIVE');
    assert.equal(res.data.puc.status, 'ACTIVE');
    assert.ok(res.data.insurance.validTill);
    assert.ok(res.data.puc.validTill);
  });

  await t.test('Aadhaar DigiLocker initiation and data retrieval', async () => {
    const init = await provider.initiateAadhaarDigilocker({ redirectUrl: 'http://localhost:3100/callback' });
    assert.equal(init.success, true);
    assert.ok(init.data.clientId);
    assert.ok(init.data.url.includes('mock-digilocker'));

    const details = await provider.getAadhaarDetails({ clientId: init.data.clientId });
    assert.equal(details.success, true);
    assert.equal(details.data.status, 'COMPLETED');
    assert.equal(details.data.name, 'RAJESH KUMAR SHARMA');
    assert.equal(details.data.digilockerVerified, true);
  });

  await t.test('E-Challan returns pending fines, offense details, and auto-selected state portals', async () => {
    const res = await provider.verifyChallan({ rcNumber: 'HR55AP0244' });
    assert.equal(res.success, true);
    assert.equal(res.provider, 'mock');
    assert.equal(res.data.rcNumber, 'HR55AP0244');
    assert.equal(res.data.hasPendingChallans, true);
    assert.equal(res.data.pendingChallansCount, 1);
    assert.equal(res.data.totalPendingAmount, 1000);
    assert.deepEqual(res.data.checkedPortals, ['DL', 'TS', 'GJ']);
    assert.equal(res.data.challans.length, 2);
  });
});

test('KYC Service - Caching & Zero-Cost Deduplication', async (t) => {
  const provider = new MockKycProvider();
  const repo = createMockRepository();
  const service = createKycService(provider, repo);

  await t.test('First DL check hits PROVIDER and caches to DB with consent', async () => {
    const res = await service.verifyDrivingLicense(
      { dlNumber: 'MH1420110062821', dob: '1990-05-15', consent: { agreed: true, noticeVersion: 'DL_V1.0' } },
      'test-user'
    );
    assert.equal(res.source, 'PROVIDER');
    assert.equal(res.success, true);
    assert.ok(res.consentId);
    assert.equal(repo.verifications.length, 1);
    assert.equal(repo.logs.length, 1);
    assert.equal(repo.consents.length, 1);
  });

  await t.test('Second DL check returns from CACHE (₹0 cost, records new consent)', async () => {
    const res = await service.verifyDrivingLicense(
      { dlNumber: 'MH1420110062821', dob: '1990-05-15', consent: { agreed: true, noticeVersion: 'DL_V1.0' } },
      'test-user'
    );
    assert.equal(res.source, 'CACHE');
    assert.equal(res.success, true);
    assert.ok(res.consentId);
    // Verifications and API logs count did not increase (cached), but consent artifact was captured!
    assert.equal(repo.verifications.length, 1);
    assert.equal(repo.logs.length, 1);
    assert.equal(repo.consents.length, 2);
  });

  await t.test('RC caching also prevents duplicate provider calls', async () => {
    const res1 = await service.verifyRc(
      { vehicleNumber: 'MH12AB1234', consent: { agreed: true, noticeVersion: 'RC_V1.0' } },
      'test-user'
    );
    assert.equal(res1.source, 'PROVIDER');
    assert.ok(res1.consentId);

    const res2 = await service.verifyRc(
      { vehicleNumber: 'MH12AB1234', consent: { agreed: true, noticeVersion: 'RC_V1.0' } },
      'test-user'
    );
    assert.equal(res2.source, 'CACHE');
    assert.ok(res2.consentId);
  });

  await t.test('Challan caching prevents duplicate provider calls (₹0 cost)', async () => {
    const res1 = await service.verifyChallan(
      { rcNumber: 'HR55AP0244', consent: { agreed: true, noticeVersion: 'CHALLAN_V1.0' } },
      'test-user'
    );
    assert.equal(res1.source, 'PROVIDER');
    assert.equal(res1.data.pendingChallansCount, 1);
    assert.ok(res1.consentId);

    const res2 = await service.verifyChallan(
      { rcNumber: 'HR55AP0244', consent: { agreed: true, noticeVersion: 'CHALLAN_V1.0' } },
      'test-user'
    );
    assert.equal(res2.source, 'CACHE');
    assert.equal(res2.data.pendingChallansCount, 1);
    assert.ok(res2.consentId);
  });
});

test('KYC HTTP Endpoints - Schema Validation & Routes', async (t) => {
  const { app } = await buildTestApp();

  await t.test('POST /v1/kyc/driving-license - Missing consent is rejected with 400 (DPDP Guard)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/driving-license',
      payload: { dlNumber: 'MH1420110062821', dob: '1990-05-15' }, // missing consent
    });
    assert.equal(response.statusCode, 400);
  });

  await t.test('POST /v1/kyc/driving-license - Consent with agreed:false is rejected with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/driving-license',
      payload: {
        dlNumber: 'MH1420110062821',
        dob: '1990-05-15',
        consent: { agreed: false, noticeVersion: 'DL_V1.0' },
      },
    });
    assert.equal(response.statusCode, 400);
  });

  await t.test('POST /v1/kyc/driving-license - Valid request succeeds with heavy equipment compliance & consent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/driving-license',
      payload: {
        dlNumber: 'MH1420110062821',
        dob: '1990-05-15',
        consent: { agreed: true, noticeVersion: 'DL_V1.0', noticeText: 'I agree to DL verification' },
      },
    });
    assert.equal(response.statusCode, 200);
    const json = response.json();
    assert.equal(json.success, true);
    assert.ok(json.consentId);
    assert.equal(json.data.name, 'RAJESH KUMAR SHARMA');
    assert.equal(json.data.compliance.isOriginalAndActive, true);
    assert.equal(json.data.compliance.isHeavyEquipmentAuthorized, true);
    assert.equal(json.data.compliance.verifiedOperatorBadge, true);
    assert.equal(json.data.compliance.operatorLevel, 'HEAVY_MACHINERY_OPERATOR');
  });

  await t.test('POST /v1/kyc/driving-license - Invalid DOB format rejected with 400 (₹0 cost)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/driving-license',
      payload: {
        dlNumber: 'MH1420110062821',
        dob: '15-05-1990',
        consent: { agreed: true, noticeVersion: 'DL_V1.0' },
      },
    });
    assert.equal(response.statusCode, 400);
  });

  await t.test('POST /v1/kyc/bank-account - Valid account & IFSC succeeds with consent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/bank-account',
      payload: {
        accountNumber: '987654321012',
        ifsc: 'HDFC0000240',
        nameToMatch: 'Rajesh Sharma',
        consent: { agreed: true, noticeVersion: 'BANK_V1.0' },
      },
    });
    assert.equal(response.statusCode, 200);
    const json = response.json();
    assert.equal(json.success, true);
    assert.ok(json.consentId);
    assert.equal(json.data.beneficiaryName, 'RAJESH KUMAR SHARMA');
    assert.equal(json.data.nameMatch.isMatch, true);
    assert.ok(json.data.nameMatch.score >= 60);
  });

  await t.test('POST /v1/kyc/bank-account - Invalid IFSC format rejected with 400 (₹0 cost)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/bank-account',
      payload: {
        accountNumber: '987654321012',
        ifsc: 'INVALID_IFSC',
        consent: { agreed: true, noticeVersion: 'BANK_V1.0' },
      },
    });
    assert.equal(response.statusCode, 400);
  });

  await t.test('POST /v1/kyc/rc - Valid vehicle number returns full RC & compliance with consent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/rc',
      payload: {
        vehicleNumber: 'MH12AB1234',
        consent: { agreed: true, noticeVersion: 'RC_V1.0' },
      },
    });
    assert.equal(response.statusCode, 200);
    const json = response.json();
    assert.equal(json.success, true);
    assert.ok(json.consentId);
    assert.equal(json.data.fitness.status, 'ACTIVE');
    assert.equal(json.data.puc.status, 'ACTIVE');
    assert.equal(json.data.insurance.status, 'ACTIVE');
    assert.equal(json.data.compliance.isFullyCompliant, true);
    assert.equal(json.data.compliance.verifiedBadge, true);
    assert.equal(json.data.compliance.status, 'COMPLIANT');
  });

  await t.test('POST /v1/kyc/rc - Invalid vehicle number rejected with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/rc',
      payload: {
        vehicleNumber: '123',
        consent: { agreed: true, noticeVersion: 'RC_V1.0' },
      },
    });
    assert.equal(response.statusCode, 400);
  });

  await t.test('POST /v1/kyc/vehicle-inspection - Unified RC + Challan check in a single call', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/vehicle-inspection',
      payload: {
        vehicleNumber: 'MH12AB1234',
        checkChallan: true,
        consent: { agreed: true, noticeVersion: 'VEHICLE_INSPECTION_V1.0' },
      },
    });
    assert.equal(response.statusCode, 200);
    const json = response.json();
    assert.equal(json.success, true);
    assert.ok(json.consentId);
    assert.ok(json.challanConsentId);
    assert.equal(json.data.isUnified, true);
    assert.equal(json.data.vehicleNumber, 'MH12AB1234');
    assert.ok(json.data.chassisNumber);
    assert.ok(json.data.engineNumber);
    assert.equal(json.data.fitness.status, 'ACTIVE');
    assert.equal(json.data.rcCompliance.isFullyCompliant, true);
  });

  await t.test('POST /v1/kyc/aadhaar/initiate & GET /v1/kyc/aadhaar/:clientId', async () => {
    const initResponse = await app.inject({
      method: 'POST',
      url: '/v1/kyc/aadhaar/initiate',
      payload: {
        redirectUrl: 'http://localhost:3100/callback',
        consent: { agreed: true, noticeVersion: 'AADHAAR_V1.0' },
      },
    });
    assert.equal(initResponse.statusCode, 200);
    const initJson = initResponse.json();
    assert.ok(initJson.data.clientId);

    const getResponse = await app.inject({
      method: 'GET',
      url: `/v1/kyc/aadhaar/${initJson.data.clientId}`,
    });
    assert.equal(getResponse.statusCode, 200);
    const getJson = getResponse.json();
    assert.equal(getJson.data.status, 'COMPLETED');
    assert.equal(getJson.data.name, 'RAJESH KUMAR SHARMA');
    assert.equal(getJson.data.compliance.isAadhaarVerified, true);
    assert.equal(getJson.data.compliance.verifiedBadge, true);
    assert.equal(getJson.data.compliance.status, 'VERIFIED');
    assert.equal(getJson.data.compliance.checks.isAdult, true);
  });

  await t.test('POST /v1/kyc/challan - Valid RC number returns challans with consent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/challan',
      payload: {
        rcNumber: 'HR55AP0244',
        chassisNumber: 'MA3JMTB1SPB851591',
        engineNumber: 'K10CNC265773',
        consent: { agreed: true, noticeVersion: 'CHALLAN_V1.0' },
      },
    });
    assert.equal(response.statusCode, 200);
    const json = response.json();
    assert.equal(json.success, true);
    assert.ok(json.consentId);
    assert.equal(json.data.rcNumber, 'HR55AP0244');
    assert.equal(json.data.hasPendingChallans, true);
    assert.equal(json.data.compliance.isClean, false);
    assert.equal(json.data.compliance.verifiedChallanBadge, false);
    assert.equal(json.data.compliance.status, 'PENDING_FINES');
    assert.ok(json.data.compliance.violations.length > 0);
    assert.deepEqual(json.data.checkedPortals, ['DL', 'TS', 'GJ']);
  });

  await t.test('POST /v1/kyc/challan - Invalid RC number rejected with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/kyc/challan',
      payload: {
        rcNumber: 'INVALID_RC_123',
        consent: { agreed: true, noticeVersion: 'CHALLAN_V1.0' },
      },
    });
    assert.equal(response.statusCode, 400);
  });

  await t.test('GET /v1/kyc/consents/:consentId & POST /v1/kyc/consents/:consentId/revoke', async () => {
    // 1. Create a verification with consent
    const dlResponse = await app.inject({
      method: 'POST',
      url: '/v1/kyc/driving-license',
      payload: {
        dlNumber: 'MH1420110062821',
        dob: '1990-05-15',
        consent: {
          agreed: true,
          noticeVersion: 'DL_NOTICE_V1.0',
          noticeText: 'I authorize verification of my driving license for heavy machinery operation.',
        },
      },
    });
    const { consentId } = dlResponse.json();
    assert.ok(consentId);

    // 2. Fetch the immutable consent artifact for legal/audit review
    const consentRes = await app.inject({
      method: 'GET',
      url: `/v1/kyc/consents/${consentId}`,
    });
    assert.equal(consentRes.statusCode, 200);
    const consentJson = consentRes.json();
    assert.equal(consentJson.success, true);
    assert.equal(consentJson.data.id, consentId);
    assert.equal(consentJson.data.consent_type, 'driving_license');
    assert.equal(consentJson.data.status, 'GRANTED');
    assert.equal(consentJson.data.notice_version, 'DL_NOTICE_V1.0');

    // 3. Revoke consent under DPDP Act 2023 Section 6(4)
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/v1/kyc/consents/${consentId}/revoke`,
    });
    assert.equal(revokeRes.statusCode, 200);
    const revokeJson = revokeRes.json();
    assert.equal(revokeJson.success, true);
    assert.equal(revokeJson.data.status, 'REVOKED');
    assert.ok(revokeJson.data.revoked_at);

    // 4. Verify status is now REVOKED on subsequent lookups
    const recheckRes = await app.inject({
      method: 'GET',
      url: `/v1/kyc/consents/${consentId}`,
    });
    assert.equal(recheckRes.json().data.status, 'REVOKED');
  });

  await t.test('GET /v1/kyc/history/:type/:idNumber - Fetches audit log (₹0 cost) with underscores or hyphens', async () => {
    // 1. Query with underscore
    const histRes1 = await app.inject({
      method: 'GET',
      url: '/v1/kyc/history/driving_license/MH1420110062821',
    });
    assert.equal(histRes1.statusCode, 200);
    const histJson1 = histRes1.json();
    assert.equal(histJson1.success, true);
    assert.ok(Array.isArray(histJson1.data));
    assert.ok(histJson1.data.length > 0);
    assert.equal(histJson1.data[0].id_number, 'MH1420110062821');

    // 2. Query with hyphen (e.g. driving-license)
    const histRes2 = await app.inject({
      method: 'GET',
      url: '/v1/kyc/history/driving-license/MH1420110062821',
    });
    assert.equal(histRes2.statusCode, 200);
    const histJson2 = histRes2.json();
    assert.equal(histJson2.success, true);
    assert.ok(histJson2.data.length > 0);
    assert.equal(histJson2.data[0].id_number, 'MH1420110062821');
  });

  await app.close();
});

test('KYC Compliance Engine - Edge Cases & Violations', async (t) => {
  await t.test('Vehicle RC: detects expired PUC, expired fitness, expired insurance, or inactive status', () => {
    // 1. Vehicle with expired PUC
    const rcWithExpiredPuc = {
      status: 'ACTIVE',
      fitness: { validTill: '2028-01-01' },
      insurance: { validTill: '2028-01-01' },
      puc: { validTill: '2023-01-01' }, // EXPIRED
    };
    const res1 = evaluateVehicleCompliance(rcWithExpiredPuc, '2026-11-03');
    assert.equal(res1.isFullyCompliant, false);
    assert.equal(res1.verifiedBadge, false);
    assert.equal(res1.checks.pucValid, false);
    assert.equal(res1.checks.fitnessValid, true);
    assert.ok(res1.violations.some(v => v.includes('Pollution (PUC) certificate expired')));

    // 2. Vehicle with expired insurance
    const rcWithExpiredInsurance = {
      status: 'ACTIVE',
      fitness: { validTill: '2028-01-01' },
      insurance: { validTill: '2024-05-10' }, // EXPIRED
      puc: { validTill: '2028-01-01' },
    };
    const res2 = evaluateVehicleCompliance(rcWithExpiredInsurance, '2026-11-03');
    assert.equal(res2.isFullyCompliant, false);
    assert.equal(res2.checks.insuranceValid, false);
    assert.ok(res2.violations.some(v => v.includes('insurance policy expired')));

    // 3. Vehicle with inactive status
    const inactiveRc = {
      status: 'SUSPENDED',
      fitness: { validTill: '2028-01-01' },
      insurance: { validTill: '2028-01-01' },
      puc: { validTill: '2028-01-01' },
    };
    const res3 = evaluateVehicleCompliance(inactiveRc, '2026-11-03');
    assert.equal(res3.isFullyCompliant, false);
    assert.equal(res3.checks.registrationActive, false);
    assert.ok(res3.violations.some(v => v.includes('registration status is SUSPENDED')));
  });

  await t.test('Driving License: distinguishes Heavy Equipment vs Light Vehicle only operators', () => {
    // 1. Car driver only (LMV, MCWG) trying to operate a crane/tipper
    const lightDriver = {
      status: 'ACTIVE',
      validTill: '2035-01-01',
      vehicleClasses: [
        { class: 'MCWG', description: 'Motor Cycle With Gear' },
        { class: 'LMV', description: 'Light Motor Vehicle' },
      ],
    };
    const res1 = evaluateDriverLicenseCompliance(lightDriver, '2026-11-03');
    assert.equal(res1.isOriginalAndActive, true);
    assert.equal(res1.isHeavyEquipmentAuthorized, false);
    assert.equal(res1.verifiedOperatorBadge, false);
    assert.equal(res1.operatorLevel, 'LIGHT_VEHICLE_ONLY');
    assert.ok(res1.violations.some(v => v.includes('authorized for Light Motor Vehicles (LMV) only')));

    // 2. Heavy machinery operator with HGMV / TRANS
    const heavyOperator = {
      status: 'ACTIVE',
      validTill: '2035-01-01',
      vehicleClasses: [
        { class: 'LMV', description: 'Light Motor Vehicle' },
        { class: 'HGMV', description: 'Heavy Goods Motor Vehicle' },
        { class: 'TRANS', description: 'Transport Commercial Vehicle' },
      ],
    };
    const res2 = evaluateDriverLicenseCompliance(heavyOperator, '2026-11-03');
    assert.equal(res2.isOriginalAndActive, true);
    assert.equal(res2.isHeavyEquipmentAuthorized, true);
    assert.equal(res2.verifiedOperatorBadge, true);
    assert.equal(res2.operatorLevel, 'HEAVY_MACHINERY_OPERATOR');
    assert.equal(res2.violations.length, 0);

    // 3. Expired driving license
    const expiredDriver = {
      status: 'ACTIVE',
      validTill: '2022-01-01', // EXPIRED
      vehicleClasses: [{ class: 'HGMV', description: 'Heavy Goods Motor Vehicle' }],
    };
    const res3 = evaluateDriverLicenseCompliance(expiredDriver, '2026-11-03');
    assert.equal(res3.isOriginalAndActive, false);
    assert.equal(res3.verifiedOperatorBadge, false);
    assert.ok(res3.violations.some(v => v.includes('expired on 2022-01-01')));
  });

  await t.test('E-Challan: awards verified badge ONLY if vehicle has 0 pending challans', () => {
    // 1. Clean vehicle with 0 pending challans
    const cleanVehicle = {
      rcNumber: 'HR55AP0244',
      totalChallans: 1,
      pendingChallansCount: 0,
      totalPendingAmount: 0,
      hasPendingChallans: false,
    };
    const res1 = evaluateChallanCompliance(cleanVehicle);
    assert.equal(res1.isClean, true);
    assert.equal(res1.verifiedChallanBadge, true);
    assert.equal(res1.status, 'NO_PENDING_CHALLANS');
    assert.equal(res1.violations.length, 0);

    // 2. Vehicle with unpaid pending challan
    const finedVehicle = {
      rcNumber: 'HR55AP0244',
      totalChallans: 3,
      pendingChallansCount: 2,
      totalPendingAmount: 2500,
      hasPendingChallans: true,
    };
    const res2 = evaluateChallanCompliance(finedVehicle);
    assert.equal(res2.isClean, false);
    assert.equal(res2.verifiedChallanBadge, false);
    assert.equal(res2.status, 'PENDING_FINES');
    assert.equal(res2.pendingCount, 2);
    assert.equal(res2.totalPendingAmount, 2500);
    assert.ok(res2.violations.some(v => v.includes('2 active/unpaid challan(s) totaling ₹2500')));
  });

  await t.test('Aadhaar DigiLocker: awards verified badge on completed XML and adult age (>=18)', () => {
    // 1. Verified adult user
    const adultUser = {
      status: 'COMPLETED',
      digilockerVerified: true,
      name: 'RAJESH KUMAR SHARMA',
      dob: '1990-05-15',
      maskedAadhaar: 'XXXXXXXX8912',
    };
    const res1 = evaluateAadhaarCompliance(adultUser, 18, '2026-11-03');
    assert.equal(res1.isAadhaarVerified, true);
    assert.equal(res1.verifiedBadge, true);
    assert.equal(res1.status, 'VERIFIED');
    assert.equal(res1.checks.isAdult, true);
    assert.equal(res1.age, 36);
    assert.equal(res1.violations.length, 0);

    // 2. Underage user (age 16)
    const minorUser = {
      status: 'COMPLETED',
      digilockerVerified: true,
      name: 'AMIT SHARMA',
      dob: '2010-08-20', // Age 16
      maskedAadhaar: 'XXXXXXXX1234',
    };
    const res2 = evaluateAadhaarCompliance(minorUser, 18, '2026-11-03');
    assert.equal(res2.isAadhaarVerified, false);
    assert.equal(res2.verifiedBadge, false);
    assert.equal(res2.checks.isAdult, false);
    assert.equal(res2.age, 16);
    assert.ok(res2.violations.some(v => v.includes('minimum age of 18 years')));

    // 3. Incomplete session (user abandoned OTP screen)
    const incompleteSession = {
      status: 'PENDING',
      digilockerVerified: false,
    };
    const res3 = evaluateAadhaarCompliance(incompleteSession, 18, '2026-11-03');
    assert.equal(res3.isAadhaarVerified, false);
    assert.equal(res3.verifiedBadge, false);
    assert.equal(res3.status, 'PENDING');
  });

  await t.test('Vehicle RC: enforces expected vehicle category matching (Earthmoving vs Haulage vs Mismatch)', () => {
    const commercialTipperRc = {
      status: 'ACTIVE',
      vehicleClass: 'Heavy Goods Commercial Vehicle (HGMV)',
      fitness: { validTill: '2028-12-31' },
      puc: { validTill: '2028-12-31' },
      insurance: { validTill: '2028-12-31' },
    };

    // 1. Matches Commercial Haulage & Transport
    const matchRes = evaluateVehicleCompliance(commercialTipperRc, '2026-11-03', 'Commercial Haulage & Transport');
    assert.equal(matchRes.isFullyCompliant, true);
    assert.equal(matchRes.checks.categoryMatch, true);
    assert.equal(matchRes.violations.length, 0);

    // 2. Fails when claiming Excavator/Earthmoving for a Tipper/Truck
    const mismatchRes = evaluateVehicleCompliance(commercialTipperRc, '2026-11-03', 'Earthmoving & Excavation');
    assert.equal(mismatchRes.isFullyCompliant, false);
    assert.equal(mismatchRes.checks.categoryMatch, false);
    assert.ok(mismatchRes.violations.some(v => v.includes('Vehicle category mismatch')));

    // 3. Fails when private passenger car is submitted
    const passengerCarRc = {
      status: 'ACTIVE',
      vehicleClass: 'Motor Car (LMV)',
      fitness: { validTill: '2028-12-31' },
      puc: { validTill: '2028-12-31' },
      insurance: { validTill: '2028-12-31' },
    };
    const carRes = evaluateVehicleCompliance(passengerCarRc, '2026-11-03', 'Commercial Haulage & Transport');
    assert.equal(carRes.isFullyCompliant, false);
    assert.equal(carRes.checks.categoryMatch, false);
    assert.ok(carRes.violations.some(v => v.includes('Vehicle category mismatch')));
  });

  await t.test('Vehicle RC: enforces RTO Vehicle Class matching for specific vehicle types (BookMyEquipment fleet)', () => {
    const cevExcavatorRc = {
      status: 'ACTIVE',
      vehicleClass: 'Construction Equipment Vehicle (CEV)',
      fitness: { validTill: '2028-12-31' },
      puc: { validTill: '2028-12-31' },
      insurance: { validTill: '2028-12-31' },
    };

    const hgmvTipperRc = {
      status: 'ACTIVE',
      vehicleClass: 'Heavy Goods Commercial Vehicle (HGMV)',
      fitness: { validTill: '2028-12-31' },
      puc: { validTill: '2028-12-31' },
      insurance: { validTill: '2028-12-31' },
    };

    // 1. Excavator matches CEV
    const cevMatch = evaluateVehicleCompliance(cevExcavatorRc, '2026-11-03', 'Earthmoving', 'Backhoe (JCB 3DX)');
    assert.equal(cevMatch.isFullyCompliant, true);
    assert.equal(cevMatch.checks.rtoClassMatch, true);

    // 2. Tipper matches HGV/HGMV
    const hgmvMatch = evaluateVehicleCompliance(hgmvTipperRc, '2026-11-03', 'Transport & Cranes', 'Tipper Dump Truck');
    assert.equal(hgmvMatch.isFullyCompliant, true);
    assert.equal(hgmvMatch.checks.rtoClassMatch, true);

    // 3. Tipper RC provided for Backhoe (CEV required, HGMV provided) -> rejected with RTO class mismatch
    const typeMismatch = evaluateVehicleCompliance(hgmvTipperRc, '2026-11-03', 'Earthmoving', 'Backhoe (JCB 3DX)');
    assert.equal(typeMismatch.isFullyCompliant, false);
    assert.equal(typeMismatch.checks.rtoClassMatch, false);
    assert.ok(typeMismatch.violations.some(v => v.includes('Vehicle RTO class mismatch')));

    // 4. CEV RC provided for Tipper (HGV required, CEV provided) -> rejected with RTO class mismatch
    const tipperMismatch = evaluateVehicleCompliance(cevExcavatorRc, '2026-11-03', 'Transport & Cranes', 'Tipper Dump Truck');
    assert.equal(tipperMismatch.isFullyCompliant, false);
    assert.equal(tipperMismatch.checks.rtoClassMatch, false);
    assert.ok(tipperMismatch.violations.some(v => v.includes('Vehicle RTO class mismatch')));
  });
});

test('KYC AI OCR Pre-Validation - Document Format & Cross-Validation Guards', async (t) => {
  const { validateDlDocumentImage, validateRcDocumentImage } = await import('../src/modules/kyc/ocr/local-ocr.js');

  await t.test('Rejects corrupted / undersized buffers (< 2KB) early', async () => {
    const tinyBuffer = Buffer.alloc(500);
    const dlRes = await validateDlDocumentImage(tinyBuffer);
    assert.equal(dlRes.isDocument, false);
    assert.ok(dlRes.message.includes('too small or corrupted'));

    const rcRes = await validateRcDocumentImage(tinyBuffer);
    assert.equal(rcRes.isDocument, false);
    assert.ok(rcRes.message.includes('too small or corrupted'));
  });

  await t.test('Rejects null / non-buffer gracefully', async () => {
    const dlRes = await validateDlDocumentImage(null);
    assert.equal(dlRes.isDocument, false);

    const rcRes = await validateRcDocumentImage(undefined);
    assert.equal(rcRes.isDocument, false);
  });
});



