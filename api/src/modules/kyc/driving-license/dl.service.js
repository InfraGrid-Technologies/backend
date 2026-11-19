import { ApiError } from "../../../errors.js";
import { evaluateDriverLicenseCompliance } from "./dl.compliance.js";

/**
 * Driving License Verification Service (Surepass Integration)
 * Orchestrates: DPDP Consent -> Surepass API -> Compliance Rules -> PostgreSQL Storage
 */

export function createdrivingLicenseService({ provider, repo, logger }) {
  const ESTIMATED_CALL_COST = 15.0;

  // In-memory cache for COV codes from PostgreSQL (refreshes every 5 minutes)
  let cachedAllowedCodes = null;
  let cacheExpiresAt = 0;

  async function getAllowedCovCodes() {
    const now = Date.now();
    // 1. If we already fetched codes and 5 minutes haven't passed, return memory cache immediately
    if (cachedAllowedCodes && now < cacheExpiresAt) {
      return cachedAllowedCodes;
    }
    // 2. Otherwise, fetch fresh codes from PostgreSQL kyc.cov_categories
    const codesFromDb = (repo && typeof repo.getHeavyEquipmentCovCodes === 'function')
      ? await repo.getHeavyEquipmentCovCodes()
      : [];
    if (codesFromDb && codesFromDb.length > 0) {
      cachedAllowedCodes = new Set(codesFromDb);
      cacheExpiresAt = now + 5 * 60 * 1000; // Cache valid for next 5 minutes
    }
    return cachedAllowedCodes;
  }

  // why i added a 5 min cache here:
  /**
   * because consider a case where many divers are submitting thier DL for verification , without cache on every submission program runs the SQL cmd
   * select * from table name etc
   * so that on adding cache we can avoid latency.
   */
  

  return {
    async verify(
      { dlNumber, dob, frontDocument = null, backDocument = null, consent, forceRefresh = false, providerOverride },
      actorId = null,
      clientMeta = {},
    ) {
      // STEP 1 VALIDATE EXPLICIT DPDP USER CONSENT
      if (!consent || consent.agreed != true) {
        throw new ApiError(
          422,
          "CONSENT_REQUIRED",
          "Explicit user consent is mandatory under DPDP Act 2023 to verify driving license.",
        );
      }

      // STEP 2 Record immutable user consent artifact in postgresql
      const consentRecord = await repo.recordConsent({
        actorId,
        consentType: "driving_license",
        purpose: "OPERATOR_EQUIPMENT_ELIGIBILITY",
        noticeVersion: consent.noticeVersion,
        noticeText: consent.noticeText,
        ipAddress: clientMeta.ip || "0.0.0.0",
        userAgent: clientMeta.userAgent || null,
      });
      const consentId = consentRecord.id;

      // clean license string (remove spacing and hyphens)
      const cleanDl = dlNumber.replace(/[\s-]/g, "").toUpperCase();

      // Check cache if repo supports finding recent verification (skipped if forceRefresh is true)
      // Guard against corrupted/dummy test cache rows (requires valid dlNumber and no test flag)
      if (!forceRefresh && typeof repo.findRecentVerification === 'function') {
        const cached = await repo.findRecentVerification('driving_license', cleanDl);
        if (cached && cached.response_data && !cached.response_data.test && cached.response_data.dlNumber) {
          return {
            success: true,
            isVerified: Boolean(cached.is_compliant ?? true),
            verificationStatus: cached.status === 'verified' ? 'VERIFIED' : 'REJECTED',
            rejectionReasons: cached.rejection_reasons || [],
            source: 'CACHE',
            provider: cached.provider || 'surepass',
            consentId,
            data: cached.response_data,
          };
        }
      }

      // step 3 call surepass API
      logger?.info(
        { dlNumber: cleanDl, consentId },
        "[DL Service] Calling Surepass API for Driving License",
      );
      const result = await provider.verifyDrivingLicense({
        dlNumber: cleanDl,
        dob,
        providerOverride,
      });

      // step 4 evaluate business compliance rules (RTO active + heavy equipment check)
      if (result.success && result.data) {
        const allowedCodes = await getAllowedCovCodes();
        result.data.compliance = evaluateDriverLicenseCompliance(result.data, { allowedCodes });
      }

      // const isVerified = Boolean(result.success && result.data?.compliance?.violations || ['Driving license verification failed.']);
      const isVerified = Boolean(
        result.success && result.data?.compliance?.verifiedOperatorBadge,
      );
      const verificationStatus = isVerified ? "VERIFIED" : "REJECTED";
      const rejectionReasons = isVerified
        ? []
        : result.data?.compliance?.violations || [
            "Driving license verification failed.",
          ];

      const actualProvider = result.provider || providerOverride || 'mock';
      const actualCost = actualProvider === 'mock' ? 0.0 : ESTIMATED_CALL_COST;

      // step 5 log external api cost audit in postgresql
      await repo.logApiCall({
        provider: actualProvider,
        endpoint: "/driving-license",
        httpStatus: result.success ? 200 : 422,
        costEstimate: actualCost,
        requestPayload: { dlNumber: cleanDl, dob },
        responsePayload: result.raw,
      });

      // step 6 save master verification record in kyc.verifications
      const verificationRecord = await repo.saveVerification({
        verificationType: "driving_license",
        idNumber: cleanDl,
        status: isVerified ? "verified" : "failed",
        isAuthentic: Boolean(result.success),
        isCompliant: isVerified,
        provider: actualProvider,
        responseData: result.data,
        rawResponse: result.raw,
        actorId,
        consentId,
        costInr: actualCost,
        rejectionReasons,
        ipAddress: clientMeta.ip || "0.0.0.0",
        userAgent: clientMeta.userAgent || null,
      });

      // Step 6B: Save segregated domain inputs and Sarathi outputs in kyc.dl_verifications
      if (repo.dl && verificationRecord?.id) {
        let dlSubRecord = null;
        try {
          dlSubRecord = await repo.dl.saveDlDetails({
            verificationId: verificationRecord.id,
            actorId,
            consentId,
            input: { dlNumber: cleanDl, dob },
            verified: result.data || {},
            compliance: result.data?.compliance || {},
            rawResponse: result.raw,
            verificationStatus,
            isAuthentic: Boolean(result.success),
            isCompliant: isVerified,
            rejectionReasons,
            costInr: ESTIMATED_CALL_COST,
          });
        } catch (dbErr) {
          logger?.error({ err: dbErr.message }, "[DL Service] Failed to save dl_verifications sub-table record");
        }

        // Save Front DL Photo to kyc.dl_documents if provided
        if (frontDocument && frontDocument.fileBase64) {
          try {
            await repo.dl.saveDlDocument({
              dlVerificationId: dlSubRecord?.id || null,
              actorId,
              documentSide: 'FRONT',
              originalFilename: frontDocument.originalFilename || 'dl_front.jpg',
              mimeType: frontDocument.mimeType || 'image/jpeg',
              fileBase64: frontDocument.fileBase64,
            });
          } catch (docErr) {
            logger?.warn({ err: docErr.message }, "[DL Service] Failed to save DL front document");
          }
        }

        // Save Back DL Photo to kyc.dl_documents if provided
        if (backDocument && backDocument.fileBase64) {
          try {
            await repo.dl.saveDlDocument({
              dlVerificationId: dlSubRecord?.id || null,
              actorId,
              documentSide: 'BACK',
              originalFilename: backDocument.originalFilename || 'dl_back.jpg',
              mimeType: backDocument.mimeType || 'image/jpeg',
              fileBase64: backDocument.fileBase64,
            });
          } catch (docErr) {
            logger?.warn({ err: docErr.message }, "[DL Service] Failed to save DL back document");
          }
        }
      }

      // stpe 7 throw error if surepass verification failed
      if (!result.success) {
        throw new ApiError(
          422,
          "DL_VERIFICATION_FAILED",
          result.message || result.data?.message || "Driving license verification failed with Parivahan. Please check that the DL Number and Date of Birth (YYYY-MM-DD) match your card.",
          result.data,
        );
      }

      return {
        success: true,
        isVerified,
        verificationStatus,
        rejectionReasons,
        source: "PROVIDER",
        provider: actualProvider,
        consentId,
        data: result.data || null,
      };
    },
  };
}
