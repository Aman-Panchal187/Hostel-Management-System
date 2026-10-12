import { config } from '../../config/env';
import { CloudinaryMediaProvider } from './cloudinary.provider';
import { ExternalUrlMediaProvider } from './external-url.provider';
import type { MediaProvider } from './media.types';

export function createMediaProvider(settings: Pick<typeof config.media, 'provider' | 'cloudinary'> = config.media): MediaProvider {
  return settings.provider === 'cloudinary'
    ? new CloudinaryMediaProvider(settings.cloudinary)
    : new ExternalUrlMediaProvider();
}

let instance: MediaProvider | null = null;

/** Process-wide provider selected by MEDIA_PROVIDER. */
export function getMediaProvider(): MediaProvider {
  instance ??= createMediaProvider();
  return instance;
}
