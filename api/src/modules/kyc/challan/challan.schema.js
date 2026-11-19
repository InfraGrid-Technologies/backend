/**
 * Validates the incoming Challan request:

rcNumber: Required vehicle registration number (e.g. TS16FD7966).
consent: Explicit DPDP consent.
Optional chassisNumber and engineNumber
 */

/**
 * Vehicle E-Challan Request & Response Validation Schemas
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
        "Privacy notice version shown to the user (e.g. CHALLAN_NOTICE_V1.0).",
    },
    noticeText: {
      type: "string",
      maxLength: 2000,
      description: "Snapshot of the legal consent text displayed to the user.",
    },
  },
  additionalProperties: false,
};

// 2. Main Challan Route Schema
export const challanSchema = {
  summary: "Verify Vehicle E-Challan Details",
  description:
    "Fetches pending and disposed traffic challans across national Parivahan and state portals.",
  tags: ["KYC - Challan"],
  body: {
    type: "object",
    required: ["rcNumber", "consent"],
    properties: {
      rcNumber: {
        type: "string",
        pattern: "^[A-Za-z]{2}[0-9]{1,2}[A-Za-z]{0,3}[0-9]{4}$",
        examples: ["TS16FD7966", "HR55AP0244"],
        description: "Vehicle Registration Number (e.g. TS16FD7966)",
      },
      vehicleCategory: {
        type: ["string", "null"],
        description: "Selected Vehicle Category",
      },
      vehicleType: {
        type: ["string", "null"],
        description: "Selected Vehicle Type",
      },
      chassisNumber: {
        type: "string",
        description: "Optional Vehicle Chassis Number",
      },
      engineNumber: {
        type: "string",
        description: "Optional Vehicle Engine Number",
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
