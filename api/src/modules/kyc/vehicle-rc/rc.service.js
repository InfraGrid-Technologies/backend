import { ApiError } from "../../../errors.js";
import { evaluateVehicleCompliance } from "./rc.compliance.js";

/**
 * Vehicle RC Verification Service (Surepass Integration)
 * Orchestrates: DPDP Consent -> Surepass API -> Compliance Rules -> PostgreSQL Storage
 */

export function createVehicleRcService({ provider, repo, logger }) {
  const ESTIMATED_CALL_COST = 15.0;

  return {
    async verify(
      { vehicleNumber, vehicleCategory = null, vehicleType = null, frontDocument = null, backDocument = null, consent, forceRefresh = false, providerOverride },
      actorId = null,
      clientMeta = {},
    ) {
      // step 1: validate explicit DPDP consent artifact in postgreSQL
      if (!consent || consent.agreed !== true) {
        throw new ApiError(
          422,
          "CONSENT_REQUIRED",
          "Explicit user consent is mandatory under DPDP Act 2023 to verify vehicle RC.",
        );
      }

      //   step 2: record immutable user consent artifacr in postgresql
      const consentRecord = await repo.recordConsent({
        actorId,
        consentType: "rc",
        purpose: "FLEET_VEHICLE_ONBOARDING",
        noticeVersion: consent.noticeVersion,
        noticeText: consent.noticeText,
        ipAddress: clientMeta.ip || "0.0.0.0",
        userAgent: clientMeta.userAgent || null,
      });
      const consentId = consentRecord.id;

      // clean vehicle number(remove specs and hyphens)
      const cleanRc = vehicleNumber.replaceAll(/[\s-]/g, "").toUpperCase();

      // Check cache if repo supports finding recent verification (skipped if forceRefresh is true)
      // Guard against corrupted/dummy test cache rows (requires valid vehicleNumber and no test flag)
      if (!forceRefresh && typeof repo.findRecentVerification === 'function') {
        const cached = await repo.findRecentVerification('rc', cleanRc);
        if (cached && cached.response_data && !cached.response_data.test && cached.response_data.vehicleNumber) {
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

      // step 3: call surepass API
      logger?.info(
        { vehicleNumber: cleanRc, consentId },
        "[RC service] Calling Surepass API  for vehicle RC",
      );
      const result = await provider.verifyRc({ vehicleNumber: cleanRc, providerOverride });

      // step 4: evaluate compliance rules for Rc i.e active+fitness+puc+insurance + category & vehicle type RTO class match
      if (result.success && result.data) {
        result.data.compliance = evaluateVehicleCompliance(result.data, undefined, vehicleCategory, vehicleType);
        if (vehicleCategory) result.data.expectedCategory = vehicleCategory;
        if (vehicleType) result.data.expectedType = vehicleType;
      }

      const isVerified = Boolean(
        result.success && result.data?.compliance?.isFullyCompliant,
      );
      const verificationStatus = isVerified ? "VERIFIED" : "REJECTED";
      const rejectionReasons = isVerified
        ? []
        : result.data?.compliance?.violations || [
            "Vehicle RC verification failed.",
          ];

      const actualProvider = result.provider || providerOverride || 'mock';
      const actualCost = actualProvider === 'mock' ? 0.0 : ESTIMATED_CALL_COST;

      // Step 5: Log external API cost audit in PostgreSQL
      await repo.logApiCall({
        provider: actualProvider,
        endpoint: "/rc-full",
        httpStatus: result.success ? 200 : 422,
        costEstimate: actualCost,
        requestPayload: { vehicleNumber: cleanRc },
        responsePayload: result.raw,
      });

      // step 6: Save master verification ledger in kyc.verifications
      const verificationRecord = await repo.saveVerification({
        verificationType: "rc",
        idNumber: cleanRc,
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

      // Step 6B: Save segregated domain inputs and 35+ VAHAN outputs in kyc.rc_verifications
      if (repo.rc && verificationRecord?.id) {
        let rcSubRecord = null;
        try {
          rcSubRecord = await repo.rc.saveRcDetails({
            verificationId: verificationRecord.id,
            actorId,
            consentId,
            input: {
              vehicleNumber: cleanRc,
              engineNumber: result.data?.engineNumber,
              chassisNumber: result.data?.chassisNumber,
              vehicleType: result.data?.vehicleClass,
            },
            verified: result.data || {},
            rawResponse: result.raw,
            isCompliant: isVerified,
          });
        } catch (dbErr) {
          logger?.error({ err: dbErr.message }, "[RC Service] Failed to save rc_verifications sub-table record");
        }

        // Save Front RC Document to kyc.rc_documents if provided
        if (frontDocument && frontDocument.fileBase64) {
          try {
            await repo.rc.saveRcDocument({
              rcVerificationId: rcSubRecord?.id || null,
              actorId,
              documentSide: 'FRONT',
              originalFilename: frontDocument.originalFilename || 'rc_front.jpg',
              mimeType: frontDocument.mimeType || 'image/jpeg',
              fileBase64: frontDocument.fileBase64,
            });
          } catch (docErr) {
            logger?.warn({ err: docErr.message }, "[RC Service] Failed to save RC front document");
          }
        }

        // Save Back RC Document to kyc.rc_documents if provided
        if (backDocument && backDocument.fileBase64) {
          try {
            await repo.rc.saveRcDocument({
              rcVerificationId: rcSubRecord?.id || null,
              actorId,
              documentSide: 'BACK',
              originalFilename: backDocument.originalFilename || 'rc_back.jpg',
              mimeType: backDocument.mimeType || 'image/jpeg',
              fileBase64: backDocument.fileBase64,
            });
          } catch (docErr) {
            logger?.warn({ err: docErr.message }, "[RC Service] Failed to save RC back document");
          }
        }
      }


      // Step 7: Throw error if Surepass verification failed
      if (!result.success) {
        throw new ApiError(
          422,
          "RC_VERIFICATION_FAILED",
          result.data?.message || "Vehicle RC verification failed.",
          result.data,
        );
      }
      // Step 8: Return verified response
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
