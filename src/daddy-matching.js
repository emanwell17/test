const text = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
const key = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim().replace(/\s+/g, ' ');
const aliases = { 'west ham': 'west ham united', 'west brom': 'west bromwich albion', 'west bromwich': 'west bromwich albion', psg: 'paris saint germain', 'man utd': 'manchester united', 'man united': 'manchester united', 'man city': 'manchester city', 'inter milan': 'internazionale', 'inter': 'internazionale', 'casa pia ac': 'casa pia', 'sporting cp': 'sporting', 'vfl bochum': 'bochum', 'tsv hartberg': 'hartberg', 'grenoble foot 38': 'grenoble', 'boulogne sur mer': 'boulogne', 'clermont foot 63': 'clermont', 'cracovia krakow': 'cracovia', 'ca huracan': 'huracan', 'gimnasia lp': 'gimnasia la plata', 'fc rapid 1923': 'rapid bucuresti', 'rapid 1923': 'rapid bucuresti', 'miercurea ciuc': 'csikszereda', 'los angeles lakers': 'la lakers', 'los angeles clippers': 'la clippers' };
const team = value => { const name = key(value).replace(/\bfc\b/g, '').trim(); return aliases[name] || name; };
export function matchesSingleEvent(name, fixture) {
  const clean=value=>key(value).replace(/\bformula one\b|\bf1\b/g,'formula 1').replace(/\bmexican\b/g,'mexico').replace(/\bmoto gp\b/g,'motogp').replace(/\bqualification\b/g,'qualifying');
  const wanted=clean(fixture.home),actual=clean(name),context=clean(fixture.competition||'');
  if(fixture.sport==='motor-sports'){
    const series=value=>value.match(/\b(?:formula 1|motogp|moto2|moto3)\b/)?.[0];
    const expected=series(wanted)||series(context);
    if(!expected||series(actual)!==expected)return false;
    const session=value=>value.match(/\b(free practice|practice|qualifying|sprint|race)\s*(\d)?\b/);
    const a=session(wanted),b=session(actual);
    if(!a&&b&&b[1]!=='race')return false;
    if(a&&(!b||a[1].replace('free ','')!==b[1].replace('free ','')||(a[2]&&b[2]&&a[2]!==b[2])))return false;
    const tokens=wanted.replace(/formula 1|motogp|moto2|moto3|free practice|practice|qualifying|sprint|race|grand prix|round/g,' ').split(' ').filter(t=>t.length>2&&!/^\d+$/.test(t));
    return tokens.length>0&&tokens.every(token=>actual.split(' ').includes(token));
  }
  if(fixture.sport==='fight'){
    const show=wanted.match(/\b(smackdown|raw|nxt|dynamite|collision|rampage)\b/)?.[0];
    if(show)return actual.split(' ').includes(show);
  }
  const tokens=wanted.split(' ').filter(t=>t.length>2&&!['live','the','round','day'].includes(t));
  return tokens.length>=2&&tokens.every(token=>actual.split(' ').includes(token));
}
export function matchesIptvEvent(name, fixture) {
  if (/^(?:end|ended|replay)\s*\|/i.test(name)) return false;
  if(!fixture.away){
    const scheduled=String(name).match(/\b(\d{2})-(\d{2})-(\d{4})\s*\|\s*(\d{2}):(\d{2})\s*\(GMT\)/i);
    if(scheduled&&Math.abs(Date.UTC(+scheduled[3],+scheduled[2]-1,+scheduled[1],+scheduled[4],+scheduled[5])-Number(fixture.start))>6*3600000)return false;
    const date=String(name).match(/\b(\d{4})-(\d{2})-(\d{2})/);
    if(date&&Math.abs(Date.UTC(+date[1],+date[2]-1,+date[3])-Number(fixture.start))>36*3600000)return false;
    return matchesSingleEvent(name,fixture);
  }
  const label = String(name).split('|').find(part=>/\s+(?:vs?\.?|versus)\s+/i.test(part));
  if(!label)return false;
  const sides=label.split(/\s+(?:vs?\.?|versus)\s+/i).map(side=>side.split('@')[0].replace(/^.*?:\s*/, '').replace(/^\s*[A-Z]{2,4}\s*-\s*/, '').replace(/\s*(?:@|\(|Strong8K|[ᴸᶦᵛᵉ]).*$/i, '').trim());
  if(sides.length!==2)return false;
  const equal=(a,b)=>{
    const x=team(a),y=team(b);
    if(x===y)return true;
    if(fixture.sport!=='basketball')return false;
    const nba=['warriors','lakers','clippers','suns','nuggets','mavericks','rockets','heat','pacers','timberwolves','jazz','trail blazers','hornets','76ers','pelicans','hawks','celtics','bulls','nets','knicks','bucks','cavaliers','pistons','magic','raptors','thunder','kings','grizzlies','spurs','wizards'];
    return nba.some(short=>(x===short&&y.endsWith(` ${short}`))||(y===short&&x.endsWith(` ${short}`)));
  };
  if(!((equal(sides[0],fixture.home)&&equal(sides[1],fixture.away))||(equal(sides[1],fixture.home)&&equal(sides[0],fixture.away))))return false;
  const date=String(name).match(/\b(\d{2})-(\d{2})-(\d{4})\s*\|\s*(\d{2}):(\d{2})\s*\(GMT\)/i);
  if(date && Math.abs(Date.UTC(+date[3],+date[2]-1,+date[1],+date[4],+date[5])-Number(fixture.start))>6*3600000)return false;
  const iso=String(name).match(/\b(\d{4})-(\d{2})-(\d{2})/);
  if(iso&&Math.abs(Date.UTC(+iso[1],+iso[2]-1,+iso[3])-Number(fixture.start))>36*3600000)return false;
  return true;
}
const categorySport = value => {
  const s = key(value);
  if (/soccer|futsal/.test(s)) return 'football';
  if (/ncaaf|nfl|am football/.test(s)) return 'american-football';
  if (/basketball|\bnba\b/.test(s)) return 'basketball';
  if (/ice hockey|nhl/.test(s)) return 'hockey';
  if (/cricket/.test(s)) return 'cricket';
  if (/baseball|mlb/.test(s)) return 'baseball';
  if (/tennis/.test(s)) return 'tennis';
  if (/rugby/.test(s)) return 'rugby';
  if (/motorsport/.test(s)) return 'motor-sports';
  if (/boxing|mma|wrestling|combat/.test(s)) return 'fight';
  return s;
};
function ukTimestamp(day, time) {
  const found = day.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
  if (!found || !/^\d{2}:\d{2}$/.test(time)) return 0;
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const month = months.indexOf(found[2].slice(0, 3).toLowerCase());
  if (month < 0) return 0;
  // DaddyLive groups the overnight tail (00:00–05:59 UK) under the
  // preceding evening's schedule heading, including NBA/NHL fixtures.
  const dateOffset = +time.slice(0, 2) < 6 ? 1 : 0;
  const raw = Date.UTC(+found[3], month, +found[1] + dateOffset, +time.slice(0, 2), +time.slice(3));
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(raw).map(p => [p.type, p.value]));
  const difference = ((+parts.hour * 60 + +parts.minute) - (+time.slice(0, 2) * 60 + +time.slice(3)) + 1440) % 1440;
  return raw - difference * 60000;
}
export function parseDaddySchedule(html) {
  const chunks = html.split(/(?=<div class="schedule__(?:dayTitle|catHeader|event)")/);
  let day = '', category = '';
  const events = [];
  for (const chunk of chunks) {
    if (chunk.startsWith('<div class="schedule__dayTitle"')) day = text(chunk.match(/^[^>]+>([^<]+)/)?.[1]);
    else if (chunk.startsWith('<div class="schedule__catHeader"')) category = text(chunk.match(/class="card__meta">([^<]+)/)?.[1]);
    else if (chunk.startsWith('<div class="schedule__event"')) {
      const name = text(chunk.match(/class="schedule__eventTitle">([\s\S]*?)<\/span>/)?.[1]);
      const time = chunk.match(/data-time="(\d{2}:\d{2})"/)?.[1];
      const channels = [...chunk.matchAll(/<a\b[^>]*href="\/watch\.php\?id=(\d+)"[^>]*>([^<]+)<\/a>/g)].map(m => ({ id: m[1], name: text(m[2]) }));
      if (name && channels.length) events.push({ name, sport: categorySport(category), category, timestamp: ukTimestamp(day, time || ''), channels });
    }
  }
  return events;
}
export function matchDaddyEvent(events, fixture) {
  const home = team(fixture.home), away = team(fixture.away), start = Number(fixture.start);
  if (!home || !Number.isFinite(start) || start <= 0) return null;
  const found = events.filter(event => {
    if (event.sport !== fixture.sport) return false;
    if(!away)return matchesSingleEvent(event.name,fixture);
    const label = text(event.name).split(/\s*:\s*/).at(-1);
    const sides = label.split(/\s+(?:vs?\.?|versus|@|x)\s+/i).map(team);
    return sides.length === 2 && ((sides[0] === home && sides[1] === away) || (sides[0] === away && sides[1] === home));
  });
  if (!found.length) return null;
  // Names establish identity first. Use time afterwards to choose the nearest
  // occurrence, allowing an overnight delay without mixing different days.
  found.sort((a,b)=>Math.abs(a.timestamp-start)-Math.abs(b.timestamp-start));
  const closest=found[0];
  const unknownStart=fixture.unknownStart===true||fixture.unknownStart==='true';
  if(!closest.timestamp || Math.abs(closest.timestamp-start)>(unknownStart?24:6)*60*60000)return null;
  const sameOccurrence=found.filter(event=>Math.abs(event.timestamp-closest.timestamp)<=(away?30:90)*60000);
  return { ...closest, channels: [...new Map(sameOccurrence.flatMap(e => e.channels).filter(c => !/^event\b|not listed/i.test(c.name)).map(c => [key(c.name), c])).values()] };
}
const regions = { austria:'at', at:'at', sr:'rs', slovakia:'sk', sk:'sk', denmark:'dk', dk:'dk', romania:'ro', ro:'ro', netherlands:'nl', nl:'nl', brazil:'br', br:'br', australia:'au', au:'au', switzerland:'ch', ch:'ch', belgium:'be', be:'be', greece:'gr', gr:'gr', uk:'uk', gb:'uk', usa:'us', us:'us', france:'fr', fr:'fr', portugal:'pt', pt:'pt', poland:'pl', pl:'pl', croatia:'hr', hr:'hr', serbia:'rs', rs:'rs', argentina:'ar', ar:'ar', bulgaria:'bg', bg:'bg', turkey:'tr', tr:'tr', spain:'es', es:'es', italy:'it', it:'it', germany:'de', de:'de', canada:'ca', ca:'ca', israel:'il', il:'il', cz:'cz', mena:'mena' };
export function channelIdentity(value) {
  let name = key(String(value).normalize('NFKC')).replace(/\b(?:fhd|uhd|hd|sd|4k|8k|raw|hevc|h265|1080p|720p|2160p|3840p|50fps|60fps)\b/g, '').replace(/([a-z])(\d)/g, '$1 $2').replace(/\b(?:sports?)\s*(\d+)/g, 'sport $1').replace(/\bsports\b/g, 'sport').replace(/\s+/g, ' ').trim();
  const tokens = name.split(' '), locations = [...new Set(tokens.filter(t => regions[t]).map(t => regions[t]))];
  name = tokens.filter(t => !regions[t]).join(' ');
  if(locations.length)name=name.replace(/^en /,'');
  name=name.replace(/^(?:prime|rk) /,'');
  if(name==='cbs sport golazo network'||name==='cbs sport galazo network')name='cbs sport golazo';
  if(name==='altitude')name='altitude sport';
  if(name==='rogers sportsnet one')name='sportsnet one';
  if(name==='sportsnet one'&&!locations.length)locations.push('ca');
  return { name, region: locations.sort().join('|') };
}
export function sameChannel(wanted, actual) {
  const a = channelIdentity(wanted), b = channelIdentity(actual);
  return Boolean(a.name && a.name === b.name && a.region === b.region);
}
