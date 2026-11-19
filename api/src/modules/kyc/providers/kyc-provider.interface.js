/**
 * Standard KYC Provider Interface
 * Every external KYC vendor (Surepass, Cashfree, Zoop, Mock, etc.)
 * MUST implement this interface to be swappable.
 */
export class KycProviderInterface {
  /**
   * Verify Driving License
   * @param {{ dlNumber: string, dob: string }} params
   * @returns {Promise<{ success: boolean, provider: string, data: object, raw: object }>}
   */
  async verifyDrivingLicense({ dlNumber, dob }) {
    throw new Error('Method verifyDrivingLicense() not implemented.');
  }

  /**
   * Verify Bank Account via Penny Drop
   * @param {{ accountNumber: string, ifsc: string }} params
   * @returns {Promise<{ success: boolean, provider: string, data: object, raw: object }>}
   */
  async verifyBankAccount({ accountNumber, ifsc }) {
    throw new Error('Method verifyBankAccount() not implemented.');
  }

  /**
   * Verify Vehicle RC (Registration Certificate, PUC, Fitness, Insurance)
   * @param {{ vehicleNumber: string }} params
   * @returns {Promise<{ success: boolean, provider: string, data: object, raw: object }>}
   */
  async verifyRc({ vehicleNumber }) {
    throw new Error('Method verifyRc() not implemented.');
  }

  /**
   * Initiate DigiLocker Aadhaar Verification session
   * @param {{ redirectUrl?: string }} params
   * @returns {Promise<{ success: boolean, provider: string, data: { clientId: string, url: string }, raw: object }>}
   */
  async initiateAadhaarDigilocker({ redirectUrl }) {
    throw new Error('Method initiateAadhaarDigilocker() not implemented.');
  }

  /**
   * Fetch Aadhaar details after user completes DigiLocker consent
   * @param {{ clientId: string }} params
   * @returns {Promise<{ success: boolean, provider: string, data: object, raw: object }>}
   */
  async getAadhaarDetails({ clientId }) {
    throw new Error('Method getAadhaarDetails() not implemented.');
  }

  /**
   * Verify Vehicle E-Challans across national and state portals
   * @param {{ rcNumber: string, chassisNumber?: string, engineNumber?: string, statePortals?: string[] }} params
   * @returns {Promise<{ success: boolean, provider: string, data: object, raw: object }>}
   */
  async verifyChallan({ rcNumber, chassisNumber, engineNumber, statePortals }) {
    throw new Error('Method verifyChallan() not implemented.');
  }

  /**
   * Extract data from Vehicle RC document using AI OCR
   * @param {{ fileBase64: string, mimeType?: string, fileUrl?: string }} params
   * @returns {Promise<{ success: boolean, provider: string, data: { vehicleNumber?: string, engineNumber?: string, chassisNumber?: string, ownerName?: string, makerModel?: string }, raw: object }>}
   */
  async ocrVehicleRc({ fileBase64, mimeType, fileUrl }) {
    throw new Error('Method ocrVehicleRc() not implemented.');
  }

  /**
   * Extract data from Driving License document using AI OCR
   * @param {{ fileBase64: string, mimeType?: string, fileUrl?: string }} params
   * @returns {Promise<{ success: boolean, provider: string, data: { dlNumber?: string, dob?: string, name?: string, fatherOrHusbandName?: string }, raw: object }>}
   */
  async ocrDrivingLicense({ fileBase64, mimeType, fileUrl }) {
    throw new Error('Method ocrDrivingLicense() not implemented.');
  }
}

