export function reportedMbps(source) {
  const text = `${source.name || ''} ${source.title || ''} ${source.description || ''}`.normalize('NFKC');
  const match = text.match(/([\d]+(?:\.\d+)?)\s*(?:Mbps|Mb\/s|Mbit\/s)\b/i);
  return match ? Number(match[1]) : null;
}
export function superscriptQuality(source) {
  const text = `${source.name || ''} ${source.title || ''}`;
  const runs = text.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ]+/gu) || [];
  return runs.map(value => value.normalize('NFKC').toUpperCase()).find(value => /^(?:3840P|2160P|1080P|720P|8K|4K|UHD|FHD|HD|SD|RAW)$/.test(value)) || '';
}
