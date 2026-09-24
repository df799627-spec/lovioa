import net from 'net';

const GEOIP_LOOKUP_URL = (process.env.GEOIP_LOOKUP_URL || 'https://ipwho.is/{ip}').trim();
const GEOIP_TIMEOUT_MS = Math.max(500, Number(process.env.GEOIP_TIMEOUT_MS || 2500));
const GEOIP_CACHE_TTL_MS = Math.max(60_000, Number(process.env.GEOIP_CACHE_TTL_MS || 24 * 60 * 60 * 1000));
const GEOIP_CACHE_MAX = Math.max(100, Number(process.env.GEOIP_CACHE_MAX || 5000));

const geoCache = new Map();
const inflightLookups = new Map();

function nowMs() {
  return Date.now();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeIp(raw) {
  let ip = normalizeText(raw);
  if (!ip) return '';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);
  return ip.trim();
}

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((v) => Number(v));
  if (parts.length !== 4 || parts.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  return lower === '::1'
    || lower.startsWith('fe80:')
    || lower.startsWith('fc')
    || lower.startsWith('fd')
    || lower.startsWith('::ffff:127.')
    || lower === '::';
}

function isPrivateOrInvalidIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return true;
  const version = net.isIP(normalized);
  if (version === 0) return true;
  if (version === 4) return isPrivateIpv4(normalized);
  return isPrivateIpv6(normalized);
}

function getHeaderValue(headers, names) {
  for (const name of names) {
    const value = normalizeText(headers?.[name]);
    if (value) return value;
  }
  return '';
}

function extractClientIp(req) {
  const headerIp = getHeaderValue(req?.headers, ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'x-client-ip']);
  const firstForwarded = headerIp ? headerIp.split(',')[0].trim() : '';
  const socketIp = normalizeIp(req?.socket?.remoteAddress || req?.ip || '');
  return normalizeIp(firstForwarded || socketIp);
}

function normalizeGeoPayload(payload) {
  if (!payload || typeof payload !== 'object') return { country: '', region: '', city: '' };
  const country = normalizeText(payload.country || payload.country_name || payload.countryCode || payload.country_code);
  const region = normalizeText(payload.region || payload.region_name || payload.regionName || payload.region_code || payload.regionCode);
  const city = normalizeText(payload.city || payload.city_name || payload.cityName);
  return { country, region, city };
}

function readCache(ip) {
  const entry = geoCache.get(ip);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs()) {
    geoCache.delete(ip);
    return null;
  }
  return entry.value;
}

function writeCache(ip, value) {
  geoCache.set(ip, {
    value,
    expiresAt: nowMs() + GEOIP_CACHE_TTL_MS,
  });
  while (geoCache.size > GEOIP_CACHE_MAX) {
    const oldestKey = geoCache.keys().next().value;
    if (!oldestKey) break;
    geoCache.delete(oldestKey);
  }
}

async function lookupGeo(ip) {
  const normalizedIp = normalizeIp(ip);
  if (isPrivateOrInvalidIp(normalizedIp)) return { country: '', region: '', city: '' };

  const cached = readCache(normalizedIp);
  if (cached) return cached;

  if (inflightLookups.has(normalizedIp)) {
    return inflightLookups.get(normalizedIp);
  }

  const promise = (async () => {
    try {
      const lookupUrl = GEOIP_LOOKUP_URL.includes('{ip}')
        ? GEOIP_LOOKUP_URL.replaceAll('{ip}', encodeURIComponent(normalizedIp))
        : `${GEOIP_LOOKUP_URL.replace(/\/+$/, '')}/${encodeURIComponent(normalizedIp)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEOIP_TIMEOUT_MS);
      try {
        const res = await fetch(lookupUrl, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const rawText = await res.text();
        if (!res.ok) {
          throw new Error(`geoip HTTP ${res.status}: ${rawText.slice(0, 200)}`);
        }

        let payload = {};
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = {};
        }

        if (payload?.success === false) {
          throw new Error(payload.message || 'geoip lookup failed');
        }

        const value = normalizeGeoPayload(payload);
        writeCache(normalizedIp, value);
        return value;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      const value = { country: '', region: '', city: '' };
      writeCache(normalizedIp, value);
      return value;
    } finally {
      inflightLookups.delete(normalizedIp);
    }
  })();

  inflightLookups.set(normalizedIp, promise);
  return promise;
}

function resolveGeoFromHeaders(headers) {
  return {
    country: getHeaderValue(headers, ['cf-ipcountry', 'x-country', 'x-country-name']),
    region: getHeaderValue(headers, ['cf-region', 'x-region', 'x-region-name', 'x-state', 'x-state-name']),
    city: getHeaderValue(headers, ['cf-ipcity', 'x-city', 'x-city-name']),
  };
}

export async function resolveGeoLocationFromRequest(req) {
  const ipAddress = extractClientIp(req);
  const headerGeo = resolveGeoFromHeaders(req?.headers);

  if (!ipAddress) {
    return { ipAddress: '', ...headerGeo };
  }

  if (headerGeo.country && headerGeo.region && headerGeo.city) {
    return { ipAddress, ...headerGeo };
  }

  const lookupGeoData = await lookupGeo(ipAddress);
  return {
    ipAddress,
    country: headerGeo.country || lookupGeoData.country || '',
    region: headerGeo.region || lookupGeoData.region || '',
    city: headerGeo.city || lookupGeoData.city || '',
  };
}

