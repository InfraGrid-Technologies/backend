import { SurepassKycProvider } from '../src/modules/kyc/providers/surepass.provider.js';
import { MockKycProvider } from '../src/modules/kyc/providers/mock.provider.js';

const token = process.env.SUREPASS_TOKEN;
const baseUrl = process.env.SUREPASS_BASE_URL || 'https://sandbox.surepass.app/api/v1';
const mode = (process.argv[2] || 'rc').toLowerCase(); // 'rc' or 'dl'
const useMock = process.argv.includes('--mock') || !token;

console.log('='.repeat(65));
console.log(`🔍 EquipRent KYC AI OCR Hands-on Test Runner`);
console.log(`Mode: ${mode.toUpperCase()} OCR`);
console.log(`Provider: ${useMock ? 'MOCK (Free Simulated Test)' : 'SUREPASS SANDBOX'}`);
if (!useMock) {
  console.log(`Base URL: ${baseUrl}`);
} else {
  console.log(`Notice: Running in Mock mode (₹0 cost). Pass valid SUREPASS_TOKEN to use live sandbox.`);
}
console.log('='.repeat(65));

const logger = {
  info: (obj, msg) => console.log(`[INFO] ${msg}`, obj ? JSON.stringify(obj) : ''),
  warn: (obj, msg) => console.warn(`[WARN] ${msg}`, obj ? JSON.stringify(obj) : ''),
  error: (obj, msg) => console.error(`[ERROR] ${msg}`, obj ? JSON.stringify(obj) : ''),
};

const provider = useMock
  ? new MockKycProvider(logger)
  : new SurepassKycProvider({ token, baseUrl, logger });

// Sample tiny 1x1 transparent PNG base64 for simulation/testing
const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

try {
  let result;
  if (mode === 'rc') {
    console.log('\n📄 Executing Vehicle RC OCR extraction...');
    result = await provider.ocrVehicleRc({
      fileBase64: sampleBase64,
      mimeType: 'image/png',
    });
  } else if (mode === 'dl') {
    console.log('\n🪪 Executing Driving License OCR extraction...');
    result = await provider.ocrDrivingLicense({
      fileBase64: sampleBase64,
      mimeType: 'image/png',
    });
  } else {
    console.log('Usage: node scripts/test-ocr.mjs [rc|dl] [--mock]');
    process.exit(0);
  }

  console.log('\n✅ Extraction Completed Successfully!');
  console.log('Normalized fields returned to mobile app:');
  console.log(JSON.stringify(result, null, 2));

  if (mode === 'rc') {
    console.log('\n🎯 Auto-fill payload for Vehicle Inspection screen:');
    console.log(`- Vehicle Number: ${result.data.vehicleNumber}`);
    console.log(`- Engine Number : ${result.data.engineNumber}`);
    console.log(`- Chassis Number: ${result.data.chassisNumber}`);
    console.log(`- Owner Name    : ${result.data.ownerName}`);
  } else {
    console.log('\n🎯 Auto-fill payload for Driving License screen:');
    console.log(`- DL Number : ${result.data.dlNumber}`);
    console.log(`- DOB       : ${result.data.dob}`);
    console.log(`- Driver    : ${result.data.name}`);
  }
} catch (err) {
  console.error('\n❌ OCR Extraction Failed:', err.message);
  if (err.details) console.error('Details:', err.details);
}

