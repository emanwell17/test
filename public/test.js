const form = document.querySelector('#test'), video = document.querySelector('#video'), status = document.querySelector('#status');
let hls;
form.addEventListener('submit', async event => {
  event.preventDefault(); hls?.destroy(); video.pause(); video.removeAttribute('src'); video.load();
  status.textContent = 'Checking the source playlist from this server…';
  try {
    const response = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${document.querySelector('#key').value}` }, body: JSON.stringify({ url: document.querySelector('#url').value }) });
    if (!response.ok) throw new Error(`Session HTTP ${response.status}: ${await response.text()}`);
    const session = await response.json();
    status.textContent = 'Session created. Waiting for video through HTTPS relay…';
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = session.path; video.play().catch(() => {}); }
    else if (window.Hls?.isSupported()) {
      hls = new Hls({ enableWorker: false }); hls.loadSource(session.path); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) status.textContent = `Playback failed: ${data.details}${data.response?.code ? ` (HTTP ${data.response.code})` : ''}. Check the failed /hls/ request in Network.`; });
    } else throw new Error('This browser does not support HLS playback');
  } catch (error) { status.textContent = error.message; }
});
video.addEventListener('playing', () => { status.textContent = `Playing through this relay. Video: ${video.videoWidth}×${video.videoHeight}.`; });
video.addEventListener('error', () => { status.textContent = `Browser media error ${video.error?.code || ''}. Check the /hls/ response for an upstream failure.`; });
