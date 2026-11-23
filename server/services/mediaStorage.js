import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isStorageConfigured, uploadBuffer } from './cloudStorage.js';

const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120 * 1000;
const MAX_REDIRECTS = 5;
const VIDEO_OPTIMIZE_TIMEOUT_MS = 120 * 1000;
const execFileAsync = promisify(execFile);

function isPrivateHostname(hostname, { allowBenchmarkRange = false } = {}) {
  const value = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !value
    || value === 'localhost'
    || value.endsWith('.localhost')
    || value.endsWith('.local')
    || value.endsWith('.internal')
  ) return true;
  const version = isIP(value);
  if (version === 4) {
    const [a, b] = value.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (!allowBenchmarkRange && a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (version === 6) {
    return value === '::1'
      || value === '::'
      || value.startsWith('fc')
      || value.startsWith('fd')
      || value.startsWith('fe8')
      || value.startsWith('fe9')
      || value.startsWith('fea')
      || value.startsWith('feb');
  }
  return false;
}

function isConfiguredVideoProviderHost(hostname) {
  const configuredHosts = [
    process.env.VIDEO_FOKE_BASE_URL,
    process.env.VIDEO_YIO_BASE_URL,
    process.env.VIDEO_HEZIAI_BASE_URL,
    process.env.VIDEO_API_BASE_URL,
  ].map(value => {
    try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
  }).filter(Boolean);
  const normalized = String(hostname || '').toLowerCase();
  return configuredHosts.some(host => normalized === host || normalized.endsWith(`.${host}`));
}

// 图片生成上游（OPENAI_API_BASE_URL / 快渠道）经常挂在 CDN 后面，
// 域名解析结果可能是 benchmark/保留段（例如 198.18.0.0/15 的代理网关）。
// 只有「我们自己配置的上游域名」才允许访问这些保留段，
// 裸 IP、内网域名、localhost 仍然一律拒绝。
function isConfiguredImageProviderHost(hostname) {
  const configuredHosts = [
    process.env.OPENAI_API_BASE_URL,
    process.env.GEN_FAST_BASE_URL,
    process.env.GEN_FAST_BASE_URL_CN,
  ].map(value => {
    try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
  }).filter(Boolean);
  const normalized = String(hostname || '').toLowerCase();
  if (!normalized || isIP(normalized)) return false;
  return configuredHosts.some(host => normalized === host || normalized.endsWith(`.${host}`));
}

async function assertSafeRemoteUrl(value, {
  allowConfiguredVideoProviderHost = false,
  allowConfiguredImageProviderHost = false,
} = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('媒体地址无效');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('媒体地址协议不受支持');
  }
  // 配置的上游域名始终经过 DNS 解析校验，这里只放宽「保留段地址」，
  // 不放宽 private/localhost，因此无法借此访问内网服务。
  const allowBenchmarkRange = (
    allowConfiguredVideoProviderHost && isConfiguredVideoProviderHost(parsed.hostname)
  ) || (
    allowConfiguredImageProviderHost && isConfiguredImageProviderHost(parsed.hostname)
  );
  if (isPrivateHostname(parsed.hostname, { allowBenchmarkRange })) {
    throw new Error('媒体地址来源不受支持');
  }

  try {
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (addresses.some(({ address }) => isPrivateHostname(address, { allowBenchmarkRange }))) {
      throw new Error('媒体地址来源不受支持');
    }
  } catch (error) {
    if (error?.message === '媒体地址来源不受支持') throw error;
    throw new Error('媒体地址来源不可用');
  }
  return parsed;
}

function extensionFor(mimeType, kind, url = '') {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('video')) return 'mp4';
  if (mime.includes('png')) return 'png';
  try {
    const suffix = path.extname(new URL(url).pathname).toLowerCase().replace('.', '');
    if (['jpg', 'jpeg', 'webp', 'gif', 'png', 'mp4', 'mov', 'webm'].includes(suffix)) {
      return suffix === 'jpeg' ? 'jpg' : suffix;
    }
  } catch {}
  return kind === 'video' ? 'mp4' : 'png';
}

