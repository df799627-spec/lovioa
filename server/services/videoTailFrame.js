import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60 * 1000;

function getAllowedVideoHosts() {
  const sources = [
    process.env.VIDEO_FOKE_BASE_URL,
    process.env.VIDEO_YIO_BASE_URL,
    process.env.VIDEO_HEZIAI_BASE_URL,
    process.env.VIDEO_API_BASE_URL,
    process.env.S4_ENDPOINT,
    process.env.R2_PUBLIC_DOMAIN,
    'https://feituokuajing.oss-cn-hongkong.aliyuncs.com',
  ];
  return new Set(sources.map(value => {
    try {
      return new URL(String(value || '')).hostname.toLowerCase();
    } catch {
      return '';
    }
  }).filter(Boolean));
}

function validateRemoteVideoUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('视频地址无效');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('视频地址协议不受支持');
  }
  if (!getAllowedVideoHosts().has(parsed.hostname.toLowerCase())) {
    throw new Error('视频地址来源不受支持');
  }
  return parsed;
}

async function fetchVideoBuffer(videoUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = validateRemoteVideoUrl(videoUrl);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`视频地址重定向失败（HTTP ${response.status}）`);
        currentUrl = validateRemoteVideoUrl(new URL(location, currentUrl).toString());
        continue;
      }
      if (!response.ok) throw new Error(`视频下载失败（HTTP ${response.status}）`);
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > MAX_VIDEO_BYTES) throw new Error('视频文件超过尾帧处理大小限制');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_VIDEO_BYTES) throw new Error('视频文件超过尾帧处理大小限制');
      if (buffer.length === 0) throw new Error('视频文件为空');
      return buffer;
    }
    throw new Error('视频地址重定向次数过多');
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('视频下载超时');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runFfmpeg(args) {
  const candidates = [
    process.env.FFMPEG_PATH,
    'ffmpeg',
    '/usr/bin/ffmpeg',
    '/home/aren/.local/bin/ffmpeg',
  ].filter(Boolean);
  let lastError = null;
  for (const command of [...new Set(candidates)]) {
    try {
      await execFileAsync(command, args, {
        maxBuffer: 2 * 1024 * 1024,
        timeout: FETCH_TIMEOUT_MS,
      });
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw lastError || new Error('ffmpeg 不可用');
}

export async function extractVideoTailFrame(videoUrl) {
  const videoBuffer = await fetchVideoBuffer(videoUrl);
  const workDir = await mkdtemp(path.join(tmpdir(), 'promptfolio-video-'));
  const inputPath = path.join(workDir, 'input-video');
  const outputPath = path.join(workDir, 'tail-frame.png');
  try {
    await writeFile(inputPath, videoBuffer);
    const baseArgs = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-f',
      'image2',
      outputPath,
    ];
    try {
      await runFfmpeg(['-sseof', '-0.1', ...baseArgs]);
    } catch {
      await runFfmpeg(['-sseof', '-1', ...baseArgs]);
    }
    const frame = await readFile(outputPath);
    if (!frame.length) throw new Error('尾帧结果为空');
    return frame;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
