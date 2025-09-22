"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCMSConfiguration = resolveCMSConfiguration;
exports.mergeEventSelectors = mergeEventSelectors;
exports.resolveApiEndpoint = resolveApiEndpoint;
exports.getDefaultScrapingMethod = getDefaultScrapingMethod;
const GOVIS_SELECTORS = {
    container: '.content-teaser, .veranstaltung-item, .event-item',
    title: '.teaser-title h3, .event-title, h3',
    date: '.date-display-single, .event-date, .datum',
    location: '.location-info, .event-location, .ort',
    description: '.teaser-text, .event-description',
};
const ONEGOV_SELECTORS = {
    container: '.onegov-event, article[data-event-id]',
    title: '.event-title, h2, h3',
    date: 'time[datetime], .event-date',
    location: '.event-location, .event-meta',
    description: '.event-description, .text',
};
const TYPO3_SELECTORS = {
    container: '.tx-news-article, .event-item, .tx-sfeventmgt .event-item, .tx-calendarize .cal-event',
    title: '.news-text-wrap h1, .event-title, h2, h3',
    date: '.news-date, .event-date, .cal-date',
    location: '.news-location, .event-location',
    description: '.bodytext, .event-description',
};
const WORDPRESS_SELECTORS = {
    container: '.tribe-events-list-item, .sc-event, .wp-calendar .event-item, .event-listing .event',
    title: '.tribe-event-title, .event-title, h3',
    date: '.tribe-event-date, .event-date, time',
    location: '.tribe-event-venue, .event-venue',
    description: '.tribe-event-description, .event-description',
};
const LOCALCITIES_SELECTORS = {
    container: '.localcities-event, .lc-event-card, [data-municipality-id]',
    title: '.lc-event-title, .event-title',
    date: '.lc-event-date, .event-date',
    location: '.lc-event-location, .event-location',
    description: '.lc-event-description, .event-description',
};
const CMS_REGISTRY = {
    govis: {
        selectors: GOVIS_SELECTORS,
        defaultScrapingMethod: 'cms-selectors',
    },
    onegov_cloud: {
        selectors: ONEGOV_SELECTORS,
        defaultScrapingMethod: 'api-extraction',
        apiEndpointResolver: (_municipality, pageUrl) => {
            return new URL('/api/events.json', pageUrl.origin).toString();
        },
    },
    typo3: {
        selectors: TYPO3_SELECTORS,
        defaultScrapingMethod: 'cms-selectors',
    },
    wordpress: {
        selectors: WORDPRESS_SELECTORS,
        defaultScrapingMethod: 'cms-selectors',
    },
    localcities: {
        selectors: LOCALCITIES_SELECTORS,
        defaultScrapingMethod: 'api-extraction',
        apiEndpointResolver: (municipality, pageUrl) => {
            const segments = pageUrl.pathname.split('/').filter(Boolean);
            if (segments.length === 0) {
                return null;
            }
            const slug = segments[segments.length - 1];
            const language = municipality.language || segments[0] || 'de';
            const searchParams = new URLSearchParams({
                municipality: slug,
                language,
                limit: '100',
            });
            return `${pageUrl.origin}/api/public/events?${searchParams.toString()}`;
        },
    },
};
function resolveCMSConfiguration(cmsType) {
    if (!cmsType)
        return null;
    return CMS_REGISTRY[cmsType.toLowerCase()] || null;
}
function mergeEventSelectors(municipality, configuration) {
    const resolvedDefaults = configuration === null || configuration === void 0 ? void 0 : configuration.selectors;
    let storedSelectors = null;
    if (municipality.eventSelectors) {
        try {
            storedSelectors = JSON.parse(municipality.eventSelectors);
        }
        catch (error) {
            console.warn(`Failed to parse stored selectors for ${municipality.name}:`, error);
        }
    }
    if (!resolvedDefaults && !storedSelectors) {
        return null;
    }
    return {
        ...(resolvedDefaults || {}),
        ...(storedSelectors || {}),
    };
}
function resolveApiEndpoint(municipality, configuration) {
    if (municipality.apiEndpoint) {
        return municipality.apiEndpoint;
    }
    if (!(configuration === null || configuration === void 0 ? void 0 : configuration.apiEndpointResolver) || !municipality.eventPageUrl) {
        return null;
    }
    try {
        const pageUrl = new URL(municipality.eventPageUrl);
        return configuration.apiEndpointResolver(municipality, pageUrl);
    }
    catch (error) {
        console.warn(`Failed to resolve API endpoint for ${municipality.name}:`, error);
        return null;
    }
}
function getDefaultScrapingMethod(municipality, configuration) {
    if (municipality.scrapingMethod) {
        return municipality.scrapingMethod;
    }
    return (configuration === null || configuration === void 0 ? void 0 : configuration.defaultScrapingMethod) || null;
}
