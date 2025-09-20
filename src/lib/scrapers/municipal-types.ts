export interface MunicipalityEventSelectors {
  container?: string;
  title?: string;
  date?: string;
  location?: string;
  organizer?: string;
  description?: string;
  price?: string;
  registration?: string;
}

export interface MunicipalityScrapingConfig {
  id: string;
  name: string;
  eventPageUrl: string;
  cmsType: string;
  scrapingMethod: string;
  eventSelectors?: MunicipalityEventSelectors | null;
  apiEndpoint?: string | null;
  dateFormat?: string;
  language: string;
  requiresJavascript?: boolean;
  notes?: string;
}

export interface StructuredMunicipalEvent {
  title: string;
  startTime: Date;
  endTime?: Date;
  description?: string;
  venueName?: string;
  location?: string;
  organizer?: string;
  price?: string;
  url?: string;
  confidence: number;
}
