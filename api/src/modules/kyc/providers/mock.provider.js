import { KycProviderInterface } from './kyc-provider.interface.js';
import { DL_SCENARIOS, RC_SCENARIOS, CHALLAN_SCENARIOS } from './mock-scenarios.js';
import { validateDlDocumentImage, validateRcDocumentImage } from '../ocr/local-ocr.js';

/**
 * Free Scenario Mock Provider for local testing and client demos.
 * Consumes ₹0 Surepass tokens and returns realistic, rich dataset responses.
 */
export class MockKycProvider extends KycProviderInterface {
  constructor(logger) {
    super();
    this.logger = logger;
    this.providerName = 'mock';
  }

  /**
   * Driving License Verification
   */
  async verifyDrivingLicense({ dlNumber, dob }) {
    this.logger?.info({ dlNumber, dob }, '[MockKycProvider] Evaluating Driving License scenario');

    const cleanDl = dlNumber.replaceAll(/[\s-]/g, '').toUpperCase();

    // 1. Simulate invalid / not found DL
    if (cleanDl.includes('INVALID') || cleanDl.includes('FAKE') || cleanDl.includes('NOTFOUND')) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          dlNumber: cleanDl,
          status: 'INVALID',
          message: 'Driving license not found in Parivahan Sarathi database',
        },
        raw: { status_code: 404, message: 'DL not found' },
      };
    }

    // 2. Direct scenario lookup
    if (DL_SCENARIOS[cleanDl]) {
      const sc = DL_SCENARIOS[cleanDl];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, dlNumber: cleanDl },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    // 3. Keyword-based matching
    if (cleanDl.includes('LMV') || cleanDl.includes('BIKE') || cleanDl.includes('CAR')) {
      const sc = DL_SCENARIOS['TS01620240001534'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, dlNumber: cleanDl },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    if (cleanDl.includes('EXP')) {
      const sc = DL_SCENARIOS['MH1220050009999'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, dlNumber: cleanDl },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    // 4. Backward-compatible test unit license
    if (cleanDl === 'MH1420110062821') {
      const base = DL_SCENARIOS['TS0920210001234'];
      return {
        success: true,
        provider: this.providerName,
        scenario: 'DL_TEST_UNIT',
        data: {
          ...base.data,
          name: 'RAJESH KUMAR SHARMA',
          dlNumber: cleanDl,
          dob: dob || '1990-05-15',
          vehicleClasses: ['LMV', 'TRANS', 'HGMV'],
        },
        raw: { mock: true, code: 200 },
      };
    }

    // 5. Default: Heavy Machinery Operator (Verified & Compliant)
    const base = DL_SCENARIOS['TS0920210001234'];
    return {
      success: true,
      provider: this.providerName,
      scenario: base.scenarioCode,
      data: {
        ...base.data,
        dlNumber: cleanDl,
        dob: dob || base.data.dob,
      },
      raw: { mock: true, code: 200 },
    };
  }

  /**
   * Bank Account Penny Drop Verification
   */
  async verifyBankAccount({ accountNumber, ifsc }) {
    this.logger?.info({ accountNumber, ifsc }, '[MockKycProvider] Simulating Bank Account verification');

    if (accountNumber.endsWith('0000')) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          accountNumber,
          ifsc: ifsc.toUpperCase(),
          status: 'FAILED',
          message: 'Account does not exist or has been frozen',
        },
        raw: { status_code: 422, message: 'Invalid Account' },
      };
    }

    return {
      success: true,
      provider: this.providerName,
      data: {
        accountNumber,
        ifsc: ifsc.toUpperCase(),
        accountExists: true,
        beneficiaryName: 'RAJESH KUMAR SHARMA',
        bankName: 'HDFC BANK LIMITED',
        branch: 'BANER PUNE BRANCH',
        city: 'PUNE',
        micr: '411240012',
        upiId: 'rajesh.sharma@okhdfcbank',
        pennyDropStatus: 'SUCCESS',
      },
      raw: { mock: true, code: 200 },
    };
  }

  /**
   * Vehicle RC Roadworthiness Verification
   */
  async verifyRc({ vehicleNumber }) {
    this.logger?.info({ vehicleNumber }, '[MockKycProvider] Evaluating Vehicle RC scenario');

    const cleanRc = vehicleNumber.replaceAll(/[\s-]/g, '').toUpperCase();

    // 1. Invalid / Not registered vehicle
    if (cleanRc.includes('FAKE') || cleanRc.includes('NOTFOUND') || cleanRc.includes('INVALID')) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          vehicleNumber: cleanRc,
          status: 'NOT_FOUND',
          message: 'Vehicle not registered on Vahan registry',
        },
        raw: { status_code: 404, message: 'Vehicle not found' },
      };
    }

    // 2. Direct scenario lookup
    if (RC_SCENARIOS[cleanRc]) {
      const sc = RC_SCENARIOS[cleanRc];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, vehicleNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    // 3. Keyword-based matching
    if (cleanRc.includes('PUC')) {
      const sc = RC_SCENARIOS['DL01AB1234'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, vehicleNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    if (cleanRc.includes('FIT')) {
      const sc = RC_SCENARIOS['MH14DE9012'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, vehicleNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    if (cleanRc.includes('INS')) {
      const sc = RC_SCENARIOS['KA04ME5678'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, vehicleNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    if (cleanRc.includes('SUSP')) {
      const sc = RC_SCENARIOS['HR55XX4444'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, vehicleNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    // 4. Default: Fully Compliant Commercial Vehicle (Tata Prima Tipper)
    const base = RC_SCENARIOS['TS16FD7966'];
    return {
      success: true,
      provider: this.providerName,
      scenario: base.scenarioCode,
      data: {
        ...base.data,
        vehicleNumber: cleanRc,
      },
      raw: { mock: true, code: 200 },
    };
  }

  /**
   * DigiLocker Aadhaar Session Initiation
   */
  async initiateAadhaarDigilocker({ redirectUrl }) {
    this.logger?.info({ redirectUrl }, '[MockKycProvider] Simulating DigiLocker Aadhaar initialization');
    const mockClientId = 'mock_client_' + Date.now();

    return {
      success: true,
      provider: this.providerName,
      data: {
        clientId: mockClientId,
        url: `https://mock-digilocker.sandbox.local/oauth?client_id=${mockClientId}&redirect_url=${encodeURIComponent(redirectUrl || 'http://localhost:3100/v1/kyc/aadhaar/callback')}`,
        validityMinutes: 15,
      },
      raw: { mock: true, code: 200 },
    };
  }

  /**
   * DigiLocker Aadhaar Detail Retrieval
   */
  async getAadhaarDetails({ clientId }) {
    this.logger?.info({ clientId }, '[MockKycProvider] Simulating DigiLocker Aadhaar detail retrieval');

    return {
      success: true,
      provider: this.providerName,
      data: {
        clientId,
        status: 'COMPLETED',
        name: clientId?.includes('vinay') ? 'PANDIRI VINAY KUMAR' : 'RAJESH KUMAR SHARMA',
        dob: '1990-05-15',
        gender: 'MALE',
        maskedAadhaar: 'XXXXXXXX8912',
        careOf: 'S/O PANDIRI RAJESHWAR RAO',
        address: {
          house: 'Flat 402',
          street: 'Gokul Residency',
          locality: 'Banjara Hills',
          dist: 'Hyderabad',
          state: 'Telangana',
          pincode: '500034',
          country: 'India',
        },
        profilePhotoBase64: null,
        digilockerVerified: true,
      },
      raw: { mock: true, code: 200 },
    };
  }

  /**
   * Vehicle E-Challan Verification
   */
  async verifyChallan({ rcNumber, chassisNumber, engineNumber, statePortals }) {
    this.logger?.info({ rcNumber, chassisNumber, engineNumber, statePortals }, '[MockKycProvider] Evaluating E-Challan scenario');

    const cleanRc = rcNumber.replaceAll(/[\s-]/g, '').toUpperCase();
    const portals = (statePortals && statePortals.length) ? statePortals.filter(p => p !== 'DL_ALL') : ['DL', 'TS', 'GJ'];

    // 1. Direct scenario lookup
    if (CHALLAN_SCENARIOS[cleanRc]) {
      const sc = CHALLAN_SCENARIOS[cleanRc];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, rcNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    // 2. Keyword-based matching
    if (cleanRc === 'TS09GB8634' || cleanRc.includes('FINE') || cleanRc.includes('UNPAID')) {
      const sc = CHALLAN_SCENARIOS['TS09GB8634'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, rcNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    if (cleanRc === 'TS08UNREACHABLE' || cleanRc.includes('UNREACHABLE') || cleanRc.includes('FAIL') || cleanRc.includes('TIMEOUT')) {
      const sc = CHALLAN_SCENARIOS['TS08UNREACHABLE'];
      return {
        success: true,
        provider: this.providerName,
        scenario: sc.scenarioCode,
        data: { ...sc.data, rcNumber: cleanRc },
        raw: { mock: true, code: 200, scenario: sc.scenarioCode },
      };
    }

    if (cleanRc === 'HR55AP0244') {
      // Compatibility with unit test expectations
      return {
        success: true,
        provider: this.providerName,
        data: {
          rcNumber: cleanRc,
          totalChallans: 2,
          pendingChallansCount: 1,
          totalPendingAmount: 1000,
          hasPendingChallans: true,
          checkedPortals: portals,
          failedBackends: [],
          successfulBackends: portals,
          homeState: 'HR',
          challans: [
            {
              number: 1,
              challanNumber: 'HR551123456789',
              offenseDetails: 'Disobeying lawful directions / Jumping Red Light',
              challanPlace: 'GURUGRAM IFFCO CHOWK',
              challanDate: '2024-01-25',
              state: 'HR',
              amount: 1000,
              status: 'PENDING',
              rawStatus: 'PENDING',
            },
            {
              number: 2,
              challanNumber: 'HR559988776655',
              offenseDetails: 'Improper Parking',
              challanPlace: 'FARIDABAD BATA CHOWK',
              challanDate: '2023-11-10',
              state: 'HR',
              amount: 500,
              status: 'DISPOSED',
              rawStatus: 'DISPOSED',
            },
          ],
        },
        raw: { mock: true, code: 200 },
      };
    }

    // 3. Default: Clean vehicle with 0 pending challans
    const base = CHALLAN_SCENARIOS['TS16FD7966'];
    return {
      success: true,
      provider: this.providerName,
      scenario: base.scenarioCode,
      data: {
        ...base.data,
        rcNumber: cleanRc,
        checkedPortals: portals,
      },
      raw: { mock: true, code: 200 },
    };
  }

  /**
   * Mock Vehicle RC OCR
   */
  async ocrVehicleRc({ fileBase64, mimeType, fileUrl }) {
    this.logger?.info('[MockKycProvider] Evaluating Vehicle RC AI OCR scan');

    // If real image uploaded (e.g. from camera/gallery > 500 chars), verify it is a valid RC document
    if (fileBase64 && fileBase64.length > 500) {
      try {
        const cleanBase64 = fileBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        const buf = Buffer.from(cleanBase64, 'base64');
        const validation = await validateRcDocumentImage(buf);
        if (validation && validation.isDocument === false) {
          return {
            success: false,
            provider: this.providerName,
            data: {
              status: 'INVALID_DOCUMENT',
              message: validation.message || 'Invalid Document Image: The uploaded photo does not appear to be a valid Vehicle Registration Certificate (RC). Please ensure the full physical card is visible and well-lit.',
            },
            raw: { status_code: 422, message: 'Invalid document image' },
          };
        }
      } catch (err) {
        this.logger?.warn({ err: err.message }, '[MockKycProvider] Document validation check error');
      }
    }

    return {
      success: true,
      provider: this.providerName,
      data: {
        vehicleNumber: 'TS16FD7966',
        engineNumber: '497TCIC80N123456',
        chassisNumber: 'MAT618012E4A98765',
        ownerName: 'EQUIPRENT LOGISTICS & INFRASTRUCTURE PVT LTD',
        makerModel: 'TATA MOTORS PRIMA 2830.K HEAVY TIPPER',
        vehicleClass: 'Commercial Tipper / Dumper',
        fuelType: 'DIESEL',
        registrationDate: '2021-03-15',
        ocrConfidence: 0.98,
      },
      raw: { mock: true, code: 200, simulatedOcr: true },
    };
  }

  /**
   * Mock Driving License OCR
   */
  async ocrDrivingLicense({ fileBase64, mimeType, fileUrl }) {
    this.logger?.info('[MockKycProvider] Evaluating Driving License AI OCR scan');

    // If real image uploaded (e.g. from camera/gallery > 500 chars), verify it is a valid DL document
    if (fileBase64 && fileBase64.length > 500) {
      try {
        const cleanBase64 = fileBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        const buf = Buffer.from(cleanBase64, 'base64');
        const validation = await validateDlDocumentImage(buf);
        if (validation && validation.isDocument === false) {
          return {
            success: false,
            provider: this.providerName,
            data: {
              status: 'INVALID_DOCUMENT',
              message: validation.message || 'Invalid Document Image: The uploaded photo does not appear to be a valid physical Driving License. Please ensure the full physical card is visible and well-lit.',
            },
            raw: { status_code: 422, message: 'Invalid document image' },
          };
        }
      } catch (err) {
        this.logger?.warn({ err: err.message }, '[MockKycProvider] Document validation check error');
      }
    }

    return {
      success: true,
      provider: this.providerName,
      data: {
        dlNumber: 'TS0920210001234',
        dob: '1990-05-15',
        name: 'RAJESH KUMAR SHARMA',
        fatherOrHusbandName: 'PANDIRI RAJESHWAR RAO',
        address: 'PLOT 42, ROAD NO 12, BANJARA HILLS, HYDERABAD, TELANGANA 500034',
        ocrConfidence: 0.97,
      },
      raw: { mock: true, code: 200, simulatedOcr: true },
    };
  }
}
