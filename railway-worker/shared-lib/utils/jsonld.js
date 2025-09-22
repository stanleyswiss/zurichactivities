"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractJsonLd = extractJsonLd;
exports.jsonLdToRawEvents = jsonLdToRawEvents;
const cheerio = __importStar(require("cheerio"));
const event_1 = require("@/types/event");
const geocoding_1 = require("@/lib/utils/geocoding");
function parseJson(text) {
    const results = [];
    try {
        const obj = JSON.parse(text);
        if (Array.isArray(obj))
            return obj;
        return [obj];
    }
    catch {
        // Some sites concatenate multiple JSON objects; try to split
        const blocks = text
            .split(/\}\s*\{/) // naive split
            .map((b, i, arr) => (i === 0 ? b + '}' : i === arr.length - 1 ? '{' + b : '{' + b + '}'));
        for (const b of blocks) {
            try {
                results.push(JSON.parse(b));
            }
            catch { }
        }
        return results;
    }
}
function extractJsonLd(html) {
    const $ = cheerio.load(html);
    const rawBlocks = $('script[type="application/ld+json"]').toArray().map(el => $(el).contents().text());
    const docs = [];
    for (const raw of rawBlocks) {
        const parts = parseJson(raw);
        docs.push(...parts);
    }
    return docs;
}
function isEventNode(node) {
    const type = node['@type'] || node.type;
    if (!type)
        return false;
    if (Array.isArray(type))
        return type.includes('Event');
    return typeof type === 'string' && type.toLowerCase().includes('event');
}
function mapCategory(text) {
    const t = text.toLowerCase();
    if (t.includes('alp') || t.includes('vieh'))
        return event_1.CATEGORIES.ALPSABZUG;
    if (t.includes('festival') || t.includes('fest'))
        return event_1.CATEGORIES.FESTIVAL;
    if (t.includes('konzert') || t.includes('musik') || t.includes('music'))
        return event_1.CATEGORIES.MUSIC;
    if (t.includes('markt') || t.includes('market'))
        return event_1.CATEGORIES.MARKET;
    if (t.includes('famil') || t.includes('family'))
        return event_1.CATEGORIES.FAMILY;
    if (t.includes('sport'))
        return event_1.CATEGORIES.SPORTS;
    if (t.includes('kultur') || t.includes('theater') || t.includes('culture'))
        return event_1.CATEGORIES.CULTURE;
    if (t.includes('weihnacht') || t.includes('advent') || t.includes('christmas'))
        return event_1.CATEGORIES.SEASONAL;
    return undefined;
}
async function jsonLdToRawEvents(docs, fallbackSource, defaultLang = 'de') {
    const rawEvents = [];
    // Flatten graphs/arrays
    const nodes = [];
    for (const doc of docs) {
        if (Array.isArray(doc))
            nodes.push(...doc);
        else if (doc['@graph'])
            nodes.push(...doc['@graph']);
        else
            nodes.push(doc);
    }
    for (const node of nodes) {
        if (!isEventNode(node))
            continue;
        const name = node.name || node.headline || node.title;
        const description = node.description;
        const start = node.startDate || node.startTime || node.dateStart;
        const end = node.endDate || node.endTime || node.dateEnd;
        if (!name || !start)
            continue;
        let lat;
        let lon;
        let venueName;
        let street;
        let postalCode;
        let city;
        const location = node.location || node['@location'];
        if (location) {
            venueName = location.name;
            const addr = location.address || location['@address'];
            if (addr) {
                street = addr.streetAddress;
                postalCode = addr.postalCode;
                city = addr.addressLocality || addr.addressRegion || addr.addressLocalityName;
            }
            const geo = location.geo;
            if (geo) {
                lat = parseFloat(geo.latitude);
                lon = parseFloat(geo.longitude);
            }
        }
        if ((!lat || !lon) && (street || city || postalCode)) {
            const address = (0, geocoding_1.formatSwissAddress)(street, postalCode, city);
            const g = await (0, geocoding_1.geocodeAddress)(address);
            if (g) {
                lat = g.lat;
                lon = g.lon;
            }
        }
        // Offers
        let priceMin;
        let priceMax;
        let currency;
        const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
        for (const offer of offers) {
            const p = parseFloat(offer.price);
            if (!isNaN(p)) {
                if (priceMin == null || p < priceMin)
                    priceMin = p;
                if (priceMax == null || p > priceMax)
                    priceMax = p;
            }
            currency = offer.priceCurrency || currency;
        }
        const url = node.url || node['@id'];
        const imageUrl = node.image && (Array.isArray(node.image) ? node.image[0] : node.image);
        const category = mapCategory(`${name} ${description || ''}`);
        const raw = {
            source: fallbackSource,
            sourceEventId: typeof url === 'string' ? url : undefined,
            title: name,
            description,
            lang: defaultLang,
            category,
            startTime: new Date(start),
            endTime: end ? new Date(end) : undefined,
            venueName,
            street,
            postalCode,
            city,
            country: 'CH',
            lat,
            lon,
            priceMin,
            priceMax,
            currency: currency || 'CHF',
            url: typeof url === 'string' ? url : undefined,
            imageUrl
        };
        rawEvents.push(raw);
    }
    return rawEvents;
}
