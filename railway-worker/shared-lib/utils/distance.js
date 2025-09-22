"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDistance = calculateDistance;
exports.filterByDistance = filterByDistance;
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}
function filterByDistance(events, centerLat, centerLon, maxDistanceKm = 200) {
    return events.filter(event => {
        if (!event.lat || !event.lon)
            return true; // Include events without location
        const distance = calculateDistance(centerLat, centerLon, event.lat, event.lon);
        return distance <= maxDistanceKm;
    });
}
