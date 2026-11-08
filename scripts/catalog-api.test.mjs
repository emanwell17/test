import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogApi} from './catalog-api.mjs';

test('catalog refreshes share one request and preserve recent data through temporary failures', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const path = '/api/livescore/soccer/20261108';
  const search = new URLSearchParams();
  let calls = 0;
  let rejectRefresh;
  try {
    const initial = await catalogApi(path, search, async () => {
      calls++;
      return Response.json({Stages: [{id: 'saved'}]});
    });
    assert.equal(initial.data.Stages[0].id, 'saved');
    now += 300001;
    const failedRefresh = () => {
      calls++;
      return new Promise((resolve, reject) => { rejectRefresh = reject; });
    };
    const readers = await Promise.all(Array.from({length: 20}, () => catalogApi(path, search, failedRefresh)));
    assert.equal(calls, 2);
    assert.ok(readers.every(result => result.data.stale && result.data.Stages[0].id === 'saved'));
    rejectRefresh(new Error('Temporary outage'));
    await new Promise(resolve => setImmediate(resolve));
    await catalogApi(path, search, failedRefresh);
    assert.equal(calls, 2);

    now += 30001;
    const recovered = async () => { calls++; return Response.json({Stages: [{id: 'fresh'}]}); };
    await catalogApi(path, search, recovered);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await catalogApi(path, search, recovered)).data.Stages[0].id, 'fresh');

    now += 900001;
    await assert.rejects(catalogApi(path, search, async () => { throw new Error('Offline'); }), /Offline/);
  } finally {
    Date.now = originalNow;
  }
});
