import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { load as loadHtml, CheerioAPI } from "cheerio";
import pLimit from "p-limit";

type Seed = {
  bfs_number: string;
  name: string;
  canton: string;
  latitude: number;
  longitude: number;
  website_url: string | null;
};

type OutRow = {
  bfs_number: string;
  name: string;
  canton: string;
  profile: "list-static" | "table-static" | "api-json" | "dynamic-js" | "unknown";
  website_url: string | null;
  event_page_url: string | null;
  cms_type: string;
  scraping_method: OutRow["profile"];
  event_selectors: Record<string, string>;
  date_format: string;
  time_format: string;
  language: string[];
  requires_javascript: boolean;
  ajax_pagination: boolean;
  structured_data: boolean;
  notes: string;
  latitude: number;
  longitude: number;
};

const SEED = process.env.SEED || "data/municipalities_seed.enriched.json";
const OUT_ENH = "data/enhanced_full.json";
const OUT_EVID = "data/municipalities_evidence.json";

const CANDIDATES = [
  "/veranstaltungen",
  "/anlaesse",
  "/anlässe",
  "/agenda",
  "/kalender",
  "/aktuelles/veranstaltungen",
  "/kultur/veranstaltungen",
  "/gesellschaft/veranstaltungen",
  "/leben/veranstaltungen",
  "/freizeit/veranstaltungen",
  "/index.php/aktuell/veranstaltungen",
];

const limit = pLimit(6);

function norm(u: string) {
  return u.replace(/\/+$/, "");
}

function detectCMS(html: string) {
  const evidence: string[] = [];
  let type = "unknown";
  let note = "";

  const generatorMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1];
  if (generatorMatch) {
    evidence.push(`generator:${generatorMatch}`);
    note += `generator=${generatorMatch}; `;
  }

  if (/wp-content\//i.test(html)) {
    type = "WordPress";
    evidence.push("wp-content");
  }
  if (/typo3conf\//i.test(html)) {
    type = "TYPO3";
    evidence.push("typo3conf");
  }
  if (/com_dpcalendar/i.test(html)) {
    if (type === "unknown") type = "Joomla";
    evidence.push("DPCalendar");
  }
  if (/Drupal.settings|drupalSettings/i.test(html)) {
    type = "Drupal";
    evidence.push("drupalSettings");
  }

  if (type === "unknown" && generatorMatch) {
    if (/wordpress/i.test(generatorMatch)) type = "WordPress";
    if (/typo3/i.test(generatorMatch)) type = "TYPO3";
    if (/joomla/i.test(generatorMatch)) type = "Joomla";
    if (/drupal/i.test(generatorMatch)) type = "Drupal";
  }

  return { type, evidence, note: note.trim() };
}

function isTable($: CheerioAPI) {
  return $("table tr").length >= 3 && ($("table th").length > 0 || $("table thead").length > 0);
}

function deriveFormats(samples: string[]) {
  const combined = samples.join(" ");
  const date_format =
    /\b\d{2}\.\d{2}\.\d{4}\b/.test(combined)
      ? "DD.MM.YYYY"
      : /\b\d{4}-\d{2}-\d{2}\b/.test(combined)
      ? "YYYY-MM-DD"
      : /(\d{1,2}\.\s*[A-Za-zäöüÄÖÜ]+\.?\s*\d{4})/.test(combined)
      ? "D. MMMM YYYY"
      : "unknown";
  const time_format =
    /\b\d{2}:\d{2}\b/.test(combined)
      ? "HH:mm"
      : /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(combined)
      ? "h:mm a"
      : "unknown";
  return { date_format, time_format };
}

