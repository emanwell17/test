import { superscriptQuality } from './stream-metadata.js';
export function excludedCodec(channel){
  return /\b(?:hevc|h\s*[.\-]?\s*265|x265)\b/i.test(String(channel.name||'').normalize('NFKC'));
}
export function streamTier(channel){
  const label=String(channel.name||'');
  const quality=superscriptQuality({name:label});
  return {...channel,locked:isFourK(channel),quality};
}
export function isFourK(channel){
  return ['4K','3840P','2160P'].includes(superscriptQuality({name:channel.name})) || /\b(?:4k|3840p|2160p)\b/i.test(String(channel.name).normalize('NFKC'));
}
