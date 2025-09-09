# Switzerland Tourism API Research Results

## API Credentials Testing
- **API Key**: TaX5CpphzS32bCUNPAfog465D6RtYgO1191X2CZ2 ✅ WORKING
- **Base URL**: https://opendata.myswitzerland.io/v1
- **Authentication**: x-api-key header

## Key Findings

### 1. PRIMARY ENDPOINT FOR EVENTS: `/offers`
The **offers endpoint** is the correct source for event-like data with actual dates.

**Endpoint**: `https://opendata.myswitzerland.io/v1/offers`

**Key Features**:
- ✅ Has `validFrom` and `validThrough` date fields
- ✅ Supports date filtering
- ✅ Contains real events with specific dates
- ✅ Has price information
- ✅ Geographic coordinates via `areaServed.geo`
- ✅ Detailed descriptions and images

### 2. ATTRACTIONS ENDPOINT: Limited Event Data
**Endpoint**: `https://opendata.myswitzerland.io/v1/attractions`

**Findings**:
- ❌ No attractions found with actual `event` data containing `eventSchedule`
- ❌ Tourist attractions without specific dates
- ✅ Good for static attractions but not time-specific events

## Optimal API Configuration for Events

### Working Parameters
```bash
# Get events for next 3 months near Schlieren/Zurich
curl "https://opendata.myswitzerland.io/v1/offers" \
  -H "x-api-key: TaX5CpphzS32bCUNPAfog465D6RtYgO1191X2CZ2" \
  -H "Accept: application/json" \
  --data-urlencode "bbox=7.0,46.0,10.5,48.5" \
  --data-urlencode "validFrom=2025-09-09" \
  --data-urlencode "validThrough=2025-12-31" \
  --data-urlencode "lang=de" \
  --data-urlencode "limit=100"
```

### Successful Response Structure
```json
{
  "data": [
    {
      "@context": "https://schema.org/",
      "@type": "Offer",
      "identifier": "ffa06920-dff3-4dc0-b25f-d8c76ccd7c22",
      "name": "Rapperswil öffentliche Altstadtführung",
      "abstract": "Von April bis Oktober findet jeden Samstag in Rapperswil eine öffentliche Altstadtführung statt.",
      "validFrom": "2025-09-13",
      "validThrough": "2025-09-13",
      "priceSpecification": {
        "@type": "PriceSpecification",
        "minPrice": 20,
        "priceCurrency": "CHF"
      },
      "areaServed": {
        "@type": "TouristDestination",
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": 47.2251485,
          "longitude": 8.8155008
        }
      },
      "url": "https://www.myswitzerland.com/de/planung/angebote/rapperswil-oeffentliche-altstadtfuehrung/",
      "image": [...]
    }
  ]
}
```

## Event Identification Strategy

### Real Events Characteristics
1. **Same day events**: `validFrom == validThrough`
2. **Short duration**: Duration < 7 days  
3. **Event keywords**: "führung", "tour", "event", "festival", "konzert"
4. **Geographic specificity**: Has coordinates in `areaServed.geo`

### Recommended Search Terms
- `führung` (guided tours)
- `festival`
- `konzert` (concerts)
- `event`
- `markt` (markets)
- `fest` (festivals)

## Rate Limiting
- Current implementation: 0.5 requests/second
- API appears stable with provided key
- No specific rate limit errors encountered

## Data Mapping to Event Schema

### Field Mapping
```typescript
{
  source: 'ST',
  sourceEventId: data.identifier,
  title: data.name,
  description: data.abstract,
  startTime: new Date(data.validFrom),
  endTime: data.validThrough ? new Date(data.validThrough) : undefined,
  lat: data.areaServed?.geo?.latitude,
  lon: data.areaServed?.geo?.longitude,
  priceMin: data.priceSpecification?.minPrice,
  currency: data.priceSpecification?.priceCurrency || 'CHF',
  url: data.url,
  imageUrl: data.image?.[0]?.url
}
```

## Recommended Implementation Changes

1. **Switch from `/attractions` to `/offers` endpoint**
2. **Add date filtering with `validFrom` and `validThrough` parameters**
3. **Filter for short-duration offers (likely events)**
4. **Use search terms to find event-like offers**
5. **Extract geographic data from `areaServed.geo` instead of direct `geo` field**

## Example Working API Calls

### Get Today's Events
```bash
curl "https://opendata.myswitzerland.io/v1/offers?validFrom=2025-09-09&validThrough=2025-09-09&bbox=7.0,46.0,10.5,48.5&lang=de&limit=50" \
  -H "x-api-key: TaX5CpphzS32bCUNPAfog465D6RtYgO1191X2CZ2"
```

### Search for Guided Tours
```bash
curl "https://opendata.myswitzerland.io/v1/offers?search=führung&bbox=7.0,46.0,10.5,48.5&lang=de&limit=50" \
  -H "x-api-key: TaX5CpphzS32bCUNPAfog465D6RtYgO1191X2CZ2"
```

### Get Upcoming Events (Next 30 Days)
```bash
curl "https://opendata.myswitzerland.io/v1/offers?validFrom=2025-09-09&validThrough=2025-10-09&bbox=7.0,46.0,10.5,48.5&lang=de&limit=100" \
  -H "x-api-key: TaX5CpphzS32bCUNPAfog465D6RtYgO1191X2CZ2"
```