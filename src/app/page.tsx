'use client';

import { useState } from 'react';
import EventFilters, { FilterState } from './components/EventFilters';
import EventList from './components/EventList';

export default function Home() {
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

  const [showScrapePanel, setShowScrapePanel] = useState(false);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<any>(null);

  const handleScrape = async () => {
    setScrapeLoading(true);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Omit sources to use server-side default from SOURCES_ENABLED env
          force: false
        })
      });

      const results = await response.json();
      setScrapeResults(results);
    } catch (error) {
      setScrapeResults({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setScrapeLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Events in the Schlieren Region
        </h1>
        <p className="text-lg text-gray-600 mb-4">
          Discover local events, festivals and activities near you
        </p>
        
        {/* Admin Panel Toggle */}
        <div className="flex justify-between items-center">
          <div className="flex items-center text-sm text-gray-500">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Centered on Schlieren, ZH
          </div>
          
          <button
            onClick={() => setShowScrapePanel(!showScrapePanel)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Update Data
          </button>
        </div>
      </div>

      {/* Scrape Panel */}
      {showScrapePanel && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-blue-900">Update Event Data</h3>
            <button
              onClick={() => setShowScrapePanel(false)}
              className="text-blue-400 hover:text-blue-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <p className="text-blue-800 text-sm mb-4">
            Fetch latest event data from Switzerland Tourism and regional sources.
          </p>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={handleScrape}
              disabled={scrapeLoading}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                scrapeLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {scrapeLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </>
              ) : (
                'Update Now'
              )}
            </button>
            
            {scrapeResults && (
              <div className={`text-sm ${scrapeResults.success ? 'text-green-800' : 'text-red-800'}`}>
                {scrapeResults.success 
                  ? `✓ ${scrapeResults.summary?.total_events_saved || 0} new events saved`
                  : `✗ ${scrapeResults.error || 'Update failed'}`
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <EventFilters onFilterChange={setFilters} />

      {/* Events List */}
      <EventList filters={filters} />
    </div>
  );
}
