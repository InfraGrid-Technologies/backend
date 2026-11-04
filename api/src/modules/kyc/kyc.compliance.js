/**
 * KYC Compliance Engine
 * Evaluates business compliance rules for Equipment Rental:
 * 1. Vehicle RC Compliance: Active registration + Unexpired Fitness + Unexpired PUC + Unexpired Insurance.
 * 2. Driver License Compliance: Genuine RTO status + Unexpired license + Heavy Equipment Authorization (HGMV, TRANS, HMV, CRANE, EXCAVATOR, etc.).
 */

// Recognized Indian Parivahan COV (Class of Vehicle) codes for commercial heavy machinery
export const HEAVY_EQUIPMENT_COV_CODES = new Set([
  'TRANS',                  // Transport Commercial Vehicle (Standard commercial endorsement)
  'TRANS-HV',               // Transport Heavy Vehicle
  'HGMV',                   // Heavy Goods Motor Vehicle (Tippers, Dumpers, Multi-axle trucks)
  'HMV',                    // Heavy Motor Vehicle
  'HTV',                    // Heavy Transport Vehicle
  'HPMV',                   // Heavy Passenger Motor Vehicle
  'MGV',                    // Medium Goods Vehicle
  'MMV',                    // Medium Motor Vehicle
  'CHGVA',                  // Commercial Heavy Goods Vehicle
  'CRANE',                  // Mobile / Tower Cranes
  'EXCAVATOR',              // Excavators / Earthmovers / Backhoe Loaders
  'LOADER',                 // Heavy Loaders
  'FORKLIFT',               // Industrial Forklifts
  'ROAD_ROLLER',            // Road Rollers / Compactors
  'CONSTRUCTION_EQUIPMENT', // Construction Equipment Vehicles (CEV)
  'CONSTRN',                // Construction Equipment abbreviation
  'CEV',                    // Construction Equipment Vehicle code
  'TRACTOR',                // Commercial Tractors / Haulers
]);

// Keywords in COV descriptions indicating heavy/commercial equipment
const HEAVY_KEYWORDS = [
  'HEAVY',
  'TRANSPORT',
  'GOODS',
  'CRANE',
  'EXCAVATOR',
  'CONSTRUCTION',
  'LOADER',
  'TRUCK',
  'TIPPER',
  'TRAILER',
  'DUMPER',
  'EARTHMOV',
];

/**
 * Robust date parser handling YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, and ISO strings.
 * Returns standard YYYY-MM-DD or null if invalid.
 */
export function parseDateToIso(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s || s === 'NA' || s === 'null' || s === 'UNKNOWN') return null;

  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  // DD-MM-YYYY or DD/MM/YYYY format
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Checks if a date string represents an unexpired date relative to reference date.
 */
export function isDateNotExpired(dateStr, referenceDateIso = new Date().toISOString().slice(0, 10)) {
  const iso = parseDateToIso(dateStr);
  if (!iso) return false;
  return iso >= referenceDateIso;
}

/**
 * Evaluates Vehicle RC Compliance
 * Requires ALL 4 criteria to pass:
 * 1. Active RTO registration
 * 2. Unexpired Commercial Fitness certificate
 * 3. Unexpired Pollution (PUC) certificate
 * 4. Unexpired Insurance policy
 *
 * @param {object} rcData
 * @param {string} [referenceDateIso] - ISO date for testing / evaluation (defaults to today)
 * @returns {object} Detailed compliance verdict
 */
