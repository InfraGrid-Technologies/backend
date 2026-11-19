/**
 * KYC Compliance Facade (Backwards Compatibility)
 * Re-exports compliance evaluators from domain modules
 */
export { evaluateVehicleCompliance } from './vehicle-rc/rc.compliance.js';
export { evaluateDriverLicenseCompliance } from './driving-license/dl.compliance.js';
export { evaluateChallanCompliance } from './challan/challan.compliance.js';
export { evaluateAadhaarCompliance } from './aadhaar/aadhaar.compliance.js';

