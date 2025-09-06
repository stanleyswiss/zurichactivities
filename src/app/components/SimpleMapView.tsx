'use client';

import { Event } from '@prisma/client';
import { useState } from 'react';

interface SimpleMapViewProps {
  events: (Event & { distance?: number })[];
}

export default function SimpleMapView({ events }: SimpleMapViewProps) {
  // Schlieren coordinates as center
  const centerLat = 47.396;
  const centerLon = 8.447;

  // Get events with valid coordinates
  const eventsWithCoords = events.filter(e => e.lat && e.lon);

  // Always show the static map with real markers that work properly
  const [showInteractive, setShowInteractive] = useState(false);

  // Create a static Google Maps URL with markers
  const createStaticMapUrl = () => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return '';
    
    const markers = eventsWithCoords
      .slice(0, 25) // Google Static Maps allows max 25 markers
      .map((event, index) => {
        const color = getMarkerColor(event.category);
        return `&markers=color:${color}%7Clabel:${String.fromCharCode(65 + (index % 26))}%7C${event.lat},${event.lon}`;
      })
      .join('');
      
    return `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLon}&zoom=9&size=800x500&maptype=roadmap${markers}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
  };

  const getMarkerColor = (category?: string | null) => {
    if (!category) return 'red';
    const val = category.toLowerCase();
    switch (val) {
      case 'alpsabzug': return 'orange';
      case 'festival': return 'purple';
      case 'musik': return 'pink';
      case 'markt': return 'green';
      case 'familie': return 'blue';
      case 'sport': return 'red';
      case 'kultur': return 'yellow';
      case 'saisonal': return 'blue';
      default: return 'red';
    }
  };

  // Create an interactive Google Maps embed URL
  const createInteractiveMapUrl = () => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return '';
    return `https://www.google.com/maps/embed/v1/view?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&center=${centerLat},${centerLon}&zoom=9&maptype=roadmap`;
  };

  const getAllEventsMapUrl = () => {
    const markers = eventsWithCoords
      .slice(0, 10)
      .map(event => `${event.lat},${event.lon}`)
      .join('|');
    return `https://www.google.com/maps/dir/${markers}`;
  };

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center max-w-md p-6">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 616 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Google Maps API Required</h3>
          <p className="text-sm text-gray-600 mb-4">
            To show the map, please configure your Google Maps API key.
          </p>
        </div>
      </div>
    );
  }

  // Create embedded Google Maps URL with multiple markers using the correct API
  const createEmbeddedMapWithMarkers = () => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return '';
    
    // Use the directions API to show multiple waypoints, which shows all locations
    if (eventsWithCoords.length > 0) {
      const origin = `${eventsWithCoords[0].lat},${eventsWithCoords[0].lon}`;
      const waypoints = eventsWithCoords
        .slice(1, 10) // Take up to 9 additional waypoints (Google limit)
        .map(event => `${event.lat},${event.lon}`)
        .join('|');
      
      if (waypoints) {
        return `https://www.google.com/maps/embed/v1/directions?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&origin=${origin}&destination=${origin}&waypoints=${waypoints}&mode=driving`;
      }
    }
    
    // Fallback to view mode
    return `https://www.google.com/maps/embed/v1/view?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&center=${centerLat},${centerLon}&zoom=9&maptype=roadmap`;
  };

  return (
    <div className="w-full h-full relative">
      {/* Interactive embedded Google Maps that stays within your site */}
      <iframe
        src={createEmbeddedMapWithMarkers()}
        width="100%"
        height="500"
        style={{ border: 0, borderRadius: '8px' }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="w-full h-full"
      />
      
      {/* Event Info Overlay */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg p-3 shadow-lg z-10 max-w-xs">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Interactive Event Map</h4>
        <div className="text-xs text-gray-600 mb-2">
          Navigate directly in this map - pan, zoom, and explore
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
            <span>Alpsabzug Events</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
            <span>Festivals</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
            <span>Family Events</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            <span>Markets</span>
          </div>
          <div className="text-gray-500 mt-2">
            {eventsWithCoords.length} events shown as route waypoints
          </div>
        </div>
      </div>

      {/* Optional external link - small and unobtrusive */}
      <div className="absolute bottom-4 right-4 z-10">
        <a
          href={getAllEventsMapUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-2 py-1 bg-gray-800 bg-opacity-70 hover:bg-opacity-90 text-white rounded text-xs transition-all"
          title="Open in new Google Maps tab (only if needed for detailed navigation)"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          External
        </a>
      </div>

      {/* Event List Panel */}
      <div className="absolute bottom-4 left-4 bg-white bg-opacity-95 rounded-lg p-3 shadow-lg z-10 max-w-xs max-h-32 overflow-y-auto">
        <h5 className="text-xs font-semibold text-gray-900 mb-1">Nearby Events</h5>
        <div className="space-y-1">
          {eventsWithCoords.slice(0, 5).map((event, index) => (
            <div key={event.id} className="text-xs">
              <div className="font-medium text-gray-800 truncate">{event.title}</div>
              <div className="text-gray-500">
                {new Date(event.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                • {event.city}
              </div>
            </div>
          ))}
          {eventsWithCoords.length > 5 && (
            <div className="text-xs text-gray-400">
              +{eventsWithCoords.length - 5} more events
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
