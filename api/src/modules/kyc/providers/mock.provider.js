import { KycProviderInterface } from './kyc-provider.interface.js';

/**
 * Free Mock Provider for local testing and development.
 * Consumes ₹0 and returns realistic data immediately.
 */
export class MockKycProvider extends KycProviderInterface {
  constructor(logger) {
    super();
    this.logger = logger;
    this.providerName = 'mock';
  }

  async verifyDrivingLicense({ dlNumber, dob }) {
    this.logger?.info({ dlNumber, dob }, '[MockKycProvider] Simulating Driving License verification');

    // Simulate invalid DL if number is "INVALID_DL"
    if (dlNumber.toUpperCase().includes('INVALID')) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          dlNumber,
          status: 'INVALID',
          message: 'Driving license not found in Parivahan database'
        },
        raw: { status_code: 404, message: 'DL not found' }
      };
    }

    return {
      success: true,
      provider: this.providerName,
      data: {
        dlNumber: dlNumber.toUpperCase(),
        name: 'RAJESH KUMAR SHARMA',
        dob: dob || '1990-05-15',
        status: 'ACTIVE',
        validFrom: '2015-06-20',
        validTill: '2035-06-19',
        issueDate: '2015-06-20',
        rtoName: 'RTO PUNE, MAHARASHTRA',
        fatherOrHusbandName: 'SURESH SHARMA',
        address: 'FLAT 402, GOKUL RESIDENCY, BANER, PUNE, MAHARASHTRA 411045',
        vehicleClasses: [
          { class: 'MCWG', description: 'Motor Cycle With Gear', issueDate: '2015-06-20' },
          { class: 'LMV', description: 'Light Motor Vehicle', issueDate: '2015-06-20' },
          { class: 'TRANS', description: 'Commercial Transport Vehicle', issueDate: '2018-09-10' }
        ]
      },
      raw: { mock: true, code: 200 }
    };
  }

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
          message: 'Account does not exist or has been frozen'
        },
        raw: { status_code: 422, message: 'Invalid Account' }
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
        pennyDropStatus: 'SUCCESS'
      },
      raw: { mock: true, code: 200 }
    };
  }

  async verifyRc({ vehicleNumber }) {
    this.logger?.info({ vehicleNumber }, '[MockKycProvider] Simulating Vehicle RC verification');

    const cleanVehicleNumber = vehicleNumber.replaceAll(/[\s-]/g, '').toUpperCase();

    if (cleanVehicleNumber.includes('FAKE')) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          vehicleNumber: cleanVehicleNumber,
          status: 'NOT_FOUND',
          message: 'Vehicle not registered on Vahan registry'
        },
        raw: { status_code: 404, message: 'Vehicle not found' }
      };
    }

    return {
      success: true,
      provider: this.providerName,
      data: {
        vehicleNumber: cleanVehicleNumber,
        ownerName: 'RAJESH KUMAR SHARMA',
        makerModel: 'TATA MOTORS / ULTRA T.7 TRUCK',
        vehicleClass: 'Heavy Commercial Vehicle (HCV)',
        fuelType: 'DIESEL',
        engineNumber: '497TCIC80****',
        chassisNumber: 'MAT618012****',
        registrationDate: '2021-03-10',
        rtoName: 'RTO PUNE, MAHARASHTRA',
        status: 'ACTIVE',
        // Vital compliance documents:
        fitness: {
          status: 'ACTIVE',
          validTill: '2027-03-09'
        },
        insurance: {
          status: 'ACTIVE',
          company: 'ICICI LOMBARD GENERAL INSURANCE CO LTD',
          policyNumber: '3001/2021/98765432',
          validTill: '2027-02-28'
        },
        puc: {
          status: 'ACTIVE',
          certificateNumber: 'MH12PUC202600192',
          validTill: '2027-04-15'
        },
        nationalPermit: {
          status: 'ACTIVE',
          permitNumber: 'MH/NP/2021/8872',
          validTill: '2026-11-30'
        }
      },
      raw: { mock: true, code: 200 }
    };
  }

  async initiateAadhaarDigilocker({ redirectUrl }) {
    this.logger?.info({ redirectUrl }, '[MockKycProvider] Simulating DigiLocker Aadhaar initialization');
    const mockClientId = 'mock_client_' + Date.now();

    return {
      success: true,
      provider: this.providerName,
      data: {
        clientId: mockClientId,
        url: `https://mock-digilocker.sandbox.local/oauth?client_id=${mockClientId}&redirect_url=${encodeURIComponent(redirectUrl || 'http://localhost:3100/v1/kyc/aadhaar/callback')}`,
        validityMinutes: 15
      },
      raw: { mock: true, code: 200 }
    };
  }

  async getAadhaarDetails({ clientId }) {
    this.logger?.info({ clientId }, '[MockKycProvider] Simulating DigiLocker Aadhaar detail retrieval');

    return {
      success: true,
      provider: this.providerName,
      data: {
        clientId,
        status: 'COMPLETED',
        name: 'RAJESH KUMAR SHARMA',
        dob: '1990-05-15',
        gender: 'MALE',
        maskedAadhaar: 'XXXXXXXX8912',
        careOf: 'S/O SURESH SHARMA',
        address: {
          house: 'Flat 402',
          street: 'Gokul Residency',
          locality: 'Baner',
          dist: 'Pune',
          state: 'Maharashtra',
          pincode: '411045',
          country: 'India'
        },
        profilePhotoBase64: null,
        digilockerVerified: true
      },
      raw: { mock: true, code: 200 }
    };
  }

  async verifyChallan({ rcNumber, chassisNumber, engineNumber, statePortals }) {
    this.logger?.info({ rcNumber, chassisNumber, engineNumber, statePortals }, '[MockKycProvider] Simulating E-Challan verification');

    const cleanRc = rcNumber.replaceAll(/[\s-]/g, '').toUpperCase();
    const portals = (statePortals && statePortals.length) ? statePortals.filter(p => p !== 'DL_ALL') : ['DL', 'TS', 'GJ'];

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
        challans: [
          {
            number: 1,
            challanNumber: 'DL112345678978',
            offenseDetails: 'Disobeying lawful directions / Jumping Red Light',
            challanPlace: 'ITO INTERSECTION, DELHI',
            challanDate: '2024-01-25',
            state: 'DL',
            amount: 1000,
            status: 'PENDING',
          },
          {
            number: 2,
            challanNumber: 'TS998877665544',
            offenseDetails: 'Improper Parking',
            challanPlace: 'NIZAMABAD RTO CIRCLE',
            challanDate: '2023-11-10',
            state: 'TS',
            amount: 500,
            status: 'DISPOSED',
          },
        ],
      },
      raw: { mock: true, code: 200 },
    };
  }
}

