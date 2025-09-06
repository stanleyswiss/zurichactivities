interface GeocodeResult {
  lat: number;
  lon: number;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    // Use OpenStreetMap Nominatim for geocoding (free and reliable)
    const encodedAddress = encodeURIComponent(`${address}, Switzerland`);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&countrycodes=ch`,
      {
        headers: {
          'User-Agent': 'SwissActivitiesDashboard/1.0'
        }
      }
    );

    if (!response.ok) {
      console.error('Geocoding API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', address, error);
    return null;
  }
}

export function formatSwissAddress(
  street?: string,
  postalCode?: string,
  city?: string
): string {
  const parts = [];
  if (street) parts.push(street);
  if (postalCode && city) {
    parts.push(`${postalCode} ${city}`);
  } else if (city) {
    parts.push(city);
  }
  return parts.join(', ');
}