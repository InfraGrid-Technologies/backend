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
        SELECT id, verification_type, id_number, status, provider, response_data, raw_provider_response, created_at
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
     * Store new verification result
     */
    async saveVerification({ verificationType, idNumber, status, provider, responseData, rawResponse, actorId }) {
      const sql = `
        INSERT INTO kyc.verifications (
          verification_type, id_number, status, provider, response_data, raw_provider_response, actor_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, verification_type, id_number, status, provider, response_data, created_at;
      `;
      const { rows } = await query(sql, [
        verificationType,
        idNumber,
        status,
        provider,
        JSON.stringify(responseData || {}),
        rawResponse ? JSON.stringify(rawResponse) : null,
        actorId || null,
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
        SELECT id, verification_type, id_number, status, provider, response_data, created_at
        FROM kyc.verifications
        WHERE verification_type = $1 AND id_number = $2
        ORDER BY created_at DESC;
      `;
      const { rows } = await query(sql, [verificationType, idNumber]);
      return rows;
    },
  };
}

