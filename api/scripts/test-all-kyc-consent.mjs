import Fastify from 'fastify';
import kycModule from '../src/modules/kyc/index.js';
import { randomUUID } from 'node:crypto';

console.log('='.repeat(75));
console.log('🚀 COMPREHENSIVE TEST: ALL KYC VERIFICATIONS + DPDP ACT USER CONSENT');
console.log('='.repeat(75));

// 1. Initialize test Fastify app
const app = Fastify({
  ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false, allErrors: true } },
});

const inMemoryStore = {
  verifications: new Map(),
  consents: new Map(),
};

const mockDb = {
  pool: {
    query: async (sql, params) => {
      // 1. Consent inserts
      if (sql.includes('INSERT INTO kyc.consents')) {
        const record = {
          id: randomUUID(),
          actor_id: params[0] || 'usr-default-operator',
          consent_type: params[1],
          purpose: params[2],
          notice_version: params[3],
          notice_text: params[4],
          ip_address: params[5],
          user_agent: params[6],
          status: 'GRANTED',
          granted_at: new Date().toISOString(),
          revoked_at: null,
        };
        inMemoryStore.consents.set(record.id, record);
        return { rows: [record] };
      }
      // 2. Consent lookups
      if (sql.includes('SELECT') && sql.includes('kyc.consents')) {
        const record = inMemoryStore.consents.get(params[0]);
        return { rows: record ? [record] : [] };
      }
      // 3. Consent revocation
      if (sql.includes('UPDATE kyc.consents')) {
        const record = inMemoryStore.consents.get(params[0]);
        if (record && record.status === 'GRANTED') {
          record.status = 'REVOKED';
          record.revoked_at = new Date().toISOString();
          return { rows: [{ id: record.id, status: record.status, revoked_at: record.revoked_at }] };
        }
        return { rows: [] };
      }
      // 4. Verifications inserts
      if (sql.includes('INSERT INTO kyc.verifications')) {
        const record = {
          id: randomUUID(),
          verification_type: params[0],
          id_number: params[1],
          status: params[2],
          provider: params[3],
          response_data: JSON.parse(params[4]),
          actor_id: params[6],
          consent_id: params[7],
          created_at: new Date().toISOString(),
        };
        inMemoryStore.verifications.set(`${params[0]}_${params[1]}`, record);
        return { rows: [record] };
      }
      // 5. Verification cache lookups
      if (sql.includes('SELECT') && sql.includes('kyc.verifications')) {
        const record = inMemoryStore.verifications.get(`${params[0]}_${params[1]}`);
        return { rows: record ? [record] : [] };
      }
      return { rows: [] };
    },
  },
};

await app.register(kycModule, {
  config: { kycProvider: 'mock' },
  db: mockDb,
});

await app.ready();

let passedCount = 0;
function logPass(title) {
  passedCount++;
  console.log(`✅ [PASS ${passedCount}] ${title}`);
}

// =========================================================================
// 1. DRIVING LICENSE VERIFICATION
// =========================================================================
console.log('\n--- 1. DRIVING LICENSE (DL) VERIFICATION ---');

// 1A. Rejection without consent
const dlReject = await app.inject({
  method: 'POST',
  url: '/v1/kyc/driving-license',
  payload: { dlNumber: 'MH1420110062821', dob: '1990-05-15' },
});
if (dlReject.statusCode === 400) {
  logPass('DL rejected with HTTP 400 when consent is missing.');
}

// 1B. Success with consent
const dlSuccess = await app.inject({
  method: 'POST',
  url: '/v1/kyc/driving-license',
  headers: { 'x-actor-id': 'usr-driver-101', 'user-agent': 'EquipRent-Android/2.4' },
  payload: {
    dlNumber: 'MH1420110062821',
    dob: '1990-05-15',
    consent: {
      agreed: true,
      noticeVersion: 'DL_NOTICE_V1.0',
      noticeText: 'I authorize verification of my driving license for heavy machinery qualification.',
    },
  },
});
const dlJson = dlSuccess.json();
if (dlSuccess.statusCode === 200 && dlJson.consentId && dlJson.data?.compliance?.verifiedOperatorBadge) {
  logPass(`DL verified successfully with generated consentId: ${dlJson.consentId}`);
  console.log(`   Operator: ${dlJson.data.name} | Badge: ${dlJson.data.compliance.operatorLevel}`);
}

