// Runs the server against a throwaway in-memory MongoDB: handy before Atlas is set up.
// Everything (accounts, albums) is lost when it stops. Photos still go to the upload folder.
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('momento');
process.env.JWT_SECRET ||= 'dev-only-secret';
console.log('Using an in-memory MongoDB. Data is lost when this stops.');
await import('../src/server.js');
