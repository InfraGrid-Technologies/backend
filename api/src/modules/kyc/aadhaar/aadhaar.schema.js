/**
 * Its Role (The Contracts for DigiLocker):

Aadhaar has two endpoints, so this file defines two schemas:

aadhaarInitiateSchema: Validates the request to start a DigiLocker session (needs DPDP consent, optional redirect URL).
aadhaarStatusSchema: Validates the request to fetch verified details using the clientId URL parameter (/aadhaar/:clientId).
 */

/**
 * Aadhaar DigiLocker Request & Response Validation Schemas
 * Fastify / Ajv JSON Schema
 */

// 1. Reusable DPDP Act 2023 Consent Schema
export const dpdpConsentSchema = {
  type: "object",
  required: ["agreed", "noticeVersion"],
  properties: {
    agreed: {
      type: "boolean",
      enum: [true],
      description: "Explicit user authorization confirming consent is granted.",
    },
    noticeVersion: {
      type: "string",
      minLength: 3,
      maxLength: 50,
      description:
        "Privacy notice version shown to the user (e.g. AADHAAR_NOTICE_V1.0).",
    },
    noticeText: {
      type: "string",
      maxLength: 2000,
      description: "Snapshot of the legal consent text displayed to the user.",
    },
  },
  additionalProperties: false,
};

// 2. Schema for Initiating DigiLocker Session (POST /aadhaar/initiate)
export const aadhaarInitiateSchema = {
  summary: "Initiate DigiLocker Aadhaar Verification",
  description:
    "Creates a DigiLocker session link where the user authenticates with OTP to securely share Aadhaar XML.",
  tags: ["KYC - Aadhaar"],
  body: {
    type: "object",
    required: ["consent"],
    properties: {
      redirectUrl: {
        type: "string",
        default: "https://google.com",
        description:
          "URL to redirect user after DigiLocker consent is completed.",
      },
      logoUrl: {
        type: "string",
        description: "Logo image URL to show on DigiLocker gateway header.",
      },
      consent: dpdpConsentSchema,
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        consentId: { type: "string" },
        data: {
          type: "object",
          properties: {
            clientId: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
  },
};

// 3. Schema for Fetching Verified Aadhaar Details (GET /aadhaar/:clientId)
export const aadhaarStatusSchema = {
  summary: "Get DigiLocker Aadhaar Result",
  description:
    "Fetches verified Aadhaar details once user completes OTP consent on DigiLocker.",
  tags: ["KYC - Aadhaar"],
  params: {
    type: "object",
    required: ["clientId"],
    properties: {
      clientId: { type: "string", description: "DigiLocker client/session ID" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        isVerified: { type: "boolean" },
        verificationStatus: { type: "string", enum: ["VERIFIED", "REJECTED"] },
        rejectionReasons: { type: "array", items: { type: "string" } },
        source: { type: "string", enum: ["SUREPASS"] },
        provider: { type: "string" },
        consentId: { type: "string" },
        data: { type: "object", additionalProperties: true,nullable: true, },
      },
    },
  },
};
