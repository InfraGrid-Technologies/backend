 1. Suresh's Mobile App sends HTTP POST to:
    http://localhost:3100/v1/kyc/rc
                          │
                          ▼
 2. Fastify Router (rc.routes.js)
    • Fastify hears the knock on door '/rc'.
    • Before letting Suresh in, Fastify calls The Security Bouncer (Schema).
                          │
                          ▼
 3. The Bouncer (rc.schema.js)
    • Checks: Does "TS16FD7966" match Indian vehicle registration regex? (Yes).
    • Checks: Did Suresh check the DPDP consent box? (Yes).
    • [If Suresh typed "1234XYZ", Fastify stops right here with 400 Bad Request!
       No ₹15 spent on Surepass, no database touched].
                          │
                          ▼
 4. The Waiter (rc.controller.js)
    • Grabs Suresh's IP address (`request.ip`) and device info (`userAgent`).
    • Hands the order to the Chef: `service.verify(request.body, actorId, clientMeta)`.
                          │
                          ▼
 5. The Conductor (rc.service.js)
    • Step 5a: Calls `repo.recordConsent()` ➔ Saves Suresh's consent in PostgreSQL (`kyc.consents`).
    • Step 5b: Cleans the string: `"TS 16 FD 7966"` ➔ `"TS16FD7966"`.
    • Step 5c: Calls `provider.verifyRc()` ➔ Surepass queries Government Vahan database.
    • Step 5d: Calls The Rulebook (`rc.compliance.js`):
        - Check 1: Is Registration ACTIVE? (Yes)
        - Check 2: Is Commercial Fitness unexpired? (Yes)
        - Check 3: Is Pollution (PUC) unexpired? (Yes)
        - Check 4: Is Insurance policy unexpired?
          * If Insurance expired last week ➔ `verificationStatus = 'REJECTED'`
            (Violation: "Vehicle insurance policy expired on 2026-11-03").
          * If All 4 are unexpired ➔ `verificationStatus = 'VERIFIED'`.
    • Step 5e: Calls `repo.logApiCall()` ➔ Records ₹15 spent (`kyc.api_logs`).
    • Step 5f: Calls `repo.saveVerification()` ➔ Saves the full vehicle report in PostgreSQL (`kyc.verifications`).
    • Returns the clean result object back to the Controller.
                          │
                          ▼
 6. The Waiter (rc.controller.js)
    • Receives the result from the Service.
    • Sends `reply.code(200).send(result)`.
                          │
                          ▼
 7. Suresh's Mobile App receives:
    { "success": true, "verificationStatus": "VERIFIED", "isVerified": true }
    ➔ Screen displays: 🟢 "Vehicle Verified & Ready for Rental!"