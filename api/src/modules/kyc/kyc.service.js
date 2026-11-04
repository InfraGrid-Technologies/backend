import { ApiError } from '../../errors.js';
import {
  evaluateVehicleCompliance,
  evaluateDriverLicenseCompliance,
  evaluateChallanCompliance,
  evaluateAadhaarCompliance,
} from './kyc.compliance.js';

/**
 * Fuzzy Name Matching Helper
 * Compares two names (e.g. Aadhaar name vs Bank Beneficiary name)
 * Returns { isMatch: boolean, score: number } (0-100%)
 */
export function computeNameMatch(name1, name2) {
  if (!name1 || !name2) return { isMatch: false, score: 0 };
  const clean1 = name1.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const clean2 = name2.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (clean1 === clean2) return { isMatch: true, score: 100 };

  const words1 = clean1.split(/\s+/).filter(Boolean);
  const words2 = clean2.split(/\s+/).filter(Boolean);

  let matchCount = 0;
  for (const w1 of words1) {
    if (words2.some(w2 => w2 === w1 || (w1.length > 2 && w2.startsWith(w1)) || (w2.length > 2 && w1.startsWith(w2)))) {
      matchCount++;
    }
  }

  const score = Math.round((matchCount / Math.max(words1.length, words2.length)) * 100);
  return {
    isMatch: score >= 60,
    score,
  };
}

/**
 * KYC Service
 * Coordinates business rules, caching, provider calls, and audit logging.
 */
