/**
 * Before a truck, tipper, or heavy vehicle can be rented on the platform, Indian law requires 4 valid documents:

Registration Status: Must be ACTIVE on Vahan.
Commercial Fitness Certificate: Must not be expired.
Pollution Under Control (PUC): Must not be expired.
Insurance Policy: Must not be expired.

If all 4 pass ➔ verificationStatus = 'VERIFIED'. If any certificate is expired ➔ verificationStatus = 'REJECTED' with the exact violation!
 */

/**
 * 4 Primary Vehicle Categories & Government VAHAN Mapping Rules
 * Sourced directly from BookMyEquipment Fleet Section:
 * 1. Earthmoving (Excavators & Earthmoving)
 * 2. Transport & Cranes (Transport & Heavy Cranes)
 * 3. Concrete (Concrete Equipment)
 * 4. Road & Power (Road Construction & Power)
 */
export const VEHICLE_CATEGORY_RULES = {
  // 1. Official Parivahan RTO COV (Class of Vehicle) Codes (Exact match with Surepass response)
  cev: {
    label: "CEV",
    fullName: "Construction Equipment Vehicle (CEV)",
    aliases: ["cev", "construction equipment vehicle", "construction equipment", "cev_earthmoving", "earthmoving"],
    keywords: ["CEV", "CONSTRUCTION", "EXCAVAT", "LOADER", "BACKHOE", "DOZER", "GRADER", "EARTH", "JCB", "CRANE", "ROLLER", "COMPACT", "PUMP", "MIXER"],
  },
  hgv: {
    label: "HGV",
    fullName: "Heavy Goods Commercial Vehicle (HGV/HGMV/HCV)",
    aliases: ["hgv", "hgmv", "hcv", "heavy goods vehicle", "heavy goods motor vehicle", "goods", "commercial_haulage", "commercial haulage & transport", "haulage", "transport & cranes"],
    keywords: ["GOODS", "HGV", "HGMV", "HCV", "TIPPER", "DUMPER", "TRUCK", "TRAILER", "TRACTOR", "TRANS", "COMMERCIAL", "HAULAGE", "TANKER", "CARRIAGE"],
  },

  // 2. Legacy App Categories (Retained for test suite & historical audit logs)
  earthmoving: {
    label: "Earthmoving",
    fullName: "Excavators & Earthmoving",
    aliases: ["earthmoving", "excavators & earthmoving", "earthmoving & excavation", "excavation", "cev_earthmoving"],
    keywords: ["CEV", "CONSTRUCTION", "EXCAVAT", "LOADER", "BACKHOE", "DOZER", "GRADER", "EARTH", "JCB"],
  },
  transport_cranes: {
    label: "Transport & Cranes",
    fullName: "Transport & Heavy Cranes",
    aliases: ["transport & cranes", "transport & heavy cranes", "transport", "cranes", "commercial_haulage", "commercial haulage & transport", "haulage"],
    keywords: ["GOODS", "HGV", "HGMV", "HCV", "TIPPER", "DUMPER", "TRUCK", "TRAILER", "TRACTOR", "TRANS", "COMMERCIAL", "HAULAGE", "TANKER", "CARRIAGE", "CRANE", "HYDRA", "CEV", "CONSTRUCTION"],
  },
  concrete: {
    label: "Concrete",
    fullName: "Concrete Equipment",
    aliases: ["concrete", "concrete equipment", "ready-mix concrete", "transit mixer", "mixer"],
    keywords: ["MIXER", "TRANSIT", "CONCRETE", "PUMP", "CEV", "CONSTRUCTION", "GOODS", "HGV", "HGMV", "HCV", "CARRIAGE", "SPECIAL"],
  },
  road_power: {
    label: "Road & Power",
    fullName: "Road Construction & Power",
    aliases: ["road & power", "road construction & power", "road_work", "road construction & compaction", "compactor", "roller", "power"],
    keywords: ["ROLLER", "COMPACT", "PAVER", "ROAD", "CEV", "CONSTRUCTION", "SOIL", "POWER", "EQUIPMENT", "SPECIAL"],
  },
};

/**
 * 13 Vehicle Types mapped strictly to RTO COV (Class of Vehicle) Rules
 * Compares selected equipment with Surepass Parivahan VAHAN vehicleClass
 */
