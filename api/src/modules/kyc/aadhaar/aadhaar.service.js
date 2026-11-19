import { ApiError } from "../../../errors.js";
import { evaluateAadhaarCompliance } from "./aadhaar.compliance.js";

/**
 * Aadhaar DigiLocker Verification Service (Surepass Integration)
 * Manages: 1. Session Initiation -> 2. Result Fetching & Compliance Evaluation
 */
export function createAadhaarService({ provider, repo, logger }) {
  const ESTIMATED_INITIATE_COST = 0.0;
  const ESTIMATED_FETCH_COST = 15.0; // Surepass charges upon successful fetch

  return {
    /**
     * Step 1: Create a DigiLocker OTP Session
     */
    async initiate({ redirectUrl, logoUrl, consent }, actorId = null, clientMeta = {}) {
      // Validate DPDP consent
      if (!consent || consent.agreed !== true) {
        throw new ApiError(
          422,
          "CONSENT_REQUIRED",
          "Explicit user consent is mandatory under DPDP Act 2023 to verify Aadhaar.",
        );
      }

      // Record consent artifact in PostgreSQL
      const consentRecord = await repo.recordConsent({
        actorId,
        consentType: "aadhaar",
        purpose: "AADHAAR_DIGILOCKER_VERIFICATION",
        noticeVersion: consent.noticeVersion,
        noticeText: consent.noticeText,
        ipAddress: clientMeta.ip || "0.0.0.0",
        userAgent: clientMeta.userAgent || null,
      });
      const consentId = consentRecord.id;

      // Call Surepass to generate DigiLocker URL
      logger?.info(
        { consentId },
        "[Aadhaar Service] Initiating DigiLocker session with Surepass",
      );
      const result = await provider.initiateAadhaarDigilocker({
        redirectUrl: redirectUrl || "equiprent://aadhaar",
        logoUrl: logoUrl || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
      });

      // Log external API audit
      await repo.logApiCall({
        provider: "surepass",
        endpoint: "/digilocker/initialize",
        httpStatus: result.success ? 200 : 422,
        costEstimate: ESTIMATED_INITIATE_COST,
        requestPayload: { redirectUrl, logoUrl },
        responsePayload: result.raw,
      });

      if (!result.success) {
        throw new ApiError(
          422,
          "DIGILOCKER_INIT_FAILED",
          result.data?.message || "Failed to initialize DigiLocker session.",
        );
      }

      // Save initial pending verification in PostgreSQL
      if (result.data?.clientId) {
        const verificationRecord = await repo.saveVerification({
          verificationType: "aadhaar",
          idNumber: result.data.clientId,
          status: "pending",
          provider: "surepass",
          responseData: result.data,
          rawResponse: result.raw,
          actorId,
          consentId,
          costInr: ESTIMATED_INITIATE_COST,
          ipAddress: clientMeta.ip || "0.0.0.0",
          userAgent: clientMeta.userAgent || null,
        });

        if (repo.aadhaar && verificationRecord?.id) {
          try {
            await repo.aadhaar.saveAadhaarDetails({
              verificationId: verificationRecord.id,
              actorId,
              consentId,
              clientId: result.data.clientId,
              redirectUrl: redirectUrl || null,
              verified: {},
              rawResponse: result.raw,
              sessionStatus: 'INITIATED',
              verificationStatus: 'PENDING',
              costInr: ESTIMATED_INITIATE_COST,
            });
          } catch (dbErr) {
            logger?.error({ err: dbErr.message }, "[Aadhaar Service] Failed to initialize aadhaar_verifications sub-table record");
          }
        }
      }

      return {
        success: true,
        consentId,
        data: result.data,
      };
    },

    /**
     * Step 2: Fetch Verified Aadhaar Details after user enters OTP
     */
    async getDetails(clientId, actorId = null) {
      logger?.info(
        { clientId },
        "[Aadhaar Service] Fetching verified Aadhaar data from Surepass",
      );
      const result = await provider.getAadhaarDetails({ clientId });

      // Run compliance check
      if (result.success && result.data) {
        result.data.compliance = evaluateAadhaarCompliance(result.data);
      }

      const isVerified = Boolean(result.data?.compliance?.isAadhaarVerified);
      const verificationStatus = isVerified ? "VERIFIED" : "REJECTED";
      const rejectionReasons = isVerified
        ? []
        : result.data?.compliance?.violations || [
            result.data?.message
              ? `${result.data.message}. Please complete OTP authorization on DigiLocker.`
              : "Aadhaar verification incomplete.",
          ];

      // Log API audit in PostgreSQL
      await repo.logApiCall({
        provider: "surepass",
        endpoint: "/digilocker/get-aadhaar-data",
        httpStatus: result.success ? 200 : 422,
        costEstimate: ESTIMATED_FETCH_COST,
        requestPayload: { clientId },
        responsePayload: result.raw,
      });

      // If user completed OTP, update verification record in PostgreSQL
      if (result.success && result.data?.status === "COMPLETED") {
        const verificationRecord = await repo.saveVerification({
          verificationType: "aadhaar",
          idNumber: clientId,
          status: isVerified ? "verified" : "failed",
          isAuthentic: Boolean(result.success && result.data?.status === "COMPLETED"),
          isCompliant: isVerified,
          provider: "surepass",
          responseData: result.data,
          rawResponse: result.raw,
          actorId,
          costInr: ESTIMATED_FETCH_COST,
          rejectionReasons,
        });

        if (repo.aadhaar && verificationRecord?.id) {
          try {
            await repo.aadhaar.saveAadhaarDetails({
              verificationId: verificationRecord.id,
              actorId,
              clientId,
              verified: result.data || {},
              rawResponse: result.raw,
              sessionStatus: 'COMPLETED',
              verificationStatus,
              costInr: ESTIMATED_FETCH_COST,
            });
          } catch (dbErr) {
            logger?.error({ err: dbErr.message }, "[Aadhaar Service] Failed to save completed aadhaar_verifications sub-table record");
          }
        }
      }

      return {
        success: true,
        isVerified,
        verificationStatus,
        rejectionReasons,
        source: "SUREPASS",
        provider: "surepass",
        data: result.data || null,
      };
    },
  };
}