export function evaluateVehicleCompliance(rcData, referenceDateIso = new Date().toISOString().slice(0, 10)) {
  if (!rcData) {
    return {
      isFullyCompliant: false,
      status: 'NON_COMPLIANT',
      verifiedBadge: false,
      checks: { registrationActive: false, fitnessValid: false, pucValid: false, insuranceValid: false },
      expiries: { fitness: null, puc: null, insurance: null },
      violations: ['No vehicle data available for compliance check.'],
      evaluatedAt: referenceDateIso,
    };
  }

  const violations = [];

  // 1. Check Registration Status
  const statusStr = (rcData.status || '').toUpperCase();
  const registrationActive = statusStr === 'ACTIVE' || statusStr === 'REGISTERED';
  if (!registrationActive) {
    violations.push(`Vehicle registration status is ${statusStr || 'UNKNOWN'} (must be ACTIVE).`);
  }

  // 2. Check Fitness Validity
  const fitnessDateIso = parseDateToIso(rcData.fitness?.validTill);
  const fitnessValid = Boolean(fitnessDateIso && fitnessDateIso >= referenceDateIso);
  if (!fitnessValid) {
    violations.push(
      fitnessDateIso
        ? `Commercial fitness certificate expired on ${fitnessDateIso}.`
        : 'Commercial fitness certificate is missing or unverified.'
    );
  }

  // 3. Check PUC Validity
  const pucDateIso = parseDateToIso(rcData.puc?.validTill);
  const pucValid = Boolean(pucDateIso && pucDateIso >= referenceDateIso);
  if (!pucValid) {
    violations.push(
      pucDateIso
        ? `Pollution (PUC) certificate expired on ${pucDateIso}.`
        : 'Pollution (PUC) certificate is missing or unverified.'
    );
  }

  // 4. Check Insurance Validity
  const insuranceDateIso = parseDateToIso(rcData.insurance?.validTill);
  const insuranceValid = Boolean(insuranceDateIso && insuranceDateIso >= referenceDateIso);
  if (!insuranceValid) {
    violations.push(
      insuranceDateIso
        ? `Vehicle insurance policy expired on ${insuranceDateIso}.`
        : 'Vehicle insurance policy is missing or unverified.'
    );
  }

  const isFullyCompliant = registrationActive && fitnessValid && pucValid && insuranceValid;

  return {
    isFullyCompliant,
    status: isFullyCompliant ? 'COMPLIANT' : 'NON_COMPLIANT',
    verifiedBadge: isFullyCompliant, // Direct boolean flag for React Native to render Green Verified Badge
    checks: {
      registrationActive,
      fitnessValid,
      pucValid,
      insuranceValid,
    },
    expiries: {
      fitness: fitnessDateIso,
      puc: pucDateIso,
      insurance: insuranceDateIso,
    },
    violations,
    evaluatedAt: referenceDateIso,
  };
}

/**
 * Evaluates Driving License Compliance for Heavy Equipment Operators
 * 1. Verifies DL is genuine & active on Parivahan
 * 2. Checks license is unexpired
 * 3. Inspects vehicle classes (COV) to verify authorization for heavy machinery (Cranes, Excavators, Tippers)
 *
 * @param {object} dlData
 * @param {string} [referenceDateIso] - ISO date for testing / evaluation (defaults to today)
 * @returns {object} Detailed operator eligibility verdict
 */
