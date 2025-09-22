"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMunicipalDate = parseMunicipalDate;
exports.extractPriceText = extractPriceText;
function parseMunicipalDate(dateText, format) {
    if (!dateText)
        return null;
    const cleaned = dateText.trim().replace(/\s+/g, ' ');
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
        const date = new Date(cleaned);
        if (!isNaN(date.getTime()))
            return date;
    }
    const swissMatch = cleaned.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (swissMatch) {
        const [, day, month, year] = swissMatch;
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(date.getTime()))
            return date;
    }
    if (format === 'dd.mm.yyyy') {
        const parts = cleaned.split('.');
        if (parts.length >= 3) {
            const [day, month, year] = parts.map(part => parseInt(part, 10));
            const date = new Date(year, month - 1, day);
            if (!isNaN(date.getTime()))
                return date;
        }
    }
    const fallbackDate = new Date(cleaned);
    if (!isNaN(fallbackDate.getTime())) {
        return fallbackDate;
    }
    return null;
}
function extractPriceText(priceText) {
    if (!priceText)
        return undefined;
    const priceMatch = priceText.match(/(CHF|Fr\.?|SFr\.?|CHF\s?)(\d+(?:[.,]\d{2})?)|(\d+(?:[.,]\d{2})?)\s*\.?-?/);
    if (priceMatch) {
        return priceText.trim();
    }
    return undefined;
}
