"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwissMunicipalityService = void 0;
const distance_1 = require("../utils/distance");
const SCHLIEREN_COORDS = {
    lat: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LAT || '47.396'),
    lon: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LON || '8.447'),
};
const CANTON_CODE_TO_ABBREV = {
    '1': 'ZH',
    '01': 'ZH',
    '2': 'BE',
    '02': 'BE',
    '3': 'LU',
    '03': 'LU',
    '4': 'UR',
    '04': 'UR',
    '5': 'SZ',
    '05': 'SZ',
    '6': 'OW',
    '06': 'OW',
    '7': 'NW',
    '07': 'NW',
    '8': 'GL',
    '08': 'GL',
    '9': 'ZG',
    '09': 'ZG',
    '10': 'FR',
    '11': 'SO',
    '12': 'BS',
    '13': 'BL',
    '14': 'SH',
    '15': 'AR',
    '16': 'AI',
    '17': 'SG',
    '18': 'GR',
    '19': 'AG',
    '20': 'TG',
    '21': 'TI',
    '22': 'VD',
    '23': 'VS',
    '24': 'NE',
    '25': 'GE',
    '26': 'JU',
};
class SwissMunicipalityService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async fetchAndStoreMunicipalities(maxDistance = 200) {
        console.log(`Fetching Swiss municipalities within ${maxDistance}km of Schlieren...`);
        try {
            const municipalities = await this.fetchFromSwissPost();
            if (!municipalities || municipalities.length === 0) {
                throw new Error('Swiss Post API returned no municipalities. Aborting seed so deployment can surface the failure.');
            }
            let stored = 0;
            let skipped = 0;
            for (const muni of municipalities) {
                if (!Number.isFinite(muni.bfsNr)) {
                    skipped++;
                    continue;
                }
                if (!muni.latitude || !muni.longitude) {
                    skipped++;
                    continue;
                }
                const distance = (0, distance_1.calculateDistance)(SCHLIEREN_COORDS.lat, SCHLIEREN_COORDS.lon, muni.latitude, muni.longitude);
                if (distance <= maxDistance) {
                    await this.upsertMunicipality({
                        bfsNumber: muni.bfsNr,
                        name: muni.gemeindename,
                        canton: muni.kanton,
                        district: muni.bezirk,
                        lat: muni.latitude,
                        lon: muni.longitude,
                        distanceFromHome: distance,
                    });
                    stored++;
                }
            }
            console.log(`Stored ${stored} municipalities within ${maxDistance}km (skipped ${skipped} without coordinates)`);
            return { stored, skipped, total: municipalities.length };
        }
        catch (error) {
            console.error('Error fetching municipalities:', error);
            throw error;
        }
    }
    async fetchFromSwissPost() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const pageSize = 100;
        const baseUrl = 'https://public.opendatasoft.com/api/v2/catalog/datasets/georef-switzerland-gemeinde/records';
        const targetYear = (_a = process.env.SWISS_MUNICIPALITY_YEAR) !== null && _a !== void 0 ? _a : '2025';
        const collected = [];
        try {
            let offset = 0;
            let total = Infinity;
            while (offset < total) {
                const url = new URL(baseUrl);
                url.searchParams.set('limit', String(pageSize));
                url.searchParams.set('offset', String(offset));
                url.searchParams.set('timezone', 'UTC');
                url.searchParams.set('refine.year', targetYear);
                const response = await fetch(url);
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`Swiss Post API error: ${response.status} – ${errorBody}`);
                }
                const data = await response.json();
                const records = (_b = data.records) !== null && _b !== void 0 ? _b : [];
                if (records.length === 0) {
                    break;
                }
                total = (_c = data.total_count) !== null && _c !== void 0 ? _c : total;
                for (const entry of records) {
                    const fields = (_e = (_d = entry.record) === null || _d === void 0 ? void 0 : _d.fields) !== null && _e !== void 0 ? _e : {};
                    const bfsRaw = Array.isArray(fields.gem_code) ? fields.gem_code[0] : fields.gem_code;
                    const bfsNr = Number.parseInt(bfsRaw, 10);
                    if (!Number.isFinite(bfsNr)) {
                        continue;
                    }
                    const name = (_f = this.extractStringField(fields.gem_name)) !== null && _f !== void 0 ? _f : String(bfsNr);
                    const canton = (_h = (_g = this.resolveCantonAbbrev(fields.kan_code)) !== null && _g !== void 0 ? _g : this.extractStringField(fields.kan_name)) !== null && _h !== void 0 ? _h : 'Unknown';
                    const district = this.extractStringField(fields.bez_name);
                    const point = fields.geo_point_2d;
                    const latitude = (_j = point === null || point === void 0 ? void 0 : point.lat) !== null && _j !== void 0 ? _j : (Array.isArray(point) ? point[0] : undefined);
                    const longitude = (_k = point === null || point === void 0 ? void 0 : point.lon) !== null && _k !== void 0 ? _k : (Array.isArray(point) ? point[1] : undefined);
                    collected.push({
                        bfsNr,
                        gemeindename: name,
                        kanton: canton,
                        bezirk: district !== null && district !== void 0 ? district : undefined,
                        latitude,
                        longitude,
                    });
                }
                offset += pageSize;
            }
            const deduped = new Map();
            for (const muni of collected) {
                if (Number.isFinite(muni.bfsNr)) {
                    deduped.set(muni.bfsNr, muni);
                }
            }
            return Array.from(deduped.values());
        }
        catch (error) {
            console.error('Swiss Post API error:', error);
            throw error;
        }
    }
    async fetchFromOpenDataSwiss() {
        try {
            // Official Swiss municipality register
            const response = await fetch('https://data.geo.admin.ch/ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill/v1/current/gemeinde.json');
            if (!response.ok) {
                throw new Error(`OpenData API error: ${response.status}`);
            }
            const data = await response.json();
            // This returns GeoJSON, we'd need to process it differently
            console.log('OpenData response needs custom processing...');
            return { stored: 0, skipped: 0, total: 0 };
        }
        catch (error) {
            console.error('OpenData.swiss API error:', error);
            return { stored: 0, skipped: 0, total: 0 };
        }
    }
    async upsertMunicipality(data) {
        const nameNorm = this.normalizeName(data.name);
        await this.prisma.municipality.upsert({
            where: { bfsNumber: data.bfsNumber },
            create: {
                bfsNumber: data.bfsNumber,
                name: data.name,
                nameNorm,
                canton: data.canton,
                district: data.district,
                lat: data.lat,
                lon: data.lon,
                distanceFromHome: data.distanceFromHome,
                scrapeStatus: 'pending',
            },
            update: {
                name: data.name,
                nameNorm,
                canton: data.canton,
                district: data.district,
                lat: data.lat,
                lon: data.lon,
                distanceFromHome: data.distanceFromHome,
            },
        });
    }
    normalizeName(name) {
        return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
            .replace(/[^a-z0-9]/g, ''); // Keep only alphanumeric
    }
    resolveCantonAbbrev(value) {
        var _a;
        const raw = Array.isArray(value) ? value[0] : value;
        if (typeof raw !== 'string') {
            return undefined;
        }
        const trimmed = raw.replace(/^0+/, '') || raw;
        return (_a = CANTON_CODE_TO_ABBREV[trimmed]) !== null && _a !== void 0 ? _a : CANTON_CODE_TO_ABBREV[raw];
    }
    extractStringField(value) {
        if (typeof value === 'string') {
            return value;
        }
        if (Array.isArray(value) && typeof value[0] === 'string') {
            return value[0];
        }
        return undefined;
    }
    async findWebsitePatterns() {
        // Common Swiss municipality website patterns
        const patterns = [
            (name) => `https://www.${name.toLowerCase()}.ch`,
            (name) => `https://${name.toLowerCase()}.ch`,
            (name) => `https://www.gemeinde-${name.toLowerCase()}.ch`,
            (name) => `https://www.stadt-${name.toLowerCase()}.ch`,
            (name) => `https://www.${name.toLowerCase().replace(/\s+/g, '-')}.ch`,
        ];
        const municipalities = await this.prisma.municipality.findMany({
            where: {
                websiteUrl: null,
                distanceFromHome: { lte: 50 } // Start with closer ones
            },
            orderBy: { distanceFromHome: 'asc' },
            take: 10, // Process in batches
        });
        for (const muni of municipalities) {
            for (const pattern of patterns) {
                const url = pattern(muni.name);
                try {
                    const response = await fetch(url, {
                        method: 'HEAD',
                        signal: AbortSignal.timeout(5000),
                    });
                    if (response.ok) {
                        await this.prisma.municipality.update({
                            where: { id: muni.id },
                            data: { websiteUrl: url },
                        });
                        console.log(`Found website for ${muni.name}: ${url}`);
                        break;
                    }
                }
                catch (error) {
                    // Try next pattern
                }
            }
        }
    }
    async detectEventPages() {
        const eventPatterns = [
            '/veranstaltungen',
            '/events',
            '/agenda',
            '/anlaesse',
            '/kalender',
            '/termine',
            '/aktuelles/veranstaltungen',
            '/de/veranstaltungen',
            '/gemeinde/veranstaltungen',
        ];
        const municipalities = await this.prisma.municipality.findMany({
            where: {
                websiteUrl: { not: null },
                eventPageUrl: null,
                distanceFromHome: { lte: 50 }
            },
            orderBy: { distanceFromHome: 'asc' },
            take: 10,
        });
        for (const muni of municipalities) {
            for (const pattern of eventPatterns) {
                const url = muni.websiteUrl + pattern;
                try {
                    const response = await fetch(url, {
                        signal: AbortSignal.timeout(5000),
                    });
                    if (response.ok) {
                        await this.prisma.municipality.update({
                            where: { id: muni.id },
                            data: {
                                eventPageUrl: url,
                                eventPagePattern: pattern,
                            },
                        });
                        console.log(`Found event page for ${muni.name}: ${url}`);
                        break;
                    }
                }
                catch (error) {
                    // Try next pattern
                }
            }
        }
    }
}
exports.SwissMunicipalityService = SwissMunicipalityService;
