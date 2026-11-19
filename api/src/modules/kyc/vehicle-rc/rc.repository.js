import { randomUUID } from 'node:crypto';

/**
 * Vehicle RC Repository
 * Dedicated data access layer for kyc.rc_verifications and kyc.rc_documents
 * Adheres strictly to the single-responsibility principle (< 130 lines)
 */
/**
 * Safe ISO Date parser for PostgreSQL DATE columns
 * Converts "YYYY-MM-DD", "YYYY-MM", "MM/YYYY", or ISO strings into "YYYY-MM-DD"
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

export function createVehicleRcRepository(db) {
  const query = (sql, params) => db.pool.query(sql, params);

  return {
    /**
     * 1. Save complete RC details (User inputs + VAHAN 4-pillar outputs)
     */
    async saveRcDetails({
      verificationId,
      actorId,
      consentId,
      input = {},
      verified = {},
      rawResponse = null,
      isCompliant = true,
    }) {
      const raw = rawResponse?.data || rawResponse || {};
      const fitness = verified.fitness || {};
      const insurance = verified.insurance || {};
      const puc = verified.puc || {};
      const permit = verified.nationalPermit || {};

      const sql = `
        INSERT INTO kyc.rc_verifications (
          verification_id, actor_id, consent_id,
          input_vehicle_number, input_engine_number, input_chassis_number, input_vehicle_type,
          verified_owner_name, verified_father_name, verified_present_address, verified_permanent_address,
          verified_mobile_number, registration_date, registered_at_rto, rc_status,
          verified_maker_description, verified_maker_model, verified_vehicle_class,
          verified_body_type, verified_fuel_type, verified_color, verified_norms_type,
          verified_engine_number, verified_chassis_number, cubic_capacity, no_cylinders,
          unladen_weight, vehicle_gross_weight, wheelbase, manufacturing_date, financer,
          fitness_status, fitness_valid_till,
          insurance_status, insurance_company, insurance_policy_number, insurance_valid_till,
          puc_status, puc_certificate_number, puc_valid_till,
          permit_status, permit_number, permit_type, permit_valid_till,
          national_permit_number, national_permit_valid_till, tax_upto, is_roadworthy,
          raw_surepass_response
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18,
          $19, $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28, $29, $30, $31,
          $32, $33,
          $34, $35, $36, $37,
          $38, $39, $40,
          $41, $42, $43, $44,
          $45, $46, $47, $48,
          $49
        )
        ON CONFLICT (verification_id) DO UPDATE SET
          input_vehicle_number = EXCLUDED.input_vehicle_number,
          input_engine_number = EXCLUDED.input_engine_number,
          input_chassis_number = EXCLUDED.input_chassis_number,
          input_vehicle_type = EXCLUDED.input_vehicle_type,
          verified_owner_name = EXCLUDED.verified_owner_name,
          verified_father_name = EXCLUDED.verified_father_name,
          verified_present_address = EXCLUDED.verified_present_address,
          verified_permanent_address = EXCLUDED.verified_permanent_address,
          verified_mobile_number = EXCLUDED.verified_mobile_number,
          registration_date = EXCLUDED.registration_date,
          registered_at_rto = EXCLUDED.registered_at_rto,
          rc_status = EXCLUDED.rc_status,
          verified_maker_description = EXCLUDED.verified_maker_description,
          verified_maker_model = EXCLUDED.verified_maker_model,
          verified_vehicle_class = EXCLUDED.verified_vehicle_class,
          verified_body_type = EXCLUDED.verified_body_type,
          verified_fuel_type = EXCLUDED.verified_fuel_type,
          verified_color = EXCLUDED.verified_color,
          verified_norms_type = EXCLUDED.verified_norms_type,
          verified_engine_number = EXCLUDED.verified_engine_number,
          verified_chassis_number = EXCLUDED.verified_chassis_number,
          cubic_capacity = EXCLUDED.cubic_capacity,
          no_cylinders = EXCLUDED.no_cylinders,
          unladen_weight = EXCLUDED.unladen_weight,
          vehicle_gross_weight = EXCLUDED.vehicle_gross_weight,
          wheelbase = EXCLUDED.wheelbase,
          manufacturing_date = EXCLUDED.manufacturing_date,
          financer = EXCLUDED.financer,
          fitness_status = EXCLUDED.fitness_status,
          fitness_valid_till = EXCLUDED.fitness_valid_till,
          insurance_status = EXCLUDED.insurance_status,
          insurance_company = EXCLUDED.insurance_company,
          insurance_policy_number = EXCLUDED.insurance_policy_number,
          insurance_valid_till = EXCLUDED.insurance_valid_till,
          puc_status = EXCLUDED.puc_status,
          puc_certificate_number = EXCLUDED.puc_certificate_number,
          puc_valid_till = EXCLUDED.puc_valid_till,
          permit_status = EXCLUDED.permit_status,
          permit_number = EXCLUDED.permit_number,
          permit_type = EXCLUDED.permit_type,
          permit_valid_till = EXCLUDED.permit_valid_till,
          national_permit_number = EXCLUDED.national_permit_number,
          national_permit_valid_till = EXCLUDED.national_permit_valid_till,
          tax_upto = EXCLUDED.tax_upto,
          is_roadworthy = EXCLUDED.is_roadworthy,
          raw_surepass_response = EXCLUDED.raw_surepass_response
        RETURNING id, verification_id, input_vehicle_number, verified_owner_name, is_roadworthy, input_submitted_at;
      `;

      const values = [
        verificationId,                                    // $1
        sanitizeUuid(actorId, null),                       // $2
        consentId,                                         // $3
        input.vehicleNumber,                               // $4
        input.engineNumber || verified.engineNumber || raw.vehicle_engine_number || raw.engine_number || null, // $5
        input.chassisNumber || verified.chassisNumber || raw.vehicle_chasi_number || raw.chassis_number || null, // $6
        input.vehicleType || verified.vehicleClass || raw.vehicle_category_description || raw.vehicle_category || null, // $7
        verified.ownerName || raw.owner_name || null,      // $8
        verified.fatherName || raw.father_name || null,    // $9
        verified.presentAddress || raw.present_address || null, // $10
        verified.permanentAddress || raw.permanent_address || null, // $11
        verified.mobileNumber || raw.mobile_number || null, // $12
        parseSafeDate(verified.registrationDate || raw.registration_date), // $13
        verified.rtoName || raw.registered_at || null,     // $14
        verified.status || raw.rc_status || raw.status || 'ACTIVE', // $15
        verified.makerDescription || raw.maker_description || null, // $16
        verified.makerModel || raw.maker_model || null,    // $17
        verified.vehicleClass || raw.vehicle_category_description || raw.vehicle_category || raw.vehicle_class || null, // $18
        verified.bodyType || raw.body_type || null,        // $19
        verified.fuelType || raw.fuel_type || null,        // $20
        verified.color || raw.color || null,               // $21
        verified.normsType || raw.norms_type || null,      // $22
        verified.engineNumber || raw.vehicle_engine_number || raw.engine_number || null, // $23
        verified.chassisNumber || raw.vehicle_chasi_number || raw.chassis_number || null, // $24
        Number(verified.cubicCapacity ?? raw.cubic_capacity) || null, // $25
        Number(verified.noCylinders ?? raw.no_cylinders) || null, // $26
        Number(verified.unladenWeight ?? raw.unladen_weight) || null, // $27
        Number(verified.vehicleGrossWeight ?? raw.vehicle_gross_weight) || null, // $28
        Number(verified.wheelbase ?? raw.wheelbase) || null, // $29
        parseSafeDate(verified.manufacturingDate || raw.manufacturing_date_formatted || raw.manufacturing_date), // $30
        verified.financer || raw.financer || (raw.financed ? 'FINANCED' : null), // $31
        fitness.status || (raw.fit_up_to ? 'ACTIVE' : 'UNKNOWN'), // $32
        parseSafeDate(fitness.validTill || raw.fit_up_to), // $33
        insurance.status || ((raw.insurance_upto || raw.insurance_up_to) ? 'ACTIVE' : 'UNKNOWN'), // $34
        insurance.company || raw.insurance_company || null, // $35
        insurance.policyNumber || raw.insurance_policy_number || null, // $36
        parseSafeDate(insurance.validTill || raw.insurance_upto || raw.insurance_up_to), // $37
        puc.status || (raw.pucc_upto ? 'ACTIVE' : 'UNKNOWN'), // $38
        puc.certificateNumber || raw.pucc_number || null,  // $39
        parseSafeDate(puc.validTill || raw.pucc_upto),     // $40
        permit.status || ((raw.permit_valid_upto || raw.national_permit_upto) ? 'ACTIVE' : 'UNKNOWN'), // $41
        permit.permitNumber || raw.permit_number || raw.national_permit_number || null, // $42
        permit.type || raw.permit_type || null,            // $43
        parseSafeDate(permit.validTill || raw.permit_valid_upto), // $44
        raw.national_permit_number || null,                // $45
        parseSafeDate(raw.national_permit_upto),           // $46
        parseSafeDate(verified.taxUpto || raw.tax_upto || raw.tax_paid_upto), // $47
        Boolean(verified.isRoadworthy ?? isCompliant),     // $48
        rawResponse ? JSON.stringify(rawResponse) : null,  // $49
      ];

      const { rows } = await query(sql, values);
      return rows[0];
    },

    /**
     * 2. Save RC Document Photo (Converts base64 to BYTEA binary)
     */
    async saveRcDocument({
      rcVerificationId,
      actorId,
      documentSide = 'FRONT',
      originalFilename = 'rc_document.jpg',
      mimeType = 'image/jpeg',
      fileBase64 = null,
      sha256Checksum = '0000000000000000000000000000000000000000000000000000000000000000',
      ocrExtractedData = null,
      ocrConfidence = null,
    }) {
      let fileBuffer = null;
      let fileSizeBytes = 0;
      if (fileBase64) {
        const cleanB64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
        fileBuffer = Buffer.from(cleanB64, 'base64');
        fileSizeBytes = fileBuffer.length;
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safeActorId = (actorId && uuidRegex.test(actorId)) ? actorId : randomUUID();

      const sql = `
        INSERT INTO kyc.rc_documents (
          rc_verification_id, actor_id, document_side, original_filename,
          mime_type, file_size_bytes, sha256_checksum, storage_type, file_data,
          ocr_extracted_data, ocr_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, rc_verification_id, original_filename, file_size_bytes, sha256_checksum, created_at;
      `;

      const { rows } = await query(sql, [
        rcVerificationId || null,
        safeActorId,
        documentSide,
        originalFilename,
        mimeType,
        fileSizeBytes,
        sha256Checksum,
        'DATABASE_BLOB',
        fileBuffer,
        ocrExtractedData ? JSON.stringify(ocrExtractedData) : null,
        ocrConfidence || null,
      ]);

      return rows[0];
    },

    /**
     * 3. Fetch RC Details with attached photos
     */
    async getRcByVerificationId(verificationId) {
      const sql = `
        SELECT rc.*, json_agg(doc.*) FILTER (WHERE doc.id IS NOT NULL) AS documents
        FROM kyc.rc_verifications rc
        LEFT JOIN kyc.rc_documents doc ON doc.rc_verification_id = rc.id
        WHERE rc.verification_id = $1
        GROUP BY rc.id;
      `;
      const { rows } = await query(sql, [verificationId]);
      return rows[0] || null;
    },

    /**
     * 4. Fetch most recent RC Details by Vehicle Number
     */
    async getRcByVehicleNumber(vehicleNumber) {
      const sql = `
        SELECT rc.*, json_agg(doc.*) FILTER (WHERE doc.id IS NOT NULL) AS documents
        FROM kyc.rc_verifications rc
        LEFT JOIN kyc.rc_documents doc ON doc.rc_verification_id = rc.id
        WHERE rc.input_vehicle_number = $1
        GROUP BY rc.id
        ORDER BY rc.input_submitted_at DESC
        LIMIT 1;
      `;
      const { rows } = await query(sql, [vehicleNumber]);
      return rows[0] || null;
    },
  };
}