export function evaluateDriverLicenseCompliance(dlData, referenceDateIso = new Date().toISOString().slice(0, 10)) {
  if (!dlData) {
    return {
      isOriginalAndActive: false,
      isHeavyEquipmentAuthorized: false,
      verifiedOperatorBadge: false,
      operatorLevel: 'UNAUTHORIZED',
      checks: { rtoVerified: false, statusActive: false, licenseUnexpired: false, heavyEquipmentEndorsed: false },
      authorizedHeavyClasses: [],
      allVehicleClasses: [],
      violations: ['No driving license data available for evaluation.'],
      evaluatedAt: referenceDateIso,
    };
  }

  const violations = [];

  // 1. RTO Verification & Status check
  const statusStr = (dlData.status || '').toUpperCase();
  const statusActive = statusStr === 'ACTIVE';
  if (!statusActive) {
    violations.push(`Driving license status is ${statusStr || 'INVALID'} (must be ACTIVE on Parivahan).`);
  }

  // 2. Expiry check
  const validTillIso = parseDateToIso(dlData.validTill);
  const licenseUnexpired = Boolean(validTillIso && validTillIso >= referenceDateIso);
  if (!licenseUnexpired && validTillIso) {
    violations.push(`Driving license expired on ${validTillIso}.`);
  }

  const isOriginalAndActive = statusActive && licenseUnexpired;

  // 3. Heavy Equipment Authorization check
  const rawClasses = Array.isArray(dlData.vehicleClasses) ? dlData.vehicleClasses : [];
  const allVehicleClasses = [];
  const authorizedHeavyClasses = [];

  for (const item of rawClasses) {
    const code = (typeof item === 'string' ? item : (item.class || item.category || '')).toUpperCase().trim();
    const desc = (typeof item === 'object' && item.description ? item.description : '').toUpperCase().trim();
    if (!code) continue;

    allVehicleClasses.push(code);

    // Check if code matches known heavy machinery/commercial COV or description contains heavy keywords
    const isHeavyCode = HEAVY_EQUIPMENT_COV_CODES.has(code);
    const isHeavyDesc = HEAVY_KEYWORDS.some(kw => desc.includes(kw) || code.includes(kw));

    if (isHeavyCode || isHeavyDesc) {
      authorizedHeavyClasses.push(code);
    }
  }

  const heavyEquipmentEndorsed = authorizedHeavyClasses.length > 0;

  if (isOriginalAndActive && !heavyEquipmentEndorsed) {
    violations.push(
      'Driver holds an authentic driving license, but is authorized for Light Motor Vehicles (LMV) only. Operating heavy machinery (Cranes, Excavators, Tippers) requires an HGMV, TRANS, or HMV commercial endorsement.'
    );
  }

  let operatorLevel = 'UNAUTHORIZED';
  if (isOriginalAndActive) {
    if (heavyEquipmentEndorsed) {
      operatorLevel = 'HEAVY_MACHINERY_OPERATOR';
    } else if (allVehicleClasses.some(c => c.includes('LMV') || c.includes('MCWG'))) {
      operatorLevel = 'LIGHT_VEHICLE_ONLY';
    }
  }

  const verifiedOperatorBadge = isOriginalAndActive && heavyEquipmentEndorsed;

  return {
    isOriginalAndActive,
    isHeavyEquipmentAuthorized: heavyEquipmentEndorsed,
    verifiedOperatorBadge, // Direct boolean flag for React Native to render "Verified Heavy Operator" badge
    operatorLevel,
    checks: {
      rtoVerified: true,
      statusActive,
      licenseUnexpired,
      heavyEquipmentEndorsed,
    },
    authorizedHeavyClasses,
    allVehicleClasses,
    violations,
    evaluatedAt: referenceDateIso,
  };
}

/**
 * Evaluates Vehicle E-Challan Compliance
 * A vehicle is verified clean for equipment rental ONLY if it has NO active/pending traffic challans.
 *
 * @param {object} challanData
 * @returns {object} Detailed challan compliance verdict
 */
export function evaluateChallanCompliance(challanData) {
  if (!challanData) {
    return {
      isClean: false,
      status: 'UNKNOWN',
      verifiedChallanBadge: false,
      pendingCount: 0,
      totalPendingAmount: 0,
      violations: ['No challan data available to verify.'],
    };
  }

  const pendingCount = Number(challanData.pendingChallansCount ?? 0);
  const pendingAmount = Number(challanData.totalPendingAmount ?? 0);
  const hasPending = Boolean(challanData.hasPendingChallans || pendingCount > 0);

  const violations = [];
  if (hasPending) {
    violations.push(
      `Vehicle has ${pendingCount} active/unpaid challan(s) totaling ₹${pendingAmount}. Outstanding traffic fines must be cleared before listing or dispatch.`
    );
  }

  const isClean = !hasPending;

  return {
    isClean,
    status: isClean ? 'NO_PENDING_CHALLANS' : 'PENDING_FINES',
    verifiedChallanBadge: isClean, // React Native uses this to show "No Traffic Fines / Challan Clean" green badge
    pendingCount,
    totalPendingAmount: pendingAmount,
    totalChallans: Number(challanData.totalChallans ?? 0),
    checkedPortals: challanData.checkedPortals || [],
    violations,
  };
}

