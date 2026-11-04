import { KycProviderInterface } from './kyc-provider.interface.js';
import { ApiError } from '../../../errors.js';

/**
 * Surepass KYC Provider Adapter
 * Connects to Surepass API (sandbox or production) using Bearer token.
 */
export class SurepassKycProvider extends KycProviderInterface {
  constructor({ token, baseUrl, logger }) {
    super();
    if (!token) throw new Error('SUREPASS_TOKEN is required for SurepassKycProvider');
    this.token = token;
    this.baseUrl = (baseUrl || 'https://sandbox.surepass.app/api/v1').replace(/\/+$/, '');
    this.logger = logger;
    this.providerName = 'surepass';
  }

  /**
   * Helper to perform HTTP request to Surepass
   */
  async _request(endpoint, body = null, method = 'POST', timeoutMs = 45000) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    this.logger?.info({ endpoint, url, method }, '[SurepassKycProvider] Sending API request');

    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://sandbox.surepass.app',
      'Referer': 'https://sandbox.surepass.app/',
    };

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    };

    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      this.logger?.error({ err: err.message, name: err.name, endpoint }, '[SurepassKycProvider] Network failure contacting Surepass');
      if (err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted')) {
        throw new ApiError(504, 'KYC_PROVIDER_TIMEOUT', `KYC provider request to ${endpoint} timed out after ${timeoutMs / 1000}s. Government traffic police databases can take 20-40 seconds. Please try again.`);
      }
      throw new ApiError(503, 'KYC_PROVIDER_UNAVAILABLE', `Unable to reach KYC provider network (${err.message}).`);
    }

    const rawText = await response.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      this.logger?.error({ endpoint, status: response.status, body: rawText.slice(0, 300) }, '[SurepassKycProvider] Non-JSON response');
      if (response.status === 403) {
        throw new ApiError(403, 'KYC_PROVIDER_FORBIDDEN', 'Surepass returned 403 Forbidden. This endpoint (Aadhaar/DigiLocker) is either not enabled for your sandbox token or requires IP whitelisting in your Surepass dashboard.');
      }
      if (response.status === 404) {
        throw new ApiError(404, 'KYC_PROVIDER_ENDPOINT_NOT_FOUND', `The endpoint ${endpoint} was not found on Surepass.`);
      }
      throw new ApiError(502, 'KYC_PROVIDER_ERROR', `Invalid non-JSON response from Surepass (HTTP ${response.status}).`);
    }

    if (!response.ok || json.success === false) {
      const message = json.message || json.error || 'KYC verification failed with provider.';
      this.logger?.warn({ endpoint, status: response.status, json }, '[SurepassKycProvider] Verification failed');
      return {
        success: false,
        statusCode: response.status,
        message,
        raw: json,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      raw: json,
    };
  }

  /**
   * Verify Driving License
   */
  async verifyDrivingLicense({ dlNumber, dob }) {
    const cleanDl = dlNumber.replaceAll(/[\s-]/g, '').toUpperCase();
    const result = await this._request('/driving-license/driving-license', {
      id_number: cleanDl,
      dob: dob, // Expected YYYY-MM-DD
    });

    if (!result.success) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          dlNumber: cleanDl,
          status: 'FAILED',
          message: result.message,
        },
        raw: result.raw,
      };
    }

    const d = result.raw.data || {};

    // Robust extraction of vehicle classes across different provider formats (cov_details vs vehicle_classes string array)
    const rawClasses = d.vehicle_classes || d.cov_details || d.class_of_vehicle || [];
    const descriptions = d.vehicle_class_description || [];
    const vehicleClasses = rawClasses.map((item, idx) => {
      if (typeof item === 'string') {
        return {
          class: item,
          description: descriptions[idx] || item,
          issueDate: d.doi || d.issue_date || null,
        };
      }
      return {
        class: item.cov || item.class || item.category,
        description: item.category || item.description || item.cov,
        issueDate: item.issue_date || d.doi,
      };
    });

    return {
      success: true,
      provider: this.providerName,
      data: {
        dlNumber: d.license_number || cleanDl,
        name: d.name,
        dob: d.dob,
        status: d.status || 'ACTIVE',
        validFrom: d.doi || d.valid_from,
        validTill: d.doe || d.valid_till || d.non_transport_to,
        issueDate: d.doi || d.issue_date,
        rtoName: d.ola_name || d.rto,
        fatherOrHusbandName: d.father_or_husband_name,
        address: d.permanent_address || d.temporary_address,
        vehicleClasses,
      },
      raw: result.raw,
    };
  }

  /**
   * Verify Bank Account (Penny Drop)
   */
  async verifyBankAccount({ accountNumber, ifsc }) {
    const cleanAcc = accountNumber.trim();
    const cleanIfsc = ifsc.replaceAll(/\s/g, '').toUpperCase();
    const result = await this._request('/bank-verification/', {
      id_number: cleanAcc,
      account_number: cleanAcc,
      ifsc: cleanIfsc,
    });

    if (!result.success) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          accountNumber: cleanAcc,
          ifsc: cleanIfsc,
          status: 'FAILED',
          message: result.message,
        },
        raw: result.raw,
      };
    }

    const d = result.raw.data || {};
    const ifscDetails = d.ifsc_details || {};
    return {
      success: true,
      provider: this.providerName,
      data: {
        accountNumber: cleanAcc,
        ifsc: cleanIfsc,
        accountExists: d.account_exists ?? true,
        beneficiaryName: d.full_name || d.beneficiary_name || d.name_at_bank || null,
        bankName: d.bank_name || ifscDetails.bank_name || null,
        branch: d.branch || ifscDetails.branch || null,
        city: d.city || ifscDetails.city || null,
        micr: d.micr || ifscDetails.micr || null,
        upiId: d.upi_id || null,
        utr: d.utr || null,
        pennyDropStatus: d.account_exists ? 'SUCCESS' : (d.status || 'FAILED'),
      },
      raw: result.raw,
    };
  }

  /**
   * Verify Vehicle RC (PUC, Fitness, Insurance)
   */
  async verifyRc({ vehicleNumber }) {
    const cleanRc = vehicleNumber.replaceAll(/[\s-]/g, '').toUpperCase();
    const result = await this._request('/rc/rc-v2', {
      id_number: cleanRc,
    });

    if (!result.success) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          vehicleNumber: cleanRc,
          status: 'FAILED',
          message: result.message,
        },
        raw: result.raw,
      };
    }

    const d = result.raw.data || {};
    return {
      success: true,
      provider: this.providerName,
      data: {
        vehicleNumber: d.rc_number || cleanRc,
        ownerName: d.owner_name,
        makerModel: d.maker_model || `${d.maker_description || ''} ${d.maker_model || ''}`.trim(),
        vehicleClass: d.vehicle_category_description || d.vehicle_category || d.vehicle_class,
        fuelType: d.fuel_type,
        engineNumber: d.vehicle_engine_number || d.engine_number,
        chassisNumber: d.vehicle_chasi_number || d.chassis_number,
        registrationDate: d.registration_date,
        rtoName: d.registered_at,
        status: d.rc_status || d.status || 'ACTIVE',
        fitness: {
          status: d.fit_up_to ? 'ACTIVE' : 'UNKNOWN',
          validTill: d.fit_up_to,
        },
        insurance: {
          status: (d.insurance_upto || d.insurance_up_to) ? 'ACTIVE' : 'UNKNOWN',
          company: d.insurance_company,
          policyNumber: d.insurance_policy_number,
          validTill: d.insurance_upto || d.insurance_up_to,
        },
        puc: {
          status: d.pucc_upto ? 'ACTIVE' : 'UNKNOWN',
          certificateNumber: d.pucc_number || null,
          validTill: d.pucc_upto,
        },
        nationalPermit: {
          status: d.permit_valid_upto ? 'ACTIVE' : 'UNKNOWN',
          permitNumber: d.permit_number || null,
          validTill: d.permit_valid_upto,
        },
      },
      raw: result.raw,
    };
  }

  /**
   * Initiate DigiLocker Aadhaar Verification Session (Web SDK flow)
   * Endpoint: POST /api/v1/digilocker/initialize
   */
  async initiateAadhaarDigilocker({ redirectUrl, logoUrl, signupFlow, skipMainScreen }) {
    const payload = {
      data: {
        signup_flow: signupFlow !== false,
        logo_url: logoUrl || 'https://surepass.io/assets/images/logo.png',
        redirect_url: redirectUrl || 'https://google.com',
        skip_main_screen: skipMainScreen === true,
      },
    };

    const result = await this._request('/digilocker/initialize', payload, 'POST');

    if (!result.success) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          message: result.message,
        },
        raw: result.raw,
      };
    }

    const d = result.raw.data || {};
    return {
      success: true,
      provider: this.providerName,
      data: {
        clientId: d.client_id,
        url: d.url,
        token: d.token,
        validityMinutes: 15,
      },
      raw: result.raw,
    };
  }

  /**
   * Download Aadhaar details from completed DigiLocker session
   * Endpoint: GET /api/v1/digilocker/download-aadhaar/<client_id>
   */
  async getAadhaarDetails({ clientId }) {
    const cleanClientId = encodeURIComponent(clientId.trim());
    const result = await this._request(`/digilocker/download-aadhaar/${cleanClientId}`, null, 'GET');

    if (!result.success) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          clientId,
          status: 'PENDING_OR_FAILED',
          message: result.message,
        },
        raw: result.raw,
      };
    }

    const d = result.raw.data || {};
    const meta = d.digilocker_metadata || {};
    const xml = d.aadhaar_xml_data || {};

    return {
      success: true,
      provider: this.providerName,
      data: {
        clientId: d.client_id || clientId,
        status: 'COMPLETED',
        name: xml.full_name || meta.name,
        dob: xml.dob || meta.dob,
        gender: meta.gender || xml.gender,
        mobileNumber: meta.mobile_number,
        careOf: xml.care_of,
        maskedAadhaar: xml.masked_aadhaar || meta.masked_aadhaar || null,
        address: {
          house: xml.house,
          street: xml.street,
          landmark: xml.landmark,
          locality: xml.locality,
          vtc: xml.vtc_name,
          dist: xml.district,
          state: xml.state,
          pincode: xml.zip || xml.pincode,
          country: xml.country || 'India',
        },
        profilePhotoBase64: xml.profile_image || null,
        digilockerVerified: true,
      },
      raw: result.raw,
    };
  }

  /**
   * Verify Vehicle E-Challan Details
   * Endpoint: POST /api/v1/rc/rc-related/challan-details
   */
  async verifyChallan({ rcNumber, chassisNumber, engineNumber, stateOnly = false, statePortals }) {
    const cleanRc = rcNumber.replaceAll(/[\s-]/g, '').toUpperCase();
    const cleanChassis = (chassisNumber && chassisNumber !== 'string') ? chassisNumber.trim() : '';
    const cleanEngine = (engineNumber && engineNumber !== 'string') ? engineNumber.trim() : '';
    const portals = (statePortals && statePortals.length)
      ? statePortals.filter(p => p !== 'DL_ALL')
      : ['DL', 'TS', 'GJ'];

    const payload = {
      rc_number: cleanRc,
      chassis_number: cleanChassis,
      engine_number: cleanEngine,
      state_only: stateOnly === true,
      state_portal: portals,
    };

    // KA portal takes ~30s on sandbox, so grant 60s timeout if KA is requested
    const timeoutMs = portals.includes('KA') ? 60000 : 35000;
    const result = await this._request('/rc/rc-related/challan-details', payload, 'POST', timeoutMs);

    if (!result.success) {
      return {
        success: false,
        provider: this.providerName,
        data: {
          rcNumber: cleanRc,
          status: 'FAILED',
          message: result.message,
        },
        raw: result.raw,
      };
    }

    const d = result.raw.data || {};
    const challanDetails = d.challan_details || {};
    const rawChallans = Array.isArray(challanDetails.challans)
      ? challanDetails.challans
      : (Array.isArray(d.challans) ? d.challans : []);

    const challans = rawChallans.map((c, idx) => ({
      number: c.number ?? idx + 1,
      challanNumber: c.challan_number || c.challanNumber || null,
      offenseDetails: c.offense_details || c.offenseDetails || c.offense || null,
      challanPlace: c.challan_place || c.challanPlace || null,
      challanDate: c.challan_date || c.challanDate || null,
      state: c.state || null,
      amount: Number(c.amount ?? c.challan_amount ?? 0),
      status: (c.status || c.challan_status || 'UNKNOWN').toUpperCase(),
      paymentDate: c.payment_date || c.paymentDate || null,
      transactionId: c.transaction_id || c.transactionId || null,
    }));

    const totalChallans = challans.length;
    const pendingChallans = challans.filter(c => c.status === 'PENDING' || c.status === 'UNPAID');
    const pendingChallansCount = pendingChallans.length;
    const totalPendingAmount = pendingChallans.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const hasPendingChallans = pendingChallansCount > 0;

    return {
      success: true,
      provider: this.providerName,
      data: {
        rcNumber: cleanRc,
        clientId: d.client_id || null,
        totalChallans,
        pendingChallansCount,
        totalPendingAmount,
        hasPendingChallans,
        checkedPortals: portals,
        challans,
      },
      raw: result.raw,
    };
  }
}

