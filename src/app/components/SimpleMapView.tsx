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

  // Start with interactive mode by default
  const [showInteractive, setShowInteractive] = useState(true);

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

  return (
    <div className="w-full h-full relative">
      {!showInteractive ? (
        // Static Map with Markers
        <>
          <img
            src={createStaticMapUrl()}
            alt="Event Locations Map"
            className="w-full h-full object-cover rounded-lg cursor-pointer"
            onClick={() => setShowInteractive(true)}
          />
          
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded z-10">
            Click to enable interactive navigation
          </div>

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
        // Interactive Map - Simple approach
        <>
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

          {/* Simple event markers overlay with approximate positioning */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {eventsWithCoords.slice(0, 20).map((event) => {
              // Simple coordinate to pixel conversion for Swiss region
              const latRange = 2.5; // degrees visible in viewport
              const lonRange = 3.5; // degrees visible in viewport
              
              const xPercent = 50 + ((event.lon! - centerLon) / lonRange) * 40;
              const yPercent = 50 - ((event.lat! - centerLat) / latRange) * 40;
              
              // Only show markers within reasonable bounds
              if (xPercent < 10 || xPercent > 90 || yPercent < 10 || yPercent > 90) {
                return null;
              }

              const getMarkerColorHex = () => {
                switch (event.category) {
                  case 'alpsabzug': return '#f97316';
                  case 'festival': return '#8b5cf6';
                  case 'musik': return '#ec4899';
                  case 'market': return '#10b981';
                  case 'family': return '#3b82f6';
                  case 'sport': return '#ef4444';
                  case 'kultur': return '#eab308';
                  default: return '#ef4444';
                }
              };

              return (
                <div
                  key={event.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group"
                  style={{
                    left: `${xPercent}%`,
                    top: `${yPercent}%`
                  }}
                  title={`${event.title} - ${new Date(event.startTime).toLocaleDateString()}`}
                >
                  <div
                    className="w-3 h-3 rounded-full border border-white shadow-md hover:scale-150 transition-transform"
                    style={{ backgroundColor: getMarkerColorHex() }}
                  />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-90 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none max-w-xs">
                    <div className="font-semibold">{event.title}</div>
                    <div className="text-gray-300">
                      {new Date(event.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {event.city && ` • ${event.city}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <div className="absolute bottom-4 right-4 z-20 flex space-x-2">
            <button
              onClick={() => setShowInteractive(false)}
              className="inline-flex items-center px-3 py-2 bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 rounded-lg shadow-lg text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Markers
            </button>
            
            <a
              href={getAllEventsMapUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-all"
              title="Open in Google Maps"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              External
            </a>
          </div>

          {/* Legend for interactive mode */}
          <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg p-3 shadow-lg z-20">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Interactive Map</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
                <span>Alpsabzug</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
                <span>Festivals</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                <span>Family</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                <span>Markets</span>
              </div>
              <div className="text-gray-500 mt-2">
                Pan & zoom • Hover dots for details
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}