import fastify from 'fastify';
import kycModule from '../src/modules/kyc/index.js';
import { MockKycProvider } from '../src/modules/kyc/providers/mock.provider.js';

const app = fastify();
const mockDb = { pool: { query: async () => ({ rows: [] }) } };
const mockProvider = new MockKycProvider();

await app.register(kycModule, { db: mockDb, provider: mockProvider });
await app.ready();
console.log('✅ All KYC routes registered successfully with Fastify!');
console.log(app.printRoutes());
process.exit(0);

