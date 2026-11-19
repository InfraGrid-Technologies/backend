/**
 * Vehicle E-Challan Compliance Engine
 * Evaluates pending traffic violations, unpaid fines, and portal reachability.
 */
export function evaluateChallanCompliance(challanData) {
  if (!challanData) {
    return {
      isClean: false,
      status: 'UNKNOWN',
      verifiedChallanBadge: false,
      pendingCount: 0,
      totalPendingAmount: 0,
      failedBackends: [],
      violations: ['No challan data available to verify.'],
    };
  }

  const pendingCount = Number(challanData.pendingChallansCount ?? 0);
  const pendingAmount = Number(challanData.totalPendingAmount ?? 0);
  const hasPending = Boolean(challanData.hasPendingChallans || pendingCount > 0);
  const failedBackends = Array.isArray(challanData.failedBackends) ? challanData.failedBackends : [];
  const homeState = challanData.homeState || (challanData.rcNumber ? challanData.rcNumber.slice(0, 2).toUpperCase() : null);
  const homeStateFailed = Boolean(homeState && failedBackends.includes(homeState));

  const violations = [];
  if (hasPending) {
    violations.push(
      `Vehicle has ${pendingCount} active/unpaid challan(s) totaling ₹${pendingAmount}. Outstanding traffic fines must be cleared before listing or dispatch.`
    );
  }

  if (homeStateFailed) {
    violations.push(
      `Traffic police portal for state ${homeState} was unreachable during this scan. Outstanding fines could not be verified. Please retry inspection.`
    );
  }

  const isClean = !hasPending && !homeStateFailed;

  let status = 'NO_PENDING_CHALLANS';
  if (hasPending) {
    status = 'PENDING_FINES';
  } else if (homeStateFailed) {
    status = 'PORTAL_UNREACHABLE';
  }

  return {
    isClean,
    status,
    verifiedChallanBadge: isClean, // Direct boolean flag for Green "No Fines" badge
    pendingCount,
    totalPendingAmount: pendingAmount,
    totalChallans: Number(challanData.totalChallans ?? 0),
    checkedPortals: challanData.checkedPortals || [],
    failedBackends,
    successfulBackends: challanData.successfulBackends || [],
    homeStateFailed,
    violations,
  };
}
