// Admin-Bereich: Anmeldung, Hochladen, Umbenennen, Sortieren, Löschen
(() => {
  const P = window.PEP, sb = P.sb, $ = id => document.getElementById(id);
  const fmt = P.fmt, esc = P.esc;
  const MAX_BYTES = 50 * 1024 * 1024;
  let tracks = [], editing = null, confirming = null, busy = false;

  const msg = (text, kind) => P.showMsg($('msg'), text, kind);
  function show(view) {
    $('loginCard').hidden = view !== 'login';
    $('noAdminCard').hidden = view !== 'noadmin';
    $('adminArea').hidden = view !== 'admin';
  }
  function errText(e) {
    const m = (e && (e.message || e.error_description || e.error)) || '';
    if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort ist falsch.';
    if (/Email not confirmed/i.test(m)) return 'Diese E-Mail-Adresse ist noch nicht bestätigt. Bestätige sie in Supabase unter Authentication → Users.';
    if (/row-level security|violates|Unauthorized|permission/i.test(m)) return 'Keine Berechtigung. Steht deine E-Mail-Adresse in der Admin-Liste?';
    if (/mime type|not supported/i.test(m)) return 'Dieses Dateiformat wird nicht akzeptiert. Erlaubt sind MP3 und M4A.';
    if (/maximum allowed size|too large|Payload too large/i.test(m)) return 'Die Datei ist zu gross (max. 50 MB).';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.';
    return 'Etwas ist schiefgelaufen' + (m ? ': ' + m : '.');
  }

  // ---------- Anmeldung ----------
  async function init() {
    if (!P.configured) { msg('Die App ist noch nicht eingerichtet: Bitte in config.js die Supabase-Zugangsdaten eintragen.', 'err'); return; }
    const { data } = await sb.auth.getSession();
    if (data.session) await enter(data.session); else show('login');
  }
  async function enter(session) {
    const { data: ok, error } = await sb.rpc('is_admin');
    if (error) { msg(errText(error), 'err'); show('noadmin'); return; }
    if (!ok) { show('noadmin'); return; }
    $('whoEmail').textContent = session.user.email;
    show('admin'); msg('');
    await reload();
  }
  $('loginCard').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('email').value.trim(), password = $('password').value;
    if (!email || !password) { msg('Bitte E-Mail und Passwort eingeben.', 'err'); return; }
    $('loginBtn').disabled = true; msg('');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    $('loginBtn').disabled = false;
    if (error) { msg(errText(error), 'err'); return; }
    $('password').value = '';
    await enter(data.session);
  });
  document.querySelectorAll('.logout').forEach(b => b.addEventListener('click', async () => {
    await sb.auth.signOut(); tracks = []; msg('Du bist abgemeldet.', 'ok'); show('login');
  }));

  // ---------- Liste ----------
  async function reload() {
    try { tracks = await P.loadSongs(); } catch (e) { msg(errText(e), 'err'); }
    render();
  }
  const ICON = {
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    rename: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    del: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'
  };
  const iconBtn = (act, id, label, disabled) =>
    `<button class="icon-btn" data-act="${act}" data-id="${id}" type="button" aria-label="${label}" ${disabled ? 'disabled' : ''}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${ICON[act]}</svg></button>`;

  function render() {
    const total = tracks.reduce((a, t) => a + (t.duration || 0), 0);
    $('listCount').textContent = tracks.length ? `${tracks.length} · ${fmt(total)}` : '';
    const ol = $('tracks');
    if (!tracks.length) { ol.innerHTML = '<li class="empty"><strong>Noch keine Lieder</strong>Lade oben die erste Aufnahme hoch.</li>'; return; }
    ol.innerHTML = tracks.map((t, i) => {
      if (editing === t.id) return `<li class="track"><form class="rename" data-id="${t.id}"><input id="rename-${t.id}" value="${esc(t.title)}" maxlength="120" aria-label="Titel"><button class="btn-sm" type="submit">Speichern</button></form></li>`;
      if (confirming === t.id) return `<li class="track"><div class="confirm"><span>«${esc(t.title)}» endgültig löschen?</span><div><button class="btn-sm" data-act="no" type="button">Abbrechen</button><button class="btn-sm btn-danger" data-act="yes" data-id="${t.id}" type="button">Löschen</button></div></div></li>`;
      return `<li class="track"><div class="row">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <span class="t-title">${esc(t.title)}</span>
          <span class="t-meta">${fmt(t.duration)}</span>
        </div><div class="edit-tools">
          ${iconBtn('up', t.id, 'Nach oben', i === 0 || busy)}${iconBtn('down', t.id, 'Nach unten', i === tracks.length - 1 || busy)}${iconBtn('rename', t.id, 'Umbenennen', busy)}${iconBtn('del', t.id, 'Löschen', busy)}
        </div></li>`;
    }).join('');
    if (editing) { const inp = $('rename-' + editing); if (inp) { inp.focus(); inp.select(); } }
  }

  async function savePositions() {
    // nur geänderte Positionen speichern
    const changes = tracks.map((t, i) => ({ t, i })).filter(({ t, i }) => t.position !== i);
    for (const { t, i } of changes) {
      const { error } = await sb.from('songs').update({ position: i }).eq('id', t.id);
      if (error) throw error;
      t.position = i;
    }
  }

  $('tracks').addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b || busy) return;
    const id = b.dataset.id, act = b.dataset.act, i = tracks.findIndex(t => t.id === id);
    if (act === 'rename') { editing = id; confirming = null; render(); return; }
    if (act === 'del') { confirming = id; editing = null; render(); return; }
    if (act === 'no') { confirming = null; render(); return; }
    busy = true; msg('');
    try {
      if (act === 'up' && i > 0) { [tracks[i - 1], tracks[i]] = [tracks[i], tracks[i - 1]]; render(); await savePositions(); }
      if (act === 'down' && i < tracks.length - 1) { [tracks[i + 1], tracks[i]] = [tracks[i], tracks[i + 1]]; render(); await savePositions(); }
      if (act === 'yes') {
        const t = tracks[i]; confirming = null;
        const { error } = await sb.from('songs').delete().eq('id', t.id);
        if (error) throw error;
        await sb.storage.from(P.BUCKET).remove([t.file_path]);
        tracks.splice(i, 1);
        await savePositions();
        msg(`«${t.title}» wurde gelöscht.`, 'ok');
      }
    } catch (err) { msg(errText(err), 'err'); await reload(); }
    busy = false; render();
  });

  $('tracks').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.closest('form.rename'); if (!f) return;
    const t = tracks.find(x => x.id === f.dataset.id);
    const v = f.querySelector('input').value.trim();
    editing = null;
    if (t && v && v !== t.title) {
      const { error } = await sb.from('songs').update({ title: v.slice(0, 120) }).eq('id', t.id);
      if (error) msg(errText(error), 'err'); else t.title = v.slice(0, 120);
    }
    render();
  });
  $('tracks').addEventListener('keydown', e => { if (e.key === 'Escape' && editing) { editing = null; render(); } });

  // ---------- Hochladen ----------
  $('uploadBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length || busy) return;
    busy = true; $('uploadBtn').disabled = true; msg(''); render();
    const box = $('uploads'); box.hidden = false;
    box.innerHTML = files.map((f, i) => `<div class="up-row"><span>${esc(f.name)}</span><span class="st" id="up-${i}">wartet</span></div>`).join('');
    let done = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i], st = $('up-' + i);
      const set = (txt, cls) => { st.textContent = txt; st.className = 'st' + (cls ? ' ' + cls : ''); };
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!['mp3', 'm4a'].includes(ext)) { set('nur MP3 oder M4A', 'err'); continue; }
      if (f.size > MAX_BYTES) { set('zu gross (max. 50 MB)', 'err'); continue; }
      const mime = ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
      const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      const path = `${id}.${ext}`;
      try {
        set('analysiere …');
        const info = await analyse(f);
        set('lädt hoch …');
        const up = await sb.storage.from(P.BUCKET).upload(path, f, { contentType: mime, cacheControl: '31536000', upsert: false });
        if (up.error) throw up.error;
        const title = f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim().slice(0, 120) || 'Neues Lied';
        const position = tracks.length ? Math.max(...tracks.map(t => t.position || 0)) + 1 : 0;
        const ins = await sb.from('songs').insert({ title, file_path: path, mime_type: mime, duration: info.duration, peaks: info.peaks, position }).select().single();
        if (ins.error) { await sb.storage.from(P.BUCKET).remove([path]); throw ins.error; }
        tracks.push(ins.data); done++;
        set('fertig', 'ok'); render();
      } catch (err) {
        set('fehlgeschlagen', 'err'); msg(errText(err), 'err');
      }
    }
    busy = false; $('uploadBtn').disabled = false; render();
    if (done) msg(done === 1 ? '1 Lied wurde hochgeladen. Es ist ab sofort für alle hörbar.' : `${done} Lieder wurden hochgeladen. Sie sind ab sofort für alle hörbar.`, 'ok');
  });

  // Dauer und Wellenform aus der Datei berechnen
  async function analyse(file) {
    const out = { duration: 0, peaks: null };
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const ab = await file.arrayBuffer();
      const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
      out.duration = Math.round(buf.duration * 10) / 10;
      const d = buf.getChannelData(0), n = 72, seg = Math.floor(d.length / n), stepN = Math.max(1, Math.floor(seg / 400));
      const raw = [];
      for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i * seg; j < (i + 1) * seg; j += stepN) { s += d[j] * d[j]; c++; } raw.push(Math.sqrt(s / Math.max(1, c))); }
      const mx = Math.max(...raw) || 1;
      out.peaks = raw.map(v => Math.round(Math.min(1, v / mx) * 100) / 100);
      if (ctx.close) ctx.close();
    } catch (e) {
      out.duration = await new Promise(res => {
        const a = new Audio(), u = URL.createObjectURL(file);
        a.preload = 'metadata';
        a.onloadedmetadata = () => { res(Math.round(a.duration * 10) / 10); URL.revokeObjectURL(u); };
        a.onerror = () => res(0);
        a.src = u;
      });
    }
    return out;
  }

  init();
})();
