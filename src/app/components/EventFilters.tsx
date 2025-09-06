'use client';

import { useState, useEffect } from 'react';
import { CATEGORIES, SOURCES } from '@/types/event';

const CATEGORY_LABELS = {
  [CATEGORIES.ALPSABZUG]: 'Alpsabzug',
  [CATEGORIES.FESTIVAL]: 'Festival',
  [CATEGORIES.MUSIC]: 'Music',
  [CATEGORIES.MARKET]: 'Market',
  [CATEGORIES.FAMILY]: 'Family',
  [CATEGORIES.SPORTS]: 'Sports',
  [CATEGORIES.CULTURE]: 'Culture',
  [CATEGORIES.COMMUNITY]: 'Community',
  [CATEGORIES.SEASONAL]: 'Seasonal'
} as const;

const SOURCE_LABELS = {
  [SOURCES.ST]: 'Switzerland Tourism',
  [SOURCES.LIMMATTAL]: 'Limmattal Regional',
  [SOURCES.ZURICH]: 'Zurich Tourism',
  [SOURCES.MUNICIPAL]: 'Municipal',
  'COMPREHENSIVE': 'All Sources'
} as const;

interface EventFiltersProps {
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  dateRange: {
    from: string;
    to: string;
  };
  categories: string[];
  sources: string[];
  municipalities: string[];
  distance: number;
  freeOnly: boolean;
  searchTerm: string;
}

export default function EventFilters({ onFilterChange }: EventFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    dateRange: {
      from: new Date().toISOString().split('T')[0],
      to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    categories: [],
    sources: [],
    municipalities: [],
    distance: 200,
    freeOnly: false,
    searchTerm: ''
  });

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const updateFilter = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const toggleCategory = (category: string) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const toggleSource = (source: string) => {
    setFilters(prev => ({
      ...prev,
      sources: prev.sources.includes(source)
        ? prev.sources.filter(s => s !== source)
        : [...prev.sources, source]
    }));
  };

  const toggleMunicipality = (municipality: string) => {
    setFilters(prev => ({
      ...prev,
      municipalities: prev.municipalities.includes(municipality)
        ? prev.municipalities.filter(m => m !== municipality)
        : [...prev.municipalities, municipality]
    }));
  };

  const resetFilters = () => {
    setFilters({
      dateRange: {
        from: new Date().toISOString().split('T')[0],
        to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      },
      categories: [],
      sources: [],
      municipalities: [],
      distance: 200,
      freeOnly: false,
      searchTerm: ''
    });
  };

  const setQuickFilter = (type: 'today' | 'tomorrow' | 'weekend' | 'free') => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    switch (type) {
      case 'today':
        updateFilter('dateRange', {
          from: today.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        });
        break;
      case 'tomorrow':
        updateFilter('dateRange', {
          from: tomorrow.toISOString().split('T')[0],
          to: tomorrow.toISOString().split('T')[0]
        });
        break;
      case 'weekend':
        const friday = new Date(today);
        const sunday = new Date(today);
        const dayOfWeek = today.getDay();
        const daysToFriday = (5 - dayOfWeek + 7) % 7;
        friday.setDate(today.getDate() + daysToFriday);
        sunday.setDate(friday.getDate() + 2);
        updateFilter('dateRange', {
          from: friday.toISOString().split('T')[0],
          to: sunday.toISOString().split('T')[0]
        });
        break;
      case 'free':
        updateFilter('freeOnly', !filters.freeOnly);
        break;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex flex-col space-y-4">
        {/* Search and Quick Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search for events..."
              value={filters.searchTerm}
              onChange={(e) => updateFilter('searchTerm', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setQuickFilter('today')}
              className="px-3 py-2 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setQuickFilter('tomorrow')}
              className="px-3 py-2 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors"
            >
              Tomorrow
            </button>
            <button
              onClick={() => setQuickFilter('weekend')}
              className="px-3 py-2 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors"
            >
              Weekend
            </button>
            <button
              onClick={() => setQuickFilter('free')}
              className={`px-3 py-2 text-sm rounded-md transition-colors ${
                filters.freeOnly 
                  ? 'bg-green-200 text-green-800' 
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Free
            </button>
          </div>
        </div>

        {/* Expandable Filters */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            More Filters
            <svg
              className={`ml-1 w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={resetFilters}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset Filters
          </button>
        </div>

        {isExpanded && (
          <div className="space-y-4 pt-4 border-t border-gray-200">
            {/* Date Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                <input
                  type="date"
                  value={filters.dateRange.from}
                  onChange={(e) => updateFilter('dateRange', { ...filters.dateRange, from: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="date"
                  value={filters.dateRange.to}
                  onChange={(e) => updateFilter('dateRange', { ...filters.dateRange, to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Distance */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Distance: {filters.distance}km
              </label>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={filters.distance}
                onChange={(e) => updateFilter('distance', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10km</span>
                <span>200km</span>
              </div>
            </div>

            {/* Categories */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {Object.values(CATEGORIES).map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filters.categories.includes(category)
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {CATEGORY_LABELS[category] || category}
                  </button>
                ))}
              </div>
            </div>

            {/* Sources */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sources</label>
              <div className="flex flex-wrap gap-2">
                {[...Object.values(SOURCES), 'COMPREHENSIVE'].map((source) => (
                  <button
                    key={source}
                    onClick={() => toggleSource(source)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filters.sources.includes(source)
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] || source}
                  </button>
                ))}
              </div>
            </div>

            {/* Municipalities */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Municipalities</label>
              <div className="flex flex-wrap gap-2">
                {['Schlieren', 'Zürich', 'Basel', 'Bern', 'Lucerne', 'Geneva', 'Dietikon', 'Urdorf', 'Oberengstringen', 'Weiningen', 'Appenzell', 'St. Gallen', 'Chur', 'Interlaken'].map((municipality) => (
                  <button
                    key={municipality}
                    onClick={() => toggleMunicipality(municipality)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filters.municipalities.includes(municipality)
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {municipality}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}