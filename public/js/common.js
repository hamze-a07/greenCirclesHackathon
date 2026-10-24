/* RightDoor — shared browser helpers: language, text size, contrast, read aloud, API, results. */
(function () {
  const I = window.RD_I18N;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
  };
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang') || store.get('rd_lang') || 'en';
  if (!I.STR[lang]) lang = 'en';

  const RD = {
    I, store, meta: null,
    get lang() { return lang; },
    t(key, p) { return I.t(lang, key, p); },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    setLang(code) {
      if (!I.STR[code]) return;
      lang = code; store.set('rd_lang', code);
      RD.applyDocLang(); RD.apply(document);
      document.dispatchEvent(new CustomEvent('rd:lang', { detail: code }));
    },
    applyDocLang() {
      const L = I.LANGS.find((l) => l.code === lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = L ? L.dir : 'ltr';
    },
    apply(root) {
      root.querySelectorAll('[data-i18n]').forEach((el) => {
        let args = {};
        if (el.dataset.args) { try { args = JSON.parse(el.dataset.args); } catch { /* ignore */ } }
        el.textContent = RD.t(el.dataset.i18n, args);
      });
      root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = RD.t(el.dataset.i18nPh); });
      root.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', RD.t(el.dataset.i18nLabel)); });
      root.querySelectorAll('.lang-select').forEach((s) => { s.value = lang; });
    },
    applyPrefs() {
      const size = store.get('rd_size') || '1';
      document.documentElement.dataset.size = size;
      document.documentElement.dataset.contrast = store.get('rd_contrast') === 'high' ? 'high' : 'normal';
      document.querySelectorAll('.size-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === size)));
      document.querySelectorAll('.contrast-btn').forEach((b) => b.setAttribute('aria-pressed', String(document.documentElement.dataset.contrast === 'high')));
    },
    tools({ sizes = 3, showLang = true } = {}) {
      const langOpts = I.LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');
      const sizeBtns = [1, 2, 3].slice(0, sizes).map((n) => `<button type="button" class="size-btn" data-size="${n}" aria-pressed="false"><span aria-hidden="true">A</span><span class="sr">${n}</span></button>`).join('');
      return `<div class="tools">
        ${showLang ? `<select class="lang-select" data-i18n-label="ui.language">${langOpts}</select>` : ''}
        <span class="label" data-i18n="ui.textSize"></span>${sizeBtns}
        <button type="button" class="contrast-btn" aria-pressed="false" data-i18n="ui.highContrast"></button>
      </div>`;
    },
    bindTools(root = document) {
      root.querySelectorAll('.size-btn').forEach((b) => b.addEventListener('click', () => { store.set('rd_size', b.dataset.size); RD.applyPrefs(); }));
      root.querySelectorAll('.contrast-btn').forEach((b) => b.addEventListener('click', () => {
        store.set('rd_contrast', document.documentElement.dataset.contrast === 'high' ? 'normal' : 'high'); RD.applyPrefs();
      }));
      root.querySelectorAll('.lang-select').forEach((s) => s.addEventListener('change', () => RD.setLang(s.value)));
      RD.applyPrefs();
    },
    async api(path, opts = {}) {
      const res = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
      let data = null;
      try { data = await res.json(); } catch { /* no body */ }
      if (!res.ok) { const e = new Error((data && data.error) || res.statusText); e.status = res.status; e.data = data; throw e; }
      return data;
    },
    async loadMeta() { if (!RD.meta) RD.meta = await RD.api('/api/meta'); return RD.meta; },

    // ----- Read aloud -----
    speaking: false,
    speak(text, onEnd) {
      if (!('speechSynthesis' in window)) { alert(RD.t('ui.noSpeech')); return false; }
      speechSynthesis.cancel();
      const L = I.LANGS.find((l) => l.code === lang);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = L ? L.speech : 'en-GB';
      const voice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
      if (voice) u.voice = voice;
      u.rate = 0.92;
      u.onend = u.onerror = () => { RD.speaking = false; if (onEnd) onEnd(); };
      RD.speaking = true;
      speechSynthesis.speak(u);
      return true;
    },
    stopSpeak() { if ('speechSynthesis' in window) speechSynthesis.cancel(); RD.speaking = false; },

    icon: {
      tick: '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      box: '<span class="box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
      speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" fill="currentColor"/></svg>',
      sms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9h8M8 12.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    },

    // ----- Results -----
    reason(r) {
      let x;
      if (r.x !== undefined) {
        x = r.lit ? r.x : RD.t(r.x);
        if (!r.lit && lang === 'en' && /^opt\.(enjoy|exp)\./.test(r.x)) x = x.toLowerCase();
      }
      return RD.t('r.' + r.k, { x });
    },
    tag(tg) { return tg.k === 'lang' ? RD.t('r.lang', { x: RD.t(tg.x) }) : RD.t('t.' + tg.k); },
    whyLine(reasons) {
      const list = (reasons || []).map(RD.reason);
      if (!list.length) return '';
      const s = list.join(lang === 'ar' || lang === 'ur' ? '، ' : ', ');
      return s.charAt(0).toUpperCase() + s.slice(1) + '.';
    },
    jobHTML(j, n) {
      const area = RD.t('opt.areas.' + j.area);
      const nonCourse = (j.reasons || []).filter((r) => r.k !== 'course');
      return `<article class="job">
        <h3>${n ? n + '. ' : ''}${RD.esc(j.title)} <span class="emp">· ${RD.esc(j.employer)}, ${RD.esc(area)}</span></h3>
        <div class="tags">${(j.tags || []).map((tg) => `<span class="tag">${RD.esc(RD.tag(tg))}</span>`).join('')}</div>
        ${nonCourse.length ? `<p class="why"><b>${RD.t('ui.why')}</b> ${RD.esc(RD.whyLine(nonCourse))}</p>` : ''}
        ${j.course ? `<p class="course"><b>${RD.t('ui.course')}</b> ${RD.esc(j.course.name)}</p>` : ''}
        ${j.pay ? `<p class="small muted">${RD.esc(j.pay)}${j.desc ? ' · ' + RD.esc(j.desc) : ''}</p>` : ''}
        ${j.unsure ? `<div class="unsure">${RD.t('ui.notSure')}</div>` : ''}
      </article>`;
    },
    renderResults(el, data, ctx = {}) {
      const fields = data.fields || [];
      el.innerHTML = `<section class="results stack" aria-live="polite">
        ${data.noMatch ? `<div class="note">${RD.t('ui.noMatch')}</div>` : ''}
        ${fields.length ? `<h2 tabindex="-1" id="res-top">${RD.t('ui.fieldsTitle')}</h2><p class="muted">${RD.t('ui.fieldsSub')}</p>
        <div class="field-grid">${fields.map((f, i) => `<button type="button" class="field-card" aria-expanded="false" data-i="${i}">
            <h3>${RD.esc(RD.t('sector.' + f.sector))}</h3>
            <div class="count">${RD.t('ui.nJobs', { n: f.count })}</div>
            <div class="small muted">${RD.esc(RD.whyLine(f.reasons.filter((r) => r.k !== 'course').slice(0, 2)))}</div></button>`).join('')}</div>
        <div class="jobs" id="field-jobs"></div>` : ''}
        ${(data.jobs || []).length ? `<h2>${RD.t('ui.jobsTitle')}</h2><div class="jobs">${data.jobs.map((j, i) => RD.jobHTML(j, i + 1)).join('')}</div>` : ''}
        ${(data.support || []).length ? `<h2>${RD.t('ui.supportTitle')}</h2><div class="support-list">${data.support.map((s) => `<div class="support"><h3>${RD.esc(s.name)}</h3><div class="small">${RD.esc(RD.t('svc.' + s.id))}</div></div>`).join('')}</div>` : ''}
        <div class="card" id="send-panel"></div>
      </section>`;
      el.querySelectorAll('.field-card').forEach((b) => b.addEventListener('click', () => {
        const open = b.getAttribute('aria-expanded') === 'true';
        el.querySelectorAll('.field-card').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        const box = el.querySelector('#field-jobs');
        if (open) { box.innerHTML = ''; return; }
        b.setAttribute('aria-expanded', 'true');
        box.innerHTML = fields[+b.dataset.i].jobs.map((j) => RD.jobHTML(j)).join('');
      }));
      if (data.code) RD.renderCode(el.querySelector('#send-panel'), data.code);
      else RD.renderSend(el.querySelector('#send-panel'), ctx);
      const top = el.querySelector('#res-top');
      if (top) top.focus();
    },
    renderSend(box, ctx) {
      const a = ctx.answers || {};
      const contactOpts = I.QUESTIONS.find((q) => q.id === 'contact').opts;
      let contact = a.contact || '';
      box.innerHTML = `<h2>${RD.t('ui.whatNext')}</h2><p>${RD.t('ui.whatNextText')}</p>
        <div class="stack">
          <div><label class="field" for="s-name">${RD.t('ui.yourName')}</label><input id="s-name" type="text" autocomplete="given-name" value="${RD.esc(ctx.name || '')}"></div>
          <div><label class="field" for="s-phone">${RD.t('ui.phoneOpt')}</label><input id="s-phone" type="tel" autocomplete="tel" value="${RD.esc(ctx.phone || '')}"></div>
          <fieldset><legend class="field" style="font-weight:600;margin-bottom:6px">${RD.t('ui.contactTitle')}</legend>
            <div class="chips" role="radiogroup">${contactOpts.map((o) => `<button type="button" class="chip" role="radio" aria-pressed="${o === contact}" aria-checked="${o === contact}" data-v="${o}">${RD.icon.tick}${RD.esc(RD.t('opt.contact.' + o))}</button>`).join('')}</div>
          </fieldset>
          <label class="check"><input type="checkbox" id="s-consent"> <span>${RD.t('ui.consent')}</span></label>
          <p class="small muted">${RD.t('ui.privacy')}</p>
          <div class="alert hidden" id="s-err" role="alert"></div>
          <div class="actions" style="margin-top:4px"><button type="button" class="btn btn-primary" id="s-send">${RD.t('ui.sendWorker')}</button></div>
        </div>`;
      box.querySelectorAll('[role="radio"]').forEach((b) => b.addEventListener('click', () => {
        contact = b.dataset.v;
        box.querySelectorAll('[role="radio"]').forEach((x) => { const on = x === b; x.setAttribute('aria-pressed', on); x.setAttribute('aria-checked', on); });
      }));
      box.querySelector('#s-send').addEventListener('click', async () => {
        const err = box.querySelector('#s-err');
        err.classList.add('hidden');
        if (!box.querySelector('#s-consent').checked) { err.textContent = RD.t('ui.needConsent'); err.classList.remove('hidden'); return; }
        const btn = box.querySelector('#s-send'); btn.disabled = true;
        try {
          const out = await RD.api('/api/checkins', { body: { name: box.querySelector('#s-name').value, phone: box.querySelector('#s-phone').value, lang, consent: true, channel: ctx.channel || 'web', answers: { ...a, contact } } });
          RD.renderCode(box, out.code);
          if (ctx.onSent) ctx.onSent(out);
        } catch (e) { err.textContent = RD.t('ui.error'); err.classList.remove('hidden'); btn.disabled = false; }
      });
    },
    renderCode(box, code) {
      box.innerHTML = `<h2>${RD.t('ui.sentOk')}</h2>
        <div class="code-box"><div><div class="small" style="font-weight:600">${RD.t('ui.yourCode')}</div><div class="code">${RD.esc(code)}</div></div>
        <p style="margin:0;flex:1 1 240px">${RD.t('ui.codeHelp')}</p></div>
        <p style="margin-top:16px">${RD.t('ui.whatNextText')}</p>
        <div class="actions"><a class="btn btn-primary" href="/app/track?code=${encodeURIComponent(code)}">${RD.t('ui.trackProgress')}</a>
        <button type="button" class="btn btn-outline" onclick="window.print()">${RD.t('ui.print')}</button></div>`;
      try { RD.store.set('rd_code', code); } catch { /* ignore */ }
    }
  };
  window.RD = RD;
  RD.applyDocLang();
  RD.applyPrefs();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
})();