export const VEHICLE_TYPE_RULES = {
  // CEV - Construction Equipment Vehicle (11 Fleet Types)
  "mini excavator": {
    name: "Mini Excavator",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "EXCAVAT"],
  },
  "small excavator": {
    name: "Small Excavator",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "EXCAVAT"],
  },
  "medium excavator": {
    name: "Medium Excavator",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "EXCAVAT"],
  },
  "backhoe": {
    name: "Backhoe (JCB 3DX)",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "BACKHOE", "LOADER", "JCB"],
  },
  "backhoe (jcb 3dx)": {
    name: "Backhoe (JCB 3DX)",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "BACKHOE", "LOADER", "JCB"],
  },
  "wheel loader": {
    name: "Wheel Loader",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "LOADER"],
  },
  "hydra crane": {
    name: "Hydra Crane",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle / Mobile Crane (CEV)",
    allowedKeywords: ["CEV", "CRANE", "MOBILE CRANE", "CONSTRUCTION", "SPECIAL"],
  },
  "self-loading mixer": {
    name: "Self-Loading Mixer",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "MIXER", "LOADER"],
  },
  "concrete pump": {
    name: "Concrete Pump",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Construction Equipment Vehicle / Special Commercial (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "PUMP", "SPECIAL", "HGV", "HCV"],
  },
  "soil compactor": {
    name: "Soil Compactor",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Road Roller / Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "ROLLER", "COMPACT"],
  },
  "tandem roller": {
    name: "Tandem Roller",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Road Roller / Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "ROLLER", "COMPACT"],
  },
  "pneumatic roller": {
    name: "Pneumatic Roller",
    category: "CEV",
    rtoClass: "CEV",
    rtoDescription: "Road Roller / Construction Equipment Vehicle (CEV)",
    allowedKeywords: ["CEV", "CONSTRUCTION", "ROLLER", "COMPACT"],
  },

  // HGV / HGMV - Heavy Goods Commercial Vehicles (2 Fleet Types)
  "tipper dump truck": {
    name: "Tipper Dump Truck",
    category: "HGV / HGMV",
    rtoClass: "HGV/HGMV",
    rtoDescription: "Heavy Goods Commercial Vehicle (HGV/HGMV/HCV)",
    allowedKeywords: ["GOODS", "HGV", "HGMV", "HCV", "TIPPER", "DUMPER", "TRUCK", "CARRIAGE", "COMMERCIAL"],
  },
  "commercial tipper / dumper": {
    name: "Tipper Dump Truck",
    category: "HGV / HGMV",
    rtoClass: "HGV/HGMV",
    rtoDescription: "Heavy Goods Commercial Vehicle (HGV/HGMV/HCV)",
    allowedKeywords: ["GOODS", "HGV", "HGMV", "HCV", "TIPPER", "DUMPER", "TRUCK", "CARRIAGE", "COMMERCIAL"],
  },
  "transit mixer": {
    name: "Transit Mixer",
    category: "HGV / CEV",
    rtoClass: "HGV/CEV",
    rtoDescription: "Heavy Commercial Goods / Special Machine (HGV/CEV)",
    allowedKeywords: ["GOODS", "HGV", "HGMV", "HCV", "TRANSIT", "MIXER", "CEV", "SPECIAL", "CARRIAGE"],
  },
};

/**
 * Robust date parser handling YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, or ISO timestamps.
 * Returns standard YYYY-MM-DD or null.
 */

