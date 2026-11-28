export const SITE_ORIGIN='https://scorezonetv.live';
export const SITE_ORIGINS=[SITE_ORIGIN,'https://scorezone.cv','https://scorezonetv.cv'];
export function siteRequestAllowed(method,path,headers={},adminOrigin='') {
 // Keep only the non-sensitive health checks public for hosting probes.
 if(['/healthz','/'].includes(path) && ['GET','HEAD'].includes(method))return true;
 // Session creation is internal-only; it must not be exposed by the public proxy.
 if(path==='/api/sessions')return false;
 if(headers.origin){
  if(adminOrigin&&path.startsWith('/api/admin/site/'))return headers.origin===adminOrigin;
  if(SITE_ORIGINS.includes(headers.origin))return true;
  return Boolean(adminOrigin&&headers.origin===adminOrigin&&/^\/api\/(?:admin\/site\/|site-settings$|livescore\/|addon-catalog\/|matches\/)/.test(path));
 }
 // Native HLS clients can omit Origin. Require the site's referrer as well as
 // the signed media ticket, which the media handler verifies separately.
 if(['GET','HEAD'].includes(method) && /^\/(?:hls|restream)\//.test(path)) {
  try{return SITE_ORIGINS.includes(new URL(headers.referer).origin);}catch{return false;}
 }
 return false;
}
