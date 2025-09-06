'use client';

import { Event } from '@prisma/client';
import { useState, useEffect } from 'react';
import SimpleMapView from './SimpleMapView';

interface MapViewProps {
  events: (Event & { distance?: number })[];
}

export default function MapView({ events }: MapViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  
  // Schlieren coordinates as center
  const centerLat = 47.396;
  const centerLon = 8.447;
  
  useEffect(() => {
    // Close modal when clicking outside
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEvent(null);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getGoogleMapsUrl = () => {
    const markers = events
      .filter(event => event.lat && event.lon)
      .slice(0, 25) // Google Maps URL limit
      .map(event => `${event.lat},${event.lon}`)
      .join('|');
    
    return `https://www.google.com/maps/@${centerLat},${centerLon},10z/data=!4m2!6m1!1s${markers}`;
  };

  const getEventMapUrl = (event: Event) => {
    if (!event.lat || !event.lon) return '#';
    const address = [event.venueName, event.street, event.city, event.country]
      .filter(Boolean)
      .join(', ');
    return `https://www.google.com/maps/search/${encodeURIComponent(address)}/@${event.lat},${event.lon},15z`;
  };

  return (
    <div className="space-y-4">
      {/* Map Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Event Locations</h3>
          <p className="text-sm text-gray-600">
            {events.filter(e => e.lat && e.lon).length} events with location data
          </p>
        </div>
        <a
          href={getGoogleMapsUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          View All on Google Maps
        </a>
      </div>

      {/* Interactive Map with Event Markers */}
      <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '500px' }}>
        <SimpleMapView events={events} />
      </div>

      {/* Event List with Map Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {events
          .filter(event => event.lat && event.lon)
          .slice(0, 20) // Show first 20 events
          .map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedEvent(event)}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-semibold text-gray-900 line-clamp-2">
                  {event.title}
                </h4>
                <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                  {event.distance}km
                </span>
              </div>
              
              <div className="text-xs text-gray-600 mb-2 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {[event.venueName, event.city].filter(Boolean).join(', ')}
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  {new Date(event.startTime).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </span>
                <a
                  href={getEventMapUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  View on Map
                </a>
              </div>
            </div>
          ))}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedEvent.title}
                </h3>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {selectedEvent.description && (
                <p className="text-gray-600 text-sm mb-4">
                  {selectedEvent.description}
                </p>
              )}
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center text-gray-500">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(selectedEvent.startTime).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
                
                {(selectedEvent.venueName || selectedEvent.city) && (
                  <div className="flex items-center text-gray-500">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {[selectedEvent.venueName, selectedEvent.street, selectedEvent.city].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2 mt-6">
                <a
                  href={getEventMapUrl(selectedEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  View on Map
                </a>
                {selectedEvent.url && (
                  <a
                    href={selectedEvent.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Event Details
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}