/**
 * Safe ISO Date parser for PostgreSQL TIMESTAMPTZ / DATE columns
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
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
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
 * Vehicle E-Challan Repository
 * Dedicated data access layer for kyc.challan_verifications and kyc.challan_tickets
 * Adheres strictly to the single-responsibility principle (< 130 lines)
 */
export function createChallanRepository(db) {
  const query = (sql, params) => db.pool.query(sql, params);

  return {
    /**
     * 1. Save summary challan verification details + auto-insert violation tickets
     */
    async saveChallanDetails({
      verificationId,
      actorId,
      consentId,
      input = {},
      verified = {},
      rawResponse = null,
      verificationStatus = 'VERIFIED',
      isCompliant = true,
      costInr = 15.0,
    }) {
      const raw = rawResponse?.data || rawResponse || {};
      const challanDetails = raw.challan_details || {};
      const rawChallans = Array.isArray(challanDetails.challans)
        ? challanDetails.challans
        : (Array.isArray(raw.challans) ? raw.challans : []);
      const tickets = (verified.challans && verified.challans.length > 0) ? verified.challans : rawChallans;

      const totalChallans = Number(verified.totalChallans ?? raw.total_challans ?? tickets.length ?? 0);
      const pendingCount = Number(verified.pendingChallansCount ?? raw.pending_challans_count ?? tickets.filter(t => (t.status || t.challan_status || '').toUpperCase() === 'PENDING').length ?? 0);
      const disposedCount = Math.max(0, totalChallans - pendingCount);
      const pendingAmount = Number(verified.totalPendingAmount ?? raw.total_pending_amount ?? tickets.filter(t => (t.status || t.challan_status || '').toUpperCase() === 'PENDING').reduce((sum, t) => sum + (Number(t.amount || t.challan_amount) || 0), 0));
      const hasPending = pendingCount > 0;
      const mostRecentDate = parseSafeDate(verified.mostRecentChallanDate || raw.most_recent_challan_date || tickets[0]?.challanDate || tickets[0]?.challan_date);

      const sql = `
        INSERT INTO kyc.challan_verifications (
          verification_id, actor_id, consent_id,
          input_rc_number, input_chassis_number, input_engine_number, input_queried_portals,
          vendor_client_id, total_challans, pending_challans_count, disposed_challans_count,
          total_pending_amount, total_disposed_amount, has_pending_challans, is_traffic_compliant,
          most_recent_challan_date, queried_portals_status,
          verification_status, cost_inr, raw_surepass_response
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17,
          $18, $19, $20
        )
        ON CONFLICT (verification_id) DO UPDATE SET
          input_rc_number = EXCLUDED.input_rc_number,
          input_chassis_number = EXCLUDED.input_chassis_number,
          input_engine_number = EXCLUDED.input_engine_number,
          input_queried_portals = EXCLUDED.input_queried_portals,
          vendor_client_id = EXCLUDED.vendor_client_id,
          total_challans = EXCLUDED.total_challans,
          pending_challans_count = EXCLUDED.pending_challans_count,
          disposed_challans_count = EXCLUDED.disposed_challans_count,
          total_pending_amount = EXCLUDED.total_pending_amount,
          total_disposed_amount = EXCLUDED.total_disposed_amount,
          has_pending_challans = EXCLUDED.has_pending_challans,
          is_traffic_compliant = EXCLUDED.is_traffic_compliant,
          most_recent_challan_date = EXCLUDED.most_recent_challan_date,
          queried_portals_status = EXCLUDED.queried_portals_status,
          verification_status = EXCLUDED.verification_status,
          cost_inr = EXCLUDED.cost_inr,
          raw_surepass_response = EXCLUDED.raw_surepass_response
        RETURNING id, verification_id, input_rc_number, total_challans, pending_challans_count, total_pending_amount, is_traffic_compliant, input_submitted_at;
      `;

      const values = [
        verificationId,                                                     // $1
        sanitizeUuid(actorId, null),                                        // $2
        consentId,                                                          // $3
        input.rcNumber,                                                     // $4
        input.chassisNumber || raw.chassis_number || null,                  // $5
        input.engineNumber || raw.engine_number || null,                    // $6
        input.queriedPortals || ['DL', 'TS', 'GJ'],                         // $7
        verified.clientId || raw.client_id || null,                         // $8
        totalChallans,                                                      // $9
        pendingCount,                                                       // $10
        disposedCount,                                                      // $11
        pendingAmount,                                                      // $12
        Number(verified.totalDisposedAmount || raw.total_disposed_amount || 0.0), // $13
        hasPending,                                                         // $14
        Boolean(isCompliant ?? !hasPending),                                // $15
        mostRecentDate,                                                     // $16
        JSON.stringify(verified.queriedPortalsStatus || raw.state_portal_status || {}), // $17
        verificationStatus || 'PENDING',                                    // $18
        Number(costInr || 15.0),                                            // $19
        rawResponse ? JSON.stringify(rawResponse) : null,                   // $20
      ];

      const { rows } = await query(sql, values);
      const insertedRow = rows[0];

      // Save individual violation tickets if any are present
      if (insertedRow && tickets.length > 0) {
        await this.saveChallanTickets(insertedRow.id, tickets);
      }

      return insertedRow;
    },

    /**
     * 2. Save individual violation ticket records linked to challan_verification_id
     */
    async saveChallanTickets(challanVerificationId, tickets = []) {
      if (!tickets || tickets.length === 0) return [];
      const inserted = [];
      const sql = `
        INSERT INTO kyc.challan_tickets (
          challan_verification_id, challan_number, offense_details,
          challan_place, challan_date, state, amount,
          status, payment_date, transaction_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, challan_number, amount, status;
      `;

      for (const t of tickets) {
        const { rows } = await query(sql, [
          challanVerificationId,
          String(t.challanNumber || t.challan_number || t.number || `TICKET-${Date.now()}`),
          String(t.offenseDetails || t.offense_details || t.offense || 'Traffic violation'),
          t.challanPlace || t.challan_place || null,
          parseSafeDate(t.challanDate || t.challan_date),
          t.state || null,
          Number(t.amount || t.challan_amount || 0.0),
          (t.status || t.challan_status || 'PENDING').toUpperCase(),
          parseSafeDate(t.paymentDate || t.payment_date),
          t.transactionId || t.transaction_id || null,
        ]);
        if (rows[0]) inserted.push(rows[0]);
      }
      return inserted;
    },

    /**
     * 3. Fetch Challan Details with violation tickets by verification_id
     */
    async getChallansByVerificationId(verificationId) {
      const sql = `
        SELECT c.*, json_agg(t.*) FILTER (WHERE t.id IS NOT NULL) AS tickets
        FROM kyc.challan_verifications c
        LEFT JOIN kyc.challan_tickets t ON t.challan_verification_id = c.id
        WHERE c.verification_id = $1
        GROUP BY c.id;
      `;
      const { rows } = await query(sql, [verificationId]);
      return rows[0] || null;
    },

    /**
     * 4. Fetch most recent Challan Details by Vehicle RC Number
     */
    async getChallansByRcNumber(rcNumber) {
      const sql = `
        SELECT c.*, json_agg(t.*) FILTER (WHERE t.id IS NOT NULL) AS tickets
        FROM kyc.challan_verifications c
        LEFT JOIN kyc.challan_tickets t ON t.challan_verification_id = c.id
        WHERE c.input_rc_number = $1
        GROUP BY c.id
        ORDER BY c.input_submitted_at DESC
        LIMIT 1;
      `;
      const { rows } = await query(sql, [rcNumber]);
      return rows[0] || null;
    },
  };
}

