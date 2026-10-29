import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRelay, mediaTarget, publicAddress } from './relay.mjs';
const source = 'https://vps-65a08dc7.vps.ovh.ca/svt/hls/324993.m3u8?t=test';
const apiKey = 'operator-secret-test-abcdefghijklmnopqrstuvwxyz';
const secret = 'relay-encryption-test-abcdefghijklmnopqrstuvwxyz';
async function call(handler, path, { method = 'GET', body, headers = {} } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { url: path, method, headers: { host: 'relay.test', ...headers } });
  const result = {};
  const res = { writeHead(status, responseHeaders) { result.status = status; result.headers = responseHeaders; }, end(bytes) { result.body = Buffer.from(bytes || ''); } };
  await handler(req, res); return result;
}
const session = handler => call(handler, '/api/sessions', { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: { url: source } });
test('site integration creates a session without scanning media and caps it at entitlement expiry', async () => {
  const handler = createRelay({secret,apiKey,now:()=>1000,fetcher:()=>{throw new Error('Must not scan media');}});
  const response = await call(handler,'/api/sessions',{method:'POST',headers:{authorization:`Bearer ${apiKey}`},body:{url:source,validate:false,expiresAt:91000}});
  assert.equal(response.status,200); assert.equal(JSON.parse(response.body).expiresAt,91000);
  const expired = await call(handler,'/api/sessions',{method:'POST',headers:{authorization:`Bearer ${apiKey}`},body:{url:source,validate:false,expiresAt:999}});
  assert.equal(expired.status,403);
});
test('requires authentication, limits root sources and blocks private network targets', async () => {
  let calls = 0;
  const handler = createRelay({ secret, apiKey, fetcher: async () => { calls++; throw new Error('Must not fetch'); } });
  assert.equal((await call(handler, '/api/sessions', { method: 'POST', body: { url: source } })).status, 401);
  assert.equal((await call(handler, '/api/sessions', { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: { url: 'https://example.com/a.m3u8' } })).status, 400);
  assert.equal(calls, 0);
  for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.0.1','100.64.0.1','::1','::ffff:127.0.0.1','2001:db8::1','224.0.0.1']) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('185.245.1.73'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  for (const target of ['http://127.1/a.ts','http://169.254.169.254/latest','http://10.0.0.1/a.ts','https://evil.test/a.m3u8']) assert.throws(() => mediaTarget(target));
});
test('rewrites segments and keys, coalesces and shares cached media, preserves byte ranges and expiry', async () => {
  let time = 1000, segmentFetches = 0;
  const segment = Buffer.from([0x47,1,2,3,4,5,6,7]);
  const handler = createRelay({ secret, apiKey, now: () => time, fetcher: async url => {
    if (url === source) return { body: Buffer.from('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="http://185.245.1.73/hls/key.key"\n#EXTINF:6,\nhttp://185.245.1.73/hls/id/1.ts\n'), type: 'application/vnd.apple.mpegurl' };
    segmentFetches++; await new Promise(resolve => setTimeout(resolve, 5)); return { body: segment, type: 'video/mp2t' };
  } });
  const created = await session(handler); assert.equal(created.status, 200);
  const path = JSON.parse(created.body).path;
  const playlist = await call(handler, path), text = playlist.body.toString();
  assert.equal(playlist.status, 200);
  assert.equal(text.includes('185.245.1.73'), false);
  assert.equal(text.includes('http://'), false);
  const keyPath = text.match(/URI="([^"]+)"/)[1]; assert.ok(keyPath.startsWith('/hls/'));
  const media = text.split('\n').find(line => line.startsWith('/hls/'));
  const [a,b] = await Promise.all([call(handler, media), call(handler, media)]);
  assert.equal(a.status, 200); assert.deepEqual(b.body, segment); assert.equal(segmentFetches, 1);
  const range = await call(handler, media, { headers: { range: 'bytes=2-4' } });
  assert.equal(range.status, 206); assert.deepEqual(range.body, segment.subarray(2,5));
  assert.equal(range.headers['Content-Range'], 'bytes 2-4/8'); assert.equal(segmentFetches, 1);
  const second = JSON.parse((await session(handler)).body).path;
  assert.equal(second, path, 'stable links within a session avoid segment identity churn');
  assert.equal((await call(handler, media.replace(/\/hls\//, '/hls/bad'))).status, 401);
  time += 600001; assert.equal((await call(handler, media)).status, 401);
});
test('private playlist children and upstream failures do not become playable sessions', async () => {
  const privateHandler = createRelay({ secret, apiKey, fetcher: async () => ({ body: Buffer.from('#EXTM3U\nhttp://169.254.169.254/secret.ts'), type: 'application/vnd.apple.mpegurl' }) });
  assert.equal((await session(privateHandler)).status, 502);
  const rejected = createRelay({ secret, apiKey, fetcher: async () => { throw Object.assign(new Error('Upstream returned HTTP 403'), { status: 403 }); } });
  const response = await session(rejected);
  assert.equal(response.status, 403); assert.equal(response.body.toString(), 'Upstream returned HTTP 403');
});
test('variants, alternate audio, init maps and suffix ranges use the signed relay', async () => {
  const handler = createRelay({ secret, apiKey, fetcher: async url => url === source
    ? { body: Buffer.from('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvariant.m3u8\n'), type: 'application/vnd.apple.mpegurl' }
    : url.endsWith('variant.m3u8') ? { body: Buffer.from('#EXTM3U\n#EXT-X-MAP:URI="http://185.245.1.73/hls/init.mp4"\nhttp://185.245.1.73/hls/seg.m4s'), type: 'application/vnd.apple.mpegurl' }
    : { body: Buffer.from('12345678'), type: 'video/mp4' } });
  const path = JSON.parse((await session(handler)).body).path;
  const root = (await call(handler, path)).body.toString();
  assert.ok(root.match(/URI="\/hls\//));
  const variant = root.split('\n').find(line => line.startsWith('/hls/'));
  const playlist = (await call(handler, variant)).body.toString();
  assert.ok(playlist.includes('#EXT-X-MAP:URI="/hls/'));
  const media = playlist.split('\n').find(line => line.startsWith('/hls/'));
  const range = await call(handler, media, { headers: { range: 'bytes=-3' } });
  assert.equal(range.status, 206); assert.equal(range.body.toString(), '678');
  assert.equal((await call(handler, media, { headers: { range: 'bytes=999-' } })).status, 416);
});
