import {streamTier,isFourK,excludedCodec} from '../shared/stream-tier.js';
import { createHash } from 'node:crypto';
import { channelIdentity, matchDaddyEvent, matchesIptvEvent } from '../src/daddy-matching.js';
export const fixtureKey = f => createHash('sha256').update(JSON.stringify(f.eventId ? [f.sport,f.eventId] : [f.sport, Number(f.start), f.home, f.away])).digest('hex').slice(0,24);
export const channelKey = url => createHash('sha256').update(url).digest('hex').slice(0,24);
const identity = name => JSON.stringify(channelIdentity(name));
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
  for (const entry of entries.filter(entry=>!excludedCodec(entry))) { const k=identity(entry.name); if(!index.has(k)) index.set(k,[]); index.get(k).push(entry); }
  index.eventChannels=entries.filter(entry=>!excludedCodec(entry)).filter(entry=>/\s+(?:vs?\.?|versus)\s+|^(?:live|next)\s*\|/i.test(entry.name));
  return index;
}
export function prepareFixture(fixture, events, index) {
  const match = matchDaddyEvent(events, fixture);
  const byChannel = (match?.channels || []).map(c => (index.get(identity(c.name)) || []).map(entry => ({...entry,daddyChannel:c.name})));
  // Round robin keeps different channels represented before adding variants.
  const refs=[]; const seen=new Set();
  for(let i=0;byChannel.some(group=>group[i]);i++) for(const group of byChannel) {
    const entry=group[i]; if(entry&&!seen.has(entry.id)){seen.add(entry.id);refs.push(entry);}
  }
  if(!refs.length) {
    for(const entry of index.eventChannels || [])if(matchesIptvEvent(entry.name,fixture)&&!seen.has(entry.id)){
      seen.add(entry.id);refs.push({...entry,...(match?{daddyChannel:match.name}:{}),eventFallback:true});
    }
  }
  const fourK=refs.filter(isFourK);
  const chosen=prioritizeChannels(refs).slice(0,8);
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