/**
 * Evaluates DigiLocker Aadhaar Compliance
 * Provides a verified identity badge if:
 * 1. DigiLocker session status is 'COMPLETED'
 * 2. Authenticated by DigiLocker XML (digilockerVerified: true)
 * 3. Verified full name and masked Aadhaar are present
 * 4. User meets minimum age requirement (default 18 years for equipment rental contracts)
 *
 * @param {object} aadhaarData
 * @param {number} [minAge=18]
 * @param {string} [referenceDateIso]
 * @returns {object} Detailed Aadhaar compliance verdict
 */
export function evaluateAadhaarCompliance(aadhaarData, minAge = 18, referenceDateIso = new Date().toISOString().slice(0, 10)) {
  if (!aadhaarData) {
    return {
      isAadhaarVerified: false,
      verifiedBadge: false,
      status: 'INCOMPLETE',
      checks: {
        sessionCompleted: false,
        digilockerAuthenticated: false,
        namePresent: false,
        maskedAadhaarPresent: false,
        isAdult: false,
      },
      age: null,
      violations: ['Aadhaar session data is missing or incomplete.'],
      evaluatedAt: referenceDateIso,
    };
  }

  const violations = [];

  // 1. Session Status check
  const isCompleted = (aadhaarData.status || '').toUpperCase() === 'COMPLETED';
  if (!isCompleted) {
    violations.push(`DigiLocker verification status is ${aadhaarData.status || 'PENDING'} (user has not completed OTP consent).`);
  }

  // 2. DigiLocker Authentication check
  const isDigilockerVerified = Boolean(aadhaarData.digilockerVerified);
  if (!isDigilockerVerified) {
    violations.push('Aadhaar XML was not verified through the official DigiLocker gateway.');
  }

  // 3. Name & Identity checks
  const namePresent = Boolean(aadhaarData.name && aadhaarData.name.trim().length > 0);
  if (!namePresent) {
    violations.push('User full name could not be extracted from Aadhaar records.');
  }

  const maskedAadhaarPresent = Boolean(aadhaarData.maskedAadhaar && aadhaarData.maskedAadhaar.length >= 4);
  if (!maskedAadhaarPresent) {
    violations.push('Aadhaar number identification is missing.');
  }

  // 4. Age Calculation (Must be >= minAge, default 18)
  let age = null;
  let isAdult = false;
  const dobIso = parseDateToIso(aadhaarData.dob);
  if (dobIso) {
    const birthYear = parseInt(dobIso.slice(0, 4), 10);
    const birthMonth = parseInt(dobIso.slice(5, 7), 10);
    const birthDay = parseInt(dobIso.slice(8, 10), 10);

    const refYear = parseInt(referenceDateIso.slice(0, 4), 10);
    const refMonth = parseInt(referenceDateIso.slice(5, 7), 10);
    const refDay = parseInt(referenceDateIso.slice(8, 10), 10);

    age = refYear - birthYear;
    if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
      age--;
    }

    isAdult = age >= minAge;
    if (!isAdult) {
      violations.push(`User age is ${age} years. Equipment rental contracts require a minimum age of ${minAge} years.`);
    }
  } else {
    isAdult = isCompleted;
  }

  const isAadhaarVerified = isCompleted && isDigilockerVerified && namePresent && maskedAadhaarPresent && isAdult;

  return {
    isAadhaarVerified,
    verifiedBadge: isAadhaarVerified, // React Native uses this to show official "Aadhaar Verified" green shield badge
    status: isAadhaarVerified ? 'VERIFIED' : (isCompleted ? 'ACTION_REQUIRED' : 'PENDING'),
    age,
    checks: {
      sessionCompleted: isCompleted,
      digilockerAuthenticated: isDigilockerVerified,
      namePresent,
      maskedAadhaarPresent,
      isAdult,
    },
    verifiedName: aadhaarData.name || null,
    maskedAadhaar: aadhaarData.maskedAadhaar || null,
    violations,
    evaluatedAt: referenceDateIso,
  };
}

