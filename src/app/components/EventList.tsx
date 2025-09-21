'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Event } from '@prisma/client';
import EventCard from './EventCard';
import MapView from './MapView';
import { FilterState } from './EventFilters';

interface EventListProps {
  filters: FilterState;
}

export default function EventList({ filters }: EventListProps) {
  const [events, setEvents] = useState<(Event & { distance?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'distance' | 'relevance'>('date');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        from: filters.dateRange.from,
        to: filters.dateRange.to,
        radius: filters.distance.toString(),
        lang: 'de'
      });

      if (filters.categories.length > 0) {
        filters.categories.forEach(category => {
          params.append('category', category);
        });
      }

      if (filters.sources.length > 0) {
        filters.sources.forEach(source => {
          params.append('source', source);
        });
      }

      const response = await fetch(`/api/events?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }

      const data = await response.json();
      setEvents(data.events || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filters.dateRange.from, filters.dateRange.to, filters.distance, filters.categories, filters.sources]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filteredAndSortedEvents = useMemo(() => {
    let filtered = events.filter(event => {
      // Search term filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(searchLower);
        const matchesDescription = event.description?.toLowerCase().includes(searchLower);
        const matchesVenue = event.venueName?.toLowerCase().includes(searchLower);
        const matchesCity = event.city?.toLowerCase().includes(searchLower);
        
        if (!matchesTitle && !matchesDescription && !matchesVenue && !matchesCity) {
          return false;
        }
      }

      // Free events filter
      if (filters.freeOnly) {
        if (event.priceMin === null || event.priceMin > 0) {
          return false;
        }
      }

      // Municipality filter
      if (filters.municipalities.length > 0) {
        if (!event.city || !filters.municipalities.includes(event.city)) {
          return false;
        }
      }

      return true;
    });

    // Sort events
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        case 'distance':
          const distanceA = a.distance || 999;
          const distanceB = b.distance || 999;
          return distanceA - distanceB;
        case 'relevance':
          // Simple relevance based on search term matches and recency
          if (filters.searchTerm) {
            const searchLower = filters.searchTerm.toLowerCase();
            const scoreA = (a.title.toLowerCase().includes(searchLower) ? 10 : 0) +
                          (a.description?.toLowerCase().includes(searchLower) ? 5 : 0);
            const scoreB = (b.title.toLowerCase().includes(searchLower) ? 10 : 0) +
                          (b.description?.toLowerCase().includes(searchLower) ? 5 : 0);
            if (scoreA !== scoreB) return scoreB - scoreA;
          }
          // Fall back to date sorting
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [events, filters, sortBy]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-2 text-gray-600">Loading events...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
        <div className="text-red-800">
          <p className="font-medium">Error loading events</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        <button
          onClick={fetchEvents}
          className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-gray-600">
          {filteredAndSortedEvents.length} event{filteredAndSortedEvents.length !== 1 ? 's' : ''} found
        </div>
        <div className="flex items-center space-x-4">
          {/* View Mode Toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">View:</span>
            <div className="flex rounded-lg border border-gray-300">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 text-sm rounded-l-lg ${
                  viewMode === 'grid'
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-sm ${
                  viewMode === 'list'
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-3 py-1 text-sm rounded-r-lg ${
                  viewMode === 'map'
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Sort Dropdown */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'distance' | 'relevance')}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="date">Date</option>
              <option value="distance">Distance</option>
              <option value="relevance">Relevance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events Display */}
      {filteredAndSortedEvents.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No events found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Adjust your filters or try again later.
          </p>
          <div className="mt-6">
            <button
              onClick={fetchEvents}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Reload
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-4">
          {filteredAndSortedEvents.map((event) => (
            <EventCard key={event.id} event={event} isListView />
          ))}
        </div>
      ) : (
        <MapView events={filteredAndSortedEvents} />
      )}
    </div>
  );
}
