import { MockKycProvider } from './mock.provider.js';
import { SurepassKycProvider } from './surepass.provider.js';
import { KycProviderInterface } from './kyc-provider.interface.js';

/**
 * Hybrid KYC Provider
 * Seamlessly routes calls to either Surepass (live) or Mock (scenario database)
 * based on header `x-kyc-provider`, request body `providerOverride`, or global .env KYC_PROVIDER.
 */
export class HybridKycProvider extends KycProviderInterface {
  constructor({ surepassProvider, mockProvider, defaultProvider = 'mock', logger }) {
    super();
    this.surepassProvider = surepassProvider;
    this.mockProvider = mockProvider;
    this.defaultProvider = defaultProvider;
    this.logger = logger;
  }

  get providerName() {
    return this.defaultProvider;
  }

  _resolve(params = {}) {
    const requested = (
      params.providerOverride ||
      params.provider ||
      this.defaultProvider ||
      'mock'
    ).toLowerCase().trim();

    if (requested === 'surepass' && this.surepassProvider) {
      return this.surepassProvider;
    }
    return this.mockProvider;
  }

  async verifyDrivingLicense(params) {
    return this._resolve(params).verifyDrivingLicense(params);
  }

  async verifyRc(params) {
    return this._resolve(params).verifyRc(params);
  }

  async verifyChallan(params) {
    return this._resolve(params).verifyChallan(params);
  }

  async initiateAadhaarDigilocker(params) {
    return this._resolve(params).initiateAadhaarDigilocker(params);
  }

  async getAadhaarDetails(params) {
    return this._resolve(params).getAadhaarDetails(params);
  }

  async verifyBankAccount(params) {
    return this._resolve(params).verifyBankAccount(params);
  }

  async ocrDrivingLicense(params) {
    return this._resolve(params).ocrDrivingLicense(params);
  }

  async ocrVehicleRc(params) {
    return this._resolve(params).ocrVehicleRc(params);
  }
}

/**
 * KYC Provider Factory
 * Dynamically creates a HybridKycProvider that supports both Surepass and Mock Scenarios.
 */
export function getKycProvider(config = {}, logger) {
  const token = config.surepassToken || process.env.SUREPASS_TOKEN;
  const baseUrl = config.surepassBaseUrl || process.env.SUREPASS_BASE_URL || 'https://sandbox.surepass.app/api/v1';
  const defaultProvider = (config.kycProvider || process.env.KYC_PROVIDER || 'mock').toLowerCase().trim();

  const mockProvider = new MockKycProvider(logger);
  let surepassProvider = null;

  if (token) {
    surepassProvider = new SurepassKycProvider({ token, baseUrl, logger });
  }

  logger?.info(
    { defaultProvider, hasSurepass: Boolean(surepassProvider) },
    `[KYC Factory] Initialized Hybrid Provider. Default: ${defaultProvider.toUpperCase()} (Switchable on-the-fly via x-kyc-provider header)`
  );

  return new HybridKycProvider({
    surepassProvider,
    mockProvider,
    defaultProvider,
    logger,
  });
}
