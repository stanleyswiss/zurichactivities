import { db } from '@/lib/db';

interface GeocodeResult {
  lat: number;
  lon: number;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    // Normalize and check cache
    const normalized = normalizeAddress(address);
    const ttlDays = parseInt(process.env.GEOCODE_CACHE_TTL_DAYS || '365');
    const cached = await getFromCache(normalized, ttlDays);
    if (cached) return cached;

    // Use OpenStreetMap Nominatim for geocoding (free and reliable)
    await rateLimit();
    const encodedAddress = encodeURIComponent(`${address}, Switzerland`);
    const email = process.env.NOMINATIM_EMAIL;
    const ua = `SwissActivitiesDashboard/1.0${email ? ` (${email})` : ''}`;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&countrycodes=ch`,
      {
        headers: {
          'User-Agent': ua
        }
      }
    );

    if (!response.ok) {
      console.error('Geocoding API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
      await saveToCache(normalized, result);
      return result;
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', address, error);
    return null;
  }
}

export function formatSwissAddress(
  street?: string,
  postalCode?: string,
  city?: string
): string {
  const parts = [];
  if (street) parts.push(street);
  if (postalCode && city) {
    parts.push(`${postalCode} ${city}`);
  } else if (city) {
    parts.push(city);
  }
  return parts.join(', ');
}

// Helpers: address normalization and cache access
function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getFromCache(addressKey: string, ttlDays: number): Promise<GeocodeResult | null> {
  try {
    const record = await db.geocodeCache.findUnique({ where: { addressKey } });
    if (!record) return null;
    const ageMs = Date.now() - new Date(record.updatedAt).getTime();
    const maxAgeMs = ttlDays * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) return null;
    return { lat: record.lat, lon: record.lon };
  } catch (e) {
    return null;
  }
}

async function saveToCache(addressKey: string, result: GeocodeResult): Promise<void> {
  try {
    await db.geocodeCache.upsert({
      where: { addressKey },
      update: { lat: result.lat, lon: result.lon },
      create: { addressKey, lat: result.lat, lon: result.lon }
    });
  } catch (e) {
    // best-effort cache
  }
}

let lastGeoRequest = 0;
async function rateLimit(): Promise<void> {
  const minIntervalMs = 1000; // 1 req/s
  const now = Date.now();
  const wait = Math.max(0, minIntervalMs - (now - lastGeoRequest));
  if (wait > 0) {
    await new Promise(res => setTimeout(res, wait));
  }
  lastGeoRequest = Date.now();
}
