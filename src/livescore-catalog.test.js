import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedLeague, normalizeLiveScore, includeCatalogEvent } from './livescore-catalog.js';
test('selected football leagues are country scoped and tolerate LiveScore aliases', () => {
  assert.equal(selectedLeague('football', { Cnm: 'England', Snm: 'Premier League' }), true);
  assert.equal(selectedLeague('football', { Cnm: 'Egypt', Snm: 'Premier League' }), false);
  assert.equal(selectedLeague('football', { Cnm: 'Spain', Snm: 'LaLiga' }), true);
  assert.equal(selectedLeague('basketball', { Snm: 'NBA' }), true);
  assert.equal(selectedLeague('basketball', { Snm: 'NBL' }), false);
});
test('yesterday remains available before 5am Lagos without retaining ended games', () => {
  const timestamp=Date.UTC(2026,9,30,21);
  assert.equal(includeCatalogEvent({timestamp,status:'NS'},Date.UTC(2026,9,31,3)),true);
  assert.equal(includeCatalogEvent({timestamp,status:'NS'},Date.UTC(2026,9,31,4)),false);
  assert.equal(includeCatalogEvent({timestamp,status:'ft'},Date.UTC(2026,9,31,3)),false);
  assert.equal(includeCatalogEvent({timestamp,status:'live'},Date.UTC(2026,9,31,4)),true);
});
test('catalog retains numeric event identity, live status, score and team badges', () => {
  const [match] = normalizeLiveScore({ Stages: [{ Cnm: 'England', Snm: 'Premier League', Events: [{ Eid: 42, Esid: 2, Esd: 20261030190000, T1: [{ Nm: 'Home', Img: 'enet/1.png' }], T2: [{ Nm: 'Away' }], Tr1: 1, Tr2: 0 }] }] }, 'football');
  assert.equal(match.id, '42');
  assert.equal(match.status, 'live');
  assert.equal(match.timestamp, Date.UTC(2026, 9, 30, 19));
  assert.equal(match.score.current.home, 1);
  assert.match(match.home_team_logo, /medium\/enet\/1.png$/);
  assert.equal(match._addonMetaId, undefined);
});
