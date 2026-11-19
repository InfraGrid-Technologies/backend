import { createVehicleRcService } from './vehicle-rc/rc.service.js';
import { createdrivingLicenseService } from './driving-license/dl.service.js';
import { createChallanService } from './challan/challan.service.js';
import { createAadhaarService } from './aadhaar/aadhaar.service.js';

/**
 * KYC Service Facade (Backwards Compatibility)
 * Composes segregated domain services under a unified API surface
 */
export function createKycService(provider, repo, logger = null) {
  const rcService = createVehicleRcService({ provider, repo, logger });
  const dlService = createdrivingLicenseService({ provider, repo, logger });
  const challanService = createChallanService({ provider, repo, logger });
  const aadhaarService = createAadhaarService({ provider, repo, logger });

  return {
    rcService,
    dlService,
    challanService,
    aadhaarService,

    verifyVehicleRc: (args, actorId, clientMeta) => rcService.verify(args, actorId, clientMeta),
    verifyRc: (args, actorId, clientMeta) => rcService.verify(args, actorId, clientMeta),
    verifyDrivingLicense: (args, actorId, clientMeta) => dlService.verify(args, actorId, clientMeta),
    verifyChallan: (args, actorId, clientMeta) => challanService.verify(args, actorId, clientMeta),
    initiateAadhaarDigilocker: (args, actorId, clientMeta) => aadhaarService.initiate(args, actorId, clientMeta),
    getAadhaarDetails: (clientId, actorId) => aadhaarService.getDetails(clientId, actorId),
  };
}