async function jsPass(page: any) {
  const containers = await page.$$("[class*='event'], .veranstaltungen-list .item, .event-list .event-item, table tr");
  const count = containers.length;
  const paginationNext = await page.$("a[rel='next'], .pagination-next, button[aria-label*='weiter' i]");
  const ajaxNext = !!paginationNext;
  let selectors: Record<string, string> = {};

  const trySel = async (container: string, title: string, date: string, location: string, description: string) => {
    const elements = await page.$$(container);
    if (elements.length >= 2) {
      selectors = { container, title, date, location, description };
    }
  };

  await trySel(".event-item", ".event-title, h2, a", "time, .event-date, .date", ".event-location, .location", ".event-description, p");
  if (!selectors.container) {
    await trySel(".veranstaltungen-list .item", "h2, a", "time, .date", ".location", "p, .teaser");
  }
  if (!selectors.container && (await page.$("table tr"))) {
    selectors = {
      container: "table tr",
      title: "td:nth-child(2), a",
      date: "td:nth-child(1) time, td:nth-child(1)",
      location: "td:nth-child(3)",
      description: "td:nth-child(4)",
    };
  }

  let sample = "";
  const first = selectors.container ? await page.$(selectors.container) : null;
  if (first) {
    sample = (await first.evaluate((node: any) => node.outerHTML)).slice(0, 500);
  }

  if (ajaxNext) {
    selectors.pagination_next = "a[rel='next'], .pagination-next, button[aria-label*='weiter' i]";
  }

  return { count, selectors, sample, ajaxNext };
}

