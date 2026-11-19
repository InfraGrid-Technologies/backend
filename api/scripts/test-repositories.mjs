import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createKycRepository } from '../src/modules/kyc/kyc.repository.js';

const { Pool } = pg;

const dbConfig = {
  host: '127.0.0.1',
  port: 5434,
  user: 'postgres',
  password: 'dev-secure-password-1234567890',
  database: 'equiprent_model',
};

async function runRepositoryTests() {
  console.log('🚀 [TEST RUNNER] Starting Verification Repositories Test Suite...\n');
  const pool = new Pool(dbConfig);
  const db = { pool };
  const repo = createKycRepository(db);

  const testActorId = randomUUID();

  try {
    // ---------------------------------------------------------
    // TEST 1: Consent Creation
    // ---------------------------------------------------------
    console.log('--- 1. Testing DPDP Consent Storage ---');
    const consent = await repo.recordConsent({
      actorId: testActorId,
      consentType: 'rc',
      purpose: 'INTEGRATION_TESTING',
      noticeVersion: '1.0',
      noticeText: 'Test consent agreement',
      ipAddress: '127.0.0.1',
      userAgent: 'RepositoryTestSuite/1.0',
    });
    console.log(`✅ Consent Created: ID = ${consent.id}, Status = ${consent.status}`);

    // ---------------------------------------------------------
    // TEST 2: Vehicle RC Repository
    // ---------------------------------------------------------
    console.log('\n--- 2. Testing Vehicle RC Repository (kyc.rc_verifications & rc_documents) ---');
    const rcMaster = await repo.saveVerification({
      verificationType: 'rc',
      idNumber: 'TS09GB8634',
      status: 'verified',
      isAuthentic: true,
      isCompliant: true,
      provider: 'surepass',
      responseData: { test: true },
      actorId: testActorId,
      consentId: consent.id,
      costInr: 15.00,
      rejectionReasons: [],
    });
    console.log(`✅ Master Verification Row Created: ID = ${rcMaster.id}`);

    const rcSub = await repo.rc.saveRcDetails({
      verificationId: rcMaster.id,
      actorId: testActorId,
      consentId: consent.id,
      input: {
        vehicleNumber: 'TS09GB8634',
        engineNumber: 'ENG-998877',
        chassisNumber: 'CHAS-112233',
        vehicleType: 'CEV - Heavy Excavator',
      },
      verified: {
        ownerName: 'EQUIPRENT LOGISTICS PVT LTD',
        fatherName: 'RAMESH RAO',
        presentAddress: 'Plot 45, HITEC City, Hyderabad',
        permanentAddress: 'Plot 45, HITEC City, Hyderabad',
        registrationDate: '2021-05-10',
        rtoName: 'RTO HYDERABAD CENTRAL, TELANGANA',
        status: 'ACTIVE',
        makerDescription: 'TATA HITACHI',
        makerModel: 'EXCAVATOR EX200',
        vehicleClass: 'CEV - Construction Equipment Vehicle',
        fuelType: 'DIESEL',
        color: 'YELLOW',
        engineNumber: 'ENG-998877',
        chassisNumber: 'CHAS-112233',
        cubicCapacity: 5883.00,
        unladenWeight: 19800.00,
        vehicleGrossWeight: 21500.00,
        manufacturingDate: '2021-03-01',
        fitness: { status: 'ACTIVE', validTill: '2027-05-09' },
        insurance: { status: 'ACTIVE', company: 'TATA AIG', policyNumber: 'POL-776655', validTill: '2027-06-01' },
        puc: { status: 'ACTIVE', certificateNumber: 'PUC-9988', validTill: '2026-12-31' },
        nationalPermit: { status: 'ACTIVE', permitNumber: 'NP-4433', type: 'ALL INDIA GOODS', validTill: '2028-05-01' },
        taxUpto: '2027-05-01',
        isRoadworthy: true,
      },
      rawResponse: { status_code: 200, message: 'Test RC Response' },
      isCompliant: true,
    });
    console.log(`✅ RC Sub-Table Record Inserted: ID = ${rcSub.id}, Timestamp = ${rcSub.input_submitted_at}`);

    // Save RC Document image
    const sampleImageB64 = Buffer.from('EQUIPRENT_MOCK_RC_BINARY_PHOTO_DATA_2026').toString('base64');
    const rcDoc = await repo.rc.saveRcDocument({
      rcVerificationId: rcSub.id,
      actorId: testActorId,
      documentSide: 'FRONT',
      originalFilename: 'test_rc_smartcard.jpg',
      mimeType: 'image/jpeg',
      fileBase64: sampleImageB64,
      ocrExtractedData: { vehicleNumber: 'TS09GB8634', makerModel: 'EXCAVATOR EX200' },
      ocrConfidence: 98.5,
    });
    console.log(`✅ RC Document Saved (BYTEA Blob): ID = ${rcDoc.id}, Size = ${rcDoc.file_size_bytes} bytes, SHA256 = ${rcDoc.sha256_checksum.slice(0, 16)}...`);

    // Verify RC Fetching with Documents joined
    const fetchedRc = await repo.rc.getRcByVerificationId(rcMaster.id);
    console.log(`🔍 Retrieved RC Details: Owner = "${fetchedRc.verified_owner_name}", Roadworthy = ${fetchedRc.is_roadworthy}, Documents Count = ${fetchedRc.documents?.length || 0}`);

    // ---------------------------------------------------------
    // TEST 3: Driving License Repository
    // ---------------------------------------------------------
    console.log('\n--- 3. Testing Driving License Repository (kyc.dl_verifications & dl_documents) ---');
    const dlMaster = await repo.saveVerification({
      verificationType: 'driving_license',
      idNumber: 'TS01620240001534',
      status: 'verified',
      isAuthentic: true,
      isCompliant: true,
      provider: 'surepass',
      responseData: { test: true },
      actorId: testActorId,
      consentId: consent.id,
      costInr: 15.00,
    });

    const dlSub = await repo.dl.saveDlDetails({
      verificationId: dlMaster.id,
      actorId: testActorId,
      consentId: consent.id,
      input: {
        dlNumber: 'TS01620240001534',
        dob: '1990-08-15',
      },
      verified: {
        name: 'SURESH KUMAR SHARMA',
        fatherOrHusbandName: 'RAMESHWAR SHARMA',
        gender: 'MALE',
        bloodGroup: 'B+',
        permanentAddress: 'H.No 12-4, Madhapur, Hyderabad',
        status: 'ACTIVE',
        issueDate: '2015-06-20',
        validFrom: '2015-06-20',
        validTill: '2035-06-19',
        transportValidFrom: '2018-01-10',
        transportValidTill: '2028-01-09',
        rtoName: 'RTO PUNE, MAHARASHTRA',
        rtoCode: 'MH-12',
        state: 'Maharashtra',
        vehicleClasses: [
          { class: 'LMV', description: 'LIGHT MOTOR VEHICLE' },
          { class: 'TRANS', description: 'TRANSPORT HEAVY COMMERCIAL' },
          { class: 'HGMV', description: 'HEAVY GOODS MOTOR VEHICLE (CRANE/EXCAVATOR)' },
        ],
        badgeNumber: 'BDG-998811',
        badgeIssueDate: '2018-01-10',
      },
      compliance: {
        isHeavyEqipmentAuthorized: true,
        allVehicleClasses: ['LMV', 'TRANS', 'HGMV'],
      },
      rawResponse: { status_code: 200, message: 'Test DL Response' },
      verificationStatus: 'VERIFIED',
      isAuthentic: true,
      isCompliant: true,
      rejectionReasons: [],
      costInr: 15.00,
    });
    console.log(`✅ DL Sub-Table Record Inserted: ID = ${dlSub.id}, Timestamp = ${dlSub.input_submitted_at}`);

    // Save DL Document image
    const sampleDlB64 = Buffer.from('EQUIPRENT_MOCK_DL_BINARY_PHOTO_DATA_2026').toString('base64');
    const dlDoc = await repo.dl.saveDlDocument({
      dlVerificationId: dlSub.id,
      actorId: testActorId,
      documentSide: 'FRONT',
      originalFilename: 'test_dl_photo.jpg',
      mimeType: 'image/jpeg',
      fileBase64: sampleDlB64,
      ocrExtractedData: { dlNumber: 'TS01620240001534', name: 'SURESH KUMAR SHARMA' },
      ocrConfidence: 99.1,
    });
    console.log(`✅ DL Document Saved (BYTEA Blob): ID = ${dlDoc.id}, Size = ${dlDoc.file_size_bytes} bytes, SHA256 = ${dlDoc.sha256_checksum.slice(0, 16)}...`);

    // Verify DL Fetching
    const fetchedDl = await repo.dl.getDlByVerificationId(dlMaster.id);
    console.log(`🔍 Retrieved DL Details: Name = "${fetchedDl.verified_name}", Status = ${fetchedDl.verification_status}, Heavy Machinery Endorsed = ${fetchedDl.has_heavy_equipment_endorsement}, Documents Count = ${fetchedDl.documents?.length || 0}`);

    // ---------------------------------------------------------
    // TEST 4: Challan Repository
    // ---------------------------------------------------------
    console.log('\n--- 4. Testing Challan Repository (kyc.challan_verifications & challan_tickets) ---');
    const challanMaster = await repo.saveVerification({
      verificationType: 'challan',
      idNumber: 'TS09GB8634',
      status: 'verified',
      isAuthentic: true,
      isCompliant: false, // Has pending violation
      provider: 'surepass',
      responseData: { test: true },
      actorId: testActorId,
      consentId: consent.id,
      costInr: 15.00,
      rejectionReasons: ['Vehicle has 1 pending traffic violation'],
    });

    const challanSub = await repo.challan.saveChallanDetails({
      verificationId: challanMaster.id,
      actorId: testActorId,
      consentId: consent.id,
      input: {
        rcNumber: 'TS09GB8634',
        chassisNumber: 'CHAS-112233',
        engineNumber: 'ENG-998877',
        queriedPortals: ['DL', 'TS', 'GJ'],
      },
      verified: {
        clientId: 'CHALLAN-CLIENT-12345',
        totalChallans: 2,
        pendingChallansCount: 1,
        totalPendingAmount: 1500.00,
        totalDisposedAmount: 500.00,
        hasPendingChallans: true,
        queriedPortalsStatus: { TS: 'SUCCESS', DL: 'SUCCESS', GJ: 'SUCCESS' },
        challans: [
          {
            number: 1,
            challanNumber: 'TS-2024-99881122',
            offenseDetails: 'Overspeeding on Outer Ring Road',
            challanPlace: 'Gachibowli Junction, Hyderabad',
            challanDate: '2024-03-15T10:30:00Z',
            state: 'TS',
            amount: 1500.00,
            status: 'PENDING',
          },
          {
            number: 2,
            challanNumber: 'TS-2023-11223344',
            offenseDetails: 'Improper Parking',
            challanPlace: 'Madhapur, Hyderabad',
            challanDate: '2023-11-20T14:15:00Z',
            state: 'TS',
            amount: 500.00,
            status: 'DISPOSED',
            paymentDate: '2023-11-21T09:00:00Z',
            transactionId: 'TXN-DISP-776655',
          },
        ],
      },
      rawResponse: { status_code: 200, message: 'Test Challan Response' },
      verificationStatus: 'REJECTED',
      isCompliant: false,
      costInr: 15.00,
    });
    console.log(`✅ Challan Sub-Table Record Inserted: ID = ${challanSub.id}, Timestamp = ${challanSub.input_submitted_at}`);

    // Verify Challan Fetching with Tickets joined
    const fetchedChallan = await repo.challan.getChallansByVerificationId(challanMaster.id);
    console.log(`🔍 Retrieved Challan Details: Total = ${fetchedChallan.total_challans}, Pending = ${fetchedChallan.pending_challans_count}, Total Pending Amount = ₹${fetchedChallan.total_pending_amount}, Tickets Joined = ${fetchedChallan.tickets?.length || 0}`);

    // ---------------------------------------------------------
    // TEST 5: Aadhaar DigiLocker Repository
    // ---------------------------------------------------------
    console.log('\n--- 5. Testing Aadhaar Repository (kyc.aadhaar_verifications & aadhaar_documents) ---');
    const aadhaarMaster = await repo.saveVerification({
      verificationType: 'aadhaar',
      idNumber: 'TEST-SESSION-CLIENT-9999',
      status: 'verified',
      isAuthentic: true,
      isCompliant: true,
      provider: 'surepass',
      responseData: { test: true },
      actorId: testActorId,
      consentId: consent.id,
      costInr: 15.00,
    });

    const sampleAadhaarPhotoB64 = Buffer.from('EQUIPRENT_MOCK_AADHAAR_PORTRAIT_PHOTO_2026').toString('base64');
    const aadhaarSub = await repo.aadhaar.saveAadhaarDetails({
      verificationId: aadhaarMaster.id,
      actorId: testActorId,
      consentId: consent.id,
      clientId: 'TEST-SESSION-CLIENT-9999',
      redirectUrl: 'https://sandbox.surepass.app/callback',
      verified: {
        name: 'SURESH KUMAR SHARMA',
        dob: '1990-08-15',
        gender: 'MALE',
        maskedAadhaar: 'XXXX-XXXX-9912',
        careOf: 'C/O RAMESHWAR SHARMA',
        mobileNumber: '9876543210',
        digilockerVerified: true,
        address: {
          house: 'Plot 45',
          street: 'Road No 36',
          landmark: 'Near Cyber Towers',
          locality: 'Madhapur',
          vtc: 'Hyderabad',
          subdist: 'Serilingampally',
          dist: 'Hyderabad',
          state: 'Telangana',
          pincode: '500081',
          country: 'India',
        },
        profilePhotoBase64: sampleAadhaarPhotoB64,
      },
      rawResponse: { status_code: 200, message: 'Test Aadhaar DigiLocker Response' },
      sessionStatus: 'COMPLETED',
      verificationStatus: 'VERIFIED',
      costInr: 15.00,
    });
    console.log(`✅ Aadhaar Sub-Table Record Inserted: ID = ${aadhaarSub.id}, Timestamp = ${aadhaarSub.input_submitted_at}`);

    // Verify Aadhaar Fetching with Documents joined
    const fetchedAadhaar = await repo.aadhaar.getAadhaarByClientId('TEST-SESSION-CLIENT-9999');
    console.log(`🔍 Retrieved Aadhaar Details: Name = "${fetchedAadhaar.verified_full_name}", Masked = ${fetchedAadhaar.masked_aadhaar}, DigiLocker Verified = ${fetchedAadhaar.digilocker_verified}, Documents Count = ${fetchedAadhaar.documents?.length || 0}`);

    console.log('\n🎉 ========================================================');
    console.log('🎉 ALL REPOSITORY OPERATIONS PASSED 100% WITH ZERO ERRORS!');
    console.log('🎉 ========================================================');
  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runRepositoryTests();
