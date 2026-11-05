import { randomUUID } from 'node:crypto';

/**
 * KYC Repository
 * Manages database operations for KYC verification caching and audit logs.
 */
export function createKycRepository(db) {
  const query = (sql, params) => db.pool.query(sql, params);

  return {
    /**
     * Check if a document was successfully verified recently (default 30 days)
     * Returning cached records saves ₹15 per call!
     */
    async findRecentVerification(verificationType, idNumber, maxAgeDays = 30) {
      const sql = `
        SELECT id, verification_type, id_number, status, provider, response_data, raw_provider_response, consent_id, created_at
        FROM kyc.verifications
        WHERE verification_type = $1
          AND id_number = $2
          AND status = 'verified'
          AND created_at >= NOW() - ($3 || ' days')::INTERVAL
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      const { rows } = await query(sql, [verificationType, idNumber, maxAgeDays.toString()]);
      return rows[0] || null;
    },

    /**
     * Record an immutable user consent artifact under DPDP Act 2023
     */
    async recordConsent({ actorId, consentType, purpose, noticeVersion, noticeText, ipAddress, userAgent }) {
      const sql = `
        INSERT INTO kyc.consents (
          actor_id, consent_type, purpose, notice_version, notice_text, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, actor_id, consent_type, purpose, notice_version, notice_text, ip_address, user_agent, status, granted_at, revoked_at;
      `;
      const { rows } = await query(sql, [
        actorId || null,
        consentType,
        purpose || 'IDENTITY_AND_COMPLIANCE_VERIFICATION',
        noticeVersion,
        noticeText || 'Standard platform compliance consent',
        ipAddress || '0.0.0.0',
        userAgent || null,
      ]);
      return rows[0] || {
        id: randomUUID(),
        actor_id: actorId || null,
        consent_type: consentType,
        purpose: purpose || 'IDENTITY_AND_COMPLIANCE_VERIFICATION',
        notice_version: noticeVersion,
        notice_text: noticeText || 'Standard platform compliance consent',
        ip_address: ipAddress || '0.0.0.0',
        user_agent: userAgent || null,
        status: 'GRANTED',
        granted_at: new Date().toISOString(),
        revoked_at: null,
      };
    },

    /**
     * Fetch consent artifact by ID
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
      let sql = `
        UPDATE kyc.consents
        SET status = 'REVOKED', revoked_at = clock_timestamp()
        WHERE id = $1 AND status = 'GRANTED'
      `;
      const params = [consentId];
      if (actorId) {
        sql += ` AND actor_id = $2`;
        params.push(actorId);
      }
      sql += ` RETURNING id, status, revoked_at;`;
      const { rows } = await query(sql, params);
      return rows[0] || null;
    },

    /**
     * Clear cached verifications (for a specific ID or all)
     */
    async clearCache(verificationType, idNumber) {
      if (verificationType && idNumber) {
        await query('DELETE FROM kyc.verifications WHERE verification_type = $1 AND id_number = $2', [verificationType, idNumber]);
      } else if (verificationType) {
        await query('DELETE FROM kyc.verifications WHERE verification_type = $1', [verificationType]);
      } else {
        await query('DELETE FROM kyc.verifications');
      }
    },

    /**
     * Store new verification result with linked consent_id
     */
    async saveVerification({ verificationType, idNumber, status, provider, responseData, rawResponse, actorId, consentId }) {
      const sql = `
        INSERT INTO kyc.verifications (
          verification_type, id_number, status, provider, response_data, raw_provider_response, actor_id, consent_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, verification_type, id_number, status, provider, response_data, consent_id, created_at;
      `;
      const { rows } = await query(sql, [
        verificationType,
        idNumber,
        status,
        provider,
        JSON.stringify(responseData || {}),
        rawResponse ? JSON.stringify(rawResponse) : null,
        actorId || null,
        consentId || null,
      ]);
      return rows[0];
    },

    /**
     * Log external API request & cost audit
     */
    async logApiCall({ provider, endpoint, httpStatus, costEstimate, requestPayload, responsePayload }) {
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
          costEstimate || 0.00,
          requestPayload ? JSON.stringify(requestPayload) : null,
          responsePayload ? JSON.stringify(responsePayload) : null,
        ]);
      } catch (err) {
        // Logging error should not fail the main user verification
        console.error('[KycRepository] Failed to log API audit:', err.message);
      }
    },

    /**
     * Fetch verification history by ID
     */
    async getHistory(verificationType, idNumber) {
      const sql = `
        SELECT id, verification_type, id_number, status, provider, response_data, consent_id, created_at
        FROM kyc.verifications
        WHERE verification_type = $1 AND id_number = $2
        ORDER BY created_at DESC;
      `;
      const { rows } = await query(sql, [verificationType, idNumber]);
      return rows;
    },
  };
}

