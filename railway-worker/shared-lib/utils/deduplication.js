"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniquenessHash = generateUniquenessHash;
exports.normalizeTitle = normalizeTitle;
const crypto_1 = require("crypto");
function generateUniquenessHash(event) {
    const normalized = {
        title: event.title.toLowerCase().trim(),
        startTime: Math.round(event.startTime.getTime() / 60000), // minute precision
        lat: event.lat ? Math.round(event.lat * 10000) / 10000 : null,
        lon: event.lon ? Math.round(event.lon * 10000) / 10000 : null
    };
    return (0, crypto_1.createHash)('sha1')
        .update(JSON.stringify(normalized))
        .digest('hex');
}
function normalizeTitle(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' '); // Normalize spaces
}
