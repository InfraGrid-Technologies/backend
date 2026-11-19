import { ApiError } from "../../../errors.js";
import { evaluateChallanCompliance } from "./challan.compliance.js";

/**
 * Vehicle E-Challan Verification Service (Surepass Integration)
 * Orchestrates: DPDP Consent -> Surepass API -> Compliance Rules -> PostgreSQL Storage
 */
export function createChallanService({ provider, repo, logger }) {
  const ESTIMATED_CALL_COST = 15.0;

  return {
    async verify(
      { rcNumber, chassisNumber, engineNumber, statePortals, consent, forceRefresh = false, providerOverride },
      actorId = null,
      clientMeta = {},
    ) {
      // Step 1: Validate explicit DPDP user consent
      if (!consent || consent.agreed !== true) {
        throw new ApiError(
          422,
          "CONSENT_REQUIRED",
          "Explicit user consent is mandatory under DPDP Act 2023 to verify vehicle challans.",
        );
      }

      // Step 2: Record immutable user consent artifact in PostgreSQL
      const consentRecord = await repo.recordConsent({
        actorId,
        consentType: "challan",
        purpose: "VEHICLE_TRAFFIC_COMPLIANCE_CHECK",
        noticeVersion: consent.noticeVersion,
        noticeText: consent.noticeText,
        ipAddress: clientMeta.ip || "0.0.0.0",
        userAgent: clientMeta.userAgent || null,
      });
      const consentId = consentRecord.id;

      // Clean vehicle registration number
      const cleanRc = rcNumber.replaceAll(/[\s-]/g, "").toUpperCase();
      let cleanChassis = chassisNumber ? chassisNumber.trim() : null;
      let cleanEngine = engineNumber ? engineNumber.trim() : null;

      // Auto-recover chassis/engine from recent RC verification if omitted
      if (!cleanChassis && typeof repo.findRecentVerification === 'function') {
        try {
          const rcVerif = await repo.findRecentVerification('rc', cleanRc, 90);
          if (rcVerif?.response_data?.chassisNumber) {
            cleanChassis = rcVerif.response_data.chassisNumber;
          }
          if (!cleanEngine && rcVerif?.response_data?.engineNumber) {
            cleanEngine = rcVerif.response_data.engineNumber;
          }
        } catch (_) {}
      }

      // Check cache if repo supports finding recent verification (skipped if forceRefresh is true)
      if (!forceRefresh && typeof repo.findRecentVerification === 'function') {
        const cached = await repo.findRecentVerification('challan', cleanRc);
        if (cached && cached.response_data) {
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

      // Step 3: Call Surepass API
      logger?.info(
        { rcNumber: cleanRc, consentId },
        "[Challan Service] Calling Surepass API for E-Challans",
      );
      const result = await provider.verifyChallan({
        rcNumber: cleanRc,
        chassisNumber: cleanChassis,
        engineNumber: cleanEngine,
        statePortals,
        providerOverride,
      });

      // Step 4: Evaluate business compliance rules (Check for unpaid traffic fines)
      if (result.success && result.data) {
        result.data.compliance = evaluateChallanCompliance(result.data);
      }

      const isVerified = Boolean(
        result.success && result.data?.compliance?.isClean,
      );
      const verificationStatus = isVerified ? "VERIFIED" : "REJECTED";
      const rejectionReasons = isVerified
        ? []
        : result.data?.compliance?.violations || [
            "Vehicle has pending traffic fines.",
          ];

      const actualProvider = result.provider || providerOverride || 'mock';
      const actualCost = actualProvider === 'mock' ? 0.0 : ESTIMATED_CALL_COST;

      // Step 5: Log external API cost audit in PostgreSQL
      await repo.logApiCall({
        provider: actualProvider,
        endpoint: "/challan",
        httpStatus: result.success ? 200 : 422,
        costEstimate: actualCost,
        requestPayload: { rcNumber: cleanRc },
        responsePayload: result.raw,
      });

      // Step 6: Save master verification record in kyc.verifications
      const verificationRecord = await repo.saveVerification({
        verificationType: "challan",
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

      // Step 6B: Save segregated domain inputs, traffic summary, and violation tickets in kyc.challan_verifications & kyc.challan_tickets
      if (repo.challan && verificationRecord?.id) {
        try {
          await repo.challan.saveChallanDetails({
            verificationId: verificationRecord.id,
            actorId,
            consentId,
            input: {
              rcNumber: cleanRc,
              chassisNumber: cleanChassis,
              engineNumber: cleanEngine,
              queriedPortals: result.data?.checkedPortals || ['DL', 'TS', 'GJ'],
            },
            verified: result.data || {},
            rawResponse: result.raw,
            verificationStatus,
            isCompliant: isVerified,
            costInr: ESTIMATED_CALL_COST,
          });
        } catch (dbErr) {
          logger?.error({ err: dbErr.message }, "[Challan Service] Failed to save challan_verifications sub-table record");
        }
      }

      // Step 7: Throw error if Surepass verification failed
      if (!result.success) {
        throw new ApiError(
          422,
          "CHALLAN_VERIFICATION_FAILED",
          result.data?.message || "Challan verification failed.",
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
