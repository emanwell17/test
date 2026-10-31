// Explicit competition aliases: country is part of the match to avoid showing
// unrelated competitions which also call themselves Premier League or Serie A.
export const LEAGUES = {
  football: [
    ['England', 'Premier League'], ['Spain', 'LaLiga|La Liga'], ['France', 'Ligue 1'], ['Italy', 'Serie A'],
    ['England', 'Championship|EFL Championship'], ['Scotland', 'Premiership'], ['Spain', 'LaLiga 2|Segunda Division'],
    ['Brazil', 'Serie A'], ['Romania', 'Liga 1|Liga I|Superliga'], ['Greece', 'Super League'], ['Denmark', 'Superliga'],
    ['Portugal', 'Primeira Liga|Liga Portugal'], ['Argentina', 'Primera Division|Liga Profesional'], ['Netherlands', 'Eredivisie'],
    ['Austria', 'Bundesliga|Cup|OFB Cup'], ['Scotland', 'FA Cup|Scottish Cup'], ['England', 'League One'], ['France', 'Ligue 2'],
    ['Germany', '2 Bundesliga|Bundesliga 2'], ['', 'Copa Sudamericana|Copa Libertadores'], ['Australia', 'A League|A League Men'],
    ['Poland', 'Ekstraklasa'], ['Germany', 'Bundesliga|DFB Pokal'], ['', 'Champions League|Europa League|Conference League'],
    ['Saudi Arabia', 'Pro League|Saudi Pro League'], ['Turkiye|Turkey', 'Super Lig'], ['Belgium', 'Pro League|First Division A'],
    ['Switzerland', 'Super League'], ['USA|United States', 'MLS'], ['Spain', 'Copa del Rey'], ['England', 'EFL Cup|EFL Trophy'],
    ['Portugal', 'Taca da Liga|League Cup'], ['Denmark', 'DBU Pokalen|Cup'], ['Greece', 'Cup|Greek Cup'], ['Netherlands', 'KNVB Cup|Cup'],
  ],
  basketball: [['', 'Euroleague|NBA|WNBA|NCAA|NCAA Basketball|NCAA Men|NCAA Women']],
  'american-football': [['', 'NFL|NCAA|College Football']],
  hockey: [['', 'NHL']], baseball: [['', 'MLB']], 'motor-sports': [['', 'Formula 1|Formula One|MotoGP']],
  fight: [['', 'UFC|Boxing|WWE|AEW|TNA Wrestling|NJPW|PFL|ONE Championship|BKFC|Oktagon MMA']],
  tennis: [['', 'ATP|ATP World Tour']],
  rugby: [['', 'English Prem Rugby|Premiership|United Rugby Championship|Top 14|Super Rugby|Rugby World Cup|Six Nations|Rugby Championship|Autumn Nations Cup|Currie Cup|National Provincial Championship|Internationals|Rugby Union Internationals|Rugby League World Cup|NRL|Super League|State of Origin']],
  golf: [['', 'PGA Tour']],
  cricket: [['', 'International Test Match|Test Series|Test Matches|ODI Series|One Day Internationals|T20I Series|Twenty20 Internationals|ICC World Test Championship|Big Bash League|The Hundred|SA20|Caribbean Premier League']],
};
const key = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function selectedLeague(sport, stage) {
  const rules = LEAGUES[sport];
  // These sports had no individual competition selections on the config page.
  if (!rules) return ['billiards', 'afl', 'darts', 'other'].includes(sport);
  const names = [stage.Snm, stage.CompN].map(key);
  const country = key(stage.Cnm);
  return rules.some(([countries, aliases]) => (!countries || countries.split('|').some(c => key(c) === country)) &&
    aliases.split('|').some(alias => names.some(name => name === key(alias) || name.startsWith(`${key(alias)} `))));
}
export function normalizeLiveScore(feed, sport) {
  return (feed.Stages || []).filter(stage => selectedLeague(sport, stage)).flatMap(stage => (stage.Events || []).map(event => {
    const stamp = String(event.Esd || '');
    const timestamp = /^\d{14}$/.test(stamp) ? Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(8, 10), +stamp.slice(10, 12), +stamp.slice(12, 14)) : 0;
    const logo = path => !path ? '' : /^https?:\/\//.test(path) ? path : `https://lsm-static-prod.livescore.com/medium/${path.replace(/^\//, '')}`;
    const home = event.T1?.[0]?.Nm || event.Enm || '', away = event.T2?.[0]?.Nm || '';
    return { id: String(event.Eid), _liveScoreId: String(event.Eid), _sport: sport, _catalogSource: 'livescore',
      _league: stage.Snm || stage.CompN || stage.Cnm, _leagueId: stage.CompId || stage.Sid,
      home_team_name: home, away_team_name: away, home_team_logo: logo(event.T1?.[0]?.Img), away_team_logo: logo(event.T2?.[0]?.Img),
      _singleEvent: !away, timestamp, status: [2, 3, 10].includes(+event.Esid) ? 'live' : +event.Esid === 6 ? 'ft' : event.Eps || 'NS',
      ...(event.Tr1 != null && event.Tr2 != null ? { score: { current: { home: event.Tr1, away: event.Tr2 } } } : {}),
    };
  }));
}

// Keep overnight fixtures from the preceding catalog day through 05:00 Lagos.
export function includeCatalogEvent(event, now=Date.now()) {
  const midnight=Math.floor((now+3600000)/86400000)*86400000-3600000;
  if(event.timestamp>=midnight)return true;
  if(event.status==='live')return true;
  return now-midnight<5*3600000 && event.timestamp>=midnight-86400000 && !['ft','aet','ap','finished','ended','canceled','cancelled'].includes(String(event.status).toLowerCase());
}
