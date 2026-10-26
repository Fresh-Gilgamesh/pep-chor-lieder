// Gemeinsame Hilfsfunktionen für Player und Admin-Seite
(function () {
  const cfg = window.PEP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = String(cfg.SUPABASE_ANON_KEY || '').trim();

  // Was ist (noch) nicht in Ordnung? -> klare Meldung statt leerer Seite
  let problem = '';
  if (!window.PEP_CONFIG) {
    problem = 'Die Datei config.js fehlt oder enthält einen Tippfehler (z.B. ein fehlendes Anführungszeichen oder Komma). Vergleiche sie mit der Vorlage.';
  } else if (!url || url.includes('DEIN-PROJEKT')) {
    problem = 'In config.js ist noch keine SUPABASE_URL eingetragen.';
  } else if (!/^https:\/\/[^/\s]+$/.test(url)) {
    problem = 'Die SUPABASE_URL in config.js hat ein falsches Format. Richtig ist z.B. https://abcdefgh.supabase.co (ohne Zusatz am Ende).';
  } else if (!key || key.includes('DEIN-ANON-KEY')) {
    problem = 'In config.js ist noch kein SUPABASE_ANON_KEY eingetragen.';
  } else if (/service_role|sb_secret_/.test(key) || /"role"\s*:\s*"service_role"/.test(safeJwt(key))) {
    problem = 'In config.js ist der geheime service_role-Schlüssel eingetragen. Ersetze ihn sofort durch den «anon public» Schlüssel!';
  } else if (!window.supabase || !window.supabase.createClient) {
    problem = 'Die Datei lib/supabase.js wurde nicht gefunden. Prüfe auf GitHub, ob der Ordner «lib» mit seinen zwei Dateien hochgeladen ist.';
  }

  let sb = null;
  if (!problem) {
    try { sb = window.supabase.createClient(url, key); }
    catch (e) { problem = 'Verbindung zu Supabase konnte nicht eingerichtet werden: ' + (e && e.message ? e.message : e); }
  }

  function safeJwt(k) { try { return atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')); } catch (e) { return ''; } }

  window.PEP = {
    cfg,
    problem,
    configured: !problem,
    sb,
    BUCKET: 'songs',
    fmt(s) { if (!isFinite(s) || s < 0) s = 0; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
    esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    publicUrl(path) { return sb.storage.from(this.BUCKET).getPublicUrl(path).data.publicUrl; },
    async loadSongs() {
      const { data, error } = await sb.from('songs')
        .select('id,title,file_path,mime_type,duration,peaks,position,created_at')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    showMsg(el, text, kind) { el.textContent = text || ''; el.className = 'notice' + (kind ? ' ' + kind : ''); el.hidden = !text; },
    // Bricht ab, wenn der Server nicht antwortet
    withTimeout(promise, ms, label) {
      return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(label || 'Zeitüberschreitung')), ms))]);
    }
  };

  // Unerwartete Fehler sichtbar machen statt einer leeren Seite
  window.addEventListener('error', e => {
    const el = document.getElementById('msg');
    if (el && el.hidden) window.PEP.showMsg(el, 'Technischer Fehler: ' + (e.message || 'unbekannt') + (e.filename ? ' (' + e.filename.split('/').pop() + ')' : ''), 'err');
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (cfg.APP_NAME) document.querySelectorAll('[data-app-name]').forEach(el => { el.textContent = cfg.APP_NAME; });
  });

  // Offline-Hülle / Installierbarkeit
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
