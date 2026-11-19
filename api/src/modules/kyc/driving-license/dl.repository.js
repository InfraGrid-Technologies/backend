import { createHash, randomUUID } from 'node:crypto';

/**
 * Safe ISO Date parser for PostgreSQL DATE columns
 */
function parseSafeDate(d) {
  if (!d) return null;
  const str = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}$/.test(str)) return `${str}-01`;
  if (/^(\d{1,2})\/(\d{4})$/.test(str)) {
    const [, m, y] = str.match(/^(\d{1,2})\/(\d{4})$/);
    return `${y}-${m.padStart(2, '0')}-01`;
  }
  if (/^(\d{1,2})-(\d{1,2})-(\d{4})$/.test(str)) {
    const [, day, m, y] = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sanitizeUuid(id, fallback = null) {
  if (typeof id === 'string' && UUID_REGEX.test(id.trim())) {
    return id.trim();
  }
  return fallback;
}

/**
 * Driving License Repository
 * Dedicated data access layer for kyc.dl_verifications and kyc.dl_documents
 * Adheres strictly to the single-responsibility principle (< 140 lines)
 */
export function createDrivingLicenseRepository(db) {
  const query = (sql, params) => db.pool.query(sql, params);

  return {
    /**
     * 1. Save complete DL details (User inputs + Sarathi / Surepass outputs + Compliance)
     */
    async saveDlDetails({
      verificationId,
      actorId,
      consentId,
      input = {},
      verified = {},
      compliance = {},
      rawResponse = null,
      verificationStatus = 'VERIFIED',
      isAuthentic = true,
      isCompliant = true,
      rejectionReasons = [],
      costInr = 15.0,
    }) {
      const rawData = rawResponse?.data || {};

      const sql = `
        INSERT INTO kyc.dl_verifications (
          verification_id, actor_id, consent_id,
          input_dl_number, input_dob,
          verified_name, verified_father_or_husband_name, verified_gender, verified_blood_group,
          verified_permanent_address, verified_temporary_address, dl_status,
          issue_date, valid_from, valid_till, transport_valid_from, transport_valid_till,
          rto_name, rto_code, state,
          vehicle_classes, has_heavy_equipment_endorsement, authorized_equipment_codes,
          badge_number, badge_issue_date,
          verification_status, is_authentic, is_compliant, rejection_reasons,
          cost_inr, raw_surepass_response
        ) VALUES (
          $1, $2, $3,
          $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19, $20,
          $21, $22, $23,
          $24, $25,
          $26, $27, $28, $29,
          $30, $31
        )
        ON CONFLICT (verification_id) DO UPDATE SET
          input_dl_number = EXCLUDED.input_dl_number,
          input_dob = EXCLUDED.input_dob,
          verified_name = EXCLUDED.verified_name,
          verified_father_or_husband_name = EXCLUDED.verified_father_or_husband_name,
          verified_gender = EXCLUDED.verified_gender,
          verified_blood_group = EXCLUDED.verified_blood_group,
          verified_permanent_address = EXCLUDED.verified_permanent_address,
          verified_temporary_address = EXCLUDED.verified_temporary_address,
          dl_status = EXCLUDED.dl_status,
          issue_date = EXCLUDED.issue_date,
          valid_from = EXCLUDED.valid_from,
          valid_till = EXCLUDED.valid_till,
          transport_valid_from = EXCLUDED.transport_valid_from,
          transport_valid_till = EXCLUDED.transport_valid_till,
          rto_name = EXCLUDED.rto_name,
          rto_code = EXCLUDED.rto_code,
          state = EXCLUDED.state,
          vehicle_classes = EXCLUDED.vehicle_classes,
          has_heavy_equipment_endorsement = EXCLUDED.has_heavy_equipment_endorsement,
          authorized_equipment_codes = EXCLUDED.authorized_equipment_codes,
          badge_number = EXCLUDED.badge_number,
          badge_issue_date = EXCLUDED.badge_issue_date,
          verification_status = EXCLUDED.verification_status,
          is_authentic = EXCLUDED.is_authentic,
          is_compliant = EXCLUDED.is_compliant,
          rejection_reasons = EXCLUDED.rejection_reasons,
          cost_inr = EXCLUDED.cost_inr,
          raw_surepass_response = EXCLUDED.raw_surepass_response
        RETURNING id, verification_id, input_dl_number, verified_name, verification_status, is_compliant, input_submitted_at;
      `;

      const values = [
        verificationId,                                                     // $1
        sanitizeUuid(actorId, null),                                        // $2
        consentId,                                                          // $3
        input.dlNumber,                                                     // $4
        parseSafeDate(input.dob || rawData.dob),                            // $5
        verified.name || rawData.name || null,                              // $6
        verified.fatherOrHusbandName || rawData.father_or_husband_name || null, // $7
        verified.gender || rawData.gender || null,                          // $8
        verified.bloodGroup || rawData.blood_group || null,                 // $9
        verified.permanentAddress || rawData.permanent_address || verified.address || null, // $10
        verified.temporaryAddress || rawData.temporary_address || null,      // $11
        verified.status || rawData.status || 'ACTIVE',                      // $12
        parseSafeDate(verified.issueDate || rawData.doi || rawData.issue_date), // $13
        parseSafeDate(verified.validFrom || rawData.valid_from || null),    // $14
        parseSafeDate(verified.validTill || rawData.valid_till || rawData.doe || null), // $15
        parseSafeDate(verified.transportValidFrom || rawData.transport_from || rawData.transport_valid_from || null), // $16
        parseSafeDate(verified.transportValidTill || rawData.transport_to || rawData.transport_valid_till || null),   // $17
        verified.rtoName || rawData.ola_name || rawData.rto || null,        // $18
        verified.rtoCode || rawData.ola_code || null,                       // $19
        verified.state || rawData.state || null,                            // $20
        JSON.stringify(verified.vehicleClasses || rawData.cov_details || []), // $21
        Boolean(compliance.isHeavyEqipmentAuthorized ?? compliance.isHeavyEquipmentAuthorized ?? false), // $22
        compliance.allVehicleClasses || [],                                 // $23
        verified.badgeNumber || rawData.badge_number || null,               // $24
        parseSafeDate(verified.badgeIssueDate || rawData.badge_issue_date || null), // $25
        verificationStatus || 'PENDING',                                    // $26
        Boolean(isAuthentic),                                               // $27
        Boolean(isCompliant),                                               // $28
        rejectionReasons || [],                                             // $29
        Number(costInr || 15.0),                                            // $30
        rawResponse ? JSON.stringify(rawResponse) : null,                   // $31
      ];

      const { rows } = await query(sql, values);
      return rows[0];
    },

    /**
     * 2. Save DL Document Photo (Converts base64 to BYTEA binary)
     */
    async saveDlDocument({
      dlVerificationId,
      actorId,
      documentSide = 'FRONT',
      originalFilename = 'dl_document.jpg',
      mimeType = 'image/jpeg',
      fileBase64 = null,
      sha256Checksum = null,
      ocrExtractedData = null,
      ocrConfidence = null,
    }) {
      let fileBuffer = null;
      let fileSizeBytes = 0;
      let calculatedHash = sha256Checksum;

      if (fileBase64) {
        const cleanB64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
        fileBuffer = Buffer.from(cleanB64, 'base64');
        fileSizeBytes = fileBuffer.length;
        if (!calculatedHash) {
          calculatedHash = createHash('sha256').update(fileBuffer).digest('hex');
        }
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safeActorId = (actorId && uuidRegex.test(actorId)) ? actorId : randomUUID();

      const sql = `
        INSERT INTO kyc.dl_documents (
          dl_verification_id, actor_id, document_side, original_filename,
          mime_type, file_size_bytes, sha256_checksum, storage_type, file_data,
          ocr_extracted_data, ocr_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, dl_verification_id, original_filename, file_size_bytes, sha256_checksum, created_at;
      `;

      const { rows } = await query(sql, [
        dlVerificationId || null,
        safeActorId,
        documentSide,
        originalFilename,
        mimeType,
        fileSizeBytes,
        calculatedHash || '0000000000000000000000000000000000000000000000000000000000000000',
        'DATABASE_BLOB',
        fileBuffer,
        ocrExtractedData ? JSON.stringify(ocrExtractedData) : null,
        ocrConfidence || null,
      ]);

      return rows[0];
    },

    /**
     * 3. Fetch DL Details with attached photos by verification_id
     */
    async getDlByVerificationId(verificationId) {
      const sql = `
        SELECT dl.*, json_agg(doc.*) FILTER (WHERE doc.id IS NOT NULL) AS documents
        FROM kyc.dl_verifications dl
        LEFT JOIN kyc.dl_documents doc ON doc.dl_verification_id = dl.id
        WHERE dl.verification_id = $1
        GROUP BY dl.id;
      `;
      const { rows } = await query(sql, [verificationId]);
      return rows[0] || null;
    },

    /**
     * 4. Fetch most recent DL Details by DL Number
     */
    async getDlByNumber(dlNumber) {
      const sql = `
        SELECT dl.*, json_agg(doc.*) FILTER (WHERE doc.id IS NOT NULL) AS documents
        FROM kyc.dl_verifications dl
        LEFT JOIN kyc.dl_documents doc ON doc.dl_verification_id = dl.id
        WHERE dl.input_dl_number = $1
        GROUP BY dl.id
        ORDER BY dl.input_submitted_at DESC
        LIMIT 1;
      `;
      const { rows } = await query(sql, [dlNumber]);
      return rows[0] || null;
    },
  };
}