export function parseDateToIso(dateStr) {
  if (!dateStr || typeof dateStr !== "string") {
    return null;
  }
  const s = dateStr.trim();

  if (!s || s === "NA" || s === "null" || s === "UNKNOWN") {
    return null;
  }

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  // Format: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Evaluate the 4 roadworthiness pillares
 */

export function evaluateVehicleCompliance(
  rcData,
  referenceDateIso = new Date().toISOString().slice(0, 10),
  expectedCategory = null,
  expectedType = null,
) {
  if (!rcData) {
    return {
      isFullyCompliant: false,
      status: "NON_COMPLIANT",
      verifiedBadge: false,
      checks: {
        registrationActive: false,
        fitnessValid: false,
        pucValid: false,
        insuranceValid: false,
        categoryMatch: false,
        rtoClassMatch: false,
      },
      violations: ["No vehicle data available for compliance check."],
    };
  }

  const violations = [];

  // check 1 : registration status
  const statusStr = (rcData.status || "").toUpperCase();
  const registrationActive =
    statusStr === "ACTIVE" || statusStr === "REGISTERED";
  // registration is active only if data from Rc says "active " or "registered" else not active
  if (!registrationActive) {
    violations.push(
      `vehicle registration status is ${statusStr || "UNKNOWN"} (must be ACTIVE) `,
    );
  }

  // check 2: fitness certificate validity
  const rawFitnessDate = rcData.fitness?.validTill || rcData.rcExpiryDate || rcData.regnUpto || null;
  const fitnessDateIso = parseDateToIso(rawFitnessDate);
  const fitnessValid = Boolean(
    fitnessDateIso && fitnessDateIso >= referenceDateIso,
  );
  //   fitness chekc is valid only if it in correct format of date and also the fitness expiry date should be greater than current data
  if (!fitnessValid) {
    violations.push(
      fitnessDateIso
        ? `Commercial fitness certificate expired on ${fitnessDateIso}.`
        : "Commercial fitness certificate is missing or unverified.",
    );
  }

  //   check 3: puc validity
  const pucDateIso = parseDateToIso(rcData.puc?.validTill);
  const pucValid = Boolean(pucDateIso && pucDateIso >= referenceDateIso);
  if (!pucValid) {
    violations.push(
      pucDateIso
        ? `Pollution (PUC) certificate expired on ${pucDateIso}.`
        : "Pollution (PUC) certificate is missing or unverified.",
    );
  }

  // Check 4: Insurance Validity
  const insuranceDateIso = parseDateToIso(rcData.insurance?.validTill);
  const insuranceValid = Boolean(
    insuranceDateIso && insuranceDateIso >= referenceDateIso,
  );
  if (!insuranceValid) {
    violations.push(
      insuranceDateIso
        ? `Vehicle insurance policy expired on ${insuranceDateIso}.`
        : "Vehicle insurance policy is missing or unverified.",
    );
  }

  // Check 5: Vehicle Category & RTO Class Compliance (BookMyEquipment Fleet Section)
  let categoryMatch = true;
  let rtoClassMatch = true;
  const rawClass = (
    rcData.vehicleClass ||
    rcData.vehicle_category_description ||
    rcData.vehicle_category ||
    rcData.vehicle_class ||
    ""
  ).toUpperCase();

  // Explicitly reject non-commercial passenger vehicles or two-wheelers masquerading as heavy equipment
  const isPersonalOrTwoWheeler =
    rawClass.includes("MOTOR CYCLE") ||
    rawClass.includes("TWO WHEELER") ||
    rawClass.includes("2W") ||
    rawClass.includes("SCOOTER") ||
    rawClass.includes("MOTOR CAR") ||
    rawClass.includes("PASSENGER CAR") ||
    (rawClass.includes("LMV") && !rawClass.includes("CEV") && !rawClass.includes("GOODS"));

  if (isPersonalOrTwoWheeler) {
    categoryMatch = false;
    rtoClassMatch = false;
    violations.push(
      `Vehicle category mismatch: Vehicle is registered on VAHAN as '${rcData.vehicleClass || "Private Vehicle"}', which is a non-commercial passenger vehicle and cannot be registered as equipment.`
    );
  } else if (expectedType && typeof expectedType === "string" && expectedType.trim()) {
    // 5A: Specific Vehicle Type compared directly with RTO Class (from Central Motor Vehicles Rules)
    const cleanType = expectedType.trim().toLowerCase();
    const typeKey = Object.keys(VEHICLE_TYPE_RULES).find(
      (k) => k === cleanType || cleanType.includes(k) || k.includes(cleanType)
    );

    if (typeKey) {
      const typeRule = VEHICLE_TYPE_RULES[typeKey];
      const isClassMatch = typeRule.allowedKeywords.some((kw) => rawClass.includes(kw));

      if (!isClassMatch) {
        rtoClassMatch = false;
        categoryMatch = false;
        violations.push(
          `Vehicle RTO class mismatch: Vehicle is registered on VAHAN as '${rcData.vehicleClass || "Unknown Class"}', which does not match '${typeRule.name}' (Required RTO Class: ${typeRule.rtoClass} - ${typeRule.rtoDescription}).`
        );
      }
    }
  } else if (expectedCategory && typeof expectedCategory === "string" && expectedCategory.trim()) {
    // 5B: Category-level fallback check
    const cleanExpected = expectedCategory.trim().toLowerCase();
    const matchedRuleKey = Object.keys(VEHICLE_CATEGORY_RULES).find((k) => {
      const rule = VEHICLE_CATEGORY_RULES[k];
      return (
        rule.label.toLowerCase() === cleanExpected ||
        rule.fullName.toLowerCase() === cleanExpected ||
        rule.aliases.includes(cleanExpected)
      );
    });

    if (matchedRuleKey) {
      const rule = VEHICLE_CATEGORY_RULES[matchedRuleKey];
      const isClassMatch = rule.keywords.some((kw) => rawClass.includes(kw));

      if (!isClassMatch) {
        categoryMatch = false;
        rtoClassMatch = false;
        violations.push(
          `Vehicle category mismatch: Vehicle is registered on VAHAN as '${rcData.vehicleClass || "Unknown Class"}', which does not match expected category '${rule.label}'.`
        );
      }
    }
  }

  const isFullyCompliant =
    registrationActive && fitnessValid && pucValid && insuranceValid && categoryMatch && rtoClassMatch;

  return {
    isFullyCompliant,
    status: isFullyCompliant ? "COMPLIANT" : "NON_COMPLIANT",
    verifiedBadge: isFullyCompliant,
    checks: {
      registrationActive,
      fitnessValid,
      pucValid,
      insuranceValid,
      categoryMatch,
      rtoClassMatch,
    },
    expires: {
      fitness: fitnessDateIso,
      puc: pucDateIso,
      insurance: insuranceDateIso,
    },
    violations,
    evaluatedAt: referenceDateIso,
  };
}
