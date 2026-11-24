export function fixtureIdentity(fixture) {
  return JSON.stringify([fixture.sport || fixture._sport, Number(fixture.start ?? fixture.timestamp),
    String(fixture.home ?? fixture.home_team_name ?? '').trim().toLowerCase(),
    String(fixture.away ?? fixture.away_team_name ?? '').trim().toLowerCase()]);
}

const regionNames=new Intl.DisplayNames(['en'],{type:'region'});
export function playlistCountry(name) {
  const match=String(name).match(/(?:^|\|\s*)([A-Z]{2})(?:\s+(?:4K|VIP))?:/i)||String(name).match(/^([A-Z]{2})\s*\(/i);
  if(!match)return '';
  const code=match[1].toUpperCase();
  if(['TV','RK','AV','HD','SD'].includes(code))return '';
  try { const label=regionNames.of(code==='UK'?'GB':code);return label&&label!==code?code:''; } catch { return ''; }
}

export function applyCatalogSettings(events, sport, settings = {}) {
  const records = (settings.matches || []).filter(record => record.sport === sport);
  const result = new Map(events.map(event => [fixtureIdentity(event), event]));
  for (const record of records) {
    const key = fixtureIdentity(record);
    if (!record.enabled) result.delete(key);
    else if (!result.has(key)) result.set(key, {
      id:record.id, _sport:sport, _catalogSource:'livescore', _league:record.competition,
      home_team_name:record.home, away_team_name:record.away, timestamp:record.start,
      home_team_logo:record.homeLogo || '', away_team_logo:record.awayLogo || '',
      status:record.status || 'NS', _adminMatch:true,
    });
  }
  return [...result.values()].filter(event => !(settings.leagues || []).some(rule =>
    rule.sport === sport && !rule.enabled && (!rule.country || !event._country || rule.country.toLowerCase().split('|').includes(event._country.toLowerCase())) && String(event._league || '').toLowerCase() === rule.name.toLowerCase())).map(event=>{
      const rank=(settings.leagueOrder?.[sport]||[]).findIndex(rule=>rule.name.toLowerCase()===String(event._league||'').toLowerCase()&&(!rule.country||!event._country||rule.country.toLowerCase().split('|').includes(event._country.toLowerCase())));
      return {...event,_leaguePriority:rank<0?1000000:rank};
    });
}

export function orderChannels(channels,order=[]){
  const positions=new Map(order.map((id,index)=>[id,index]));
  return [...channels].sort((a,b)=>(positions.get(a.id)??1000000)-(positions.get(b.id)??1000000));
}
