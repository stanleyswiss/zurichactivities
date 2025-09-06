'use client';

import { Event } from '@prisma/client';
import { useState } from 'react';
import LeafletMap from './LeafletMap';

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

  // Create an interactive Google Maps embed URL that works within the site
  const createInteractiveMapUrl = () => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return '';
    
    // Use the view mode but with specific center and zoom for the Swiss region
    return `https://www.google.com/maps/embed/v1/view?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&center=${centerLat},${centerLon}&zoom=9&maptype=roadmap`;
  };

  const [showInteractive, setShowInteractive] = useState(false);

  return (
    <div className="w-full h-full relative">
      {!showInteractive ? (
        // Static Map with Markers - Initial Display (fallback for Google Static Maps)
        <>
          <img
            src={createStaticMapUrl()}
            alt="Event Locations Map"
            className="w-full h-full object-cover rounded-lg cursor-pointer"
            onClick={() => setShowInteractive(true)}
            onError={() => setShowInteractive(true)} // Auto-switch to interactive if static fails
          />
          
          {/* Click Hint */}
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded z-10">
            Click to enable interactive navigation
          </div>

          {/* Map Legend for static view */}
          <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg p-3 shadow-lg z-10">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Event Markers</h4>
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
                {eventsWithCoords.length} events with markers
              </div>
            </div>
          </div>
        </>
      ) : (
        // Interactive OpenStreetMap with Leaflet - Works with ad blockers
        <>
          <LeafletMap events={events} />
          
          {/* Switch back to static view */}
          <div className="absolute bottom-4 right-4 z-[1001]">
            <button
              onClick={() => setShowInteractive(false)}
              className="inline-flex items-center px-3 py-2 bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 rounded-lg shadow-lg text-sm font-medium transition-all mr-2"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Static View
            </button>
            
            {/* External Google Maps Link */}
            <a
              href={getAllEventsMapUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs font-medium transition-all"
              title="Open in Google Maps"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Google
            </a>
          </div>
        </>
      )}
    </div>
  );
}