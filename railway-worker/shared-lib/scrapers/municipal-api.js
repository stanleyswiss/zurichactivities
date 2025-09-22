"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchMunicipalEventsFromAPI = fetchMunicipalEventsFromAPI;
exports.parseMunicipalAPIResponse = parseMunicipalAPIResponse;
const municipal_utils_1 = require("./municipal-utils");
async function fetchMunicipalEventsFromAPI(config) {
    try {
        const response = await fetch(config.apiEndpoint, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'SwissEventsBot/1.0',
            },
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        return parseMunicipalAPIResponse(data, config);
    }
    catch (error) {
        console.error(`API scraping failed for ${config.name}:`, error);
        return [];
    }
}
function parseMunicipalAPIResponse(data, config) {
    const events = [];
    const eventsList = Array.isArray(data)
        ? data
        : data.events || data.items || data.results || (Array.isArray(data.data) ? data.data : []);
    for (const item of eventsList) {
        try {
            const event = parseEventFromAPI(item, config);
            if (event) {
                events.push(event);
            }
        }
        catch (error) {
            console.warn(`Error parsing API event:`, error);
        }
    }
    return events;
}
function parseEventFromAPI(item, config) {
    const title = item.title || item.name || item.subject || item.event_name;
    const startTime = (0, municipal_utils_1.parseMunicipalDate)(item.start_date || item.startDate || item.date || item.event_date, config.dateFormat);
    if (!title || !startTime) {
        return null;
    }
    return {
        title: title.trim(),
        startTime,
        endTime: (0, municipal_utils_1.parseMunicipalDate)(item.end_date || item.endDate || item.finishDate, config.dateFormat) ||
            undefined,
        description: item.description || item.body || item.text,
        venueName: item.venue || item.location || item.place,
        location: item.address || item.location_text,
        organizer: item.organizer || item.organization,
        price: (0, municipal_utils_1.extractPriceText)(item.price || item.cost || item.fee),
        url: item.url || item.link || item.event_url,
        confidence: 0.9,
    };
}
