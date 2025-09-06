import { createHash } from 'crypto';
import { RawEvent } from '@/types/event';

export function generateUniquenessHash(event: RawEvent): string {
  const normalized = {
    title: event.title.toLowerCase().trim(),
    startTime: Math.round(event.startTime.getTime() / 60000), // minute precision
    lat: event.lat ? Math.round(event.lat * 10000) / 10000 : null,
    lon: event.lon ? Math.round(event.lon * 10000) / 10000 : null
  };
  
  return createHash('sha1')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize spaces
}