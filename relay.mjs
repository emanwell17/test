import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

const blocked = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip, bits, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001::', 23, 'ipv6'); blocked.addSubnet('2001:db8::', 32, 'ipv6');
export function publicAddress(address) {
  const clean = address.replace(/^\[|\]$/g, '');
  if (isIP(clean) === 4) return !blocked.check(clean, 'ipv4');
  if (isIP(clean) === 6) return globalV6.check(clean, 'ipv6') && !blocked.check(clean, 'ipv6');
  return false;
}
function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function mediaTarget(value, root = false) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.username || url.password || url.port || url.hash) throw fail('Invalid media address');
  if (root) {
    if (url.protocol !== 'https:' || host !== 'vps-65a08dc7.vps.ovh.ca' || !/^\/(?:svt|trtv|d4k|dino|cloud)\/hls\/\d+\.m3u8$/i.test(url.pathname)) throw fail('Use a direct IPTV HLS link from the configured provider');
  } else if (isIP(host)) {
    // These addresses are accepted ONLY from a provider playlist, and are sealed
    // into a server-created token. There is no public URL-fetch endpoint.
    if (!publicAddress(host) || !['http:', 'https:'].includes(url.protocol)) throw fail('Media destination blocked', 502);
  } else if (host !== 'vps-65a08dc7.vps.ovh.ca' || url.protocol !== 'https:') throw fail('Media host blocked', 502);
  return url;
}
async function safeLookup(hostname, options, callback) {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some(record => !publicAddress(record.address))) throw fail('DNS destination blocked', 502);
    // The checked address is supplied directly to the socket: no second DNS
    // lookup can rebind an approved hostname to an internal address.
    if (options.all) callback(null, records);
    else callback(null, records[0].address, records[0].family);
  } catch (error) { callback(error); }
}
export async function fetchMedia(value, redirects = 0) {
  const url = mediaTarget(value);
  if (redirects > 3) throw fail('Too many upstream redirects', 502);
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).get(url, {
      lookup: safeLookup,
      headers: { Accept: '*/*', 'Accept-Encoding': 'identity' },
    }, response => {
      const status = response.statusCode || 502;
      if ([301,302,303,307,308].includes(status) && response.headers.location) {
        response.resume();
        try { const next = mediaTarget(new URL(response.headers.location, url).href); fetchMedia(next.href, redirects + 1).then(resolve, reject); }
        catch (error) { reject(error); }
        return;
      }
      if (status < 200 || status >= 300) { response.resume(); reject(fail(`Upstream returned HTTP ${status}`, status >= 400 && status < 600 ? status : 502)); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) response.destroy(fail('Media object exceeds 32 MiB', 502));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ body: Buffer.concat(chunks), type: String(response.headers['content-type'] || 'application/octet-stream') }));
    });
    const timeout = setTimeout(() => req.destroy(fail('Upstream timed out', 504)), 60000);
    req.on('close', () => clearTimeout(timeout));
    req.on('error', reject);
  });
}

