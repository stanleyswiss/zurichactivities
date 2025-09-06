'use client';

import { Event } from '@prisma/client';
import { CATEGORIES } from '@/types/event';

interface EventCardProps {
  event: Event & { distance?: number | null };
}

export default function EventCard({ event }: EventCardProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('de-CH', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('de-CH', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'ST': return 'bg-red-100 text-red-800';
      case 'LIMMATTAL': return 'bg-blue-100 text-blue-800';
      case 'ZURICH': return 'bg-green-100 text-green-800';
      case 'MUNICIPAL': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case CATEGORIES.ALPSABZUG: return 'bg-orange-100 text-orange-800';
      case CATEGORIES.FESTIVAL: return 'bg-purple-100 text-purple-800';
      case CATEGORIES.MUSIC: return 'bg-pink-100 text-pink-800';
      case CATEGORIES.MARKET: return 'bg-green-100 text-green-800';
      case CATEGORIES.FAMILY: return 'bg-blue-100 text-blue-800';
      case CATEGORIES.SPORTS: return 'bg-red-100 text-red-800';
      case CATEGORIES.CULTURE: return 'bg-indigo-100 text-indigo-800';
      case CATEGORIES.COMMUNITY: return 'bg-gray-100 text-gray-800';
      case CATEGORIES.SEASONAL: return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const addToCalendar = () => {
    const startDate = new Date(event.startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endDate = event.endTime 
      ? new Date(event.endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      : new Date(new Date(event.startTime).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    const location = [event.venueName, event.street, event.city].filter(Boolean).join(', ');
    
    const googleCalendarUrl = new URL('https://calendar.google.com/calendar/render');
    googleCalendarUrl.searchParams.set('action', 'TEMPLATE');
    googleCalendarUrl.searchParams.set('text', event.title);
    googleCalendarUrl.searchParams.set('dates', `${startDate}/${endDate}`);
    googleCalendarUrl.searchParams.set('details', event.description || '');
    googleCalendarUrl.searchParams.set('location', location);
    
    window.open(googleCalendarUrl.toString(), '_blank');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex space-x-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSourceBadgeColor(event.source)}`}>
            {event.source}
          </span>
          {event.category && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(event.category)}`}>
              {event.category}
            </span>
          )}
        </div>
        {event.distance && (
          <span className="text-sm text-gray-500">
            {event.distance}km away
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
        {event.title}
      </h3>

      {event.description && (
        <p className="text-gray-600 text-sm mb-3 line-clamp-3">
          {event.description}
        </p>
      )}

      <div className="flex items-center text-sm text-gray-500 mb-2">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {formatDate(event.startTime)}
        {formatTime(event.startTime) !== '00:00' && (
          <span className="ml-2">{formatTime(event.startTime)}</span>
        )}
      </div>

      {(event.venueName || event.city) && (
        <div className="flex items-center text-sm text-gray-500 mb-3">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {[event.venueName, event.city].filter(Boolean).join(', ')}
        </div>
      )}

      {(event.priceMin || event.priceMax) && (
        <div className="flex items-center text-sm text-gray-500 mb-3">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
          </svg>
          {event.priceMin === 0 && !event.priceMax ? 'Free' : 
           event.priceMin === event.priceMax ? `${event.priceMin} ${event.currency}` :
           `${event.priceMin || 0} - ${event.priceMax || '?'} ${event.currency}`}
        </div>
      )}

      <div className="flex justify-between items-center pt-3 border-t border-gray-100">
        <div className="flex space-x-2">
          <button
            onClick={addToCalendar}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Add to Calendar
          </button>
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Details
            </a>
          )}
        </div>
      </div>
    </div>
  );
}