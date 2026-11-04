import { MockKycProvider } from './mock.provider.js';
import { SurepassKycProvider } from './surepass.provider.js';

/**
 * KYC Provider Factory
 * Dynamically resolves the active KYC provider adapter.
 * Allows switching providers via .env with zero code changes.
 */
export function getKycProvider(config, logger) {
  const providerType = (config.kycProvider || process.env.KYC_PROVIDER || 'mock').toLowerCase().trim();

  if (providerType === 'surepass') {
    const token = config.surepassToken || process.env.SUREPASS_TOKEN;
    const baseUrl = config.surepassBaseUrl || process.env.SUREPASS_BASE_URL || 'https://sandbox.surepass.app/api/v1';

    if (!token) {
      logger?.warn('[KYC Factory] KYC_PROVIDER is "surepass" but SUREPASS_TOKEN is missing. Falling back to MockKycProvider!');
      return new MockKycProvider(logger);
    }

    logger?.info({ baseUrl }, '[KYC Factory] Active KYC Provider: SUREPASS (Sandbox/Live)');
    return new SurepassKycProvider({ token, baseUrl, logger });
  }

  logger?.info('[KYC Factory] Active KYC Provider: MOCK (Free offline testing - ₹0 credit consumed)');
  return new MockKycProvider(logger);
}

