 1. Ramesh's Mobile App sends HTTP POST to:
    http://localhost:3100/v1/kyc/driving-license
                          │
                          ▼
 2. Fastify Router (dl.routes.js)
    • Fastify hears the knock on door '/driving-license'.
    • Before letting Ramesh in, Fastify calls The Security Bouncer (Schema).
                          │
                          ▼
 3. The Bouncer (dl.schemas.js)
    • Checks: Did Ramesh provide a valid date format (YYYY-MM-DD)? Yes.
    • Checks: Did Ramesh check the DPDP consent box? Yes.
    • [If Ramesh entered garbage, Fastify stops right here with 400 Bad Request!
       No money is spent on Surepass, no database is touched].
                          │
                          ▼
 4. The Waiter (dl.controller.js)
    • Grabs Ramesh's IP address (`request.ip`) and device info (`userAgent`).
    • Hands the order to the Chef: `service.verify(request.body, actorId, clientMeta)`.
                          │
                          ▼
 5. The Conductor (dl.service.js)
    • Step 5a: Calls `repo.recordConsent()` ➔ Saves Ramesh's consent in PostgreSQL (`kyc.consents`).
    • Step 5b: Cleans the string: `"TS 01-2024"` ➔ `"TS012024"`.
    • Step 5c: Calls `provider.verifyDrivingLicense()` ➔ Surepass talks to the Government RTO.
    • Step 5d: Calls The Rulebook (`dl.compliance.js`):
        - Check 1: Is license ACTIVE? (Yes)
        - Check 2: Is it unexpired? (Yes)
        - Check 3: Does it have commercial heavy machinery endorsement (CRANE, EXCAVATOR)?
          * If Ramesh only has a car (LMV) license ➔ `verificationStatus = 'REJECTED'`.
          * If Ramesh has `CRANE` endorsement ➔ `verificationStatus = 'VERIFIED'`.
    • Step 5e: Calls `repo.logApiCall()` ➔ Records that ₹15 Surepass credits were spent (`kyc.api_logs`).
    • Step 5f: Calls `repo.saveVerification()` ➔ Saves the full report in PostgreSQL (`kyc.verifications`).
    • Returns the clean result object back to the Controller.
                          │
                          ▼
 6. The Waiter (dl.controller.js)
    • Receives the result from the Service.
    • Sends `reply.code(200).send(result)`.
                          │
                          ▼
 7. Ramesh's Mobile App receives:
    { "success": true, "verificationStatus": "VERIFIED", "isVerified": true }
    ➔ Screen displays: 🟢 "Verified Heavy Machinery Operator"!