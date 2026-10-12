import { describe, expect, it } from 'vitest';
import { CloudinaryMediaProvider, issueFolder } from '../../src/modules/media/cloudinary.provider';
import { ExternalUrlMediaProvider, validateExternalUrl } from '../../src/modules/media/external-url.provider';
import { createMediaProvider } from '../../src/modules/media/media.factory';

const creds = { cloudName: 'demo-cloud', apiKey: 'key123', apiSecret: 'secret-never-leaves-server' };
const hostelId = '11111111-1111-4111-8111-111111111111';
const issueId = '22222222-2222-4222-8222-222222222222';

describe('provider selection', () => {
  it('picks the external provider by default', () => {
    expect(createMediaProvider({ provider: 'external', cloudinary: creds }).name).toBe('external');
  });
  it('picks cloudinary when configured', () => {
    expect(createMediaProvider({ provider: 'cloudinary', cloudinary: creds }).name).toBe('cloudinary');
  });
});

describe('external URL validation', () => {
  it.each([
    'http://example.com/a.png',
    'ftp://example.com/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://localhost/a.png',
    'https://127.0.0.1/a.png',
    'https://2130706433/a.png',
    'https://10.0.0.5/a.png',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a.png',
    'https://user:pass@example.com/a.png',
    'https://printer.local/a.png',
    'https://intranet/a.png',
    'not a url',
    `https://example.com/${'a'.repeat(2100)}`,
  ])('rejects %s', (url) => {
    expect(() => validateExternalUrl(url)).toThrowError(expect.objectContaining({ code: 'INVALID_MEDIA_URL' }));
  });

  it('accepts public https urls', () => {
    expect(validateExternalUrl('https://picsum.photos/seed/x/800/600').hostname).toBe('picsum.photos');
  });

  it('provider normalizes and never offers uploads', () => {
    const provider = new ExternalUrlMediaProvider();
    expect(provider.resolve({ url: 'https://example.com/a.mp4', mediaType: 'VIDEO' }).providerAssetId).toBeNull();
    expect(provider.createUploadSignature()).toBeNull();
  });
});

describe('cloudinary provider (no network, no SDK calls)', () => {
  const provider = new CloudinaryMediaProvider(creds, () => 1_700_000_000);
  const folder = issueFolder(hostelId, issueId);
  const good = { url: `https://res.cloudinary.com/demo-cloud/image/upload/${folder}/a.jpg`, mediaType: 'IMAGE' as const, publicId: `${folder}/a` };

  it('signs uploads server-side without exposing the secret', () => {
    const sig = provider.createUploadSignature({ hostelId, issueId });
    expect(sig.folder).toBe(folder);
    expect(sig.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.stringify(sig)).not.toContain(creds.apiSecret);
  });

  it('accepts assets in the issue folder', () => {
    expect(provider.resolve(good, { hostelId, issueId }).providerAssetId).toBe(good.publicId);
  });

  it('rejects assets from another issue or tenant folder', () => {
    const other = { ...good, publicId: `${issueFolder(hostelId, '33333333-3333-4333-8333-333333333333')}/a` };
    expect(() => provider.resolve(other, { hostelId, issueId })).toThrowError(expect.objectContaining({ code: 'MEDIA_FOLDER_MISMATCH' }));
  });

  it('rejects foreign cloud URLs, oversize and unsupported formats', () => {
    expect(() => provider.resolve({ ...good, url: 'https://res.cloudinary.com/evil/image/upload/x.jpg' }, { hostelId, issueId })).toThrowError(expect.objectContaining({ code: 'INVALID_MEDIA_URL' }));
    expect(() => provider.resolve({ ...good, bytes: 999_999_999 }, { hostelId, issueId })).toThrowError(expect.objectContaining({ code: 'MEDIA_TOO_LARGE' }));
    expect(() => provider.resolve({ ...good, format: 'exe' }, { hostelId, issueId })).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_FORMAT' }));
  });

  it('requires an existing issue', () => {
    expect(() => provider.resolve(good, { hostelId })).toThrowError(expect.objectContaining({ code: 'MEDIA_REQUIRES_ISSUE' }));
  });
});
