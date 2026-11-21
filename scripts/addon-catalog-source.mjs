import {readFile} from 'node:fs/promises';

export async function addonCatalogUrl(catalog, skip) {
  let base = process.env.ADDON_BASE;
  if (!base && process.env.SCOREZONE_MANAGED_BACKEND !== 'true') {
    const config = await readFile(new URL('../workers/scorezone-live/wrangler.toml', import.meta.url), 'utf8');
    base = config.match(/^ADDON_BASE\s*=\s*"([^"]+)"/m)?.[1];
  }
  if (!base) throw Error('ADDON_BASE is not configured');
  const url = new URL(base.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '') + `/catalog/sport/${catalog}.json`);
  if (url.protocol !== 'https:' || !['sports.highfly.to', 'sports.highfly.dev', 'premium.highfly.to'].includes(url.hostname) || url.username || url.password) throw Error('Invalid addon catalog source');
  url.searchParams.set('skip', String(skip));
  return url.href;
}