export function createRelay({ secret, apiKey, allowedOrigins = [], ttlSeconds = 600, cacheBytes = 64 * 1024 * 1024, fetcher = fetchMedia, now = Date.now } = {}) {
  if (String(secret || '').length < 32 || String(apiKey || '').length < 24 || String(secret).startsWith('replace-with') || String(apiKey).startsWith('replace-with')) throw new Error('Configure RELAY_SECRET (32+ characters) and SESSION_API_KEY (24+ characters)');
  const key = createHash('sha256').update(secret).digest(), cache = new Map(), pending = new Map(), tokens = new Map();
  const expectedKey = createHash('sha256').update(apiKey).digest();
  let used = 0, active = 0;
  function authorized(value) { return timingSafeEqual(expectedKey, createHash('sha256').update(String(value || '')).digest()); }
  function seal(payload) {
    const text = JSON.stringify(payload), old = tokens.get(text);
    if (old && old.expires > now()) return old.token;
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(text), cipher.final()]);
    const token = Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
    tokens.set(text, { token, expires: payload.expires });
    while (tokens.size > 8192) tokens.delete(tokens.keys().next().value);
    return token;
  }
  function open(token) {
    try {
      if (token.length > 8192) return null;
      const bytes = Buffer.from(token, 'base64url'), decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(12,28));
      const result = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]));
      return result.expires > now() ? result : null;
    } catch { return null; }
  }
  const link = payload => `/hls/${seal(payload)}/${payload.playlist ? 'index.m3u8' : 'media.ts'}`;
  async function get(url) {
    const cached = cache.get(url);
    if (cached && cached.until > now()) { cache.delete(url); cache.set(url, cached); return cached; }
    if (cached) { used -= cached.body.length; cache.delete(url); }
    if (pending.has(url)) return pending.get(url);
    if (active >= 12) throw fail('Relay is busy; retry shortly', 503);
    active++;
    const job = (async () => {
      mediaTarget(url);
      const result = await fetcher(url);
      if (!Buffer.isBuffer(result.body) || result.body.length > 32 * 1024 * 1024) throw fail('Invalid upstream response', 502);
      const playlist = result.body.subarray(0, 7).toString() === '#EXTM3U';
      if (!playlist && /text\/html|application\/json/i.test(result.type)) throw fail('Upstream returned an error document', 502);
      const entry = { ...result, playlist, until: now() + (playlist ? 2000 : 300000) };
      if (entry.body.length <= cacheBytes) {
        while (used + entry.body.length > cacheBytes && cache.size) { const first = cache.keys().next().value; used -= cache.get(first).body.length; cache.delete(first); }
        cache.set(url, entry); used += entry.body.length;
      }
      return entry;
    })();
    pending.set(url, job);
    try { return await job; } finally { pending.delete(url); active--; }
  }
  function rewrite(text, source, expires) {
    const proxy = value => {
      const url = mediaTarget(new URL(value, source).href);
      return link({ url: url.href, expires, playlist: /\.m3u8$/i.test(url.pathname) });
    };
    return text.split(/\r?\n/).map(line => {
      if (!line.trim()) return line;
      if (!line.startsWith('#')) return proxy(line.trim());
      // Also covers encryption keys, fMP4 init files, audio renditions and
      // low-latency HLS URI attributes. They must all remain HTTPS in browsers.
      return line.replace(/\bURI="([^"]+)"/g, (_, value) => `URI="${proxy(value)}"`).replace(/https?:\/\/[^\s",<>]+/gi, '[source]');
    }).join('\n');
  }
  function send(res, status, body, headers = {}) {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    res.writeHead(status, { 'Content-Length': bytes.length, 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(bytes);
  }
  return async function handle(req, res) {
    const route = new URL(req.url, 'http://relay.internal');
    const origin = req.headers.origin;
    const cors = origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range', Vary: 'Origin' } : {};
    // The same-origin test page works without an explicit allowlist entry.
    const sameOrigin = origin && new URL(origin).host === req.headers.host;
    if (origin && !sameOrigin && !allowedOrigins.includes(origin)) return send(res, 403, 'Origin not allowed');
    if (req.method === 'OPTIONS') return send(res, 204, '', cors);
    try {
      if (route.pathname === '/healthz') return send(res, 200, JSON.stringify({ ok: true, cacheBytes: used, cachedObjects: cache.size, activeRequests: active }), { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      if (route.pathname === '/api/sessions' && req.method === 'POST') {
        if (!authorized(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) return send(res, 401, 'Session API key required', { ...cors, 'Cache-Control': 'no-store' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 16384) throw fail('Request too large', 413); chunks.push(chunk); }
        let data; try { data = JSON.parse(Buffer.concat(chunks)); } catch { throw fail('Invalid JSON'); }
        const url = mediaTarget(data.url, true);
        const expires = now() + Math.max(60, Math.min(3600, Number(ttlSeconds) || 600)) * 1000;
        const upstream = await get(url.href);
        if (!upstream.playlist) throw fail('Source is not an HLS playlist', 502);
        // Validate child destinations before handing out a usable session.
        rewrite(upstream.body.toString('utf8'), url.href, expires);
        return send(res, 200, JSON.stringify({ path: link({ url: url.href, expires, playlist: true }), expiresAt: expires }), { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      }
      const match = route.pathname.match(/^\/hls\/([\w-]+)\/(?:index\.m3u8|media\.ts)$/);
      if (!match || !['GET','HEAD'].includes(req.method)) return send(res, 404, 'Not found', cors);
      const session = open(match[1]);
      if (!session) return send(res, 401, 'Playback link expired or invalid', { ...cors, 'Cache-Control': 'no-store' });
      const upstream = await get(mediaTarget(session.url).href);
      const playlist = upstream.playlist;
      let body = playlist ? Buffer.from(rewrite(upstream.body.toString('utf8'), session.url, session.expires)) : upstream.body;
      const headers = { ...cors, 'Content-Type': playlist ? 'application/vnd.apple.mpegurl' : upstream.type, 'Cache-Control': playlist ? 'no-store' : `private, max-age=${Math.max(0, Math.min(300, Math.floor((session.expires - now()) / 1000)))}` };
      let status = 200;
      if (!playlist && req.headers.range) {
        const range = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
        if (!range || (!range[1] && !range[2])) return send(res, 416, '', { ...headers, 'Content-Range': `bytes */${body.length}` });
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start > end || start >= body.length) return send(res, 416, '', { ...headers, 'Content-Range': `bytes */${body.length}` });
        headers['Content-Range'] = `bytes ${start}-${end}/${body.length}`;
        headers['Accept-Ranges'] = 'bytes'; body = body.subarray(start, end + 1); status = 206;
      }
      if (req.method === 'HEAD') { res.writeHead(status, { ...headers, 'Content-Length': body.length }); res.end(); return; }
      return send(res, status, body, headers);
    } catch (error) {
      // No source URLs, signed queries or API secrets in public errors or logs.
      const status = error.status || 502;
      return send(res, status, error.status ? error.message : 'Relay request failed', { ...cors, 'Cache-Control': 'no-store', ...(status === 503 ? { 'Retry-After': '2' } : {}) });
    }
  };
}
