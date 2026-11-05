/**
 * KYC Request & Response Schemas
 * Rejects invalid inputs before calling paid external APIs.
 */

// Reusable user consent schema under DPDP Act 2023
export const consentSchema = {
  type: 'object',
  required: ['agreed', 'noticeVersion'],
  properties: {
    agreed: {
      type: 'boolean',
      enum: [true],
      description: 'Explicit user authorization confirming consent is given.',
    },
    noticeVersion: {
      type: 'string',
      minLength: 3,
      maxLength: 50,
      description: 'Version identifier of the privacy notice displayed to the user (e.g. DL_NOTICE_V1.0).',
    },
    noticeText: {
      type: 'string',
      maxLength: 2000,
      description: 'Snapshot of the legal consent text displayed to the user.',
    },
  },
  additionalProperties: false,
};

// Driving License validation schema
export const drivingLicenseSchema = {
  summary: 'Verify Driving License',
  description: 'Verifies driving license validity, authorized vehicle classes (COV), and expiry with RTO/Parivahan.',
  tags: ['KYC'],
  body: {
    type: 'object',
    required: ['dlNumber', 'dob', 'consent'],
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
      consent: consentSchema,
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
        consentId: { type: 'string' },
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
    required: ['accountNumber', 'ifsc', 'consent'],
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
      consent: consentSchema,
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
        consentId: { type: 'string' },
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
    required: ['vehicleNumber', 'consent'],
    properties: {
      vehicleNumber: {
        type: 'string',
        pattern: '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$',
        description: 'Vehicle Registration Number without hyphens or spaces (e.g. MH12AB1234)',
      },
      consent: consentSchema,
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
        consentId: { type: 'string' },
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
    required: ['consent'],
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
      consent: consentSchema,
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        provider: { type: 'string' },
        consentId: { type: 'string' },
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
    required: ['rcNumber', 'consent'],
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
      consent: consentSchema,
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
        consentId: { type: 'string' },
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
      type: {
        type: 'string',
        enum: [
          'driving_license',
          'driving-license',
          'bank_account',
          'bank-account',
          'rc',
          'aadhaar',
          'challan',
        ],
        description: 'Verification type to clear',
      },
      idNumber: { type: 'string', description: 'Specific ID to invalidate' },
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

// Verification History Schema
export const getHistorySchema = {
  summary: 'Get verification audit history',
  description: 'Fetches local audit log of all verifications performed for an ID. Internal database query - costs ₹0.',
  tags: ['KYC'],
  params: {
    type: 'object',
    required: ['type', 'idNumber'],
    properties: {
      type: {
        type: 'string',
        enum: [
          'driving_license',
          'driving-license',
          'bank_account',
          'bank-account',
          'rc',
          'aadhaar',
          'challan',
        ],
        description: 'Verification type (e.g. driving_license or driving-license, rc, challan, bank_account, aadhaar)',
      },
      idNumber: {
        type: 'string',
        description: 'Document or account identifier (e.g. TS01620240001534, MH1420110062821)',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        count: { type: 'integer' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              verification_type: { type: 'string' },
              id_number: { type: 'string' },
              status: { type: 'string' },
              provider: { type: 'string' },
              consent_id: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              response_data: { type: 'object', additionalProperties: true },
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};

// Get Consent Schema
export const getConsentSchema = {
  summary: 'Get Consent Artifact Details',
  description: 'Fetches immutable consent artifact by consent ID for DPDP Act audit verification.',
  tags: ['KYC'],
  params: {
    type: 'object',
    required: ['consentId'],
    properties: {
      consentId: { type: 'string', minLength: 1, maxLength: 100, description: 'Consent record ID or UUID' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            actor_id: { type: 'string', nullable: true },
            consent_type: { type: 'string' },
            purpose: { type: 'string' },
            notice_version: { type: 'string' },
            notice_text: { type: 'string' },
            ip_address: { type: 'string' },
            user_agent: { type: 'string', nullable: true },
            status: { type: 'string' },
            granted_at: { type: 'string' },
            revoked_at: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
};

// Revoke Consent Schema
export const revokeConsentSchema = {
  summary: 'Revoke User Consent',
  description: 'Revokes a previously granted user consent under DPDP Act 2023 Section 6(4).',
  tags: ['KYC'],
  params: {
    type: 'object',
    required: ['consentId'],
    properties: {
      consentId: { type: 'string', minLength: 1, maxLength: 100, description: 'Consent record ID or UUID' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            revoked_at: { type: 'string' },
          },
        },
      },
    },
  },
};