(async () => {
  const seeds: Seed[] = JSON.parse(fs.readFileSync(SEED, "utf-8"));
  fs.mkdirSync(path.dirname(OUT_ENH), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: "ZurichActivitiesBot/1.0 (+https://zurichactivities.vercel.app)",
  });

  const municipalities: OutRow[] = [];
  const errors: any[] = [];
  const evidence: any[] = [];

  await Promise.all(
    seeds.map((seed) =>
      limit(async () => {
        if (!seed.website_url) {
        municipalities.push({
          bfs_number: seed.bfs_number,
          name: seed.name,
          canton: seed.canton,
          profile: "unknown",
          website_url: null,
          event_page_url: null,
          cms_type: "unknown",
          scraping_method: "unknown",
          event_selectors: {},
          date_format: "unknown",
          time_format: "unknown",
          language: ["de"],
          requires_javascript: false,
          ajax_pagination: false,
          structured_data: false,
          notes: "No website_url in seed; skipped discovery.",
          latitude: seed.latitude,
          longitude: seed.longitude,
        });
          errors.push({ bfs_number: seed.bfs_number, name: seed.name, reason: "missing website_url" });
          return;
        }

        const base = norm(seed.website_url);
        const page = await ctx.newPage();

        let candidates = CANDIDATES.map((slug) => `${base}${slug}`);
        try {
          await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30_000 });
          const links = await page.$$eval("a", (anchors) => anchors.map((a) => (a as HTMLAnchorElement).href).filter(Boolean));
          const keywordLinks = links.filter((url) => /(veranstaltungen|anl(a|ä)sse|agenda|kalender)/i.test(url || ""));
          candidates = Array.from(new Set([...candidates, ...keywordLinks]));
        } catch (error) {
          // ignore
        }

        let picked: string | null = null;
        let staticHtml = "";
        let staticCount = 0;
        let selectors: Record<string, string> = {};

        for (const url of candidates) {
          try {
            const response = await ctx.request.get(url, { timeout: 20_000 });
            if (!response.ok()) continue;
            const html = await response.text();
            staticHtml = html;
        const $ = loadHtml(html);

            const listPatterns = [
              { container: ".event-item", title: ".event-title, h2, a", date: ".event-date, time, .date", location: ".event-location, .location", description: ".event-description, p" },
              { container: ".veranstaltungen-list .item", title: "h2, a", date: "time, .date", location: ".location", description: "p, .teaser" },
            ];
            let matched = 0;
            for (const pattern of listPatterns) {
              const count = $(pattern.container).length;
              if (count >= 2) {
                matched = count;
                selectors = {
                  container: pattern.container,
                  title: pattern.title,
                  date: pattern.date,
                  location: pattern.location,
                  description: pattern.description,
                };
                break;
              }
            }

            if (!matched && isTable($)) {
              matched = $("table tr").length;
              selectors = {
                container: "table tr",
                title: "td:nth-child(2), a",
                date: "td:nth-child(1) time, td:nth-child(1)",
                location: "td:nth-child(3)",
                description: "td:nth-child(4)",
              };
            }

            if (matched >= 2) {
              picked = url;
              staticCount = matched;
              break;
            }
          } catch (error) {
            // ignore
          }
        }

        if (!picked && candidates.length > 0) {
          picked = candidates[0];
        }

        let jsCount = 0;
        let ajax = false;
        let sample = "";
        let requiresJS = false;

        if (picked) {
          try {
            await page.goto(picked, { waitUntil: "networkidle", timeout: 45_000 });
            const js = await jsPass(page);
            if (!staticCount && js.count >= 2) {
              selectors = js.selectors;
            }
            jsCount = js.count;
            ajax = js.ajaxNext;
            sample = js.sample;
            requiresJS = jsCount >= 2 && staticCount < 2;
          } catch (error) {
            // ignore
          }
        }

        const homeHTML =
          staticHtml ||
          (await ctx.request
            .get(base)
            .then((response: any) => (response.ok() ? response.text() : ""))
            .catch(() => ""));

        const cms = detectCMS(homeHTML);
        const langAttr = homeHTML.match(/<html[^>]+lang=["']([^"']+)/i)?.[1] || "de";
        const { date_format, time_format } = deriveFormats([staticHtml]);

        const profile: OutRow["profile"] =
          staticCount >= 2
            ? selectors.container?.startsWith("table")
              ? "table-static"
              : "list-static"
            : jsCount >= 2
            ? "dynamic-js"
            : "unknown";

        const out: OutRow = {
          bfs_number: seed.bfs_number,
          name: seed.name,
          canton: seed.canton,
          profile,
          website_url: base,
          event_page_url: picked || null,
          cms_type: cms.type,
          scraping_method: profile,
          event_selectors: selectors,
          date_format,
          time_format,
          language: [langAttr.split("-")[0]],
          requires_javascript: requiresJS,
          ajax_pagination: ajax,
          structured_data: /"@type"\s*:\s*"Event"/.test(homeHTML),
          notes: cms.note || "",
          latitude: seed.latitude,
          longitude: seed.longitude,
        };

        if (!out.event_page_url) {
          errors.push({ bfs_number: seed.bfs_number, name: seed.name, reason: "No event page discovered" });
        }
        if ((profile === "list-static" || profile === "table-static") && (!selectors.container || !selectors.title || !selectors.date)) {
          errors.push({ bfs_number: seed.bfs_number, name: seed.name, reason: "Static profile but selectors incomplete" });
        }
        if (profile === "dynamic-js" && jsCount < 2) {
          errors.push({ bfs_number: seed.bfs_number, name: seed.name, reason: "Dynamic profile but <2 items rendered" });
        }

        municipalities.push(out);
        evidence.push({
          bfs_number: seed.bfs_number,
          event_page_url: out.event_page_url,
          cms_evidence: cms.evidence,
          selector_sample_html: sample,
          validation: {
            items_found_static: staticCount,
            items_found_js: jsCount,
            api_hits: 0,
            tested_at_iso: new Date().toISOString(),
          },
          network_notes: [],
        });

        await page.close();
      })
    )
  );

  fs.writeFileSync(OUT_ENH, JSON.stringify({ municipalities, errors }, null, 2));
  fs.writeFileSync(OUT_EVID, JSON.stringify(evidence, null, 2));
  await browser.close();

  console.log(
    `✅ Wrote ${OUT_ENH} (${municipalities.length} rows), ${OUT_EVID} (evidence=${evidence.length}, errors=${errors.length})`
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
