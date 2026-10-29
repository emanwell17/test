import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRelay } from './relay.mjs';

const handler = createRelay({
  secret: process.env.RELAY_SECRET, apiKey: process.env.SESSION_API_KEY,
  allowedOrigins: String(process.env.ALLOWED_ORIGINS || 'https://scorezonetv.live,https://www.scorezonetv.live').split(',').map(value => value.trim()).filter(Boolean),
  ttlSeconds: Number(process.env.SESSION_TTL_SECONDS || 600),
  cacheBytes: Math.max(8, Math.min(256, Number(process.env.CACHE_MAX_MB) || 64)) * 1024 * 1024,
});
const root = fileURLToPath(new URL('./public/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/test.js', ['test.js', 'text/javascript; charset=utf-8']],
  ['/hls.min.js', ['hls.min.js', 'text/javascript; charset=utf-8']],
]);
const server = http.createServer((req, res) => {
  const asset = assets.get(new URL(req.url, 'http://relay.internal').pathname);
  if (asset && req.method === 'GET') {
    try {
      const bytes = readFileSync(root + asset[0]);
      res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'" });
      res.end(bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }
  handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end('Relay request failed'); });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('ScoreZone relay is listening'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); });
