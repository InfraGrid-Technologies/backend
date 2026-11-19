/**
 * Aadhaar Compliance Engine
 * Evaluates DigiLocker Aadhaar verification:
 * 1. DigiLocker session status must be COMPLETED
 * 2. Authenticated via official DigiLocker gateway
 * 3. User full name present
 * 4. User is an adult (Age >= 18)
 */

export function evaluateAadhaarCompliance(
  aadhaarData,
  minAge = 18,
  referenceDateIso = new Date().toISOString().slice(0, 10),
) {
  if (!aadhaarData) {
    return {
      isAadhaarVerified: false,
      verifiedBadge: false,
      status: "INCOMPLETED",
      checks: {
        sessionCompleted: false,
        digilockerAuthenticated: false,
        namePresent: false,
        isAdult: false,
      },
      violations: ["Aadhaar session data is missing or incomplete."],
    };
  }

  const violations = [];

  // Check 1: DigiLocker Session Status
  const isCompleted = (aadhaarData.status || "").toUpperCase() === "COMPLETED";
  if (!isCompleted) {
    violations.push(
      `DigiLocker verification status is ${aadhaarData.status || "PENDING"} (user has not completed OTP consent).`,
    );
  }
  // Check 2: DigiLocker Authentication Gateway
  const isDigilockerVerified = Boolean(aadhaarData.digilockerVerified);
  if (!isDigilockerVerified) {
    violations.push(
      "Aadhaar XML was not verified through the official DigiLocker gateway.",
    );
  }
  // Check 3: Full Name Extraction
  const namePresent = Boolean(
    aadhaarData.name && aadhaarData.name.trim().length > 0,
  );
  if (!namePresent) {
    violations.push(
      "User full name could not be extracted from Aadhaar records.",
    );
  }
  // Check 4: Masked Aadhaar (e.g. XXXX-XXXX-1234)
  const maskedAadhaarPresent = Boolean(
    aadhaarData.maskedAadhaar && aadhaarData.maskedAadhaar.length >= 4,
  );
  if (!maskedAadhaarPresent) {
    violations.push("Masked Aadhaar number was not provided.");
  }
  // Check 5: Age Verification (Must be >= 18)
  let isAdult = false;
  let age = null;
  if (aadhaarData.dob) {
    const birthYear = parseInt(aadhaarData.dob.slice(0, 4), 10);
    const currentYear = parseInt(referenceDateIso.slice(0, 4), 10);
    if (!isNaN(birthYear) && !isNaN(currentYear)) {
      age = currentYear - birthYear;
      isAdult = age >= minAge;
    }
  }
  if (aadhaarData.dob && !isAdult) {
    violations.push(
      `User does not meet the minimum age of ${minAge} years (age: ${age ?? "unknown"}).`,
    );
  }

  const isAdultCheck = aadhaarData.dob ? isAdult : true;
  const isAadhaarVerified =
    isCompleted && isDigilockerVerified && namePresent && maskedAadhaarPresent && isAdultCheck;

  return {
    isAadhaarVerified,
    status: isAadhaarVerified ? "VERIFIED" : ((aadhaarData.status || '').toUpperCase() === 'PENDING' ? 'PENDING' : 'REJECTED'),
    verifiedBadge: isAadhaarVerified,
    checks: {
      sessionCompleted: isCompleted,
      digilockerAuthenticated: isDigilockerVerified,
      namePresent,
      maskedAadhaarPresent,
      isAdult,
    },
    age,
    violations,
    evaluatedAt: referenceDateIso,
  };
}
