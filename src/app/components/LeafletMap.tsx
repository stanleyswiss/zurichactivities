'use client';

import { useEffect, useState } from 'react';
import { Event } from '@prisma/client';

interface LeafletMapProps {
  events: (Event & { distance?: number })[];
}

export default function LeafletMap({ events }: LeafletMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [MapContainer, setMapContainer] = useState<any>(null);
  const [TileLayer, setTileLayer] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [Popup, setPopup] = useState<any>(null);
  const [leaflet, setLeaflet] = useState<any>(null);

  useEffect(() => {
    // Dynamically import Leaflet components to avoid SSR issues
    const loadMap = async () => {
      try {
        const leafletModule = await import('leaflet');
        const { MapContainer: MC, TileLayer: TL, Marker: M, Popup: P } = await import('react-leaflet');
        
        // Fix for default markers
        delete (leafletModule.Icon.Default.prototype as any)._getIconUrl;
        leafletModule.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        setLeaflet(leafletModule);
        setMapContainer(() => MC);
        setTileLayer(() => TL);
        setMarker(() => M);
        setPopup(() => P);
        setMapLoaded(true);
      } catch (error) {
        console.error('Error loading map:', error);
      }
    };

    loadMap();
  }, []);

  // Schlieren coordinates as center
  const centerLat = 47.396;
  const centerLon = 8.447;

  // Get events with valid coordinates
  const eventsWithCoords = events.filter(e => e.lat && e.lon);

  // Create custom icons for different event categories
  const getMarkerIcon = (category?: string | null) => {
    if (!leaflet) return null;

    const getColor = () => {
      switch (category) {
        case 'alpsabzug': return '#f97316'; // orange
        case 'festival': return '#8b5cf6'; // purple
        case 'musik': return '#ec4899'; // pink
        case 'market': return '#10b981'; // green
        case 'family': return '#3b82f6'; // blue
        case 'sport': return '#ef4444'; // red
        case 'kultur': return '#eab308'; // yellow
        default: return '#ef4444'; // red
      }
    };

    return new leaflet.divIcon({
      html: `<div style="background-color: ${getColor()}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      className: 'custom-div-icon',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  };

  if (!mapLoaded || !MapContainer || !TileLayer || !Marker || !Popup) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
          <div className="text-sm text-gray-600">Loading interactive map...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />

      {/* Map Container */}
      <MapContainer
        center={[centerLat, centerLon]}
        zoom={9}
        style={{ height: '100%', width: '100%', borderRadius: '8px' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Event Markers */}
        {eventsWithCoords.map((event) => (
          <Marker
            key={event.id}
            position={[event.lat!, event.lon!]}
            icon={getMarkerIcon(event.category)}
          >
            <Popup>
              <div className="max-w-xs">
                <h4 className="font-semibold text-sm mb-1">{event.title}</h4>
                {event.description && (
                  <p className="text-xs text-gray-600 mb-2 line-clamp-3">
                    {event.description}
                  </p>
                )}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center text-gray-500">
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {new Date(event.startTime).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  {(event.venueName || event.city) && (
                    <div className="flex items-center text-gray-500">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 616 0z" />
                      </svg>
                      {[event.venueName, event.city].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {event.distance && (
                    <div className="text-gray-400">
                      {event.distance}km from Schlieren
                    </div>
                  )}
                </div>
                {event.url && (
                  <div className="mt-2">
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                    >
                      Event Details
                    </a>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Legend */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg p-3 shadow-lg z-[1000]">
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
            {eventsWithCoords.length} events on map
          </div>
        </div>
      </div>

      {/* Map Controls Info */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded z-[1000]">
        Pan: Drag • Zoom: Scroll or +/- • Click markers for details
      </div>
    </div>
  );
}