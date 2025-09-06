export interface RawEvent {
  source: string;
  sourceEventId?: string;
  title: string;
  description?: string;
  lang?: string;
  category?: string;
  startTime: Date;
  endTime?: Date;
  venueName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  url?: string;
  imageUrl?: string;
}

export const CATEGORIES = {
  ALPSABZUG: 'alpsabzug',
  FESTIVAL: 'festival', 
  MUSIC: 'musik',
  MARKET: 'markt',
  FAMILY: 'familie',
  SPORTS: 'sport',
  CULTURE: 'kultur',
  COMMUNITY: 'gemeinde',
  SEASONAL: 'saisonal'
} as const;

export type Category = typeof CATEGORIES[keyof typeof CATEGORIES];

export const SOURCES = {
  ST: 'ST',
  ZURICH: 'ZURICH', 
  LIMMATTAL: 'LIMMATTAL',
  MUNICIPAL: 'MUNICIPAL'
} as const;

export type Source = typeof SOURCES[keyof typeof SOURCES];