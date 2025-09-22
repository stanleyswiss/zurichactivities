import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AIMunicipalScraper } from '../ai-municipal-scraper';
import { Municipality } from '@prisma/client';

interface PrismaMock {
  event: { upsert: ReturnType<typeof vi.fn> };
  municipality: { update: ReturnType<typeof vi.fn> };
}

describe('AIMunicipalScraper', () => {
  const baseMunicipality: Partial<Municipality> = {
    id: 'muni-1',
    bfsNumber: 261,
    name: 'Zürich',
    nameNorm: 'zurich',
    canton: 'ZH',
    district: 'Zürich',
    lat: 47.3769,
    lon: 8.5417,
    distanceFromHome: 5,
    language: 'de',
    hasEvents: true,
    scrapingMethod: null,
    eventSelectors: null,
    apiEndpoint: null,
    requiresJavascript: true,
    ajaxPagination: true,
    structuredData: false,
    robotsTxtCompliant: true,
    lastScraped: null,
    lastSuccessful: null,
    scrapeStatus: 'pending',
    scrapeError: null,
    eventCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: PrismaMock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-01T12:00:00Z'));

    prisma = {
      event: {
        upsert: vi.fn().mockImplementation(async ({ create }) => ({
          id: `event-${Math.random()}`,
          ...create,
        })),
      },
      municipality: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses CMS API extraction for dynamic municipalities and persists recent events', async () => {
    const municipality: Municipality = {
      ...baseMunicipality,
      id: 'zurich-localcities',
      cmsType: 'localcities',
      eventPageUrl: 'https://www.localcities.ch/de/zuerich',
      enhancedNotes: null,
    } as Municipality;

    const apiResponse = [
      {
        title: 'Sommer im Quartier',
        start_date: '2024-05-10T18:00:00Z',
        end_date: '2024-05-10T21:00:00Z',
        description: 'Nachbarschaftstreffen mit Musik.',
        venue: 'Quartierplatz',
        url: 'https://www.localcities.ch/de/zuerich/events/sommerfest',
      },
      {
        title: 'Weihnachtsmarkt',
        start_date: '2024-12-12T12:00:00Z',
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => apiResponse,
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    const scraper = new AIMunicipalScraper(prisma as unknown as any);
    const events = await scraper.scrapeMunicipality(municipality);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Sommer im Quartier');

    // Ensure the event is within the 90-day window
    const now = new Date('2024-05-01T12:00:00Z');
    const diffInDays =
      (events[0].startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffInDays).toBeGreaterThanOrEqual(0);
    expect(diffInDays).toBeLessThanOrEqual(90);

    // Municipality update should persist API metadata
    expect(prisma.municipality.update).toHaveBeenCalled();
    const updateArgs = prisma.municipality.update.mock.calls[0][0];
    expect(updateArgs.data.scrapeStatus).toBe('active');
    expect(updateArgs.data.scrapeError).toBeNull();
    expect(updateArgs.data.apiEndpoint).toContain('api/public/events');
    expect(updateArgs.data.eventSelectors).toContain('localcities-event');
  });

  it('falls back to headless rendering when required and records the fallback', async () => {
    const municipality: Municipality = {
      ...baseMunicipality,
      id: 'govis-dynamic',
      cmsType: 'govis',
      eventPageUrl: 'https://www.govis-example.ch/de/events',
      enhancedNotes: null,
    } as Municipality;

    const headlessHtml = `
      <div class="content-teaser">
        <h3 class="event-title">Stadtfest</h3>
        <div class="event-date">10.05.2024</div>
        <div class="event-location">Stadthalle</div>
        <a href="/de/events/stadtfest">Details</a>
      </div>
    `;

    vi.spyOn(AIMunicipalScraper.prototype as any, 'renderWithHeadless').mockResolvedValue(headlessHtml);
    global.fetch = vi.fn();

    const scraper = new AIMunicipalScraper(prisma as unknown as any);
    const events = await scraper.scrapeMunicipality(municipality);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Stadtfest');

    expect(prisma.municipality.update).toHaveBeenCalled();
    const updateArgs = prisma.municipality.update.mock.calls[0][0];
    expect(updateArgs.data.scrapeStatus).toBe('headless-active');
    expect(updateArgs.data.scrapeError).toMatch(/Headless fallback executed/);
  });
});
