export function addonFixture(meta, sport, now=Date.now()) {
  const [home,away='']=String(meta.name||'').split(/\s+(?:vs?\.?|@|at|-)\s+/i);
  const date=`${meta.releaseInfo||''} ${meta.description||''}`.match(/(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*[\u00b7-]\s*(\d{1,2}:\d{2})\s*UTC/i);
  const start=date?Date.parse(`${date[1]} ${date[2]} UTC`):now;
  return {home,away,sport,start,eventId:String(meta.id||''),competition:(meta.genres||[]).join(' '),unknownStart:!date};
}
