import { randomUUID } from "node:crypto";
import { createVehicleRcRepository } from "./vehicle-rc/rc.repository.js";
import { createDrivingLicenseRepository } from "./driving-license/dl.repository.js";
import { createChallanRepository } from "./challan/challan.repository.js";
import { createAadhaarRepository } from "./aadhaar/aadhaar.repository.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Universal UUID Sanitizer
 * Ensures invalid client tokens (e.g. 'usr-mobile-driver-001') do not crash PostgreSQL UUID columns.
 */
export function sanitizeUuid(id, fallback = null) {
  if (typeof id === 'string' && UUID_REGEX.test(id.trim())) {
    return id.trim();
  }
  return fallback;
}

/**
 * Master KYC Repository
 * Manages umbrella verification ledgers (kyc.verifications), DPDP consents, and vendor audits.
 * Composes domain-specific segregated repositories for RC, DL, Challan, and Aadhaar.
 */
export function createKycRepository(db) {
  const query = (sql, params) => db.pool.query(sql, params);

  // Segregated Domain Sub-Repositories
  const rc = createVehicleRcRepository(db);
  const dl = createDrivingLicenseRepository(db);
  const challan = createChallanRepository(db);
  const aadhaar = createAadhaarRepository(db);

  return {
    // Domain Repositories
    rc,
    dl,
    challan,
    aadhaar,

    /**
     * Record an immutable user consent artifact under DPDP Act 2023
     */
    async recordConsent({
      actorId,
      consentType,
      purpose,
      noticeVersion,
      noticeText,
      ipAddress,
      userAgent,
    }) {
      const safeActorId = sanitizeUuid(actorId, null);
      const sql = `
        INSERT INTO kyc.consents (
          actor_id, consent_type, purpose, notice_version, notice_text, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, actor_id, consent_type, purpose, notice_version, notice_text, ip_address, user_agent, status, granted_at, revoked_at;
      `;
      const { rows } = await query(sql, [
        safeActorId,
        consentType,
        purpose || "IDENTITY_AND_COMPLIANCE_VERIFICATION",
        noticeVersion,
        noticeText || "Standard platform compliance consent",
        ipAddress || "0.0.0.0",
        userAgent || null,
      ]);
      return (
        rows[0] || {
          id: randomUUID(),
          actor_id: safeActorId,
          consent_type: consentType,
          purpose: purpose || "IDENTITY_AND_COMPLIANCE_VERIFICATION",
          notice_version: noticeVersion,
          notice_text: noticeText || "Standard platform compliance consent",
          ip_address: ipAddress || "0.0.0.0",
          user_agent: userAgent || null,
          status: "GRANTED",
          granted_at: new Date().toISOString(),
          revoked_at: null,
        }
      );
    },

    /**
     * Fetch consent artifact by ID (Audit inspection)
     */
    async getConsentById(consentId) {
      const sql = `
        SELECT id, actor_id, consent_type, purpose, notice_version, notice_text, ip_address, user_agent, status, granted_at, revoked_at
        FROM kyc.consents
        WHERE id = $1;
      `;
      const { rows } = await query(sql, [consentId]);
      return rows[0] || null;
    },

    /**
     * Revoke user consent under DPDP Act 2023 Section 6(4)
     */
    async revokeConsent(consentId, actorId = null) {
      const safeActorId = sanitizeUuid(actorId, null);
      let sql = `
        UPDATE kyc.consents
        SET status = 'REVOKED', revoked_at = clock_timestamp()
        WHERE id = $1 AND status = 'GRANTED'
      `;
      const params = [consentId];
      if (safeActorId) {
        sql += ` AND actor_id = $2`;
        params.push(safeActorId);
      }
      sql += ` RETURNING id, status, revoked_at;`;
      const { rows } = await query(sql, params);
      return rows[0] || null;
    },

    /**
     * Store new verification result in master umbrella table (kyc.verifications)
     * Preserves 100% of existing columns while accepting new audit metadata
     */
    async saveVerification({
      verificationType,
      idNumber,
      status,
      isAuthentic = false,
      isCompliant = false,
      provider,
      responseData,
      rawResponse,
      actorId,
      consentId,
      costInr = 0.0,
      rejectionReasons = [],
      ipAddress = "0.0.0.0",
      userAgent = null,
    }) {
      const safeActorId = sanitizeUuid(actorId, null);
      const sql = `
        INSERT INTO kyc.verifications (
          verification_type, id_number, status, is_authentic, is_compliant, provider,
          response_data, raw_provider_response, actor_id, consent_id,
          cost_inr, rejection_reasons, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, verification_type, id_number, status, is_authentic, is_compliant, provider, response_data, consent_id, cost_inr, rejection_reasons, ip_address, user_agent, created_at;
      `;
      const { rows } = await query(sql, [
        verificationType,
        idNumber,
        status,
        Boolean(isAuthentic),
        Boolean(isCompliant),
        provider,
        JSON.stringify(responseData || {}),
        rawResponse ? JSON.stringify(rawResponse) : null,
        safeActorId,
        consentId || null,
        Number(costInr || 0.0),
        rejectionReasons || [],
        ipAddress || "0.0.0.0",
        userAgent || null,
      ]);
      return rows[0];
    },

    /**
     * Log external API request & cost audit
     */
    async logApiCall({
      provider,
      endpoint,
      httpStatus,
      costEstimate,
      requestPayload,
      responsePayload,
    }) {
      const sql = `
        INSERT INTO kyc.api_logs (
          provider, endpoint, http_status, cost_estimate, request_payload, response_payload
        ) VALUES ($1, $2, $3, $4, $5, $6);
      `;
      try {
        await query(sql, [
          provider,
          endpoint,
          httpStatus || 200,
          costEstimate || 0.0,
          requestPayload ? JSON.stringify(requestPayload) : null,
          responsePayload ? JSON.stringify(responsePayload) : null,
        ]);
      } catch (err) {
        console.error("[KycRepository] Failed to log API audit:", err.message);
      }
    },

    /**
     * Find recent verification from cache (within maxAgeDays, defaults to 30 days)
     */
    async findRecentVerification(verificationType, idNumber, maxAgeDays = 30) {
      const sql = `
        SELECT id, verification_type, id_number, status, is_authentic, is_compliant, provider, response_data, rejection_reasons, consent_id, created_at
        FROM kyc.verifications
        WHERE verification_type = $1 AND id_number = $2 AND created_at >= NOW() - ($3 || ' days')::INTERVAL
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      try {
        const { rows } = await query(sql, [verificationType, idNumber, maxAgeDays]);
        return rows[0] || null;
      } catch {
        return null;
      }
    },

    /**
     * Fetch verification history by ID
     */
    async getHistory(verificationType, idNumber) {
      const sql = `
        SELECT id, verification_type, id_number, status, is_authentic, is_compliant, provider, response_data, consent_id, cost_inr, created_at
        FROM kyc.verifications
        WHERE verification_type = $1 AND id_number = $2
        ORDER BY created_at DESC;
      `;
      const { rows } = await query(sql, [verificationType, idNumber]);
      return rows;
    },

    /**
     * Fetch active COV codes authorized for heavy machinery from PostgreSQL
     */
    async getHeavyEquipmentCovCodes() {
      const sql = `
        SELECT code 
        FROM kyc.cov_categories 
        WHERE is_heavy_equipment = true AND is_active = true;
      `;
      try {
        const { rows } = await query(sql);
        return rows.map((r) => r.code.toUpperCase());
      } catch (err) {
        console.error(
          "[KycRepository] Failed to fetch COV categories, using fallback:",
          err.message,
        );
        return [];
      }
    },

    /**
     * Fetch active RC vehicle categories & COV codes from PostgreSQL kyc.rc_vehicle_categories
     */
    async getRcVehicleCategories() {
      const sql = `
        SELECT id, name, cov_code as "covCode", cov_description as "covDescription", display_order as "displayOrder"
        FROM kyc.rc_vehicle_categories
        WHERE is_active = true
        ORDER BY display_order ASC;
      `;
      try {
        const { rows } = await query(sql);
        if (rows && rows.length > 0) return rows;
      } catch (err) {
        // Fallback if DB table not yet migrated
      }
      return [
        { id: 'mini-excavator', name: 'Mini Excavator', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle' },
        { id: 'small-excavator', name: 'Small Excavator', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle' },
        { id: 'medium-excavator', name: 'Medium Excavator', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle' },
        { id: 'backhoe', name: 'Backhoe (JCB 3DX)', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle' },
        { id: 'wheel-loader', name: 'Wheel Loader', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle' },
        { id: 'hydra-crane', name: 'Hydra Crane', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle / Mobile Crane' },
        { id: 'self-loading-mixer', name: 'Self-Loading Mixer', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle' },
        { id: 'concrete-pump', name: 'Concrete Pump', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle' },
        { id: 'soil-compactor', name: 'Soil Compactor', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle / Road Roller' },
        { id: 'tandem-roller', name: 'Tandem Roller', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle / Road Roller' },
        { id: 'pneumatic-roller', name: 'Pneumatic Roller', covCode: 'CEV', covDescription: 'Construction Equipment Vehicle / Road Roller' },
        { id: 'tipper', name: 'Tipper Dump Truck', covCode: 'HGV / HGMV', covDescription: 'Heavy Goods Commercial Vehicle (HGV/HGMV)' },
        { id: 'transit-mixer', name: 'Transit Mixer', covCode: 'HGV / CEV', covDescription: 'Heavy Commercial Goods Vehicle (HGV/CEV)' },
      ];
    },
  };
}
