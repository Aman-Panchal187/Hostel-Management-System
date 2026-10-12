import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../../shared/errors/app-error';
import type { MediaContext, MediaInput, MediaProvider, ResolvedMedia, UploadSignature } from './media.types';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov']);

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Folder that every upload for an issue must live in; enforced on attach. */
export const issueFolder = (hostelId: string, issueId: string) => `hostel-${hostelId}/issues/${issueId}`;

export class CloudinaryMediaProvider implements MediaProvider {
  readonly name = 'cloudinary' as const;

  constructor(
    private readonly credentials: CloudinaryCredentials,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  createUploadSignature(context: Required<MediaContext>): UploadSignature {
    const timestamp = this.now();
    const folder = issueFolder(context.hostelId, context.issueId);
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, this.credentials.apiSecret);
    return {
      cloudName: this.credentials.cloudName,
      apiKey: this.credentials.apiKey,
      timestamp,
      folder,
      signature,
      resourceType: 'auto',
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  resolve(input: MediaInput, context: MediaContext): ResolvedMedia {
    if (!context.issueId) {
      throw AppError.badRequest('Upload media after the issue has been created', 'MEDIA_REQUIRES_ISSUE');
    }
    if (!input.publicId) throw AppError.badRequest('publicId is required for Cloudinary media', 'INVALID_MEDIA');
    const folder = issueFolder(context.hostelId, context.issueId);
    // The folder prefix binds the asset to this tenant and issue (signed server-side).
    if (!input.publicId.startsWith(`${folder}/`) || input.publicId.includes('..')) {
      throw AppError.forbidden('Media does not belong to this issue', 'MEDIA_FOLDER_MISMATCH');
    }
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw AppError.badRequest('Media URL is not valid', 'INVALID_MEDIA_URL');
    }
    const expectedPrefix = `/${this.credentials.cloudName}/`;
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(expectedPrefix)) {
      throw AppError.badRequest('Media URL must be a Cloudinary asset of this account', 'INVALID_MEDIA_URL');
    }
    if (input.bytes !== undefined && input.bytes > MAX_UPLOAD_BYTES) {
      throw AppError.badRequest('Media file is too large', 'MEDIA_TOO_LARGE');
    }
    if (input.format && !ALLOWED_FORMATS.has(input.format.toLowerCase())) {
      throw AppError.badRequest('Unsupported media format', 'UNSUPPORTED_MEDIA_FORMAT');
    }
    return { url: url.toString(), mediaType: input.mediaType, providerAssetId: input.publicId };
  }
}