function safePrefix(value) {
  return String(value || 'generated')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'generated';
}

function decodeDataUrl(value) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(value || ''));
  if (!match) throw new Error('媒体 data URL 无效');
  return {
    mimeType: match[1] || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function findFfmpegBinary() {
  return [
    process.env.FFMPEG_PATH,
    'ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/home/aren/.local/bin/ffmpeg',
  ].filter(Boolean);
}

async function optimizeMp4ForPlayback(buffer, mimeType, sourceUrl) {
  const normalizedMime = String(mimeType || '').toLowerCase();
  const sourceExtension = extensionFor(mimeType, 'video', sourceUrl);
  if (!normalizedMime.includes('mp4') && sourceExtension !== 'mp4') {
    return { buffer, mimeType, optimized: false };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lovioa-video-'));
  const inputPath = path.join(tempDir, 'source.mp4');
  const outputPath = path.join(tempDir, 'playback.mp4');
  try {
    await writeFile(inputPath, buffer);
    let lastError = null;
    for (const ffmpeg of findFfmpegBinary()) {
      try {
        await execFileAsync(ffmpeg, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          inputPath,
          '-map',
          '0',
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          outputPath,
        ], {
          timeout: VIDEO_OPTIMIZE_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        });
        const optimized = await readFile(outputPath);
        if (optimized.length === 0 || optimized.length > MAX_VIDEO_BYTES) {
          throw new Error('优化后的视频文件大小无效');
        }
        return {
          buffer: optimized,
          mimeType: 'video/mp4',
          optimized: true,
        };
      } catch (error) {
        lastError = error;
      }
    }

    console.warn(
      `[mediaStorage] video faststart optimization skipped: ${lastError?.message || 'ffmpeg unavailable'}`,
    );
    return { buffer, mimeType, optimized: false };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fetchRemoteMedia(value, kind, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = String(value || '');
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const parsed = await assertSafeRemoteUrl(currentUrl, options);
      const response = await fetch(parsed, {
        signal: controller.signal,
        redirect: 'manual',
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('媒体下载重定向地址缺失');
        if (redirectCount === MAX_REDIRECTS) throw new Error('媒体下载重定向次数过多');
        currentUrl = new URL(location, parsed).toString();
        continue;
      }
      if (!response.ok) throw new Error(`媒体下载失败（HTTP ${response.status}）`);
      const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > limit) throw new Error('媒体文件超过大小限制');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error('媒体文件为空');
      if (buffer.length > limit) throw new Error('媒体文件超过大小限制');
      return {
        mimeType: response.headers.get('content-type')?.split(';')[0]?.trim()
          || (kind === 'video' ? 'video/mp4' : 'image/png'),
        buffer,
      };
    }
    throw new Error('媒体下载重定向次数过多');
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('媒体下载超时');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function persistMediaUrl(rawUrl, {
  kind = 'image',
  keyPrefix = 'generated',
  allowConfiguredVideoProviderHost = false,
  allowConfiguredImageProviderHost = false,
} = {}) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('/')) throw new Error('媒体地址无效');

  let { mimeType, buffer } = value.startsWith('data:')
    ? decodeDataUrl(value)
    : await fetchRemoteMedia(value, kind, {
      allowConfiguredVideoProviderHost,
      allowConfiguredImageProviderHost,
    });
  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (buffer.length === 0) throw new Error('媒体文件为空');
  if (buffer.length > limit) throw new Error('媒体文件超过大小限制');
  if (kind === 'video') {
    const optimized = await optimizeMp4ForPlayback(buffer, mimeType, value);
    buffer = optimized.buffer;
    mimeType = optimized.mimeType;
  }
  const extension = extensionFor(mimeType, kind, value);
  const filename = `${safePrefix(keyPrefix)}-${randomUUID()}.${extension}`;

  if (isStorageConfigured()) {
    return uploadBuffer(buffer, `generated/${filename}`, mimeType);
  }

  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
  writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}
