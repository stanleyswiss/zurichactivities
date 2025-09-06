'use client';

import { Event } from '@prisma/client';
import { useState } from 'react';

interface SimpleMapViewProps {
  events: (Event & { distance?: number })[];
}

export default function SimpleMapView({ events }: SimpleMapViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  
  // Schlieren coordinates as center
  const centerLat = 47.396;
  const centerLon = 8.447;

  // Get events with valid coordinates
  const eventsWithCoords = events.filter(e => e.lat && e.lon);
  
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
    
    switch (category) {
      case 'alpsabzug': return 'orange';
      case 'festival': return 'purple';
      case 'musik': return 'pink';
      case 'market': return 'green';
      case 'family': return 'blue';
      case 'sport': return 'red';
      case 'kultur': return 'yellow';
      default: return 'red';
    }
  };

  const getEventMapUrl = (event: Event) => {
    if (!event.lat || !event.lon) return '#';
    return `https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lon}`;
  };

  const getAllEventsMapUrl = () => {
    const markers = eventsWithCoords
      .slice(0, 10) // Limit for URL length
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 6 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Enable Maps Static API</h3>
          <p className="text-sm text-gray-600 mb-4">
            To show event markers on the map, enable the Maps Static API in your Google Cloud Console.
          </p>
          <div className="bg-white rounded-lg p-3 text-left text-xs text-gray-700 border border-gray-200 mb-4">
            <div className="font-semibold mb-2">Required API:</div>
            <div className="space-y-1">
              <div>• Go to Google Cloud Console</div>
              <div>• Enable "Maps Static API"</div>
              <div>• This allows custom markers on maps</div>
              <div>• Current key: {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'Set ✅' : 'Missing ❌'}</div>
            </div>
          </div>
          <a
            href={getAllEventsMapUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            View All Events on Google Maps
          </a>
        </div>
      </div>
    );
  }

  // Create an interactive Google Maps embed URL with markers
  const createInteractiveMapUrl = () => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return '';
    
    // If we have events, use search mode to show markers around the area
    if (eventsWithCoords.length > 0) {
      // Use the first event as the search query to center the map in the right area
      const centerEvent = eventsWithCoords[0];
      return `https://www.google.com/maps/embed/v1/search?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=events+near+${centerEvent.lat},${centerEvent.lon}&zoom=9&maptype=roadmap`;
    }
    
    // Fallback to view mode centered on Schlieren
    return `https://www.google.com/maps/embed/v1/view?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&center=${centerLat},${centerLon}&zoom=9&maptype=roadmap`;
  };

  return (
    <div className="w-full h-full relative">
      {/* Single Interactive Google Maps with Custom Markers */}
      <iframe
        src={createInteractiveMapUrl()}
        width="100%"
        height="500"
        style={{ border: 0, borderRadius: '8px' }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="w-full h-full"
      />
      
      {/* Map Legend */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg p-3 shadow-lg z-10">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Event Locations</h4>
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
            {eventsWithCoords.length} events shown
          </div>
        </div>
      </div>
      
      {/* External Map Link */}
      <div className="absolute bottom-4 right-4 z-10">
        <a
          href={getAllEventsMapUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-2 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-lg shadow-lg text-sm font-medium text-gray-900 transition-all"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002 2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Full Screen
        </a>
      </div>
    </div>
  );
}