/**
 * KYC Request & Response Schemas
 * Rejects invalid inputs before calling paid external APIs.
 */

// Driving License validation schema
export const drivingLicenseSchema = {
  summary: 'Verify Driving License',
  description: 'Verifies driving license validity, authorized vehicle classes (COV), and expiry with RTO/Parivahan.',
  tags: ['KYC'],
  body: {
    type: 'object',
    required: ['dlNumber', 'dob'],
    properties: {
      dlNumber: {
        type: 'string',
        minLength: 8,
        maxLength: 25,
        description: 'Driving license number (e.g. TS01620240001534)',
      },
      dob: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'Date of birth in YYYY-MM-DD format (required by RTO)',
      },
      forceRefresh: {
        type: 'boolean',
        default: false,
        description: 'Set to true to bypass cache and call provider',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        source: { type: 'string', enum: ['CACHE', 'PROVIDER'] },
        provider: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
  },
};

// Bank Account validation schema (Penny Drop)
export const bankAccountSchema = {
  summary: 'Verify Bank Account (Penny Drop)',
  description: 'Verifies bank account existence and fetches the beneficiary name registered with the bank.',
  tags: ['KYC'],
  body: {
    type: 'object',
    required: ['accountNumber', 'ifsc'],
    properties: {
      accountNumber: {
        type: 'string',
        pattern: '^\\d{8,22}$',
        description: 'Bank account number (digits only)',
      },
      ifsc: {
        type: 'string',
        pattern: '^[A-Za-z]{4}0[A-Za-z0-9]{6}$',
        description: '11-character Indian Financial System Code (e.g. HDFC0000240)',
      },
      nameToMatch: {
        type: 'string',
        description: 'Optional: Full name from Aadhaar or DL to verify if bank account belongs to the same user',
      },
      forceRefresh: {
        type: 'boolean',
        default: false,
        description: 'Set to true to bypass cache and call provider',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        source: { type: 'string', enum: ['CACHE', 'PROVIDER'] },
        provider: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
  },
};

// Vehicle RC validation schema (PUC, Fitness, Insurance)
export const rcSchema = {
  summary: 'Verify Vehicle RC',
  description: 'Fetches registration details, commercial fitness expiry, pollution certificate (PUC), and insurance validity.',
  tags: ['KYC'],
  body: {
    type: 'object',
    required: ['vehicleNumber'],
    properties: {
      vehicleNumber: {
        type: 'string',
        pattern: '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$',
        description: 'Vehicle Registration Number without hyphens or spaces (e.g. MH12AB1234)',
      },
      forceRefresh: {
        type: 'boolean',
        default: false,
        description: 'Set to true to bypass cache and call provider',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        source: { type: 'string', enum: ['CACHE', 'PROVIDER'] },
        provider: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
  },
};

// DigiLocker Aadhaar initialization schema
export const aadhaarInitiateSchema = {
  summary: 'Initiate DigiLocker Aadhaar Verification',
  description: 'Creates a DigiLocker session link where the user authenticates with OTP to securely share Aadhaar XML.',
  tags: ['KYC'],
  body: {
    type: 'object',
    properties: {
      redirectUrl: {
        type: 'string',
        default: 'https://google.com',
        description: 'URL to redirect user after DigiLocker consent (e.g. https://google.com)',
      },
      logoUrl: {
        type: 'string',
        default: 'https://surepass.io/assets/images/logo.png',
        description: 'Your brand logo URL to display on DigiLocker consent screen',
      },
      signupFlow: {
        type: 'boolean',
        default: true,
        description: 'Enable signup flow for users without existing DigiLocker account',
      },
      skipMainScreen: {
        type: 'boolean',
        default: false,
        description: 'Skip introductory screen and go directly to Aadhaar input',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        provider: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            clientId: { type: 'string' },
            url: { type: 'string' },
            validityMinutes: { type: 'number' },
          },
        },
      },
    },
  },
};

// DigiLocker Aadhaar status fetch schema
export const aadhaarStatusSchema = {
  summary: 'Get DigiLocker Aadhaar Result',
  description: 'Fetches verified Aadhaar details once user completes consent on DigiLocker.',
  tags: ['KYC'],
  params: {
    type: 'object',
    required: ['clientId'],
    properties: {
      clientId: { type: 'string', description: 'DigiLocker client/session ID' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        source: { type: 'string', enum: ['CACHE', 'PROVIDER'] },
        provider: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
  },
};

// E-Challan validation schema
export const challanSchema = {
  summary: 'Verify Vehicle E-Challan Details',
  description: 'Fetches pending and disposed traffic challans across national Parivahan and state portals (DL, TS, GJ, KA).',
  tags: ['KYC'],
  body: {
    type: 'object',
    required: ['rcNumber'],
    properties: {
      rcNumber: {
        type: 'string',
        pattern: '^[A-Za-z]{2}[0-9]{1,2}[A-Za-z]{0,3}[0-9]{4}$',
        examples: ['HR55AP0244'],
        description: 'Vehicle Registration Number (e.g. HR55AP0244)',
      },
      chassisNumber: {
        type: 'string',
        examples: ['MA3JMTB1SPB851591'],
        description: 'Vehicle Chassis Number (optional if RC was previously verified in cache)',
      },
      engineNumber: {
        type: 'string',
        examples: ['K10CNC265773'],
        description: 'Vehicle Engine Number (optional if RC was previously verified in cache)',
      },
      stateOnly: {
        type: 'boolean',
        default: false,
        description: 'Set to true to query only state portals; default false queries national Parivahan + state portals',
      },
      statePortals: {
        type: 'array',
        items: { type: 'string' },
        default: ['DL', 'TS', 'GJ'],
        description: 'List of state traffic portals to query. Defaults to fast portals: ["DL", "TS", "GJ"]. You can also pass ["DL", "TS", "KA", "GJ"].',
      },
      forceRefresh: {
        type: 'boolean',
        default: false,
        description: 'Set to true to bypass cache and call provider',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        source: { type: 'string', enum: ['CACHE', 'PROVIDER'] },
        provider: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
  },
};

// Clear Cache Schema
export const clearCacheSchema = {
  summary: 'Clear KYC Cache',
  description: 'Clears saved verification results from local cache. Consumes ₹0.',
  tags: ['KYC'],
  querystring: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['driving_license', 'bank_account', 'rc', 'aadhaar', 'challan'] },
      idNumber: { type: 'string' },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  },
};
