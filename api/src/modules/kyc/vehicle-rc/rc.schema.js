/**
 * Vehicle RC Request & Response Validation Schemas
 * Fastify / Ajv JSON Schema
 */

/**
 * Its Role (The Bouncer & Contract):

Enforces the rules for the incoming vehicle request:

vehicleNumber: Must match Indian vehicle registration pattern (e.g., TS16FD7966, MH12AB1234, DL01A1234).
consent: Must have explicit DPDP consent (agreed: true).
Rejects invalid formats immediately with 400 Bad Request before calling Surepass.
 */

// 1. Reusable DPDP Act 2023 Consent Schema
export const dpdpConsentSchema = {
  type: "object",
  required: ["agreed", "noticeVersion"],
  properties: {
    agreed: {
      type: "boolean",
      enum: [true], // Must be explicitly true
      description: "Explicit user authorization confirming consent is granted.",
    },
    noticeVersion: {
      type: "string",
      minLength: 3,
      maxLength: 50,
      description:
        "Privacy notice version shown to the user (e.g. RC_NOTICE_V1.0).",
    },
    noticeText: {
      type: "string",
      maxLength: 2000,
      description: "Snapshot of the legal consent text displayed to the user.",
    },
  },
  additionalProperties: false,
};

// 2. main vehicle RC route schema

export const vehicleRcSchema = {
  summary: "Verify vehicle RC",
  description:
    "Verifies vehicle registration, commercial fitness, insurance, and PUC status with Parivahan/Vahan.",
  tags: ["KYC - Vehiccle RC"],
  body: {
    type: "object",
    required: ["vehicleNumber", "consent"],
    properties: {
      vehicleNumber: {
        type: "string",
        pattern: "^([A-Za-z]{2}[0-9]{1,2}[A-Za-z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Za-z]{1,2})$",
        examples: ["TS16FD7966", "DL01AB1234", "MH12AB1234", "22BH1234AA"],
        description: "Vehicle Registration Number (e.g. TS16FD7966 or 22BH1234AA)",
      },
      vehicleCategory: {
        type: ["string", "null"],
        description: "Expected vehicle category (e.g. Commercial Haulage & Transport, Earthmoving & Excavation)",
      },
      vehicleType: {
        type: ["string", "null"],
        description: "Specific vehicle type (e.g. Commercial Tipper / Dumper, Heavy Excavator)",
      },
      forceRefresh: {
        type: "boolean",
        default: false,
        description: "Bypass internal cache to force fresh paid API call to VAHAN.",
      },
      frontDocument: {
        type: ["object", "null"],
        nullable: true,
        properties: {
          fileBase64: { type: "string" },
          originalFilename: { type: "string" },
          mimeType: { type: "string" },
        },
        additionalProperties: true,
      },
      backDocument: {
        type: ["object", "null"],
        nullable: true,
        properties: {
          fileBase64: { type: "string" },
          originalFilename: { type: "string" },
          mimeType: { type: "string" },
        },
        additionalProperties: true,
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
        consentId: { type: "string" },
        data: { type: "object", additionalProperties: true,nullable: true, },
      },
    },
  },
};
