import { AppError } from '../../shared/errors/app-error';
import type { MediaInput, MediaProvider, ResolvedMedia } from './media.types';

const MAX_URL_LENGTH = 2048;
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

/** True when the host is a literal IP, localhost or an obviously internal name. */
export function isDisallowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.startsWith('[')) return true; // no IPv6 literals
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (/^[\d.]+$/.test(host)) return true; // any IPv4 literal (URL parsing normalizes decimal/hex forms)
  return !host.includes('.');
}

/**
 * Pure URL validation: HTTPS only, no credentials, no IP literals or internal names.
 * The server never fetches these URLs, so there is no SSRF surface; checks exist so
 * that internal destinations are never rendered to other users either.
 */
export function validateExternalUrl(raw: string): URL {
  if (raw.length > MAX_URL_LENGTH) throw AppError.badRequest('Media URL is too long', 'INVALID_MEDIA_URL');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw AppError.badRequest('Media URL is not valid', 'INVALID_MEDIA_URL');
  }
  if (url.protocol !== 'https:') throw AppError.badRequest('Only HTTPS media URLs are allowed', 'INVALID_MEDIA_URL');
  if (url.username || url.password) throw AppError.badRequest('Media URL must not contain credentials', 'INVALID_MEDIA_URL');
  if (isDisallowedHost(url.hostname)) throw AppError.badRequest('Media URL host is not allowed', 'INVALID_MEDIA_URL');
  return url;
}

export class ExternalUrlMediaProvider implements MediaProvider {
  readonly name = 'external' as const;

  resolve(input: MediaInput): ResolvedMedia {
    const url = validateExternalUrl(input.url);
    return { url: url.toString(), mediaType: input.mediaType, providerAssetId: null };
  }

  createUploadSignature(): null {
    return null;
  }
}
