import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDaddySchedule, matchDaddyEvent, sameChannel } from './daddy-matching.js';
const html = `<div class="schedule__dayTitle">Friday 30th Oct 2026 - Schedule Time UK GMTT</div><div class="schedule__catHeader"><div class="card__meta">All Soccer Events ⚽</div></div><div class="schedule__event"><span data-time="18:00"></span><span class="schedule__eventTitle">France - Ligue 1 : Le Havre 🇫🇷 vs PSG 🇫🇷</span><a href="/watch.php?id=425">beIN SPORTS USA</a><a href="/watch.php?id=2">Event SD Stream</a></div>`;
test('matches both teams, PSG alias, sport and date without retaining generic event streams', () => {
  const events = parseDaddySchedule(html), fixture = { home:'Le Havre', away:'Paris Saint-Germain', sport:'football', start:Date.UTC(2026,9,30,18) };
  assert.equal(matchDaddyEvent(events, fixture).channels.length, 1);
  assert.equal(matchDaddyEvent(events, {...fixture, away:'Rennes'}), null);
  assert.equal(matchDaddyEvent(events, {...fixture, start:fixture.start+86400000}), null);
  assert.equal(matchDaddyEvent(events, {...fixture, sport:'basketball'}), null);
});
test('channel comparison preserves country and channel number while ignoring quality', () => {
  assert.equal(sameChannel('beIN SPORTS USA', 'US: BEIN SPORTS HD'), true);
  assert.equal(sameChannel('Sport TV2 Portugal', 'PT: SPORT TV 2 FHD'), true);
  assert.equal(sameChannel('Sky Sports 1 UK', 'UK: SKY SPORTS 2 HD'), false);
  assert.equal(sameChannel('beIN SPORTS USA', 'FR: BEIN SPORTS HD'), false);
  assert.equal(sameChannel('Sky Sport Austria 1', 'AT: SKY SPORT AUSTRIA 1 4K'), true);
  assert.equal(sameChannel('Arena Sport 8 Serbia', 'SR: ARENA SPORT 8 RAW'), true);
});
test('team aliases still require the other team, sport and kickoff to match', () => {
  const events = [{ name:'Austria - Bundesliga : Grazer AK vs Hartberg', sport:'football', timestamp:1793385000000, channels:[{name:'Sky Sport Austria 1'}] }];
  const fixture = {home:'Grazer AK',away:'TSV Hartberg',sport:'football',start:1793385000000};
  assert.ok(matchDaddyEvent(events, fixture));
  assert.equal(matchDaddyEvent(events, {...fixture,home:'Austria Wien'}), null);
});
test('overnight NBA events belong to the next calendar day, including month boundaries', () => {
  const night = html.replace('Friday 30th Oct 2026','Saturday 31st Oct 2026').replace('All Soccer Events ⚽','NBA').replace('18:00','02:00').replace('France - Ligue 1 : Le Havre 🇫🇷 vs PSG 🇫🇷','NBA : Phoenix Suns vs Denver Nuggets');
  const [event] = parseDaddySchedule(night);
  assert.equal(event.timestamp, Date.UTC(2026,10,1,2));
  assert.ok(matchDaddyEvent([event], {home:'Phoenix Suns',away:'Denver Nuggets',sport:'basketball',start:Date.UTC(2026,10,1,2)}));
});
test('name matching tolerates an overnight delay and selects the closest occurrence', () => {
  const start=Date.UTC(2026,9,31,1);
  const event={name:'NBA : Phoenix Suns vs Denver Nuggets',sport:'basketball',timestamp:start-3*3600000,channels:[{name:'Altitude USA'}]};
  const next={...event,timestamp:start+86400000,channels:[{name:'Different broadcast'}]};
  const fixture={home:'Phoenix Suns',away:'Denver Nuggets',sport:'basketball',start};
  assert.deepEqual(matchDaddyEvent([next,event],fixture).channels,[{name:'Altitude USA'}]);
  assert.equal(matchDaddyEvent([next],fixture),null);
});
