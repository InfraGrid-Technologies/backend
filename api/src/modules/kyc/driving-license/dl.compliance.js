/**
 * Driving License Compliance Rules
 * Evaluates whether a driver is legally eligible to operate heavy construction equipment.
 */
// NOTE: Replaced by PostgreSQL database table `kyc.cov_categories`. Preserved as reference:
/*
export const HEAVY_EQUIPMENT_COV_CODES = new Set([
  "TRANS", // Transport Commercial Vehicle
  "TRANS-HV", // Transport Heavy Vehicle
  "HGMV", // Heavy Goods Motor Vehicle (Tippers, Dumpers)
  "HMV", // Heavy Motor Vehicle
  "HTV", // Heavy Transport Vehicle
  "HPMV", // Heavy Passenger Motor Vehicle
  "MGV", // Medium Goods Vehicle
  "MMV", // Medium Motor Vehicle
  "CHGVA", // Commercial Heavy Goods Vehicle
  "CRANE", // Mobile / Tower Cranes
  "EXCAVATOR", // Excavators / Earthmovers / Backhoe Loaders
  "LOADER", // Heavy Loaders
  "FORKLIFT", // Industrial Forklifts
  "ROAD_ROLLER", // Road Rollers / Compactors
  "CONSTRUCTION_EQUIPMENT", // Construction Equipment Vehicles (CEV)
  "CONSTRN", // Construction Equipment abbreviation
  "CEV", // Construction Equipment Vehicle code
  "TRACTOR", // Commercial Tractors / Haulers
]);
*/

const HEAVY_KEYWORDS = [
  "HEAVY",
  "TRANSPORT",
  "GOODS",
  "CRANE",
  "EXCAVATOR",
  "CONSTRUCTION",
  "LOADER",
  "TRUCK",
  "TIPPER",
  "TRAILER",
  "DUMPER",
  "EARTHMOV",
];

/**
 * Evaluates Driving License Compliance:
 * 1. Must be ACTIVE on Parivahan
 * 2. Must not be expired
 * 3. Must have Heavy Machinery Endorsement (LMV-only is REJECTED)
 */

export function evaluateDriverLicenseCompliance(dlData, options = {}) {
  const referenceDateIso =
    options.referenceDateIso || new Date().toISOString().slice(0, 10);

  // Use dynamic codes from DB if provided; otherwise fallback to empty Set
  const allowedCovSet =
    options.allowedCodes instanceof Set
      ? options.allowedCodes
      : Array.isArray(options.allowedCodes) && options.allowedCodes.length > 0
        ? new Set(options.allowedCodes)
        : new Set();
  if (!dlData) {
    return {
      isOriginalAndActive: false,
      isHeavyEquipmentAuthorized: false,
      isHeavyEqipmentAuthorized: false,
      verifiedOperatorBadge: false,
      operatorLevel: "UNAUTHORIZED",
      violations: ["No driving license data available for evaluation."],
    };
  }

  const violations = [];

  // 1. RTO verification and status check
  const statusStr = (dlData.status || "").toUpperCase();
  const statusActive = statusStr === "ACTIVE";
  if (!statusActive) {
    violations.push(
      `Driving license status is ${statusStr || "INVALID"} (must be active on Parivahan).`,
    );
  }

  // 2. expiry check
  const validTillso = dlData.validTill ? dlData.validTill.slice(0, 10) : null;
  const licenseUnexpired = Boolean(
    validTillso && validTillso >= referenceDateIso,
  );
  if (!licenseUnexpired && validTillso) {
    violations.push(`Driving license expired on ${validTillso}.`);
  }

  const isOriginalAndActive = statusActive && licenseUnexpired;
  // a license is verified if it is active and unexpired

  // 3. heavy equi authorization check
  const rawClasses = Array.isArray(dlData.vehicleClasses)
    ? dlData.vehicleClasses
    : [];
  const allVehicleClasses = [];
  const authrizedHeavyClasses = [];

  for (const item of rawClasses) {
    const code = (
      typeof item === "string" ? item : item.class || item.category || ""
    )
      .toUpperCase()
      .trim();
    const desc = (
      typeof item === "object" && item.description ? item.description : ""
    )
      .toUpperCase()
      .trim();
    if (!code) continue;

    allVehicleClasses.push(code);

    const isHeavyClass = allowedCovSet.has(code);
    const isHeavyDesc = HEAVY_KEYWORDS.some(
      (kw) => desc.includes(kw) || code.includes(kw),
    );

    if (isHeavyClass || isHeavyDesc) {
      authrizedHeavyClasses.push(code);
    }
  }

  const HeavyEquipementEndrosed = authrizedHeavyClasses.length > 0;

  // next reject bikes and car, only heavy equip are accepted
  if (isOriginalAndActive && !HeavyEquipementEndrosed) {
    violations.push(
      `Driver holds an authentic driving license, but is authorized for Light Motor Vehicles (LMV) only. Operating heavy machinery requires an HGMV, TRANS, or HMV commercial endorsement.`,
    );
  }

  let operatorLevel = "UNAUTHORIZED";

  if (isOriginalAndActive) {
    if (HeavyEquipementEndrosed) {
      operatorLevel = "HEAVY_MACHINERY_OPERATOR";
    } else if (
      allVehicleClasses.some((c) => c.includes("LMV") || c.includes("MCWG"))
    ) {
      operatorLevel = "LIGHT_VEHICLE_ONLY";
    }
  }

  const verifiedOperatorBadge = isOriginalAndActive && HeavyEquipementEndrosed;

  return {
    isOriginalAndActive,
    isHeavyEquipmentAuthorized: HeavyEquipementEndrosed,
    isHeavyEqipmentAuthorized: HeavyEquipementEndrosed,
    verifiedOperatorBadge,
    operatorLevel,
    allVehicleClasses,
    violations,
    evaluatedAt: referenceDateIso,
  };
}
