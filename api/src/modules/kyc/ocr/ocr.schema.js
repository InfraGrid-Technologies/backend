/**
 * KYC OCR Validation Schemas
 * Standard Fastify JSON Schemas for AI document scanning
 */

const dpdpConsentSchema = {
  anyOf: [
    {
      type: "object",
      required: ["agreed"],
      properties: {
        agreed: { type: "boolean" },
        noticeVersion: { type: "string" },
        noticeText: { type: "string" },
      },
    },
    { type: "boolean" },
  ],
};

export const ocrRcSchema = {
  description:
    "Extract vehicle registration, engine, chassis numbers and owner name from RC smart card image using AI OCR",
  tags: ["KYC - OCR Document Extraction"],
  body: {
    type: "object",
    required: ["consent"],
    properties: {
      imageBase64: {
        type: "string",
        description:
          "Base64 encoded string of RC document (JPEG/PNG/PDF, up to 10MB)",
      },
      fileUrl: {
        type: "string",
        description:
          "Direct accessible URL of RC document if stored in S3/cloud storage",
      },
      mimeType: {
        type: "string",
        default: "image/jpeg",
      },
      consent: dpdpConsentSchema,
    },
    anyOf: [{ required: ["imageBase64"] }, { required: ["fileUrl"] }],
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        status: { type: "string" },
        consentId: { type: "string" },
        provider: { type: "string" },
        data: {
          type: "object",
          additionalProperties: true,
          properties: {
            vehicleNumber: { type: ["string", "null"] },
            engineNumber: { type: ["string", "null"] },
            chassisNumber: { type: ["string", "null"] },
            ownerName: { type: ["string", "null"] },
            makerModel: { type: ["string", "null"] },
            vehicleClass: { type: ["string", "null"] },
            fuelType: { type: ["string", "null"] },
            registrationDate: { type: ["string", "null"] },
            ocrConfidence: { type: "number" },
          },
        },
      },
    },
  },
};

export const ocrDrivingLicenseSchema = {
  description:
    "Extract driving license number, DOB, and driver name from DL image using AI OCR",
  tags: ["KYC - OCR Document Extraction"],
  body: {
    type: "object",
    required: ["consent"],
    properties: {
      imageBase64: {
        type: "string",
        description:
          "Base64 encoded string of Driving License document (JPEG/PNG/PDF, up to 10MB)",
      },
      fileUrl: {
        type: "string",
        description: "Direct accessible URL of DL document",
      },
      mimeType: {
        type: "string",
        default: "image/jpeg",
      },
      consent: dpdpConsentSchema,
    },
    anyOf: [{ required: ["imageBase64"] }, { required: ["fileUrl"] }],
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        status: { type: "string" },
        consentId: { type: "string" },
        provider: { type: "string" },
        data: {
          type: "object",
          additionalProperties: true,
          properties: {
            dlNumber: { type: ["string", "null"] },
            dob: { type: ["string", "null"] },
            name: { type: ["string", "null"] },
            fatherOrHusbandName: { type: ["string", "null"] },
            address: { type: ["string", "null"] },
            ocrConfidence: { type: "number" },
          },
        },
      },
    },
  },
};

/**
 * "In Fastify, a schema.js file acts as a strict contract for an API route—much like a Serializer in Django REST Framework. It uses JSON Schema to do three main things: it validates incoming request data (body, params, headers), strips out sensitive or extra fields from the outgoing response, and significantly speeds up JSON serialization by pre-compiling the response structure.
 */