export function createKycService(provider, repo, logger) {
  const isPaidProvider = provider.providerName !== 'mock';
  const ESTIMATED_CALL_COST = isPaidProvider ? 15.00 : 0.00;

  return {
    /**
     * 1. Verify Driving License (with 30-day cache check)
     */
    async verifyDrivingLicense({ dlNumber, dob, forceRefresh = false }, actorId) {
      const cleanDl = dlNumber.replaceAll(/[\s-]/g, '').toUpperCase();

      // Check cache first unless forceRefresh is true
      if (!forceRefresh) {
        const cached = await repo.findRecentVerification('driving_license', cleanDl);
        if (cached) {
          let responseData = cached.response_data || {};

          // Self-heal: If cached response has empty vehicleClasses but raw response had them, repair at ₹0 cost!
          if ((!responseData.vehicleClasses || responseData.vehicleClasses.length === 0) && cached.raw_provider_response) {
            const rawData = cached.raw_provider_response.data || {};
            const rawClasses = rawData.vehicle_classes || rawData.cov_details || rawData.class_of_vehicle || [];
            if (rawClasses.length > 0) {
              const descriptions = rawData.vehicle_class_description || [];
              responseData.vehicleClasses = rawClasses.map((item, idx) => {
                if (typeof item === 'string') {
                  return { class: item, description: descriptions[idx] || item, issueDate: rawData.doi || rawData.issue_date || null };
                }
                return { class: item.cov || item.class || item.category, description: item.category || item.description || item.cov, issueDate: item.issue_date || rawData.doi };
              });
            }
          }

          // Dynamically evaluate compliance against current date
          responseData.compliance = evaluateDriverLicenseCompliance(responseData);

          logger?.info({ dlNumber: cleanDl }, '[KycService] Returning Driving License from CACHE (₹0 cost)');
          return {
            success: true,
            source: 'CACHE',
            provider: cached.provider,
            data: responseData,
          };
        }
      }

      // Call external provider
      logger?.info({ dlNumber: cleanDl, provider: provider.providerName }, '[KycService] Calling KYC provider for DL');
      const result = await provider.verifyDrivingLicense({ dlNumber: cleanDl, dob });

      // Evaluate compliance rules (RTO authenticity + heavy equipment authorization)
      if (result.success && result.data) {
        result.data.compliance = evaluateDriverLicenseCompliance(result.data);
      }

      // Audit log
      await repo.logApiCall({
        provider: provider.providerName,
        endpoint: '/driving-license',
        httpStatus: result.success ? 200 : 422,
        costEstimate: ESTIMATED_CALL_COST,
        requestPayload: { dlNumber: cleanDl, dob },
        responsePayload: result.raw,
      });

      // Save verification
      await repo.saveVerification({
        verificationType: 'driving_license',
        idNumber: cleanDl,
        status: result.success ? 'verified' : 'failed',
        provider: provider.providerName,
        responseData: result.data,
        rawResponse: result.raw,
        actorId,
      });

      if (!result.success) {
        throw new ApiError(422, 'DL_VERIFICATION_FAILED', result.data?.message || 'Driving license verification failed.', result.data);
      }

      return {
        success: true,
        source: 'PROVIDER',
        provider: result.provider,
        data: result.data,
      };
    },

    /**
     * 2. Verify Bank Account (Penny Drop with cache check)
     */
    async verifyBankAccount({ accountNumber, ifsc, nameToMatch, forceRefresh = false }, actorId) {
      const cleanAcc = accountNumber.trim();
      const cleanIfsc = ifsc.replaceAll(/\s/g, '').toUpperCase();
      const cacheKey = `${cleanAcc}_${cleanIfsc}`;

      // Check cache first unless forceRefresh is true
      if (!forceRefresh) {
        const cached = await repo.findRecentVerification('bank_account', cacheKey);
        if (cached) {
          logger?.info({ cacheKey }, '[KycService] Returning Bank Account from CACHE (₹0 cost)');
          const data = { ...cached.response_data };
          if (nameToMatch && data.beneficiaryName) {
            data.nameMatch = computeNameMatch(nameToMatch, data.beneficiaryName);
          }
          return {
            success: true,
            source: 'CACHE',
            provider: cached.provider,
            data,
          };
        }
      }

      logger?.info({ cacheKey, provider: provider.providerName }, '[KycService] Calling KYC provider for Bank Verification');
      const result = await provider.verifyBankAccount({ accountNumber: cleanAcc, ifsc: cleanIfsc });

      await repo.logApiCall({
        provider: provider.providerName,
        endpoint: '/bank-verification',
        httpStatus: result.success ? 200 : 422,
        costEstimate: ESTIMATED_CALL_COST,
        requestPayload: { accountNumber: cleanAcc, ifsc: cleanIfsc },
        responsePayload: result.raw,
      });

      await repo.saveVerification({
        verificationType: 'bank_account',
        idNumber: cacheKey,
        status: result.success ? 'verified' : 'failed',
        provider: provider.providerName,
        responseData: result.data,
        rawResponse: result.raw,
        actorId,
      });

      if (!result.success) {
        throw new ApiError(422, 'BANK_VERIFICATION_FAILED', result.data?.message || 'Bank account verification failed.', result.data);
      }

      const responseData = { ...result.data };
      if (nameToMatch && responseData.beneficiaryName) {
        responseData.nameMatch = computeNameMatch(nameToMatch, responseData.beneficiaryName);
      }

      return {
        success: true,
        source: 'PROVIDER',
        provider: result.provider,
        data: responseData,
      };
    },

    /**
     * 3. Verify Vehicle RC (PUC, Fitness, Insurance with cache check)
     */
    async verifyRc({ vehicleNumber, forceRefresh = false }, actorId) {
      const cleanRc = vehicleNumber.replaceAll(/[\s-]/g, '').toUpperCase();

      // Check cache first unless forceRefresh is true
      if (!forceRefresh) {
        const cached = await repo.findRecentVerification('rc', cleanRc);
        if (cached) {
          const responseData = { ...cached.response_data };
          // Dynamically evaluate compliance against current date
          responseData.compliance = evaluateVehicleCompliance(responseData);

          logger?.info({ vehicleNumber: cleanRc }, '[KycService] Returning Vehicle RC from CACHE (₹0 cost)');
          return {
            success: true,
            source: 'CACHE',
            provider: cached.provider,
            data: responseData,
          };
        }
      }

      logger?.info({ vehicleNumber: cleanRc, provider: provider.providerName }, '[KycService] Calling KYC provider for RC');
      const result = await provider.verifyRc({ vehicleNumber: cleanRc });

      // Evaluate compliance rules (Active registration + Fitness + PUC + Insurance)
      if (result.success && result.data) {
        result.data.compliance = evaluateVehicleCompliance(result.data);
      }

      await repo.logApiCall({
        provider: provider.providerName,
        endpoint: '/rc-full',
        httpStatus: result.success ? 200 : 422,
        costEstimate: ESTIMATED_CALL_COST,
        requestPayload: { vehicleNumber: cleanRc },
        responsePayload: result.raw,
      });

      await repo.saveVerification({
        verificationType: 'rc',
        idNumber: cleanRc,
        status: result.success ? 'verified' : 'failed',
        provider: provider.providerName,
        responseData: result.data,
        rawResponse: result.raw,
        actorId,
      });

      if (!result.success) {
        throw new ApiError(422, 'RC_VERIFICATION_FAILED', result.data?.message || 'Vehicle RC verification failed.', result.data);
      }

      return {
        success: true,
        source: 'PROVIDER',
        provider: result.provider,
        data: result.data,
      };
    },

    /**
     * 4. Initiate DigiLocker Aadhaar Verification session
     */
    async initiateAadhaar({ redirectUrl, logoUrl, signupFlow, skipMainScreen }, actorId) {
      const result = await provider.initiateAadhaarDigilocker({
        redirectUrl: redirectUrl || 'https://google.com',
        logoUrl: logoUrl || 'https://surepass.io/assets/images/logo.png',
        signupFlow: signupFlow !== false,
        skipMainScreen: skipMainScreen === true,
      });

      await repo.logApiCall({
        provider: provider.providerName,
        endpoint: '/digilocker/initialize',
        httpStatus: result.success ? 200 : 422,
        costEstimate: ESTIMATED_CALL_COST,
        requestPayload: { redirectUrl, logoUrl, signupFlow, skipMainScreen },
        responsePayload: result.raw,
      });

      if (!result.success) {
        throw new ApiError(422, 'DIGILOCKER_INIT_FAILED', result.data?.message || 'Failed to initialize DigiLocker session.');
      }

      // Save pending session
      if (result.data?.clientId) {
        await repo.saveVerification({
          verificationType: 'aadhaar',
          idNumber: result.data.clientId,
          status: 'pending',
          provider: provider.providerName,
          responseData: result.data,
          rawResponse: result.raw,
          actorId,
        });
      }

      return {
        success: true,
        provider: result.provider,
        data: result.data,
      };
    },

    /**
     * 5. Get DigiLocker Aadhaar Verification Results
     */
    async getAadhaarDetails(clientId, actorId) {
      // Check if already completed and cached
      const cached = await repo.findRecentVerification('aadhaar', clientId);
      if (cached && cached.status === 'verified') {
        const responseData = { ...cached.response_data };
        responseData.compliance = evaluateAadhaarCompliance(responseData);
        return {
          success: true,
          source: 'CACHE',
          provider: cached.provider,
          data: responseData,
        };
      }

      const result = await provider.getAadhaarDetails({ clientId });

      // Evaluate Aadhaar compliance & verified badge
      if (result.success && result.data) {
        result.data.compliance = evaluateAadhaarCompliance(result.data);
      }

      await repo.logApiCall({
        provider: provider.providerName,
        endpoint: '/digilocker/get-aadhaar-data',
        httpStatus: result.success ? 200 : 422,
        costEstimate: 0.00, // fetching completed session usually doesn't cost extra
        requestPayload: { clientId },
        responsePayload: result.raw,
      });

      if (result.success && result.data?.status === 'COMPLETED') {
        await repo.saveVerification({
          verificationType: 'aadhaar',
          idNumber: clientId,
          status: 'verified',
          provider: provider.providerName,
          responseData: result.data,
          rawResponse: result.raw,
          actorId,
        });
      }

      return {
        success: result.success,
        source: 'PROVIDER',
        provider: result.provider,
        data: result.data,
      };
    },

    /**
     * 6. Verify Vehicle E-Challans across national and state portals (with 30-day cache check)
     */
    async verifyChallan({ rcNumber, chassisNumber, engineNumber, stateOnly = false, statePortals, forceRefresh = false }, actorId) {
      const cleanRc = rcNumber.replaceAll(/[\s-]/g, '').toUpperCase();

      // 1. Sanitize chassis & engine (ignore Swagger's dummy "string" placeholder)
      let cleanChassis = (chassisNumber && chassisNumber !== 'string') ? chassisNumber.trim() : null;
      let cleanEngine = (engineNumber && engineNumber !== 'string') ? engineNumber.trim() : null;

      // 2. If chassis/engine are missing, auto-fill from cached RC verification!
      if (!cleanChassis || !cleanEngine) {
        const cachedRc = await repo.findRecentVerification('rc', cleanRc);
        if (cachedRc && cachedRc.response_data) {
          cleanChassis = cleanChassis || cachedRc.response_data.chassisNumber || null;
          cleanEngine = cleanEngine || cachedRc.response_data.engineNumber || null;
          if (cleanChassis && cleanEngine) {
            logger?.info({ rcNumber: cleanRc, cleanChassis, cleanEngine }, '[KycService] Auto-filled chassis and engine from cached RC record');
          }
        }
      }

      const portals = (statePortals && statePortals.length)
        ? statePortals.filter(p => p !== 'DL_ALL')
        : ['DL', 'TS', 'GJ'];

      // Check cache first unless forceRefresh is true
      if (!forceRefresh) {
        const cached = await repo.findRecentVerification('challan', cleanRc);
        if (cached) {
          const responseData = { ...cached.response_data };
          responseData.compliance = evaluateChallanCompliance(responseData);
          logger?.info({ rcNumber: cleanRc }, '[KycService] Returning E-Challan from CACHE (₹0 cost)');
          return {
            success: true,
            source: 'CACHE',
            provider: cached.provider,
            data: responseData,
          };
        }
      }

      logger?.info({ rcNumber: cleanRc, provider: provider.providerName }, '[KycService] Calling KYC provider for E-Challan');
      const result = await provider.verifyChallan({
        rcNumber: cleanRc,
        chassisNumber: cleanChassis || '',
        engineNumber: cleanEngine || '',
        stateOnly,
        statePortals: portals,
      });

      // Evaluate Challan compliance (Clean vehicle vs unpaid fines)
      if (result.success && result.data) {
        result.data.compliance = evaluateChallanCompliance(result.data);
      }

      await repo.logApiCall({
        provider: provider.providerName,
        endpoint: '/rc/rc-related/challan-details',
        httpStatus: result.success ? 200 : 422,
        costEstimate: ESTIMATED_CALL_COST,
        requestPayload: { rcNumber: cleanRc, chassisNumber, engineNumber, stateOnly, statePortals: portals },
        responsePayload: result.raw,
      });

      await repo.saveVerification({
        verificationType: 'challan',
        idNumber: cleanRc,
        status: result.success ? 'verified' : 'failed',
        provider: provider.providerName,
        responseData: result.data,
        rawResponse: result.raw,
        actorId,
      });

      if (!result.success) {
        throw new ApiError(422, 'CHALLAN_VERIFICATION_FAILED', result.data?.message || 'E-Challan verification failed.', result.data);
      }

      return {
        success: true,
        source: 'PROVIDER',
        provider: result.provider,
        data: result.data,
      };
    },

    /**
     * 7. History lookup
     */
    async getHistory(type, idNumber) {
      return await repo.getHistory(type, idNumber);
    },

    /**
     * 8. Clear Cache (₹0 cost)
     */
    async clearCache(type, idNumber) {
      await repo.clearCache(type, idNumber);
      return {
        success: true,
        message: idNumber ? `Cache cleared for ${type} ${idNumber}` : 'All KYC cache cleared successfully',
      };
    },
  };
}

