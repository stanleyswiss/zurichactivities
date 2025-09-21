import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import pLimit from "p-limit";
import slugify from "slugify";
import { load as loadHtml } from "cheerio";

type Seed = {
  bfs_number: string;
  name: string;
  canton: string;
  latitude: number;
  longitude: number;
  website_url: string | null;
};
type RawSeed = Seed & Record<string, unknown>;

type Args = Record<string, string | boolean>;

function parseArgs(): Args {
  const entries = process.argv.slice(2).map((arg) => {
    const [key, value] = arg.split("=");
    return [key.replace(/^--/, ""), value ?? true];
  });
  return Object.fromEntries(entries);
}

const args = parseArgs();
const IN = (args.in as string) || "data/municipalities_seed.json";
const OUT = (args.out as string) || "data/municipalities_seed.enriched.json";

const CANTON_CODE_TO_ABBREV: Record<string, string> = {
  "1": "ZH",
  "01": "ZH",
  "2": "BE",
  "02": "BE",
  "3": "LU",
  "03": "LU",
  "4": "UR",
  "04": "UR",
  "5": "SZ",
  "05": "SZ",
  "6": "OW",
  "06": "OW",
  "7": "NW",
  "07": "NW",
  "8": "GL",
  "08": "GL",
  "9": "ZG",
  "09": "ZG",
  "10": "FR",
  "11": "SO",
  "12": "BS",
  "13": "BL",
  "14": "SH",
  "15": "AR",
  "16": "AI",
  "17": "SG",
  "18": "GR",
  "19": "AG",
  "20": "TG",
  "21": "TI",
  "22": "VD",
  "23": "VS",
  "24": "NE",
  "25": "GE",
  "26": "JU",
};

function toSeed(entry: RawSeed): Seed {
  if (entry && typeof entry === "object" && "bfs_number" in entry && "name" in entry) {
    const typed = entry as Seed;
    return {
      bfs_number: String(typed.bfs_number),
      name: String(typed.name),
      canton: String(typed.canton),
      latitude: Number(typed.latitude),
      longitude: Number(typed.longitude),
      website_url: typed.website_url ?? null,
    };
  }

  const bfsRaw = Array.isArray(entry.gem_code) ? entry.gem_code[0] : entry.gem_code;
  if (!bfsRaw) {
    throw new Error("Missing BFS number in seed entry");
  }

  const name = Array.isArray(entry.gem_name) ? entry.gem_name[0] : entry.gem_name;
  if (!name) {
    throw new Error(`Missing municipality name for BFS ${bfsRaw}`);
  }

  const cantonRaw = entry.canton ?? entry.canton_abbreviation ?? (Array.isArray(entry.kan_code) ? entry.kan_code[0] : entry.kan_code);
  const cantonName = Array.isArray(entry.kan_name) ? entry.kan_name[0] : entry.kan_name;
  let canton = "";
  if (typeof cantonRaw === "string" && CANTON_CODE_TO_ABBREV[cantonRaw]) {
    canton = CANTON_CODE_TO_ABBREV[cantonRaw];
  } else if (typeof cantonName === "string" && cantonName.length >= 2) {
    canton = cantonName.slice(0, 2).toUpperCase();
  } else if (typeof cantonRaw === "string" && cantonRaw.length === 2) {
    canton = cantonRaw.toUpperCase();
  } else {
    throw new Error(`Unable to determine canton for BFS ${bfsRaw}`);
  }

  const point =
    entry.geo_point_2d && typeof entry.geo_point_2d === "object"
      ? entry.geo_point_2d
      : entry.coordinates ?? entry.location ?? null;

  const lat = Number(point?.lat ?? (Array.isArray(point) ? point[1] : undefined) ?? entry.latitude ?? entry.lat);
  const lon = Number(point?.lon ?? (Array.isArray(point) ? point[0] : undefined) ?? entry.longitude ?? entry.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Missing coordinates for BFS ${bfsRaw}`);
  }

  return {
    bfs_number: String(bfsRaw),
    name: String(name),
    canton,
    latitude: lat,
    longitude: lon,
    website_url: entry.website_url ? String(entry.website_url) : null,
  };
}

const limit = pLimit(6);

const cantonDirectorySources: Record<string, { url: string; extractor: (html: string, muni: Seed) => string | null }> = {
  ZH: {
    url: "https://www.zh.ch/de/politik-staat/gemeinden.html",
    extractor: (html, muni) => {
      const $ = loadHtml(html);
      const target = muni.name.toLowerCase();
      let match: string | null = null;
      $("a[href^='http']").each((_, anchor) => {
        const text = ($(anchor).text() || "").trim().toLowerCase();
        const href = ($(anchor).attr("href") || "").trim();
        if (!href) return;
        if (text.includes(target) && /^https?:\/\/(www\.)?[^/]+\.[a-z]{2,}$/i.test(href)) {
          match = href;
        }
      });
      return match;
    },
  },
  BE: {
    url: "https://www.gemeinden.be.ch/de/start/daten/gemeindedaten.html",
    extractor: (html, muni) => {
      const $ = loadHtml(html);
      const anchor = $("a[href^='http']").filter((_, a) => ($(a).text() || "").toLowerCase().includes(muni.name.toLowerCase())).first();
      const href = anchor.attr("href");
      return href ?? null;
    },
  },
};

function candidateDomains(name: string, canton: string): string[] {
  const compact = slugify(name, { lower: true, strict: true }).replace(/-/g, "");
  const dashed = slugify(name, { lower: true, strict: true });
  const cantonLower = canton.toLowerCase();

  const candidates = [
    `https://www.${compact}.ch`,
    `https://www.${dashed}.ch`,
    `https://${compact}.ch`,
    `https://${dashed}.ch`,
    `https://www.gemeinde-${dashed}.ch`,
    `https://www.${dashed}-${cantonLower}.ch`,
    `https://www.${dashed}.${cantonLower}.ch`,
  ];

  return Array.from(new Set(candidates));
}