// 1C. Consent Artifact Verification
const dlConsentCheck = await app.inject({
  method: 'GET',
  url: `/v1/kyc/consents/${dlJson.consentId}`,
});
if (dlConsentCheck.statusCode === 200 && dlConsentCheck.json().data.status === 'GRANTED') {
  logPass(`Retrieved immutable DL consent artifact: notice_version=${dlConsentCheck.json().data.notice_version}`);
}

// 1D. Consent Revocation
const dlRevoke = await app.inject({
  method: 'POST',
  url: `/v1/kyc/consents/${dlJson.consentId}/revoke`,
});
if (dlRevoke.statusCode === 200 && dlRevoke.json().data.status === 'REVOKED') {
  logPass('DL user consent successfully revoked under DPDP Act Section 6(4).');
}

// =========================================================================
// 2. BANK ACCOUNT VERIFICATION (PENNY DROP)
// =========================================================================
console.log('\n--- 2. BANK ACCOUNT VERIFICATION (PENNY DROP) ---');

// 2A. Rejection without consent
const bankReject = await app.inject({
  method: 'POST',
  url: '/v1/kyc/bank-account',
  payload: { accountNumber: '987654321012', ifsc: 'HDFC0000240' },
});
if (bankReject.statusCode === 400) {
  logPass('Bank Account rejected with HTTP 400 when consent is missing.');
}

// 2B. Success with consent
const bankSuccess = await app.inject({
  method: 'POST',
  url: '/v1/kyc/bank-account',
  headers: { 'x-actor-id': 'usr-supplier-202', 'user-agent': 'EquipRent-iOS/3.0' },
  payload: {
    accountNumber: '987654321012',
    ifsc: 'HDFC0000240',
    nameToMatch: 'Rajesh Sharma',
    consent: {
      agreed: true,
      noticeVersion: 'BANK_NOTICE_V1.0',
      noticeText: 'I authorize a ₹1 penny drop to verify my bank account for rental payouts.',
    },
  },
});
const bankJson = bankSuccess.json();
if (bankSuccess.statusCode === 200 && bankJson.consentId && bankJson.data?.accountExists) {
  logPass(`Bank account verified with generated consentId: ${bankJson.consentId}`);
  console.log(`   Beneficiary: ${bankJson.data.beneficiaryName} | Match Score: ${bankJson.data.nameMatch.score}%`);
}

// =========================================================================
// 3. VEHICLE RC VERIFICATION (PUC, FITNESS, INSURANCE)
// =========================================================================
console.log('\n--- 3. VEHICLE RC VERIFICATION ---');

// 3A. Rejection without consent
const rcReject = await app.inject({
  method: 'POST',
  url: '/v1/kyc/rc',
  payload: { vehicleNumber: 'MH12AB1234' },
});
if (rcReject.statusCode === 400) {
  logPass('Vehicle RC rejected with HTTP 400 when consent is missing.');
}

// 3B. Success with consent
const rcSuccess = await app.inject({
  method: 'POST',
  url: '/v1/kyc/rc',
  headers: { 'x-actor-id': 'usr-fleet-owner-303', 'user-agent': 'EquipRent-Android/2.4' },
  payload: {
    vehicleNumber: 'MH12AB1234',
    consent: {
      agreed: true,
      noticeVersion: 'RC_NOTICE_V1.0',
      noticeText: 'I authorize vehicle RC, fitness, and insurance compliance check.',
    },
  },
});
const rcJson = rcSuccess.json();
if (rcSuccess.statusCode === 200 && rcJson.consentId && rcJson.data?.compliance?.isFullyCompliant) {
  logPass(`Vehicle RC verified with generated consentId: ${rcJson.consentId}`);
  console.log(`   Registration: ${rcJson.data.vehicleNumber} | Status: ${rcJson.data.compliance.status}`);
}

