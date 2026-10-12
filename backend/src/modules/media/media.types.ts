import type { MediaType } from '@prisma/client';

export interface MediaInput {
  url: string;
  mediaType: MediaType;
  /** Cloudinary public id (cloudinary provider only). */
  publicId?: string;
  bytes?: number;
  format?: string;
}

export interface ResolvedMedia {
  url: string;
  mediaType: MediaType;
  providerAssetId: string | null;
}

export interface MediaContext {
  hostelId: string;
  /** Present when attaching to an existing issue. */
  issueId?: string;
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  resourceType: 'auto';
  maxBytes: number;
}

export interface MediaProvider {
  readonly name: 'external' | 'cloudinary';
  /** Validates the reference and returns the normalized record to persist. */
  resolve(input: MediaInput, context: MediaContext): ResolvedMedia;
  /** Returns signed upload params, or null when the provider does not support uploads. */
  createUploadSignature(context: Required<MediaContext>): UploadSignature | null;
}