function strongSignals(html: string, muniName: string): boolean {
  const lower = html.toLowerCase();
  const target = muniName.toLowerCase();
  const titleMatch =
    lower.includes(`gemeinde ${target}`) ||
    lower.includes(`commune de ${target}`) ||
    lower.includes(`comune di ${target}`) ||
    lower.includes(`vischnanca ${target}`);
  const imprint = /impressum|kontakt|kontaktformular|legale/.test(lower);
  const address = /gemeindeverwaltung|stadtverwaltung|stadthaus|rathaus/.test(lower);
  const crest = /wappen|gemeindewappen|coat[- ]of[- ]arms/.test(lower);

  let score = 0;
  if (titleMatch) score += 2;
  if (imprint) score += 1;
  if (address) score += 1;
  if (crest) score += 0.5;
  return score >= 2;
}

async function fetchText(ctx: any, url: string): Promise<string> {
  try {
    const response = await ctx.request.get(url, { timeout: 20_000 });
    if (response.ok()) {
      return await response.text();
    }
  } catch (error) {
    // noop
  }
  return "";
}

(async function run() {
  const rawData: RawSeed[] = JSON.parse(fs.readFileSync(IN, "utf-8"));
  const raw: Seed[] = rawData.map(toSeed);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const cantonCache: Record<string, string> = {};
  for (const key of Object.keys(cantonDirectorySources)) {
    const { url } = cantonDirectorySources[key];
    const html = await fetchText(context, url);
    if (html) {
      cantonCache[key] = html;
    }
  }

  const results = await Promise.all(
    raw.map((seed) =>
      limit(async () => {
        if (seed.website_url) {
          return seed;
        }

        const cantonSource = cantonDirectorySources[seed.canton];
        if (cantonSource && cantonCache[seed.canton]) {
          const candidate = cantonSource.extractor(cantonCache[seed.canton], seed);
          if (candidate) {
            return { ...seed, website_url: candidate };
          }
        }

        for (const candidate of candidateDomains(seed.name, seed.canton)) {
          try {
            const response = await context.request.get(candidate, { timeout: 15_000 });
            if (!response.ok()) continue;
            const html = await response.text();
            if (strongSignals(html, seed.name)) {
              return { ...seed, website_url: candidate };
            }
          } catch (error) {
            // ignore and try next candidate
          }
        }

        return { ...seed, website_url: null };
      })
    )
  );

  await browser.close();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

  const known = results.filter((item) => item.website_url).length;
  const unknown = results.length - known;
  console.log(`✅ Enriched: ${known} domains found, ${unknown} still unknown. Wrote ${OUT}`);
})();
