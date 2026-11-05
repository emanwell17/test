export function addonTeams(name, sport) {
  const separator = ['fight', 'motor-sports'].includes(sport)
    ? /\s+(?:vs?\.?|@|at)\s+/i
    : /\s+(?:vs?\.?|@|at|-)\s+/i;
  const [home, away = ''] = String(name || '').split(separator);
  return [home, away];
}

export function addonFixture(meta, sport, now=Date.now()) {
  const [home, away] = addonTeams(meta.name, sport);
  const date=`${meta.releaseInfo||''} ${meta.description||''}`.match(/(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*[\u00b7-]\s*(\d{1,2}:\d{2})\s*UTC/i);
  const start=date?Date.parse(`${date[1]} ${date[2]} UTC`):now;
  return {home,away,sport,start,eventId:String(meta.id||''),competition:(meta.genres||[]).join(' '),unknownStart:!date};
}
