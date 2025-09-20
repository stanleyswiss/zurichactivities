'use client';

import { useState, useEffect } from 'react';

interface Municipality {
  id: string;
  bfsNumber: number;
  name: string;
  canton: string;
  distanceFromHome: number;
  websiteUrl: string | null;
  eventPageUrl: string | null;
  eventPagePattern: string | null;
  cmsType: string | null;
  scrapeStatus: string;
  lastScraped: string | null;
  eventCount: number;
  scrapeError: string | null;
}

export default function MunicipalitiesAdmin() {
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'with-website' | 'with-events' | 'ready-to-scrape'>('all');
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<any>(null);

  useEffect(() => {
    fetchMunicipalities();
  }, []);

  const fetchMunicipalities = async () => {
    try {
      const response = await fetch('/api/municipalities/list?token=randomscrape123token');
      const data = await response.json();
      if (data.success) {
        setMunicipalities(data.municipalities);
      }
    } catch (error) {
      console.error('Failed to fetch municipalities:', error);
    } finally {
      setLoading(false);
    }
  };

  const runBulkVerification = async (type: 'websites' | 'event-pages', limit: number = 10) => {
    setBulkLoading(type);
    setBulkResults(null);
    
    try {
      const response = await fetch('/api/municipalities/bulk-verify?token=randomscrape123token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          limit,
          maxDistance: 100
        })
      });
      
      const data = await response.json();
      setBulkResults(data);
      
      // Refresh municipalities list
      await fetchMunicipalities();
    } catch (error) {
      setBulkResults({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setBulkLoading(null);
    }
  };

  const filteredMunicipalities = municipalities.filter(m => {
    switch (filter) {
      case 'with-website':
        return m.websiteUrl !== null;
      case 'with-events':
        return m.eventPageUrl !== null;
      case 'ready-to-scrape':
        return m.eventPageUrl !== null && m.cmsType !== null;
      default:
        return true;
    }
  });

  const stats = {
    total: municipalities.length,
    withWebsite: municipalities.filter(m => m.websiteUrl).length,
    withEventPage: municipalities.filter(m => m.eventPageUrl).length,
    readyToScrape: municipalities.filter(m => m.eventPageUrl && m.cmsType).length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'headless-active': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCmsTypeColor = (cmsType: string | null) => {
    if (!cmsType) return 'text-gray-500';
    switch (cmsType) {
      case 'govis': return 'text-blue-600 bg-blue-100 px-2 py-1 rounded text-xs';
      case 'i-web': return 'text-purple-600 bg-purple-100 px-2 py-1 rounded text-xs';
      case 'wordpress': return 'text-green-600 bg-green-100 px-2 py-1 rounded text-xs';
      case 'unknown': return 'text-orange-600 bg-orange-100 px-2 py-1 rounded text-xs';
      default: return 'text-gray-600 bg-gray-100 px-2 py-1 rounded text-xs';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading municipalities...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Municipality Management
        </h1>
        <p className="text-lg text-gray-600 mb-4">
          Manage website discovery and scraping configuration for Swiss municipalities
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Municipalities</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.total}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">With Website</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.withWebsite} ({Math.round((stats.withWebsite / stats.total) * 100)}%)
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">With Event Page</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.withEventPage} ({Math.round((stats.withEventPage / stats.total) * 100)}%)
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Ready to Scrape</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.readyToScrape} ({Math.round((stats.readyToScrape / stats.total) * 100)}%)
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Bulk Verification</h3>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => runBulkVerification('websites', 20)}
            disabled={bulkLoading !== null}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
              bulkLoading === 'websites'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
          >
            {bulkLoading === 'websites' ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying Websites...
              </>
            ) : (
              'Verify Websites (20)'
            )}
          </button>

          <button
            onClick={() => runBulkVerification('event-pages', 15)}
            disabled={bulkLoading !== null}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
              bulkLoading === 'event-pages'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
            }`}
          >
            {bulkLoading === 'event-pages' ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Finding Event Pages...
              </>
            ) : (
              'Find Event Pages (15)'
            )}
          </button>
        </div>

        {/* Results Display */}
        {bulkResults && (
          <div className="mt-4 p-4 rounded-md bg-gray-50">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              {bulkResults.success ? '✅ Bulk Verification Results' : '❌ Verification Failed'}
            </h4>
            {bulkResults.success ? (
              <div className="text-sm text-gray-600">
                <p><strong>Type:</strong> {bulkResults.type}</p>
                <p><strong>Processed:</strong> {bulkResults.results?.processed || 0}</p>
                <p><strong>Found:</strong> {bulkResults.results?.found || bulkResults.results?.verified || 0}</p>
                <p><strong>Failed:</strong> {bulkResults.results?.failed || 0}</p>
                {bulkResults.results?.municipalities && bulkResults.results.municipalities.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium">View Details</summary>
                    <div className="mt-2 max-h-40 overflow-y-auto">
                      {bulkResults.results.municipalities.map((muni: any, i: number) => (
                        <div key={i} className="text-xs py-1">
                          <span className={muni.success ? 'text-green-600' : 'text-red-600'}>
                            {muni.success ? '✓' : '✗'}
                          </span> {muni.name} ({muni.canton}) 
                          {muni.websiteUrl && <span className="text-blue-600"> - {muni.websiteUrl}</span>}
                          {muni.eventPageUrl && <span className="text-purple-600"> - {muni.eventPagePattern}</span>}
                          {muni.cmsType && <span className="text-orange-600"> - {muni.cmsType}</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-600">{bulkResults.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="mb-6">
        <nav className="flex space-x-8">
          {[
            { key: 'all', label: 'All', count: stats.total },
            { key: 'with-website', label: 'With Website', count: stats.withWebsite },
            { key: 'with-events', label: 'With Event Page', count: stats.withEventPage },
            { key: 'ready-to-scrape', label: 'Ready to Scrape', count: stats.readyToScrape },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              className={`${
                filter === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </nav>
      </div>

      {/* Municipalities Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Municipality
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Website
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Event Page
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CMS Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Events
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredMunicipalities.map((municipality) => (
              <tr key={municipality.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {municipality.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {municipality.canton} • {municipality.distanceFromHome.toFixed(1)}km
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {municipality.websiteUrl ? (
                    <a
                      href={municipality.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-900 text-sm"
                    >
                      {municipality.websiteUrl.replace('https://', '')}
                    </a>
                  ) : (
                    <span className="text-gray-400 text-sm">Not found</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {municipality.eventPageUrl ? (
                    <div>
                      <a
                        href={municipality.eventPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-900 text-sm"
                      >
                        {municipality.eventPagePattern || 'Found'}
                      </a>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">Not found</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {municipality.cmsType ? (
                    <span className={getCmsTypeColor(municipality.cmsType)}>
                      {municipality.cmsType}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">Unknown</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(municipality.scrapeStatus)}`}>
                    {municipality.scrapeStatus}
                  </span>
                  {municipality.scrapeError && (
                    <div className="text-xs text-red-600 mt-1 truncate max-w-xs" title={municipality.scrapeError}>
                      {municipality.scrapeError}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {municipality.eventCount > 0 ? (
                    <span className="text-green-600 font-medium">{municipality.eventCount}</span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                  {municipality.lastScraped && (
                    <div className="text-xs text-gray-500">
                      {new Date(municipality.lastScraped).toLocaleDateString()}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}