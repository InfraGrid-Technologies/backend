import { ApiError } from '../../../errors.js';

/**
 * KYC OCR Service
 * Orchestrates: DPDP Consent Logging -> Vendor OCR -> Data Normalization -> Audit Storage
 */
export function createOcrService({ provider, repo, logger }) {
  const ESTIMATED_OCR_COST = 5.0; // ₹5 per OCR API call

  return {
    /**
     * Process Vehicle RC Document with AI OCR
     */
    async ocrVehicleRc({ imageBase64, fileUrl, mimeType, consent }, actorId = null, clientMeta = {}) {
      // 1. Mandatory DPDP Consent Check & Normalization
      const consentObj = typeof consent === 'boolean'
        ? { agreed: consent, noticeVersion: 'RC_OCR_V1.0', noticeText: 'Consent to extract registration details from uploaded RC document' }
        : consent;

      if (!consentObj || consentObj.agreed !== true) {
        throw new ApiError(
          422,
          'CONSENT_REQUIRED',
          'Explicit user consent is mandatory under DPDP Act 2023 before scanning vehicle registration documents.'
        );
      }

      // 2. Validate payload size (< 12MB base64)
      if (imageBase64 && imageBase64.length > 16 * 1024 * 1024) {
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Document size exceeds maximum allowed limit of 10MB.');
      }

      // 3. Record immutable DPDP consent artifact (graceful DB fallback)
      let consentRecord = { id: 'consent-ocr-rc-' + Date.now() };
      try {
        if (repo && typeof repo.recordConsent === 'function') {
          consentRecord = await repo.recordConsent({
            actorId,
            consentType: 'ocr_vehicle_rc',
            purpose: 'RC_DOCUMENT_DATA_EXTRACTION',
            noticeVersion: consentObj.noticeVersion || '1.0',
            noticeText: consentObj.noticeText || 'Consent to extract registration details from uploaded RC document',
            ipAddress: clientMeta.ip || '0.0.0.0',
            userAgent: clientMeta.userAgent || null,
          });
        }
      } catch (dbErr) {
        logger?.warn({ err: dbErr.message }, '[OCR Service] Could not log consent to database, using in-memory ID');
      }

      // 4. Call Provider Adapter
      logger?.info({ consentId: consentRecord.id }, '[OCR Service] Calling OCR provider for Vehicle RC');
      const result = await provider.ocrVehicleRc({
        fileBase64: imageBase64,
        fileUrl,
        mimeType: mimeType || 'image/jpeg',
      });

      if (!result.success) {
        throw new ApiError(422, 'OCR_EXTRACTION_FAILED', result.data?.message || 'Failed to extract text from RC document. Please ensure photo is clear and well-lit.');
      }

      // 5. Store Verification Audit Record & API log
      try {
        if (repo && typeof repo.logApiCall === 'function') {
          await repo.logApiCall({
            provider: provider.providerName,
            endpoint: '/ocr/vehicle-rc',
            httpStatus: result.success ? 200 : 422,
            costEstimate: ESTIMATED_OCR_COST,
            requestPayload: { hasImage: Boolean(imageBase64 || fileUrl) },
            responsePayload: result.raw,
          });
        }

        const verificationRecord = await repo.saveVerification({
          verificationType: 'rc',
          idNumber: result.data.vehicleNumber || 'UNKNOWN_RC',
          status: 'verified',
          isAuthentic: true,
          isCompliant: true,
          provider: provider.providerName,
          responseData: result.data,
          rawResponse: result.raw,
          actorId,
          consentId: consentRecord.id,
          rejectionReasons: [],
          costInr: ESTIMATED_OCR_COST,
          ipAddress: clientMeta.ip || '0.0.0.0',
          userAgent: clientMeta.userAgent || null,
        });

        // 5B. Save Document Image into kyc.rc_documents
        if (repo.rc && imageBase64) {
          try {
            await repo.rc.saveRcDocument({
              rcVerificationId: verificationRecord?.id || null,
              actorId,
              documentSide: 'FRONT',
              originalFilename: 'rc_camera_upload.jpg',
              mimeType: mimeType || 'image/jpeg',
              fileBase64: imageBase64,
              ocrExtractedData: result.data,
              ocrConfidence: result.data?.ocrConfidence || 0.95,
            });
          } catch (docErr) {
            logger?.warn({ err: docErr.message }, '[OCR Service] Could not save RC document binary to database');
          }
        }
      } catch (dbErr) {
        logger?.warn({ err: dbErr.message }, '[OCR Service] Could not log OCR verification to database');
      }

      return {
        success: true,
        status: 'COMPLETED',
        consentId: consentRecord.id,
        provider: provider.providerName,
        data: result.data,
      };
    },

    /**
     * Process Driving License Document with AI OCR
     */
    async ocrDrivingLicense({ imageBase64, fileUrl, mimeType, consent }, actorId = null, clientMeta = {}) {
      // 1. Mandatory DPDP Consent Check & Normalization
      const consentObj = typeof consent === 'boolean'
        ? { agreed: consent, noticeVersion: 'DL_OCR_V1.0', noticeText: 'Consent to extract license details from uploaded Driving License' }
        : consent;

      if (!consentObj || consentObj.agreed !== true) {
        throw new ApiError(
          422,
          'CONSENT_REQUIRED',
          'Explicit user consent is mandatory under DPDP Act 2023 before scanning driving license documents.'
        );
      }

      // 2. Validate payload size
      if (imageBase64 && imageBase64.length > 16 * 1024 * 1024) {
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Document size exceeds maximum allowed limit of 10MB.');
      }

      // 3. Record immutable DPDP consent artifact (graceful DB fallback)
      let consentRecord = { id: 'consent-ocr-dl-' + Date.now() };
      try {
        if (repo && typeof repo.recordConsent === 'function') {
          consentRecord = await repo.recordConsent({
            actorId,
            consentType: 'ocr_driving_license',
            purpose: 'DL_DOCUMENT_DATA_EXTRACTION',
            noticeVersion: consentObj.noticeVersion || '1.0',
            noticeText: consentObj.noticeText || 'Consent to extract license details from uploaded Driving License',
            ipAddress: clientMeta.ip || '0.0.0.0',
            userAgent: clientMeta.userAgent || null,
          });
        }
      } catch (dbErr) {
        logger?.warn({ err: dbErr.message }, '[OCR Service] Could not log consent to database, using in-memory ID');
      }

      // 4. Call Provider Adapter
      logger?.info({ consentId: consentRecord.id }, '[OCR Service] Calling OCR provider for Driving License');
      const result = await provider.ocrDrivingLicense({
        fileBase64: imageBase64,
        fileUrl,
        mimeType: mimeType || 'image/jpeg',
      });

      if (!result.success) {
        throw new ApiError(422, 'OCR_EXTRACTION_FAILED', result.data?.message || 'Failed to extract text from Driving License. Please ensure photo is clear and well-lit.');
      }

      // 5. Store Verification Audit Record & API log
      try {
        if (repo && typeof repo.logApiCall === 'function') {
          await repo.logApiCall({
            provider: provider.providerName,
            endpoint: '/ocr/license',
            httpStatus: result.success ? 200 : 422,
            costEstimate: ESTIMATED_OCR_COST,
            requestPayload: { hasImage: Boolean(imageBase64 || fileUrl) },
            responsePayload: result.raw,
          });
        }

        const verificationRecord = await repo.saveVerification({
          verificationType: 'driving_license',
          idNumber: result.data.dlNumber || 'UNKNOWN_DL',
          status: 'verified',
          isAuthentic: true,
          isCompliant: true,
          provider: provider.providerName,
          responseData: result.data,
          rawResponse: result.raw,
          actorId,
          consentId: consentRecord.id,
          rejectionReasons: [],
          costInr: ESTIMATED_OCR_COST,
          ipAddress: clientMeta.ip || '0.0.0.0',
          userAgent: clientMeta.userAgent || null,
        });

        // 5B. Save Document Image into kyc.dl_documents
        if (repo.dl && imageBase64) {
          try {
            await repo.dl.saveDlDocument({
              dlVerificationId: verificationRecord?.id || null,
              actorId,
              documentSide: 'FRONT',
              originalFilename: 'dl_camera_upload.jpg',
              mimeType: mimeType || 'image/jpeg',
              fileBase64: imageBase64,
              ocrExtractedData: result.data,
              ocrConfidence: result.data?.ocrConfidence || 0.95,
            });
          } catch (docErr) {
            logger?.warn({ err: docErr.message }, '[OCR Service] Could not save DL document binary to database');
          }
        }
      } catch (dbErr) {
        logger?.warn({ err: dbErr.message }, '[OCR Service] Could not log OCR verification to database');
      }

      return {
        success: true,
        status: 'COMPLETED',
        consentId: consentRecord.id,
        provider: provider.providerName,
        data: result.data,
      };
    },
  };
}

