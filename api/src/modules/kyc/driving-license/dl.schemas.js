/**
 * role of this schemas.js file:
This is the API Contract / Gatekeeper. It uses Fastify's built-in schema validator (Ajv). If a client sends an invalid DL format, a missing DOB, or misses the DPDP consent checkbox, Fastify rejects it with 400 Bad Request immediately before any database or paid API call is made.
 */

// 1 resuable DPDP act 2023 consent schema
export const dpdpConsentSchema = {
    type : 'object',
    required : ['agreed','noticeVersion'],
    properties: {
        agreed:{
            type: 'boolean',
            enum: [true], // must be explicity true
            description: 'Explicit user authorization confirming consent is granted.',
        },
        noticeVersion:{
            type: 'string',
            minLength: 3,
            maxLength: 50,
            description: 'Privacy notice version shown to the user',
        },
        noticeText:{
            type: 'string',
            maxLength: 2000,
            description: 'Snapshot of the consent text displayed to the user.',
        },
    },
    additionalProperties: false,
};


// 2. main driving license route schema
export const DrivingLicenseSchema = {
    summary: 'Verify Driving License',
    description: 'Verifies driving license authenticity with Parivahan and evaluates heavy equipment eligibility.',
    tags: ['KYC - Driving License'],
    body:{
        type: 'object',
        required: ['dlNumber','dob','consent'],
        properties:{
            dlNumber:{
                type: 'string',
                minLength: 8,
                maxLength: 25,
                description: 'Driving license number to be verified.',
            },
            dob:{
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                description: 'Date of birth in YYYY-MM-DD FORMAT',
            },
            forceRefresh:{
                type:'boolean',
                default: false,
                description: 'Bypass internal cache to force a fresh paid API  call to RTO.',
            },
            frontDocument: {
                type: ['object', 'null'],
                nullable: true,
                properties: {
                    fileBase64: { type: 'string' },
                    originalFilename: { type: 'string' },
                    mimeType: { type: 'string' },
                },
                additionalProperties: true,
            },
            backDocument: {
                type: ['object', 'null'],
                nullable: true,
                properties: {
                    fileBase64: { type: 'string' },
                    originalFilename: { type: 'string' },
                    mimeType: { type: 'string' },
                },
                additionalProperties: true,
            },
            consent: dpdpConsentSchema,
        },
        additionalProperties: false,
    },
    response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        isVerified: { type: 'boolean' },
        verificationStatus: { type: 'string', enum: ['VERIFIED', 'REJECTED'] },
        rejectionReasons: { type: 'array', items: { type: 'string' } },
        source: { type: 'string', enum: ['CACHE', 'SUREPASS', 'MOCK'] },
        consentId: { type: 'string' },
        data: { type: 'object', additionalProperties: true,nullable: true, },
      },
    },
  },
};