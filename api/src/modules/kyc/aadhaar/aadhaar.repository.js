import { createHash } from 'node:crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sanitizeUuid(id, fallback = null) {
  if (typeof id === 'string' && UUID_REGEX.test(id.trim())) {
    return id.trim();
  }
  return fallback;
}

/**
 * Aadhaar DigiLocker Repository
 * Dedicated data access layer for kyc.aadhaar_verifications and kyc.aadhaar_documents
 * Adheres strictly to the single-responsibility principle (< 140 lines)
 */
export function createAadhaarRepository(db) {
  const query = (sql, params) => db.pool.query(sql, params);
  

  return {
    /**
     * 1. Save or Update complete Aadhaar DigiLocker verification details
     */
    async saveAadhaarDetails({
      verificationId,
      actorId,
      consentId,
      clientId,
      redirectUrl = null,
      verified = {},
      rawResponse = null,
      sessionStatus = 'COMPLETED',
      verificationStatus = 'VERIFIED',
      costInr = 15.0,
    }) {
      const addr = verified.address || {};
      const hasPhoto = Boolean(verified.profilePhotoBase64 || verified.hasProfilePhoto);

      const sql = `
        INSERT INTO kyc.aadhaar_verifications (
          verification_id, actor_id, consent_id,
          input_client_id, input_redirect_url,
          verified_full_name, verified_dob, verified_gender,
          masked_aadhaar, care_of, mobile_hash, has_profile_photo,
          verified_house, verified_street, verified_landmark, verified_locality,
          verified_vtc, verified_subdist, verified_district, verified_state,
          verified_pincode, verified_country, verified_address_json,
          digilocker_verified, session_status, verification_status,
          cost_inr, raw_surepass_response
        ) VALUES (
          $1, $2, $3,
          $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23,
          $24, $25, $26,
          $27, $28
        )
        ON CONFLICT (input_client_id) DO UPDATE SET
          verification_id = COALESCE(EXCLUDED.verification_id, kyc.aadhaar_verifications.verification_id),
          actor_id = COALESCE(EXCLUDED.actor_id, kyc.aadhaar_verifications.actor_id),
          consent_id = COALESCE(EXCLUDED.consent_id, kyc.aadhaar_verifications.consent_id),
          verified_full_name = EXCLUDED.verified_full_name,
          verified_dob = EXCLUDED.verified_dob,
          verified_gender = EXCLUDED.verified_gender,
          masked_aadhaar = EXCLUDED.masked_aadhaar,
          care_of = EXCLUDED.care_of,
          mobile_hash = EXCLUDED.mobile_hash,
          has_profile_photo = EXCLUDED.has_profile_photo,
          verified_house = EXCLUDED.verified_house,
          verified_street = EXCLUDED.verified_street,
          verified_landmark = EXCLUDED.verified_landmark,
          verified_locality = EXCLUDED.verified_locality,
          verified_vtc = EXCLUDED.verified_vtc,
          verified_subdist = EXCLUDED.verified_subdist,
          verified_district = EXCLUDED.verified_district,
          verified_state = EXCLUDED.verified_state,
          verified_pincode = EXCLUDED.verified_pincode,
          verified_country = EXCLUDED.verified_country,
          verified_address_json = EXCLUDED.verified_address_json,
          digilocker_verified = EXCLUDED.digilocker_verified,
          session_status = EXCLUDED.session_status,
          verification_status = EXCLUDED.verification_status,
          cost_inr = EXCLUDED.cost_inr,
          raw_surepass_response = EXCLUDED.raw_surepass_response
        RETURNING id, verification_id, input_client_id, verified_full_name, session_status, verification_status, digilocker_verified, input_submitted_at;
      `;

      const values = [
        verificationId,                                         // $1
        sanitizeUuid(actorId, null),                            // $2
        consentId,                                              // $3
        clientId,                                               // $4
        redirectUrl || null,                                    // $5
        verified.name || null,                                  // $6
        verified.dob || null,                                   // $7
        verified.gender || null,                                // $8
        verified.maskedAadhaar || null,                         // $9
        verified.careOf || null,                                // $10
        verified.mobileHash || verified.mobileNumber || null,   // $11
        hasPhoto,                                               // $12
        addr.house || null,                                     // $13
        addr.street || null,                                    // $14
        addr.landmark || null,                                  // $15
        addr.locality || null,                                  // $16
        addr.vtc || null,                                       // $17
        addr.subdist || null,                                   // $18
        addr.dist || addr.district || null,                     // $19
        addr.state || null,                                     // $20
        addr.pincode || addr.zip || null,                       // $21
        addr.country || 'India',                                // $22
        JSON.stringify(addr || {}),                             // $23
        Boolean(verified.digilockerVerified ?? true),           // $24
        sessionStatus || 'COMPLETED',                           // $25
        verificationStatus || 'VERIFIED',                       // $26
        Number(costInr || 15.0),                                // $27
        rawResponse ? JSON.stringify(rawResponse) : null,       // $28
      ];

      const { rows } = await query(sql, values);
      const insertedRow = rows[0];

      // Auto-save user photo to kyc.aadhaar_documents if available
      if (insertedRow && verified.profilePhotoBase64 && actorId) {
        await this.saveAadhaarDocument({
          aadhaarVerificationId: insertedRow.id,
          actorId,
          documentType: 'PROFILE_PHOTO',
          mimeType: 'image/jpeg',
          fileBase64: verified.profilePhotoBase64,
        });
      }

      return insertedRow;
    },

    /**
     * 2. Save Aadhaar Document (Signed XML, Profile Photo, or Consent Form as BYTEA)
     */
    async saveAadhaarDocument({
      aadhaarVerificationId,
      actorId,
      documentType = 'PROFILE_PHOTO',
      mimeType = 'image/jpeg',
      fileBase64 = null,
      sha256Checksum = null,
    }) {
      let fileBuffer = null;
      let calculatedHash = sha256Checksum;

      if (fileBase64) {
        const cleanB64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
        fileBuffer = Buffer.from(cleanB64, 'base64');
        if (!calculatedHash) {
          calculatedHash = createHash('sha256').update(fileBuffer).digest('hex');
        }
      }

      const sql = `
        INSERT INTO kyc.aadhaar_documents (
          aadhaar_verification_id, actor_id, document_type,
          mime_type, sha256_checksum, storage_type, file_data
        ) VALUES ($1, $2, $3, $4, $5, 'DATABASE_BLOB', $6)
        RETURNING id, aadhaar_verification_id, document_type, mime_type, sha256_checksum, created_at;
      `;

      const { rows } = await query(sql, [
        aadhaarVerificationId,
        actorId,
        documentType,
        mimeType,
        calculatedHash || '0000000000000000000000000000000000000000000000000000000000000000',
        fileBuffer,
      ]);

      return rows[0];
    },

    /**
     * 3. Fetch Aadhaar Details with documents by client_id
     */
    async getAadhaarByClientId(clientId) {
      const sql = `
        SELECT a.*, json_agg(doc.*) FILTER (WHERE doc.id IS NOT NULL) AS documents
        FROM kyc.aadhaar_verifications a
        LEFT JOIN kyc.aadhaar_documents doc ON doc.aadhaar_verification_id = a.id
        WHERE a.input_client_id = $1
        GROUP BY a.id;
      `;
      const { rows } = await query(sql, [clientId]);
      return rows[0] || null;
    },

    /**
     * 4. Fetch Aadhaar Details by verification_id
     */
    async getAadhaarByVerificationId(verificationId) {
      const sql = `
        SELECT a.*, json_agg(doc.*) FILTER (WHERE doc.id IS NOT NULL) AS documents
        FROM kyc.aadhaar_verifications a
        LEFT JOIN kyc.aadhaar_documents doc ON doc.aadhaar_verification_id = a.id
        WHERE a.verification_id = $1
        GROUP BY a.id;
      `;
      const { rows } = await query(sql, [verificationId]);
      return rows[0] || null;
    },
  };
}
