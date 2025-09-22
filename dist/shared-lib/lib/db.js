"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const client_1 = require("@prisma/client");
const globalForPrisma = globalThis;
// Create Prisma client using public URL
function createPrismaClient() {
    // Use DATABASE_PUBLIC_URL since internal URL doesn't work from Vercel
    const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
    return new client_1.PrismaClient({
        datasources: {
            db: { url }
        }
    });
}
exports.db = (_a = globalForPrisma.prisma) !== null && _a !== void 0 ? _a : createPrismaClient();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.db;
