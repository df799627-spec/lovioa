/**
 * S3-compatible object storage service.
 *
 * Supports generic S3-compatible storage and Cloudflare R2.
 *
 * S3-compatible storage env vars:
 *   S4_ENDPOINT
 *   S4_ACCESS_KEY
 *   S4_SECRET_KEY
 *   S4_BUCKET_NAME
 *
 * Cloudflare R2 env vars (fallback / legacy):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *
 * Optional:
 *   S4_PUBLIC_DOMAIN / R2_PUBLIC_DOMAIN  — e.g. https://cdn.example.com
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// ─── Config ──────────────────────────────────────────────────────────────────

const S4_ENDPOINT = process.env.S4_ENDPOINT      || '';
const S4_ACCESS    = process.env.S4_ACCESS_KEY    || '';
const S4_SECRET    = process.env.S4_SECRET_KEY     || '';
const S4_BUCKET    = process.env.S4_BUCKET_NAME   || '';
const S4_PUBLIC    = process.env.S4_PUBLIC_DOMAIN  || '';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID        || '';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID     || '';
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET     = process.env.R2_BUCKET_NAME       || '';
const R2_PUBLIC     = process.env.R2_PUBLIC_DOMAIN     || '';

const USE_S4  = Boolean(S4_ENDPOINT && S4_ACCESS && S4_SECRET && S4_BUCKET);
const USE_R2  = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_KEY);
const STORAGE_CONFIGURED = USE_S4 || USE_R2;

const BUCKET   = USE_S4 ? S4_BUCKET  : R2_BUCKET;
const PUBLIC   = USE_S4 ? S4_PUBLIC  : R2_PUBLIC;
const PROVIDER = USE_S4 ? 's3-compatible' : USE_R2 ? 'r2' : 'none';

if (!STORAGE_CONFIGURED) {
  console.warn('[cloudStorage] No storage configured — set S4_* or R2_* env vars. Uploads will fail.');
}

export function isStorageConfigured() {
  return STORAGE_CONFIGURED;
}

// ─── S3 Client ────────────────────────────────────────────────────────────────

let _client = null;

function getClient() {
  if (_client) return _client;
  _client = new S3Client({
    region: 'auto',
    // Some S3-compatible endpoints require path-style addressing.
    forcePathStyle: USE_S4,
    endpoint: USE_S4 ? S4_ENDPOINT : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: USE_S4
      ? { accessKeyId: S4_ACCESS, secretAccessKey: S4_SECRET }
      : { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  });
  return _client;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Build the public CDN URL for a given object key.
 * @param {string} key  e.g. "uploads/abc.png"
 */
export function getCdnUrl(key) {
  if (PUBLIC) {
    const clean = key.replace(/^\//, '');
    return `${PUBLIC.replace(/\/$/, '')}/${clean}`;
  }
  // Path-style S3 endpoints include /<bucket>/<key>.
  if (USE_S4) {
    const base = S4_ENDPOINT.replace(/\/$/, '');
    const clean = key.replace(/^\//, '');
    return `${base}/${BUCKET}/${clean}`;
  }
  // R2 fallback
  return `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.dev/${key}`;
}

// ─── Core upload ─────────────────────────────────────────────────────────────

/**
 * Upload a Buffer to object storage.
 * @param {Buffer|Uint8Array} buffer
 * @param {string} key        — object key, e.g. "uploads/uuid.png"
 * @param {string} mimeType  — Content-Type, e.g. "image/png"
 * @returns {Promise<string>}  CDN URL of the uploaded file
 */
export async function uploadBuffer(buffer, key, mimeType = 'image/png') {
  if (!USE_S4 && !USE_R2) throw new Error('[cloudStorage] No storage configured — set S4_* or R2_* env vars.');

  const client = getClient();
  await new Upload({
    client,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  }).done();

  return getCdnUrl(key);
}

/**
 * Fetch a remote URL (e.g. OpenAI CDN) and stream-upload to storage.
 * @param {string} remoteUrl  — source URL to fetch and re-upload
 * @param {string} key        — target object key
 * @param {string} mimeType  — Content-Type hint
 * @returns {Promise<string>}  CDN URL
 */
export async function uploadFromUrl(remoteUrl, key, mimeType = 'image/png') {
  if (!USE_S4 && !USE_R2) throw new Error('[cloudStorage] No storage configured');

  const res = await fetch(remoteUrl);
  if (!res.ok) throw new Error(`[cloudStorage] failed to fetch ${remoteUrl}: ${res.status}`);

  const client = getClient();
  await new Upload({
    client,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: res.body,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  }).done();

  return getCdnUrl(key);
}

export async function uploadFromBase64(b64DataURL, key) {
  if (!USE_S4 && !USE_R2) throw new Error('[cloudStorage] No storage configured');
  const [header, b64payload] = b64DataURL.split(',', 2);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const buffer = Buffer.from(b64payload || b64DataURL, 'base64');
  return uploadBuffer(buffer, key, mimeType);
}

/**
 * Delete a file from storage by its key.
 * @param {string} key
 */
export async function deleteFile(key) {
  if (!USE_S4 && !USE_R2) return; // no-op when not configured
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Determine the best upload strategy based on the image source URL.
 * @param {string} imageUrl
 * @param {string} key
 * @returns {Promise<string>}  CDN URL
 */
export async function uploadFromImageSource(imageUrl, key) {
  if (!USE_S4 && !USE_R2) throw new Error('[cloudStorage] No storage configured');
  if (!imageUrl) return '';

  // Already on our CDN — nothing to do
  if (PUBLIC && imageUrl.startsWith(PUBLIC)) return imageUrl;
  if (USE_S4 && S4_ENDPOINT && imageUrl.startsWith(S4_ENDPOINT)) return imageUrl;
  if (USE_R2 && imageUrl.includes(`.${R2_ACCOUNT_ID}.r2.dev`)) return imageUrl;

  // base64 data URL
  if (imageUrl.startsWith('data:')) return uploadFromBase64(imageUrl, key);

  // Any remote URL — fetch and re-upload
  return uploadFromUrl(imageUrl, key);
}

/**
 * Resolve an image URL for storage in the database.
 * @param {string} imageUrl
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function resolveImageUrl(imageUrl, key) {
  if (!imageUrl) return '';
  return uploadFromImageSource(imageUrl, key);
}
