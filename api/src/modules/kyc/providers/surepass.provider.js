import { KycProviderInterface } from './kyc-provider.interface.js';
import { ApiError } from '../../../errors.js';
import { validateDlDocumentImage, validateRcDocumentImage } from '../ocr/local-ocr.js';

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
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        options.body = body;
        // Do not set Content-Type header so fetch creates multipart/form-data with boundary
      } else {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
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
        gender: d.gender || null,
        bloodGroup: d.blood_group || null,
        fatherOrHusbandName: d.father_or_husband_name || null,
        permanentAddress: d.permanent_address || d.address || null,
        temporaryAddress: d.temporary_address || null,
        address: d.permanent_address || d.temporary_address || null,
        validFrom: d.doi || d.valid_from || null,
        validTill: d.doe || d.valid_till || d.non_transport_to || null,
        issueDate: d.doi || d.issue_date || null,
        transportValidFrom: d.transport_from || d.transport_valid_from || null,
        transportValidTill: d.transport_to || d.transport_valid_till || null,
        rtoName: d.ola_name || d.rto || null,
        rtoCode: d.ola_code || d.rto_code || null,
        state: d.state || null,
        vehicleClasses,
        badgeNumber: d.badge_number || null,
        badgeIssueDate: d.badge_issue_date || null,
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
        fatherName: d.father_name || null,
        presentAddress: d.present_address || null,
        permanentAddress: d.permanent_address || null,
        mobileNumber: d.mobile_number || null,
        makerDescription: d.maker_description || null,
        makerModel: d.maker_model || `${d.maker_description || ''} ${d.maker_model || ''}`.trim(),
        vehicleClass: d.vehicle_category_description || d.vehicle_category || d.vehicle_class,
        bodyType: d.body_type || null,
        fuelType: d.fuel_type,
        color: d.color || null,
        normsType: d.norms_type || null,
        engineNumber: d.vehicle_engine_number || d.engine_number,
        chassisNumber: d.vehicle_chasi_number || d.chassis_number,
        cubicCapacity: Number(d.cubic_capacity) || null,
        noCylinders: Number(d.no_cylinders) || null,
        unladenWeight: Number(d.unladen_weight) || null,
        vehicleGrossWeight: Number(d.vehicle_gross_weight) || null,
        wheelbase: Number(d.wheelbase) || null,
        manufacturingDate: d.manufacturing_date_formatted || d.manufacturing_date || null,
        financer: d.financer || (d.financed ? 'FINANCED' : null),
        taxUpto: d.tax_upto || d.tax_paid_upto || null,
        registrationDate: d.registration_date,
        rtoName: d.registered_at,
        status: d.rc_status || d.status || 'ACTIVE',
        fitness: {
          status: (d.fit_up_to || d.fitness_upto || d.rc_expiry_date || d.regn_upto) ? 'ACTIVE' : 'UNKNOWN',
          validTill: d.fit_up_to || d.fitness_upto || d.rc_expiry_date || d.regn_upto || null,
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
          status: (d.national_permit_upto || d.permit_valid_upto) ? 'ACTIVE' : 'UNKNOWN',
          permitNumber: d.national_permit_number || d.permit_number || null,
          validTill: d.national_permit_upto || d.permit_valid_upto || null,
          type: d.permit_type || null,
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
    // UIDAI & Surepass security policy requires HTTPS redirect URL; plain HTTP or localhost triggers 403 Forbidden
    let sanitizedRedirect = redirectUrl;
    if (!sanitizedRedirect || !sanitizedRedirect.startsWith('https://')) {
      sanitizedRedirect = process.env.KYC_AADHAAR_CALLBACK_URL || 'https://surepass.io';
    }

    const payload = {
      data: {
        signup_flow: signupFlow !== false,
        logo_url: logoUrl || 'https://surepass.io/assets/images/logo.png',
        redirect_url: sanitizedRedirect,
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
    const homeState = cleanRc.slice(0, 2);

    // Only send chassis and engine if genuine alphanumeric (no asterisks/masks)
    const isValidAlphanumeric = (val) => val && typeof val === 'string' && /^[A-Z0-9]{5,}$/i.test(val.trim()) && !val.includes('*');
    const cleanChassis = isValidAlphanumeric(chassisNumber) ? String(chassisNumber).trim().toUpperCase() : undefined;
    const cleanEngine = isValidAlphanumeric(engineNumber) ? String(engineNumber).trim().toUpperCase() : undefined;

    // Supported state portals in Surepass E-Challan API
    const ALL_SUPPORTED_CHALLAN_PORTALS = [
      'ALL', 'TS', 'AP', 'DL', 'GJ', 'MH', 'KA', 'TN', 'KL',
      'UP', 'RJ', 'HR', 'MP', 'WB', 'PB', 'OD', 'CH',
      'HP', 'JH', 'BR', 'CG', 'GA', 'AS',
    ];

    // Determine state portal query:
    // Prioritize the vehicle's home state portal (e.g. TS) along with ALL so state traffic police backends are reliably queried
    let portals = ALL_SUPPORTED_CHALLAN_PORTALS.includes(homeState) ? [homeState, 'ALL'] : ['ALL'];
    if (statePortals && Array.isArray(statePortals) && statePortals.length > 0) {
      const sanitized = statePortals.map(p => String(p).trim().toUpperCase());
      if (sanitized.includes('ALL')) {
        portals = ALL_SUPPORTED_CHALLAN_PORTALS.includes(homeState) ? [homeState, 'ALL'] : ['ALL'];
      } else {
        const filtered = sanitized.filter(p => ALL_SUPPORTED_CHALLAN_PORTALS.includes(p));
        if (filtered.length > 0) {
          portals = filtered;
        }
      }
    }

    const payload = {
      rc_number: cleanRc,
      state_only: stateOnly === true,
      state_portal: portals,
    };
    if (cleanChassis) payload.chassis_number = cleanChassis;
    if (cleanEngine) payload.engine_number = cleanEngine;

    // Grant 60s timeout for multi-portal scans
    const timeoutMs = 60000;
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
    const failedBackends = Array.isArray(challanDetails.failed_backends)
      ? challanDetails.failed_backends
      : (Array.isArray(d.failed_backends) ? d.failed_backends : []);
    const successfulBackends = Array.isArray(challanDetails.successful_backends)
      ? challanDetails.successful_backends
      : (Array.isArray(d.successful_backends) ? d.successful_backends : []);

    const isChallanUnpaid = (status) => {
      if (!status) return true;
      const s = String(status).toUpperCase().replace(/[\s_-]+/g, '');
      return s !== 'PAID' && s !== 'DISPOSED' && s !== 'SETTLED' && s !== 'CLEARED' && s !== 'CLOSED';
    };

    const challans = rawChallans.map((c, idx) => {
      const rawStatus = (c.status || c.challan_status || 'UNKNOWN').toUpperCase().trim();
      const isPending = isChallanUnpaid(rawStatus);
      return {
        number: c.number ?? idx + 1,
        challanNumber: c.challan_number || c.challanNumber || null,
        offenseDetails: c.offense_details || c.offenseDetails || c.offense || null,
        challanPlace: c.challan_place || c.challanPlace || null,
        challanDate: c.challan_date || c.challanDate || null,
        state: c.state || null,
        amount: Number(c.amount ?? c.challan_amount ?? 0),
        status: isPending ? 'UNPAID' : 'PAID',
        rawStatus,
        paymentDate: c.payment_date || c.paymentDate || null,
        transactionId: c.transaction_id || c.transactionId || null,
      };
    });

    const totalChallans = challans.length;
    const pendingChallans = challans.filter(c => isChallanUnpaid(c.status) || isChallanUnpaid(c.rawStatus));
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
        failedBackends,
        successfulBackends,
        homeState,
        challans,
      },
      raw: result.raw,
    };
  }

  /**
   * Helper to normalize Base64 strings for Surepass API
   * Mobile cameras and file pickers often format captured images as Data URIs:
   * e.g. data:image/jpeg;base64,/9j/4AAQSkZJRg... or data:application/pdf;base64,...
   * Surepass expects the raw base64 string, so this strips out everything before the comma.
   */
  _cleanBase64(fileBase64) {
    if (!fileBase64 || typeof fileBase64 !== 'string') return '';
    const commaIdx = fileBase64.indexOf(',');
    if (commaIdx !== -1 && commaIdx < 120 && fileBase64.slice(0, commaIdx).includes('base64')) {
      return fileBase64.slice(commaIdx + 1).trim();
    }
    return fileBase64.trim();
  }

  /**
   * Extract data from Vehicle RC document using AI OCR
   * Endpoint: POST https://sandbox.surepass.app/api/v1/ocr/vehicle-rc
   */
  async ocrVehicleRc({ fileBase64, mimeType, fileUrl }) {
    // 1. Document Pre-Validation Guard (₹0 cost):
    // Validates whether uploaded image is an actual Vehicle RC before invoking Surepass API.
    // If the image is a wall, selfie, or non-document, rejects early to prevent wasting Surepass credits.
    if (fileBase64) {
      try {
        const cleanFront = this._cleanBase64(fileBase64);
        if (cleanFront) {
          const frontBuf = Buffer.from(cleanFront, 'base64');
          const validation = await validateRcDocumentImage(frontBuf);
          if (validation && validation.isDocument === false) {
            this.logger?.warn({ reason: validation.message }, '[SurepassKycProvider] Non-document image rejected by pre-validation guard');
            return {
              success: false,
              provider: this.providerName,
              data: {
                status: 'INVALID_DOCUMENT',
                message: validation.message || 'Invalid Document Image: The uploaded photo does not appear to be a valid physical Vehicle Registration Certificate (RC). Please upload a clear photo of your RC card.',
              },
              raw: { status_code: 422, error: 'INVALID_DOCUMENT', message: validation.message },
            };
          }
        }
      } catch (valErr) {
        this.logger?.warn({ err: valErr.message }, '[SurepassKycProvider] Pre-validation check encountered error, passing to Surepass');
      }
    }

    const payload = {};
    if (fileUrl) {
      payload.link = fileUrl;
    } else {
      payload.base64 = this._cleanBase64(fileBase64);
    }

    // Surepass OCR takes 5-15 seconds for image analysis
    const result = await this._request('/ocr/vehicle-rc', payload, 'POST', 25000);

    if (!result.success) {
      this.logger?.warn({ endpoint: '/ocr/vehicle-rc', status: result.statusCode, message: result.message }, '[SurepassKycProvider] Live RC OCR returned error');
      return {
        success: false,
        provider: this.providerName,
        data: {
          status: 'INVALID_DOCUMENT',
          message: result.message || 'Invalid Document Image: The uploaded photo does not appear to be a valid physical Vehicle Registration Certificate (RC). Please upload a clear, legible photo of your physical card.',
        },
        raw: result.raw,
      };
    }

    const d = result.raw.data || {};
    // Extract and normalize registration number
    const rawRc = d.rc_number || d.registration_number || d.reg_no || '';
    const cleanVehicleNumber = rawRc.replaceAll(/[\s-]/g, '').toUpperCase();
    const cleanEngineNumber = (d.engine_number || d.vehicle_engine_number || '').replaceAll(/[\s-]/g, '').toUpperCase();
    const cleanChassisNumber = (d.chassis_number || d.vehicle_chasi_number || '').replaceAll(/[\s-]/g, '').toUpperCase();

    return {
      success: true,
      provider: this.providerName,
      data: {
        vehicleNumber: cleanVehicleNumber || null,
        engineNumber: cleanEngineNumber || null,
        chassisNumber: cleanChassisNumber || null,
        ownerName: d.owner_name || d.name || null,
        makerModel: d.maker_model || d.model || null,
        registrationDate: d.registration_date || null,
        ocrConfidence: d.confidence || d.score || 0.95,
      },
      raw: result.raw,
    };
  }

  /**
   * Extract data from Driving License document using AI OCR
   * Endpoint: POST https://sandbox.surepass.app/api/v1/ocr/license (Accepts multipart/form-data with 'front' and optional 'back')
   */
  async ocrDrivingLicense({ fileBase64, mimeType, fileUrl, backFileBase64 }) {
    // 1. Document Pre-Validation Guard (₹0 cost):
    // Validates whether uploaded image is an actual Driving License before invoking Surepass API.
    // If the image is a wall, selfie, or non-document, rejects early to prevent wasting Surepass credits.
    if (fileBase64) {
      try {
        const cleanFront = this._cleanBase64(fileBase64);
        if (cleanFront) {
          const frontBuf = Buffer.from(cleanFront, 'base64');
          const validation = await validateDlDocumentImage(frontBuf);
          if (validation && validation.isDocument === false) {
            this.logger?.warn({ reason: validation.message }, '[SurepassKycProvider] Non-document image rejected by pre-validation guard');
            return {
              success: false,
              provider: this.providerName,
              data: {
                status: 'INVALID_DOCUMENT',
                message: validation.message || 'Invalid Document Image: The uploaded photo does not appear to be a valid physical Driving License. Please upload a clear photo of your Driving License.',
              },
              raw: { status_code: 422, error: 'INVALID_DOCUMENT', message: validation.message },
            };
          }
        }
      } catch (valErr) {
        this.logger?.warn({ err: valErr.message }, '[SurepassKycProvider] Pre-validation check encountered error, passing to Surepass');
      }
    }

    let body;
    if (fileUrl) {
      body = { link: fileUrl };
    } else {
      const cleanFront = this._cleanBase64(fileBase64);
      if (!cleanFront) {
        return {
          success: false,
          provider: this.providerName,
          data: {
            status: 'FAILED',
            message: 'No front image provided for Driving License OCR.',
          },
        };
      }

      const fd = new FormData();
      const frontBuf = Buffer.from(cleanFront, 'base64');
      const frontBlob = new Blob([frontBuf], { type: mimeType || 'image/jpeg' });
      fd.append('front', frontBlob, 'dl_front.jpg');

      if (backFileBase64) {
        const cleanBack = this._cleanBase64(backFileBase64);
        if (cleanBack) {
          const backBuf = Buffer.from(cleanBack, 'base64');
          const backBlob = new Blob([backBuf], { type: mimeType || 'image/jpeg' });
          fd.append('back', backBlob, 'dl_back.jpg');
        }
      }
      body = fd;
    }

    const result = await this._request('/ocr/license', body, 'POST', 30000);

    if (!result.success) {
      this.logger?.warn({ endpoint: '/ocr/license', status: result.statusCode, message: result.message }, '[SurepassKycProvider] Live DL OCR returned error');
      return {
        success: false,
        provider: this.providerName,
        data: {
          status: 'INVALID_DOCUMENT',
          message: result.message || 'Invalid Document Image: The uploaded photo does not appear to be a valid physical Driving License. Please ensure your physical card is clearly visible, well-lit, and not a random photo.',
        },
        raw: result.raw,
      };
    }

    const d = result.raw?.data || {};

    const extractVal = (field) => {
      if (!field) return null;
      if (typeof field === 'string') return field.trim();
      if (typeof field === 'object' && field.value) return String(field.value).trim();
      return null;
    };

    const rawDl = extractVal(d.license_number) || extractVal(d.dl_number) || extractVal(d.id_number) || '';
    const cleanDlNumber = rawDl.replaceAll(/[\s-]/g, '').toUpperCase();

    // Standardize DOB format to YYYY-MM-DD
    let cleanDob = extractVal(d.dob) || extractVal(d.date_of_birth) || null;
    if (cleanDob && typeof cleanDob === 'string') {
      const parts = cleanDob.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          cleanDob = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else if (parts[0].length === 4) {
          cleanDob = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
      }
    }

    const name = extractVal(d.name) || extractVal(d.full_name) || null;
    const fatherName = extractVal(d.father_or_husband_name) || extractVal(d.father_name) || null;
    const address = extractVal(d.address) || null;

    const hasAnyField = Boolean(cleanDlNumber || cleanDob || name);

    return {
      success: hasAnyField,
      provider: this.providerName,
      data: {
        dlNumber: cleanDlNumber || null,
        dob: cleanDob || null,
        name,
        fatherOrHusbandName: fatherName,
        address,
        ocrConfidence: d.license_number?.confidence || d.confidence || 0.95,
      },
      raw: result.raw,
    };
  }
}

