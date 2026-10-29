// Player und Playlist (für alle Zuhörer)
(() => {
  const P = window.PEP, $ = id => document.getElementById(id);
  const audio = $('audio'), fmt = P.fmt, esc = P.esc;
  let tracks = [], curId = null, shuffle = false, repeat = 'off', shuffleOrder = [];

  const isNew = t => t.created_at && (Date.now() - new Date(t.created_at).getTime()) < 14 * 864e5;
  const curTrack = () => tracks.find(t => t.id === curId);
  const msg = (text, kind) => P.showMsg($('msg'), text, kind);

  async function load() {
    if (P.problem) { msg(P.problem, 'err'); render(); return; }
    try {
      tracks = (await P.withTimeout(P.loadSongs(), 12000, 'timeout')).map(t => ({ ...t, url: P.publicUrl(t.file_path) }));
      msg('');
    } catch (e) {
      const m = (e && e.message) || '';
      msg(/relation|schema cache|does not exist/i.test(m) ? 'Die Datenbank ist noch nicht eingerichtet. Führe supabase-setup.sql im Supabase SQL Editor aus.'
        : /Invalid API key|No API key|JWT/i.test(m) ? 'Der Schlüssel in config.js wird nicht akzeptiert. Kopiere den «anon public» Key nochmals vollständig.'
        : /timeout/.test(m) ? 'Supabase antwortet nicht. Ist das Projekt pausiert? Dann in Supabase auf «Restore» klicken.'
        : 'Die Lieder konnten nicht geladen werden' + (m ? ' (' + m + ')' : '') + '. Prüfe deine Internetverbindung und lade die Seite neu.', 'err');
    }
    if (curId && !curTrack()) curId = null;
    render();
  }

  function render() {
    const total = tracks.reduce((a, t) => a + (t.duration || 0), 0);
    $('summary').textContent = tracks.length ? `${tracks.length} ${tracks.length === 1 ? 'Lied' : 'Lieder'} · ${fmt(total)} Gesamtdauer` : 'Noch keine Lieder';
    $('listCount').textContent = tracks.length ? fmt(total) : '';
    const ol = $('tracks');
    if (!tracks.length) {
      ol.innerHTML = '<li class="empty"><strong>Noch keine Lieder</strong>Sobald neue Aufnahmen hochgeladen sind, erscheinen sie hier.</li>';
    } else {
      ol.innerHTML = tracks.map((t, i) => {
        const cls = 'track' + (t.id === curId ? ' current' : '') + (t.id === curId && !audio.paused ? ' playing' : '');
        return `<li class="${cls}"><button class="play" data-id="${t.id}" type="button">
          <span class="num"><span class="num-n">${String(i + 1).padStart(2, '0')}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></span>
          <span class="t-title">${esc(t.title)}</span>
          <span class="t-meta">${isNew(t) ? '<span class="chip">Neu</span>' : ''}${fmt(t.duration)}</span>
        </button></li>`;
      }).join('');
    }
    updateDeck();
  }

  $('tracks').addEventListener('click', e => {
    const b = e.target.closest('button.play'); if (!b) return;
    if (b.dataset.id === curId) togglePlay(); else playId(b.dataset.id);
  });

  function playId(id) {
    const t = tracks.find(x => x.id === id); if (!t) return;
    curId = id; msg('');
    audio.src = t.url;
    $('loading').style.display = 'flex';
    audio.play().catch(() => {});
    setMedia(t); render();
  }
  function togglePlay() {
    if (!curId) { const first = order()[0]; if (first) playId(first); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function order() {
    const ids = tracks.map(t => t.id);
    if (!shuffle) return ids;
    if (shuffleOrder.length !== ids.length || !ids.every(id => shuffleOrder.includes(id))) {
      shuffleOrder = ids.slice();
      for (let i = shuffleOrder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]]; }
      if (curId) shuffleOrder = [curId, ...shuffleOrder.filter(x => x !== curId)];
    }
    return shuffleOrder;
  }
  function step(dir, auto) {
    const ids = order(); if (!ids.length) return;
    let i = ids.indexOf(curId);
    if (i < 0) { playId(ids[0]); return; }
    i += dir;
    if (i >= ids.length) { if (repeat === 'all' || !auto) i = 0; else { audio.pause(); audio.currentTime = 0; return; } }
    if (i < 0) i = ids.length - 1;
    playId(ids[i]);
  }

  $('playBtn').addEventListener('click', togglePlay);
  $('nextBtn').addEventListener('click', () => step(1));
  $('prevBtn').addEventListener('click', () => { if (audio.currentTime > 3) audio.currentTime = 0; else step(-1); });
  $('shuffleBtn').addEventListener('click', () => {
    shuffle = !shuffle; shuffleOrder = [];
    $('shuffleBtn').classList.toggle('on', shuffle); $('shuffleBtn').setAttribute('aria-pressed', shuffle);
  });
  $('repeatBtn').addEventListener('click', () => {
    repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
    $('repeatBtn').classList.toggle('on', repeat !== 'off');
    $('repeatOne').hidden = repeat !== 'one';
    $('repeatBtn').setAttribute('aria-label', 'Wiederholen: ' + ({ off: 'aus', all: 'alle', one: 'ein Lied' })[repeat]);
  });

  audio.addEventListener('ended', () => { if (repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); } else step(1, true); });
  ['play', 'pause'].forEach(ev => audio.addEventListener(ev, render));
  ['playing', 'canplay'].forEach(ev => audio.addEventListener(ev, () => { $('loading').style.display = 'none'; }));
  audio.addEventListener('timeupdate', () => { updateTime(); drawWave(); });
  audio.addEventListener('loadedmetadata', updateTime);
  audio.addEventListener('error', () => {
    $('loading').style.display = 'none';
    if (curId) msg('Dieses Lied kann nicht abgespielt werden. Versuche es später nochmals.', 'err');
  });

  function updateDeck() {
    const t = curTrack();
    $('nowTitle').textContent = t ? t.title : (tracks.length ? 'Wähle ein Lied' : 'Keine Lieder vorhanden');
    $('nowTitle').classList.toggle('idle', !t);
    const playing = !!t && !audio.paused;
    $('icPlay').toggleAttribute('hidden', playing); $('icPause').toggleAttribute('hidden', !playing);
    $('playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Abspielen');
    ['playBtn', 'nextBtn', 'prevBtn'].forEach(b => { $(b).disabled = !tracks.length; });
    updateTime(); drawWave();
  }
  function updateTime() {
    const t = curTrack();
    const dur = (isFinite(audio.duration) && audio.duration) || (t && t.duration) || 0;
    $('tCur').textContent = fmt(t ? audio.currentTime : 0);
    $('tDur').textContent = fmt(dur);
    $('seek').setAttribute('aria-valuenow', dur ? Math.round(audio.currentTime / dur * 100) : 0);
  }

  // Wellenform als Suchleiste
  const cv = $('wave'), seek = $('seek');
  const flat = n => Array.from({ length: n }, (_, i) => 0.35 + 0.15 * Math.sin(i * 0.7));
  function drawWave() {
    const r = seek.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const t = curTrack(); const peaks = (t && Array.isArray(t.peaks) && t.peaks.length) ? t.peaks : flat(72);
    const cs = getComputedStyle(document.documentElement);
    const on = cs.getPropertyValue('--accent').trim(), off = cs.getPropertyValue('--wave-off').trim();
    const dur = (isFinite(audio.duration) && audio.duration) || (t && t.duration) || 0;
    const prog = t && dur ? audio.currentTime / dur : 0;
    const n = Math.max(24, Math.min(peaks.length, Math.floor(r.width / 5)));
    const gap = 2, bw = Math.max(1.5, r.width / n - gap), mid = r.height / 2;
    for (let i = 0; i < n; i++) {
      const p = peaks[Math.floor(i * peaks.length / n)] || 0.1;
      const h = Math.max(3, p * (r.height - 4)), x = i * (bw + gap);
      g.fillStyle = (i + 0.5) / n <= prog ? on : off;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, mid - h / 2, bw, h, Math.min(2, bw / 2)); else g.rect(x, mid - h / 2, bw, h);
      g.fill();
    }
  }
  function seekTo(clientX) {
    const t = curTrack(); if (!t) return;
    const r = seek.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const dur = (isFinite(audio.duration) && audio.duration) || t.duration || 0;
    if (dur) { audio.currentTime = f * dur; updateTime(); drawWave(); }
  }
  let dragging = false;
  seek.addEventListener('pointerdown', e => { dragging = true; try { seek.setPointerCapture(e.pointerId); } catch (_) {} seekTo(e.clientX); });
  seek.addEventListener('pointermove', e => { if (dragging) seekTo(e.clientX); });
  ['pointerup', 'pointercancel'].forEach(ev => seek.addEventListener(ev, () => { dragging = false; }));
  seek.addEventListener('keydown', e => {
    if (!curTrack()) return;
    if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
  });
  window.addEventListener('resize', drawWave);
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawWave); } catch (e) {}

  // Sperrbildschirm- und Kopfhörer-Steuerung
  function setMedia(t) {
    try {
      if (!('mediaSession' in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: P.cfg.APP_NAME || 'Pep-Chor', album: P.cfg.APP_NAME || 'Pep-Chor',
        artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    } catch (e) {}
  }

  // Neue Lieder sehen, wenn die App wieder geöffnet wird
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && audio.paused) load(); });

  render();
  load();
})();
