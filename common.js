// Gemeinsame Hilfsfunktionen für Player und Admin-Seite
(function () {
  const cfg = window.PEP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('DEIN-PROJEKT') &&
                     cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('DEIN-ANON-KEY');

  window.PEP = {
    cfg,
    configured,
    sb: configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null,
    BUCKET: 'songs',
    fmt(s) { if (!isFinite(s) || s < 0) s = 0; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
    esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    publicUrl(path) { return this.sb.storage.from(this.BUCKET).getPublicUrl(path).data.publicUrl; },
    async loadSongs() {
      const { data, error } = await this.sb.from('songs')
        .select('id,title,file_path,mime_type,duration,peaks,position,created_at')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    showMsg(el, text, kind) { el.textContent = text || ''; el.className = 'notice' + (kind ? ' ' + kind : ''); el.hidden = !text; }
  };

  // Name der App überall einsetzen
  document.addEventListener('DOMContentLoaded', () => {
    if (cfg.APP_NAME) document.querySelectorAll('[data-app-name]').forEach(el => { el.textContent = cfg.APP_NAME; });
  });

  // Offline-Hülle / Installierbarkeit
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
