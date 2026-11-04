import { SurepassKycProvider } from '../src/modules/kyc/providers/surepass.provider.js';

const token = process.env.SUREPASS_TOKEN;
const baseUrl = process.env.SUREPASS_BASE_URL || 'https://sandbox.surepass.app/api/v1';

if (!token) {
  console.error('❌ Please set SUREPASS_TOKEN in your .env file!');
  process.exit(1);
}

const provider = new SurepassKycProvider({
  token,
  baseUrl,
  logger: {
    info: (obj, msg) => console.log(`[INFO] ${msg}`, obj ? JSON.stringify(obj) : ''),
    warn: (obj, msg) => console.warn(`[WARN] ${msg}`, obj ? JSON.stringify(obj) : ''),
    error: (obj, msg) => console.error(`[ERROR] ${msg}`, obj ? JSON.stringify(obj) : ''),
  },
});

const mode = (process.argv[2] || 'rc').toLowerCase();
const inputVal = process.argv[3];

console.log('='.repeat(60));
console.log(`Testing Surepass Sandbox via Adapter Pipeline...`);
console.log(`Base URL: ${baseUrl}`);
console.log(`Verification: ${mode.toUpperCase()}`);
console.log('='.repeat(60));

try {
  let result;
  if (mode === 'rc') {
    const vehicleNumber = inputVal || 'TS16FD7966';
    console.log(`\nVerifying Vehicle RC: ${vehicleNumber}`);
    result = await provider.verifyRc({ vehicleNumber });
  } else if (mode === 'dl') {
    const dlNumber = inputVal || 'DL-1420110012345';
    const dob = process.argv[4] || '1990-05-15';
    console.log(`\nVerifying Driving License: ${dlNumber} (DOB: ${dob})`);
    result = await provider.verifyDrivingLicense({ dlNumber, dob });
  } else if (mode === 'bank') {
    const accNumber = inputVal || '919010000000001';
    const ifsc = process.argv[4] || 'UTIB0000001';
    console.log(`\nVerifying Bank Account: ${accNumber} (IFSC: ${ifsc})`);
    result = await provider.verifyBankAccount({ accountNumber: accNumber, ifsc });
  } else if (mode === 'aadhaar') {
    console.log(`\nInitiating DigiLocker Aadhaar Session...`);
    result = await provider.initiateAadhaarDigilocker({ redirectUrl: 'http://localhost:3100/v1/kyc/aadhaar/callback' });
  } else {
    console.log('Unknown mode. Available modes: rc | dl | bank | aadhaar');
    process.exit(0);
  }

  console.log('\n✅ Clean Normalized Output (What your app and frontend receive):');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('\n❌ Verification Failed:', err.message);
  if (err.details) console.error('Details:', err.details);
}
