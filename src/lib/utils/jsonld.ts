import * as cheerio from 'cheerio';
import { RawEvent, CATEGORIES, SOURCES } from '@/types/event';
import { geocodeAddress, formatSwissAddress } from '@/lib/utils/geocoding';

type Json = any;

function parseJson(text: string): Json[] {
  const results: Json[] = [];
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) return obj;
    return [obj];
  } catch {
    // Some sites concatenate multiple JSON objects; try to split
    const blocks = text
      .split(/\}\s*\{/) // naive split
      .map((b, i, arr) => (i === 0 ? b + '}' : i === arr.length - 1 ? '{' + b : '{' + b + '}'));
    for (const b of blocks) {
      try {
        results.push(JSON.parse(b));
      } catch {}
    }
    return results;
  }
}

export function extractJsonLd(html: string): Json[] {
  const $ = cheerio.load(html);
  const rawBlocks = $('script[type="application/ld+json"]').toArray().map(el => $(el).contents().text());
  const docs: Json[] = [];
  for (const raw of rawBlocks) {
    const parts = parseJson(raw);
    docs.push(...parts);
  }
  return docs;
}

function isEventNode(node: Json): boolean {
  const type = node['@type'] || node.type;
  if (!type) return false;
  if (Array.isArray(type)) return type.includes('Event');
  return typeof type === 'string' && type.toLowerCase().includes('event');
}

function mapCategory(text: string): string | undefined {
  const t = text.toLowerCase();
  if (t.includes('alp') || t.includes('vieh')) return CATEGORIES.ALPSABZUG;
  if (t.includes('festival') || t.includes('fest')) return CATEGORIES.FESTIVAL;
  if (t.includes('konzert') || t.includes('musik') || t.includes('music')) return CATEGORIES.MUSIC;
  if (t.includes('markt') || t.includes('market')) return CATEGORIES.MARKET;
  if (t.includes('famil') || t.includes('family')) return CATEGORIES.FAMILY;
  if (t.includes('sport')) return CATEGORIES.SPORTS;
  if (t.includes('kultur') || t.includes('theater') || t.includes('culture')) return CATEGORIES.CULTURE;
  if (t.includes('weihnacht') || t.includes('advent') || t.includes('christmas')) return CATEGORIES.SEASONAL;
  return undefined;
}

export async function jsonLdToRawEvents(docs: Json[], fallbackSource: string, defaultLang: string = 'de'): Promise<RawEvent[]> {
  const rawEvents: RawEvent[] = [];

  // Flatten graphs/arrays
  const nodes: Json[] = [];
  for (const doc of docs) {
    if (Array.isArray(doc)) nodes.push(...doc);
    else if (doc['@graph']) nodes.push(...doc['@graph']);
    else nodes.push(doc);
  }

  for (const node of nodes) {
    if (!isEventNode(node)) continue;
    const name = node.name || node.headline || node.title;
    const description = node.description;
    const start = node.startDate || node.startTime || node.dateStart;
    const end = node.endDate || node.endTime || node.dateEnd;
    if (!name || !start) continue;

    let lat: number | undefined;
    let lon: number | undefined;
    let venueName: string | undefined;
    let street: string | undefined;
    let postalCode: string | undefined;
    let city: string | undefined;

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
      const address = formatSwissAddress(street, postalCode, city);
      const g = await geocodeAddress(address);
      if (g) { lat = g.lat; lon = g.lon; }
    }

    // Offers
    let priceMin: number | undefined;
    let priceMax: number | undefined;
    let currency: string | undefined;
    const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
    for (const offer of offers) {
      const p = parseFloat(offer.price);
      if (!isNaN(p)) {
        if (priceMin == null || p < priceMin) priceMin = p;
        if (priceMax == null || p > priceMax) priceMax = p;
      }
      currency = offer.priceCurrency || currency;
    }

    const url: string | undefined = node.url || node['@id'];
    const imageUrl: string | undefined = node.image && (Array.isArray(node.image) ? node.image[0] : node.image);
    const category = mapCategory(`${name} ${description || ''}`);

    const raw: RawEvent = {
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