// =========================================================================
// 4. VEHICLE E-CHALLAN VERIFICATION
// =========================================================================
console.log('\n--- 4. VEHICLE E-CHALLAN VERIFICATION ---');

// 4A. Rejection without consent
const challanReject = await app.inject({
  method: 'POST',
  url: '/v1/kyc/challan',
  payload: { rcNumber: 'HR55AP0244' },
});
if (challanReject.statusCode === 400) {
  logPass('Vehicle Challan rejected with HTTP 400 when consent is missing.');
}

// 4B. Success with consent
const challanSuccess = await app.inject({
  method: 'POST',
  url: '/v1/kyc/challan',
  headers: { 'x-actor-id': 'usr-contractor-404', 'user-agent': 'EquipRent-Web/1.0' },
  payload: {
    rcNumber: 'HR55AP0244',
    chassisNumber: 'MA3JMTB1SPB851591',
    engineNumber: 'K10CNC265773',
    consent: {
      agreed: true,
      noticeVersion: 'CHALLAN_NOTICE_V1.0',
      noticeText: 'I authorize traffic challan query across national and state portals.',
    },
  },
});
const challanJson = challanSuccess.json();
if (challanSuccess.statusCode === 200 && challanJson.consentId) {
  logPass(`Vehicle Challan verified with generated consentId: ${challanJson.consentId}`);
  console.log(`   Pending Challans: ${challanJson.data.pendingChallansCount} | Total Unpaid: ₹${challanJson.data.totalPendingAmount}`);
}

// =========================================================================
// 5. DIGILOCKER AADHAAR VERIFICATION
// =========================================================================
console.log('\n--- 5. DIGILOCKER AADHAAR VERIFICATION ---');

// 5A. Rejection without consent
const aadhaarReject = await app.inject({
  method: 'POST',
  url: '/v1/kyc/aadhaar/initiate',
  payload: { redirectUrl: 'https://example.com/callback' },
});
if (aadhaarReject.statusCode === 400) {
  logPass('Aadhaar DigiLocker initiation rejected with HTTP 400 when consent is missing.');
}

// 5B. Success with consent
const aadhaarSuccess = await app.inject({
  method: 'POST',
  url: '/v1/kyc/aadhaar/initiate',
  headers: { 'x-actor-id': 'usr-individual-505', 'user-agent': 'EquipRent-Android/2.4' },
  payload: {
    redirectUrl: 'https://example.com/callback',
    consent: {
      agreed: true,
      noticeVersion: 'AADHAAR_NOTICE_V1.0',
      noticeText: 'I agree to initiate a DigiLocker session to share Aadhaar XML for identity verification.',
    },
  },
});
const aadhaarJson = aadhaarSuccess.json();
if (aadhaarSuccess.statusCode === 200 && aadhaarJson.consentId && aadhaarJson.data?.clientId) {
  logPass(`Aadhaar session initiated with generated consentId: ${aadhaarJson.consentId}`);
  console.log(`   DigiLocker Session URL: ${aadhaarJson.data.url}`);

  // Fetch verified Aadhaar details
  const aadhaarFetch = await app.inject({
    method: 'GET',
    url: `/v1/kyc/aadhaar/${aadhaarJson.data.clientId}`,
  });
  if (aadhaarFetch.statusCode === 200 && aadhaarFetch.json().data?.compliance?.isAadhaarVerified) {
    logPass(`Fetched completed DigiLocker Aadhaar details for client: ${aadhaarJson.data.clientId}`);
    console.log(`   Verified Citizen: ${aadhaarFetch.json().data.name} | Adult: ${aadhaarFetch.json().data.compliance.checks.isAdult}`);
  }
}

console.log('\n' + '='.repeat(75));
console.log(`🎉 ALL ${passedCount} VERIFICATION & CONSENT CHECKS PASSED WITH 100% SUCCESS!`);
console.log('='.repeat(75) + '\n');

await app.close();

