/**
 * DPDP Act 2023 Consent Management Schemas
 * Fastify / Ajv JSON Schema
 */

export const getConsentSchema = {
  summary: 'Get DPDP Act User Consent Artifact',
  description: 'Fetches the immutable digital consent record for audit compliance.',
  tags: ['KYC - Consent'],
  params: {
    type: 'object',
    required: ['consentId'],
    properties: {
      consentId: { type: 'string', format: 'uuid', description: 'Unique Consent ID' },
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
            status: { type: 'string' },
            granted_at: { type: 'string' },
            revoked_at: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
};

export const revokeConsentSchema = {
  summary: 'Revoke User Consent (DPDP Act 2023 Sec 6(4))',
  description: 'Revokes a previously granted user consent artifact.',
  tags: ['KYC - Consent'],
  params: {
    type: 'object',
    required: ['consentId'],
    properties: {
      consentId: { type: 'string', format: 'uuid', description: 'Consent ID to revoke' },
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

