import {streamTier,isFourK,excludedCodec} from '../shared/stream-tier.js';
import { createHash } from 'node:crypto';
import { channelIdentity, matchDaddyEvent, matchesIptvEvent } from '../src/daddy-matching.js';
export const fixtureKey = f => createHash('sha256').update(JSON.stringify(f.eventId ? [f.sport,f.eventId] : [f.sport, Number(f.start), f.home, f.away])).digest('hex').slice(0,24);
export const channelKey = url => createHash('sha256').update(url).digest('hex').slice(0,24);
const identity = name => JSON.stringify(channelIdentity(name));
const teamFeedSports = {
  EPL:'football', EFL:'football', CHAMP:'football', CHAMPIONSHIP:'football', L1:'football', L2:'football', SPFL:'football', SPL:'football', MLS:'football',
  NFL:'american-football', NHL:'hockey', MLB:'baseball', NBA:'basketball', WNBA:'basketball', NRL:'rugby', RUGBY:'rugby', AFL:'afl',
  TENNIS:'tennis', CRICKET:'cricket', F1:'motor-sports', MOTOGP:'motor-sports', UFC:'fight', WWE:'fight', BOXING:'fight', GOLF:'golf', DARTS:'darts', BILLIARDS:'billiards',
};
export function prioritizeChannels(channels) {
  const priority = channel => /^(?:us|uk)$/.test(channelIdentity(channel.name).region) ? 0 : 1;
  return [...channels].sort((a,b) => priority(a)-priority(b));
}
export function parsePlaylist(text, playlistUrl) {
  const prefix=playlistUrl?new URL(playlistUrl).pathname.replace(/playlist\.m3u8$/, 'stream/'):null;
  const entries = [], lines = text.split(/\r?\n/); let name = '';
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) name = line.slice(line.indexOf(',')+1).replace(/^Strong8K\s*[·:-]\s*/i,'').trim();
    else if (/^https?:/.test(line) && name) {
      try {
        const u = new URL(line.trim());
        if (u.origin === 'https://live.flixnest.app' && /^\/u\/[A-Za-z0-9_.-]+\/live\/stream\/[^/]+\.m3u8$/.test(u.pathname) && (!prefix || u.pathname.startsWith(prefix)) && !u.username && !u.password && !/dstv/i.test(name) && !excludedCodec({name})) entries.push({ id:channelKey(u.href), name, url:u.href });
      } catch {}
      name='';
    }
  }
  return entries;
}
export function playlistIndex(entries) {
  const index = new Map();
  index.byName = new Map();
  for (const entry of entries.filter(entry=>!excludedCodec(entry))) {
    const channel = channelIdentity(entry.name);
    const k = JSON.stringify(channel);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(entry);
    if (!index.byName.has(channel.name)) index.byName.set(channel.name, []);
    index.byName.get(channel.name).push({ entry, region: channel.region });
  }
  index.eventChannels=entries.filter(entry=>!excludedCodec(entry)).filter(entry=>/\s+(?:vs?\.?|versus|at)\s+|^(?:live|next)\s*\||^(?:UFC\s+\d|WWE\s+(?:Monday Night Raw|Friday Night SmackDown|NXT)|AEW\s+(?:Dynamite|Collision)|Oktagon\s+\d)/i.test(entry.name));
  index.teamChannels=entries.filter(entry=>!excludedCodec(entry)).flatMap(entry=>{
    const label=entry.name.match(/^([A-Z0-9 ]+):\s*(.+)$/i);
    const sport=label&&teamFeedSports[label[1].toUpperCase()];
    return sport && !/[|@]|\s+(?:vs?\.?|versus)\s+/i.test(label[2]) ? [{entry,sport,team:label[2]}] : [];
  });
  return index;
}
export function prepareFixture(fixture, events, index) {
  if (fixture.eventId && !fixture.away) {
    const {name, region} = channelIdentity(fixture.home);
    const wantsFourK = isFourK({name: fixture.home});
    const candidates = (name ? index.byName?.get(name) || [] : []).filter(item =>
      (!region || item.region === region) && (!wantsFourK || isFourK(item.entry)));
    const exactRegion = candidates.filter(item => item.region === region);
    const selected = exactRegion.length ? exactRegion : new Set(candidates.map(item => item.region)).size === 1 ? candidates : [];
    if (selected.length) {
      const channels = [...new Map(selected.map(({entry}) => [entry.id, entry])).values()];
      return { fixture, match: null, channels: prioritizeChannels(channels).slice(0, 8).map(entry => streamTier({...entry, addonChannelListing: true})) };
    }
  }
  const match = fixture.sport === 'fight' ? null : matchDaddyEvent(events, fixture);
  const byChannel = (match?.channels || []).map(c => (index.get(identity(c.name)) || []).map(entry => ({...entry,daddyChannel:c.name})));
  // Round robin keeps different channels represented before adding variants.
  const refs=[]; const seen=new Set();
  for(let i=0;byChannel.some(group=>group[i]);i++) for(const group of byChannel) {
    const entry=group[i]; if(entry&&!seen.has(entry.id)){seen.add(entry.id);refs.push(entry);}
  }
  {
    for(const entry of index.eventChannels || [])if(matchesIptvEvent(entry.name,fixture)&&!seen.has(entry.id)){
      seen.add(entry.id);refs.push({...entry,...(match?{daddyChannel:match.name}:{}),eventFallback:true});
    }
  }
  if(!refs.length){
    for(const {entry,sport,team:club} of index.teamChannels||[]){
      if(sport!==fixture.sport)continue;
      const matches=fixture.away
        ? matchesIptvEvent(`${club} vs ${fixture.away}`,fixture)||matchesIptvEvent(`${fixture.home} vs ${club}`,fixture)
        : matchesIptvEvent(club,fixture);
      if(matches){
        if(!seen.has(entry.id)){seen.add(entry.id);refs.push({...entry,eventFallback:true});}
      }
    }
  }
  let preferredCanalRaw;
  if(fixture.sport==='football' && [fixture.home,fixture.away].some(name=>/^arsenal(?: fc)?$/i.test(String(name).trim()))){
    const canalFoot=/^FR:\s*CANAL\+\s*FOOT\b/i;
    const raw=(index.get(identity('FR: CANAL+ FOOT'))||[]).find(entry=>/\bRAW\b/i.test(entry.name.normalize('NFKC')));
    if(raw && refs.some(entry=>canalFoot.test(entry.name)&&isFourK(entry))){
      preferredCanalRaw=raw;
      for(let i=refs.length-1;i>=0;i--)if(canalFoot.test(refs[i].name)&&isFourK(refs[i]))refs.splice(i,1);
      if(!refs.some(entry=>entry.id===raw.id))refs.unshift(raw);
    }
  }
  const fourK=refs.filter(isFourK);
  const chosen=prioritizeChannels(refs).slice(0,8);
  if(preferredCanalRaw&&!chosen.some(entry=>entry.id===preferredCanalRaw.id)){
    chosen.unshift(preferredCanalRaw);
    if(chosen.length>8)chosen.pop();
  }
  for(const r of fourK) if(!chosen.some(c=>c.id===r.id)) chosen.push(r);
  return { fixture, match:match?{name:match.name,timestamp:match.timestamp}:null, channels:prioritizeChannels(chosen).map(streamTier) };
}
// Cache and coalesce sessions by stable channel identity, independently of games.
export function createPlaybackResolver({ resolveSource, createSession, now=Date.now }) {
  const cache=new Map(), pending=new Map();
  return async reference => {
    const hit=cache.get(reference.id);
    if(hit?.expiresAt>now()+60000)return hit;
    if(pending.has(reference.id))return pending.get(reference.id);
    const job=(async()=>{const source=await resolveSource(reference.url); const session=await createSession(source, reference); cache.set(reference.id,session); return session;})().finally(()=>pending.delete(reference.id));
    pending.set(reference.id,job);return job;
  };
}

