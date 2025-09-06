'use client';

import dynamic from 'next/dynamic';
import { Event } from '@prisma/client';

// Dynamically import the actual map component to avoid SSR issues
const DynamicLeafletMapComponent = dynamic(() => import('./LeafletMapComponent'), {
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
        <div className="text-sm text-gray-600">Loading interactive map...</div>
      </div>
    </div>
  ),
  ssr: false
});

interface LeafletMapProps {
  events: (Event & { distance?: number })[];
}

export default function LeafletMap({ events }: LeafletMapProps) {
  return <DynamicLeafletMapComponent events={events} />;
}