/* RightDoor staff app: clients, check-ins, AI summary and matches, approvals, jobs, demo tools. */
(function () {
  const I = RD.I;
  const esc = RD.esc;
  const E = (k, p) => I.t('en', k, p); // staff screens are in English
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  const bar = document.getElementById('bar');
  const main = document.getElementById('main');
  const Q = Object.fromEntries(I.QUESTIONS.map((q) => [q.id, q]));
  let me = null, meta = null, jobs = null, smsTimer = null;

  const STATUS = { new: ['New', 'grey'], processed: ['Needs review', 'amber'], approved: ['Plan approved', ''], inwork: ['In work', 'dark'] };
  const CHANNEL = { web: 'Online', person: 'Face to face', phone: 'Phone call', paper: 'Paper form', text: 'Text line', skip: 'Asked for a worker' };
  const LIMIT_LABEL = (l, p) => ({ lifting: p.liftMax ? `Lifting over ${p.liftMax} kg` : 'Heavy lifting', standing: 'Long standing', walking: 'Lots of walking or stairs', noise: 'Busy or noisy places', reading: 'Lots of reading or writing', early: 'Early starts' }[l] || l);
  const SKILL_LABEL = (s) => (s === 'computers' ? 'Computer skills' : E('opt.exp.' + s));
  const areaName = (a) => (a ? E('opt.areas.' + a) : '');
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const reasonEn = (r) => {
    let x;
    if (r.x !== undefined) { x = r.lit ? r.x : E(r.x); if (!r.lit && /^opt\.(enjoy|exp)\./.test(r.x)) x = x.toLowerCase(); }
    return E('r.' + r.k, { x });
  };
  const whyEn = (rs) => { const s = (rs || []).filter((r) => r.k !== 'course').map(reasonEn).join(', '); return s ? s[0].toUpperCase() + s.slice(1) + '.' : ''; };
  const tagEn = (t) => (t.k === 'lang' ? E('r.lang', { x: E(t.x) }) : E('t.' + t.k));

  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  async function api(path, opts) {
    try { return await RD.api(path, opts); }
    catch (e) { if (e.status === 401 && !path.includes('login')) { me = null; nav('/staff'); } throw e; }
  }
  async function getJobs(force) { if (!jobs || force) jobs = await api('/api/staff/jobs'); return jobs; }
  const jobById = (id) => (jobs || []).find((j) => j.id === id);

  // ---------- Router ----------
  function nav(path, replace) { history[replace ? 'replaceState' : 'pushState']({}, '', path); route(); }
  window.addEventListener('popstate', route);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); nav(a.getAttribute('href')); }
  });

  function renderBar(active) {
    const en = () => bar.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = E(el.dataset.i18n); });
    if (!me) { bar.innerHTML = `<div class="wrap"><a class="logo" href="/">Jobs Match · <span>Staff</span></a><div class="me">${RD.tools({ showLang: false })}</div></div>`; RD.bindTools(bar); en(); return; }
    const link = (href, label, key) => `<a data-link href="${href}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
    bar.innerHTML = `<div class="wrap"><a class="logo" data-link href="/staff/clients">Jobs Match · <span>Staff</span></a>
      <nav aria-label="Staff">${link('/staff/clients', 'Clients', 'clients')}${link('/staff/jobs', 'Jobs', 'jobs')}${link('/staff/demo', 'Demo tools', 'demo')}</nav>
      <div class="me">${RD.tools({ sizes: 3, showLang: false })}<span>${esc(me.name)}</span><button type="button" id="logout">Sign out</button></div></div>`;
    RD.bindTools(bar);
    en();
    document.getElementById('logout').onclick = async () => { await RD.api('/api/staff/logout', { body: {} }); me = null; nav('/staff'); };
  }

  async function route() {
    clearInterval(smsTimer);
    const path = location.pathname.replace(/\/+$/, '') || '/staff';
    if (!me) {
      try { const r = await RD.api('/api/staff/me'); me = r.staff; } catch { me = null; }
    }
    if (!meta) meta = await RD.loadMeta();
    if (!me) { renderBar(); return loginView(path === '/staff' ? '/staff/clients' : path); }
    let m;
    if (path === '/staff' || path === '/staff/clients') { renderBar('clients'); return clientsView(); }
    if (path === '/staff/clients/new') { renderBar('clients'); return newClientView(); }
    if ((m = path.match(/^\/staff\/clients\/([a-f0-9]+)\/letter$/))) { renderBar('clients'); return letterView(m[1]); }
    if ((m = path.match(/^\/staff\/clients\/([a-f0-9]+)$/))) { renderBar('clients'); return clientView(m[1]); }
    if (path === '/staff/jobs') { renderBar('jobs'); return jobsView(); }
    if (path === '/staff/demo') { renderBar('demo'); return demoView(); }
    renderBar(); main.innerHTML = '<h1>Page not found</h1><p><a data-link href="/staff/clients">Back to clients</a></p>';
  }

  // ---------- Login ----------
  async function loginView(next) {
    const opts = await RD.api('/api/staff/options');
    main.innerHTML = `<div class="scard" style="max-width:440px;margin:40px auto">
      <h1>Staff sign in</h1>
      <p class="muted">For council, Jobcentre, library and GP practice staff using RightDoor with residents.</p>
      <form id="lf" class="stack">
        <div><label class="field" for="who">Your name</label><select id="who">${opts.staff.map((s) => `<option value="${s.id}">${esc(s.name)} · ${esc(s.role)}</option>`).join('')}</select></div>
        <div><label class="field" for="pin">PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password"></div>
        ${opts.pinHint ? `<p class="small muted">${esc(opts.pinHint)}</p>` : ''}
        <div class="alert hidden" id="lerr" role="alert"></div>
        <button class="btn btn-primary" type="submit">Sign in</button>
      </form></div>`;
    document.getElementById('pin').focus();
    document.getElementById('lf').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await RD.api('/api/staff/login', { body: { id: document.getElementById('who').value, pin: document.getElementById('pin').value } }); me = r.staff; nav(next, true); }
      catch (err) { const el = document.getElementById('lerr'); el.textContent = err.message; el.classList.remove('hidden'); }
    };
  }

  // ---------- Clients ----------
  async function clientsView() {
    main.innerHTML = '<p class="muted">Loading…</p>';
    const list = await api('/api/staff/clients');
    const counts = { processed: 0, approved: 0, inwork: 0 };
    list.forEach((c) => { if (counts[c.status] !== undefined) counts[c.status]++; });
    main.innerHTML = `<div class="row" style="justify-content:space-between"><h1 style="margin:0">Clients</h1>
        <div class="row"><a class="btn btn-primary btn-small" data-link href="/staff/clients/new">New check-in</a></div></div>
      <div class="grid3" style="margin-top:16px">
        <div class="scard"><div class="slabel">Needs review</div><div style="font-size:1.8rem;font-weight:800">${counts.processed}</div></div>
        <div class="scard"><div class="slabel">Plan approved</div><div style="font-size:1.8rem;font-weight:800">${counts.approved}</div></div>
        <div class="scard"><div class="slabel">In work</div><div style="font-size:1.8rem;font-weight:800">${counts.inwork}</div></div>
      </div>
      <div class="toolbar"><label class="sr" for="q">Search</label><input id="q" type="search" placeholder="Search name, area or reference">
        <label class="sr" for="st">Status</label><select id="st"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Area</th><th>Came in by</th><th>Status</th><th>Top match</th><th>Steps</th><th>Checked in</th></tr></thead><tbody id="rows"></tbody></table></div>`;
    const draw = () => {
      const q = document.getElementById('q').value.toLowerCase(), st = document.getElementById('st').value;
      const rows = list.filter((c) => (!st || c.status === st) && (!q || `${c.name} ${areaName(c.area)} ${c.code}`.toLowerCase().includes(q)));
      document.getElementById('rows').innerHTML = rows.map((c) => `<tr data-id="${c.id}" tabindex="0">
        <td><a data-link href="/staff/clients/${c.id}"><b>${esc(c.name)}</b></a>${c.age ? `, ${c.age}` : ''}<div class="small muted">${esc(c.code)}</div></td>
        <td>${esc(areaName(c.area)) || '—'}</td><td>${CHANNEL[c.channel] || c.channel}${c.lang !== 'en' ? ` <span class="pill grey">${esc(I.LANGS.find((l) => l.code === c.lang).name)}</span>` : ''}</td>
        <td><span class="pill ${STATUS[c.status][1]}">${STATUS[c.status][0]}</span>${c.unsure ? ' <span class="pill amber" title="Some suggestions need checking">Check</span>' : ''}</td>
        <td>${esc(c.topMatch || '—')}</td><td>${c.steps ? `${c.stepsDone}/${c.steps}` : '—'}</td><td class="small">${when(c.createdAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No clients match.</td></tr>';
      document.querySelectorAll('#rows tr[data-id]').forEach((tr) => {
        const go = () => nav('/staff/clients/' + tr.dataset.id);
        tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(); });
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      });
    };
    document.getElementById('q').oninput = draw; document.getElementById('st').onchange = draw; draw();
  }

  // ---------- New check-in (with a helper / phone / paper) ----------
  const EXAMPLE = 'Lives in Middleton, aged 58. Has arthritis in both knees so struggles with stairs and cannot stand for long. Worked as a school cook for 12 years and has a food hygiene certificate. Would like part-time, school hours. Speaks Bengali and some English. Would like help with computers.';
  function questionChips(prefix) {
    return I.QUESTIONS.map((q) => `<fieldset class="group" style="margin-top:14px"><legend style="font-size:1rem">${q.n}. ${esc(E('q.q' + q.n))}</legend>
      <div class="chips">${q.opts.map((o) => `<button type="button" class="chip small" data-q="${q.id}" data-v="${o}" data-multi="${q.multi}" aria-pressed="false">${RD.icon.tick}${esc(E('opt.' + q.id + '.' + o))}</button>`).join('')}</div></fieldset>`).join('');
  }
  function bindChips(root, answers) {
    root.querySelectorAll('.chip[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q, v = b.dataset.v;
      if (b.dataset.multi === 'true') {
        let list = answers[q] || [];
        list = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
        answers[q] = list;
      } else answers[q] = answers[q] === v ? '' : v;
      root.querySelectorAll(`.chip[data-q="${q}"]`).forEach((c) => {
        const on = Array.isArray(answers[q]) ? answers[q].includes(c.dataset.v) : answers[q] === c.dataset.v;
        c.setAttribute('aria-pressed', String(on));
      });
    }));
  }
  function newClientView() {
    const channel = new URLSearchParams(location.search).get('channel') || 'person';
    const answers = {};
    main.innerHTML = `<p><a data-link href="/staff/clients">← Clients</a></p><h1>New check-in</h1>
      <p class="muted">Fill this in with the resident, face to face or on the phone, or type up a paper form. No login is needed for them.</p>
      <form id="nf" class="stack">
        <div class="scard"><div class="grid3">
          <div><label class="field" for="n-name">Name</label><input id="n-name" type="text" required></div>
          <div><label class="field" for="n-age">Age</label><input id="n-age" type="number" min="16" max="99"></div>
          <div><label class="field" for="n-area">Area</label><select id="n-area"><option value="">Not given</option>${Q.areas.opts.filter((a) => a !== 'anywhere').map((a) => `<option value="${a}">${esc(E('opt.areas.' + a))}</option>`).join('')}</select></div>
          <div><label class="field" for="n-phone">Phone</label><input id="n-phone" type="tel"></div>
          <div><label class="field" for="n-lang">Preferred language</label><select id="n-lang">${I.LANGS.map((l) => `<option value="${l.code}">${esc(l.name)}</option>`).join('')}</select></div>
          <div><label class="field" for="n-ch">Came in by</label><select id="n-ch">${['person', 'phone', 'paper'].map((c) => `<option value="${c}" ${c === channel ? 'selected' : ''}>${CHANNEL[c]}</option>`).join('')}</select></div>
        </div></div>
        <div class="scard ${channel === 'phone' ? '' : 'hidden'}" id="phone-script">
          <div class="slabel">Phone line script</div>
          <p style="margin:0">Introduce yourself, explain that answers are only used to find work and support, and ask if they are happy for you to note them down. Then read each question below aloud and tick their answers, or type what they say into the notes. Offer the text line (${esc(meta.textNumber)}) or a printed form if they would rather.</p>
        </div>
        <div class="scard">
          <div class="row" style="justify-content:space-between"><label class="field" for="n-notes" style="margin:0">Notes from the conversation</label>
            <button type="button" class="btn btn-ghost btn-small" id="ex">Use example notes</button></div>
          <p class="small muted" style="margin:4px 0 8px">Write in plain words. The AI will read this and pull out health limits, skills and what they want. You check everything before anything is shared.</p>
          <textarea id="n-notes" style="min-height:150px"></textarea>
        </div>
        <details class="box"><summary>Answer the questions together (optional)</summary>${questionChips()}</details>
        <div class="scard"><label class="check"><input type="checkbox" id="n-consent"><span>The resident agrees that their answers can be saved and used to find work and support for them.</span></label></div>
        <div class="alert hidden" id="nerr" role="alert"></div>
        <div class="row"><button class="btn btn-primary" type="submit" id="nsave">Save and find matches</button><a class="btn btn-outline" data-link href="/staff/clients">Cancel</a></div>
      </form>`;
    bindChips(main, answers);
    document.getElementById('n-ch').onchange = (e) => document.getElementById('phone-script').classList.toggle('hidden', e.target.value !== 'phone');
    document.getElementById('ex').onclick = () => { document.getElementById('n-notes').value = EXAMPLE; if (!document.getElementById('n-name').value) document.getElementById('n-name').value = 'Rokeya B.'; };
    document.getElementById('nf').onsubmit = async (e) => {
      e.preventDefault();
      const err = document.getElementById('nerr'); err.classList.add('hidden');
      const name = document.getElementById('n-name').value.trim();
      if (!name) { err.textContent = 'Add the resident’s name.'; err.classList.remove('hidden'); return; }
      if (!document.getElementById('n-consent').checked) { err.textContent = 'The resident needs to agree before you save their details.'; err.classList.remove('hidden'); return; }
      const btn = document.getElementById('nsave'); btn.disabled = true; btn.textContent = 'Reading the notes…';
      try {
        const c = await api('/api/staff/clients', { body: { name, age: document.getElementById('n-age').value, area: document.getElementById('n-area').value, phone: document.getElementById('n-phone').value, lang: document.getElementById('n-lang').value, channel: document.getElementById('n-ch').value, notes: document.getElementById('n-notes').value, answers, consent: true } });
        nav('/staff/clients/' + c.id);
      } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Save and find matches'; }
    };
  }

  // ---------- Client page (wireframe: AI summary and job matches) ----------
  async function clientView(id) {
    main.innerHTML = '<p class="muted">Loading…</p>';
    let c;
    try { [c] = await Promise.all([api('/api/staff/clients/' + id), getJobs()]); }
    catch { main.innerHTML = '<h1>Client not found</h1><p><a data-link href="/staff/clients">Back to clients</a></p>'; return; }
    drawClient(c);
  }

  function drawClient(c) {
    const p = c.profile || { lim: [], skills: [], prefs: [], langs: [] };
    const ai = c.ai || {};
    const planJobs = c.plan ? c.plan.jobs : c.matches.map((m) => m.jobId);
    const planSupport = c.plan ? c.plan.support : c.support.map((s) => s.id);
    const keep = new Set(planJobs);
    const sup = new Set(planSupport);
    const supportReason = Object.fromEntries(c.support.map((s) => [s.id, s.reason]));
    const shown = [...c.matches];
    for (const jid of planJobs) if (!shown.find((m) => m.jobId === jid)) { const r = c.ranked.find((x) => x.jobId === jid); if (r) shown.push(r); }
    const more = c.ranked.filter((r) => !shown.find((m) => m.jobId === r.jobId)).slice(0, 6);
    const health = c.excluded.filter((x) => x.health), other = c.excluded.filter((x) => !x.health);
    const checks = [...new Set([...(ai.uncertain || []), ...c.matches.flatMap((m) => (m.unsureWhy || []).map((w) => `${jobById(m.jobId) ? jobById(m.jobId).title : ''}: ${w}`))])];

    const matchCard = (m, n) => {
      const j = jobById(m.jobId); if (!j) return '';
      return `<article class="mcard ${keep.has(j.id) ? '' : 'off'}" data-job="${j.id}">
        <div><h3>${n ? n + '. ' : ''}${esc(j.title)} <span class="emp">· ${esc(j.employer)}, ${esc(areaName(j.area))}</span></h3>
          <div class="tags" style="margin-top:6px">${(m.tags || []).map((t) => `<span class="tag">${esc(tagEn(t))}</span>`).join('')}</div>
          <p><b>Why:</b> ${esc(whyEn(m.reasons)) || 'Few clear links: check with the person.'}</p>
          ${m.course ? `<p><b>Course:</b> ${esc(m.course.name)} (${esc(m.course.provider)}, ${esc(m.course.length)})</p>` : ''}
          ${m.unsure ? `<div class="unsure">Not sure: ${esc((m.unsureWhy || []).join('; '))}. Check with ${esc(c.name.split(' ')[0])}.</div>` : ''}
        </div>
        <label class="keep"><input type="checkbox" data-keep="${j.id}" ${keep.has(j.id) ? 'checked' : ''}> Include</label>
      </article>`;
    };

    const steps = (c.steps || []).map((s) => {
      const label = s.type === 'job' ? (jobById(s.id) ? `Find out more: ${jobById(s.id).title}, ${jobById(s.id).employer}` : s.id) : s.type === 'course' ? `Ask about the course: ${(meta.courses[s.id] || {}).name || s.id}` : `Get in touch with ${(meta.services[s.id] || {}).name || s.id}`;
      return `<li class="step ${s.done ? 'is-done' : ''}" style="padding:10px 12px"><span aria-hidden="true">${s.done ? '☑' : '☐'}</span><span class="txt">${esc(label)}</span></li>`;
    }).join('');

    main.innerHTML = `<p class="no-print"><a data-link href="/staff/clients">← Clients</a></p>
      <div class="row" style="gap:12px"><h1 style="margin:0">${esc(c.name)}${c.age ? `, ${c.age}` : ''}${c.area ? ` · ${esc(areaName(c.area))}` : ''}</h1>
        <span class="pill">${ai.mode === 'claude' ? 'AI processed' : 'AI processed · rules'}</span>
        <span class="pill ${STATUS[c.status][1]}">${STATUS[c.status][0]}</span>
        <span class="pill grey">${CHANNEL[c.channel]}</span>
        <span class="pill grey">${esc(c.code)}</span></div>
      <div class="client-grid">
        <aside class="stack">
          <div class="scard">
            <div class="row" style="justify-content:space-between"><div class="slabel" style="margin:0">AI summary</div><button type="button" class="link-btn small" id="edit-sum">Edit</button></div>
            <p id="sum" style="margin:8px 0 0">${esc(ai.summary)}</p>
            <label class="cat" for="cat">Category: <select id="cat" style="width:auto;padding:2px 6px;border:0;background:transparent;font-weight:700">${meta.categories.map((k) => `<option ${k === ai.category ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
            ${ai.condition ? `<div class="small muted">Stated: ${esc(ai.condition)}</div>` : ''}
            <div class="sub">Cannot do</div>
            <div class="tags">${p.lim.map((l) => `<span class="tag red">${esc(LIMIT_LABEL(l, p))}</span>`).join('') || (p.limPrivate ? '<span class="tag grey">Chose not to say</span>' : '<span class="small muted">None given</span>')}</div>
            <div class="sub">Existing skills</div>
            <div class="tags">${p.skills.map((s) => `<span class="tag">${esc(SKILL_LABEL(s))}</span>`).join('')}${p.langs.length ? `<span class="tag">${esc(p.langs.map((l) => E('opt.langs.' + l)).join(' and '))}</span>` : ''}${!p.skills.length && !p.langs.length ? '<span class="small muted">None given</span>' : ''}</div>
            ${p.prefs.length ? `<div class="sub">Wants</div><div class="tags">${p.prefs.filter((x) => x !== 'full').map((x) => `<span class="tag grey">${esc(E('opt.pref.' + x))}</span>`).join('')}${p.prefs.includes('full') ? '<span class="tag grey">Full-time</span>' : ''}</div>` : ''}
            ${checks.length ? `<div class="sub">Check with the person</div><ul class="small" style="margin:0;padding-inline-start:18px">${checks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          </div>
          <details class="box"><summary>What the AI read</summary>
            <div class="small" style="white-space:pre-wrap">${esc([c.notes, c.answers.freeText].filter(Boolean).join('\n\n')) || '<span class="muted">No notes. Matched from answers only.</span>'}</div>
            ${answersSummary(c.answers)}
            <div class="row" style="margin-top:10px"><button type="button" class="btn btn-ghost btn-small" id="edit-notes">Edit notes</button><button type="button" class="btn btn-ghost btn-small" id="rerun">Run again</button></div>
            <p class="small muted" style="margin:8px 0 0">${ai.mode === 'claude' ? 'Read by Claude, then health limits applied as hard rules.' : 'Read by the built-in rules reader. Set ANTHROPIC_API_KEY to use Claude.'} ${ai.at ? 'Last run ' + when(ai.at) + '.' : ''}</p>
          </details>
          <div class="scard"><div class="slabel">Contact</div>
            <div class="small">${c.phone ? esc(c.phone) : 'No phone'} · prefers ${esc(c.answers.contact ? E('opt.contact.' + c.answers.contact).toLowerCase() : 'not said')} · ${esc(I.LANGS.find((l) => l.code === c.lang).name)}</div>
            <label class="field small" for="snotes" style="margin-top:10px">Staff notes (not shown to the resident)</label><textarea id="snotes" style="min-height:70px">${esc(c.staffNotes || '')}</textarea>
          </div>
        </aside>

        <section class="stack">
          <div class="mlist" id="mlist">${shown.map((m, i) => matchCard(m, i + 1)).join('') || '<div class="scard">No good matches yet. Try adding more detail to the notes, or look at the other jobs below.</div>'}</div>
          ${more.length ? `<details class="box"><summary>Other jobs that pass the health rules (${more.length})</summary><div class="mlist">${more.map((m) => matchCard(m)).join('')}</div></details>` : ''}
          <details class="box"><summary>Ruled out (${c.excluded.length})</summary>
            ${health.length ? `<div class="sub" style="margin-top:0">By health limits: these are hard rules</div><ul class="small" style="margin:0;padding-inline-start:18px">${health.map((x) => `<li><b>${esc(jobById(x.jobId) ? jobById(x.jobId).title : x.jobId)}</b>, ${esc(jobById(x.jobId) ? jobById(x.jobId).employer : '')}: ${esc(x.why.join(', '))}</li>`).join('')}</ul>` : ''}
            ${other.length ? `<div class="sub">Hours, travel or language don’t fit</div><ul class="small" style="margin:0;padding-inline-start:18px">${other.map((x) => `<li><b>${esc(jobById(x.jobId) ? jobById(x.jobId).title : x.jobId)}</b>: ${esc(x.why.join(', '))}</li>`).join('')}</ul>` : ''}
            ${!c.excluded.length ? '<p class="small muted" style="margin:0">Nothing ruled out.</p>' : ''}
          </details>
          <div class="scard"><div class="slabel">Refer to</div>
            <div class="stack" style="margin-top:6px">${Object.values(meta.services).map((s) => `<label class="check" style="align-items:flex-start"><input type="checkbox" data-sup="${s.id}" ${sup.has(s.id) ? 'checked' : ''}>
              <span><b>${esc(s.name)}</b>${supportReason[s.id] ? ` <span class="pill" style="margin-inline-start:4px">Suggested</span><br><span class="small">${esc(supportReason[s.id])}</span>` : ''}<br><span class="small muted">${esc(s.staff)}</span></span></label>`).join('')}</div>
          </div>
          <div class="scard">
            <div class="slabel">Decision</div>
            <p style="margin:0 0 10px"><b>A person always makes the final decision.</b> Tick the jobs and referrals you have talked through with ${esc(c.name.split(' ')[0])}, add a note in plain words, then approve.</p>
            <label class="field" for="pnote">Note to the resident (they will see this)</label>
            <textarea id="pnote">${esc(c.plan ? c.plan.note : '')}</textarea>
            <div class="row" style="margin-top:12px">
              <button type="button" class="btn btn-primary" id="approve">${c.plan ? 'Update plan' : 'Approve plan'}</button>
              ${c.plan ? `<button type="button" class="btn btn-outline" id="send-text">Send by text</button><a class="btn btn-outline" data-link href="/staff/clients/${c.id}/letter">Print letter</a>` : ''}
              ${c.plan && c.status !== 'inwork' ? '<button type="button" class="btn btn-ghost" id="inwork">Mark as in work</button>' : ''}
            </div>
            ${c.plan ? `<p class="small muted" style="margin:10px 0 0">Approved by ${esc(c.plan.by)}, ${when(c.plan.at)}. Resident can track it with ${esc(c.code)}.</p>` : ''}
            ${steps ? `<div class="sub">Resident’s steps</div><ul class="steps">${steps}</ul>` : ''}
          </div>
          <details class="box"><summary>Activity</summary><ul class="log">${c.log.slice().reverse().map((l) => `<li><span class="muted">${when(l.at)}</span><span><b>${esc(l.by)}</b>: ${esc(l.action)}</span></li>`).join('')}</ul></details>
          <div class="no-print"><button type="button" class="link-btn small" id="del" style="color:var(--red)">Delete this record</button></div>
        </section>
      </div>`;

    main.querySelectorAll('[data-keep]').forEach((cb) => cb.addEventListener('change', () => {
      cb.checked ? keep.add(cb.dataset.keep) : keep.delete(cb.dataset.keep);
      cb.closest('.mcard').classList.toggle('off', !cb.checked);
    }));
    main.querySelectorAll('[data-sup]').forEach((cb) => cb.addEventListener('change', () => { cb.checked ? sup.add(cb.dataset.sup) : sup.delete(cb.dataset.sup); }));
    const patch = async (body, msg) => { const u = await api('/api/staff/clients/' + c.id, { method: 'PATCH', body }); if (msg) toast(msg); drawClient(u); };
    document.getElementById('cat').onchange = (e) => patch({ category: e.target.value }, 'Category updated');
    document.getElementById('snotes').onchange = (e) => api('/api/staff/clients/' + c.id, { method: 'PATCH', body: { staffNotes: e.target.value } }).then(() => toast('Staff notes saved'));
    document.getElementById('edit-sum').onclick = () => {
      const el = document.getElementById('sum');
      el.outerHTML = `<div id="sum-edit"><textarea id="sum-t" style="margin-top:8px">${esc(ai.summary)}</textarea><div class="row" style="margin-top:6px"><button type="button" class="btn btn-primary btn-small" id="sum-save">Save</button></div></div>`;
      document.getElementById('sum-t').focus();
      document.getElementById('sum-save').onclick = () => patch({ summary: document.getElementById('sum-t').value }, 'Summary saved');
    };
    document.getElementById('edit-notes').onclick = (e) => {
      const box = e.target.closest('details');
      box.querySelector('.small').outerHTML = `<textarea id="notes-t" style="min-height:140px">${esc(c.notes || '')}</textarea>`;
      e.target.textContent = 'Save and run again';
      e.target.onclick = () => patch({ notes: document.getElementById('notes-t').value }, 'Notes saved, matches updated');
    };
    document.getElementById('rerun').onclick = async () => { const u = await api(`/api/staff/clients/${c.id}/process`, { body: {} }); toast('Matches updated'); drawClient(u); };
    document.getElementById('approve').onclick = async () => {
      const u = await api(`/api/staff/clients/${c.id}/approve`, { body: { jobs: [...keep], support: [...sup], note: document.getElementById('pnote').value } });
      toast('Plan approved'); drawClient(u);
    };
    const st = document.getElementById('send-text');
    if (st) st.onclick = async () => {
      try { const u = await api(`/api/staff/clients/${c.id}/send`, { body: { via: 'text' } }); toast(`Text sent to ${c.phone} (see Demo tools)`); drawClient(u); }
      catch (e) { toast(e.message); }
    };
    const iw = document.getElementById('inwork');
    if (iw) iw.onclick = async () => { const u = await api(`/api/staff/clients/${c.id}/status`, { body: { status: 'inwork' } }); toast('Marked as in work'); drawClient(u); };
    document.getElementById('del').onclick = async () => {
      if (!confirm(`Delete ${c.name}'s record? This cannot be undone.`)) return;
      await api('/api/staff/clients/' + c.id, { method: 'DELETE' }); nav('/staff/clients');
    };
  }

  function answersSummary(a) {
    const rows = I.QUESTIONS.map((q) => {
      const v = a[q.id]; const list = Array.isArray(v) ? v : v ? [v] : [];
      return list.length ? `<li><b>${esc(E('q.q' + q.n))}</b> ${esc(list.map((o) => E('opt.' + q.id + '.' + o)).join(', '))}</li>` : '';
    }).join('') + ((a.prefs || []).length ? `<li><b>Would like work that is:</b> ${esc(a.prefs.map((x) => E('opt.pref.' + x)).join(', '))}</li>` : '');
    return rows ? `<ul class="small" style="margin:10px 0 0;padding-inline-start:18px">${rows}</ul>` : '';
  }

  // ---------- Letter (printed in the resident's language) ----------
  async function letterView(id) {
    const [c] = await Promise.all([api('/api/staff/clients/' + id), getJobs()]);
    if (!c.plan) { main.innerHTML = `<p>Approve the plan first.</p><p><a data-link href="/staff/clients/${id}">Back</a></p>`; return; }
    const L = c.lang, T = (k, p) => I.t(L, k, p);
    const dir = (I.LANGS.find((l) => l.code === L) || {}).dir || 'ltr';
    const reasonL = (r) => { let x; if (r.x !== undefined) { x = r.lit ? r.x : T(r.x); if (!r.lit && L === 'en' && /^opt\.(enjoy|exp)\./.test(r.x)) x = x.toLowerCase(); } return T('r.' + r.k, { x }); };
    const jobsHtml = c.plan.jobs.map((jid, i) => {
      const j = jobById(jid), m = c.ranked.find((r) => r.jobId === jid) || {};
      if (!j) return '';
      const why = (m.reasons || []).filter((r) => r.k !== 'course').map(reasonL).join(', ');
      return `<li style="margin-bottom:10px"><b>${esc(j.title)}</b>, ${esc(j.employer)} (${esc(T('opt.areas.' + j.area))})<br>${esc(T('ui.why'))} ${esc(why)}${m.course ? `<br>${esc(T('ui.course'))} ${esc(m.course.name)}` : ''}</li>`;
    }).join('');
    const supHtml = c.plan.support.map((s) => `<li><b>${esc(meta.services[s].name)}</b>: ${esc(T('svc.' + s))}</li>`).join('');
    main.innerHTML = `<div class="row no-print" style="justify-content:space-between;margin-bottom:14px"><a data-link href="/staff/clients/${id}">← Back to ${esc(c.name)}</a><button class="btn btn-primary btn-small" id="lp">Print</button></div>
      <article class="letter" dir="${dir}" lang="${L}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><b>RightDoor</b><br><span class="small">Rochdale</span></div><img src="/img/door.svg" alt="" width="48" height="48"></div>
        <p style="margin-top:28px">${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        <h1 style="font-family:inherit;font-size:1.6rem">${esc(T('ui.yourPlan'))}: ${esc(c.name.split(' ')[0])}</h1>
        ${c.plan.note ? `<p>${esc(c.plan.note)}</p><p>— ${esc(c.plan.by)}</p>` : ''}
        <h2 style="font-size:1.2rem">${esc(T('ui.jobsTitle'))}</h2><ol>${jobsHtml}</ol>
        ${supHtml ? `<h2 style="font-size:1.2rem">${esc(T('ui.supportTitle'))}</h2><ul>${supHtml}</ul>` : ''}
        <div style="border:2px dashed #000;padding:12px 16px;margin-top:20px"><b>${esc(T('ui.yourCode'))}: <span dir="ltr">${esc(c.code)}</span></b><br>${esc(T('ui.codeHelp'))}<br>${esc(T('ui.textLine', { number: meta.textNumber }))} · ${esc(T('ui.callLine', { number: meta.phoneLine }))}</div>
      </article>`;
    document.getElementById('lp').onclick = () => { api(`/api/staff/clients/${id}/send`, { body: { via: 'letter' } }).catch(() => {}); window.print(); };
  }

  // ---------- Jobs ----------
  async function jobsView() {
    const list = await getJobs(true);
    const sel = (id, opts, val) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const demand = (j) => [j.liftKg ? `lifts ${j.liftKg} kg` : 'no lifting', `standing: ${j.standing}`, `walking: ${j.walking}`, `noise: ${j.noise}`, j.paperwork === 'heavy' ? 'lots of paperwork' : '', j.early ? 'early starts' : ''].filter(Boolean).join(' · ');
    main.innerHTML = `<div class="row" style="justify-content:space-between"><h1 style="margin:0">Jobs</h1><span class="muted small">${list.length} vacancies · sample data</span></div>
      <p class="muted">What each job needs physically is what the health rules check against. Keep these accurate.</p>
      <details class="box" style="margin-bottom:16px"><summary>Add a job</summary>
        <form id="jf" class="stack">
          <div class="grid3">
            <div><label class="field" for="j-title">Job title</label><input id="j-title" type="text" required></div>
            <div><label class="field" for="j-emp">Employer</label><input id="j-emp" type="text" required></div>
            <div><label class="field" for="j-pay">Pay</label><input id="j-pay" type="text" placeholder="£12.80 an hour"></div>
            <div><label class="field" for="j-area">Area</label>${sel('j-area', Q.areas.opts.filter((a) => a !== 'anywhere').map((a) => [a, E('opt.areas.' + a)]))}</div>
            <div><label class="field" for="j-sector">Field</label>${sel('j-sector', I.SECTORS.map((s) => [s, E('sector.' + s)]))}</div>
            <div><label class="field" for="j-hours">Hours</label>${sel('j-hours', [['part', 'Part-time'], ['full', 'Full-time'], ['either', 'Either']])}</div>
            <div><label class="field" for="j-lift">Heaviest regular lift (kg)</label><input id="j-lift" type="number" min="0" max="50" value="0"></div>
            <div><label class="field" for="j-stand">Standing</label>${sel('j-stand', [['low', 'Mostly sitting'], ['some', 'Some standing'], ['long', 'Long periods']], 'some')}</div>
            <div><label class="field" for="j-walk">Walking</label>${sel('j-walk', [['low', 'Little'], ['some', 'Some'], ['lots', 'Lots or stairs']], 'some')}</div>
            <div><label class="field" for="j-noise">Noise</label>${sel('j-noise', [['quiet', 'Quiet'], ['some', 'Some'], ['busy', 'Busy or noisy']], 'some')}</div>
            <div><label class="field" for="j-paper">Reading and writing</label>${sel('j-paper', [['low', 'Little'], ['some', 'Some'], ['heavy', 'Lots']], 'some')}</div>
            <div><label class="field" for="j-course">Needs a course?</label>${sel('j-course', [['', 'No'], ...Object.values(meta.courses).map((c) => [c.id, c.name])])}</div>
          </div>
          <div class="row">${[['early', 'Early starts'], ['bus', 'On a bus route'], ['home', 'From home'], ['flexible', 'Flexible hours'], ['termTime', 'Term-time'], ['training', 'Training given']].map(([k, l]) => `<label class="check"><input type="checkbox" id="j-${k}" ${k === 'bus' ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <fieldset><legend class="sub">Useful experience</legend><div class="chips">${[...Q.exp.opts.filter((x) => x !== 'none'), 'computers'].map((s) => `<button type="button" class="chip small" data-g="skills" data-v="${s}" aria-pressed="false">${RD.icon.tick}${esc(SKILL_LABEL(s))}</button>`).join('')}</div></fieldset>
          <fieldset><legend class="sub">Suits people who enjoy</legend><div class="chips">${Q.enjoy.opts.map((s) => `<button type="button" class="chip small" data-g="interests" data-v="${s}" aria-pressed="false">${RD.icon.tick}${esc(E('opt.enjoy.' + s))}</button>`).join('')}</div></fieldset>
          <fieldset><legend class="sub">Languages that are a plus</legend><div class="chips">${Q.langs.opts.filter((l) => l !== 'en' && l !== 'other').map((s) => `<button type="button" class="chip small" data-g="langPlus" data-v="${s}" aria-pressed="false">${RD.icon.tick}${esc(E('opt.langs.' + s))}</button>`).join('')}</div></fieldset>
          <div><label class="field" for="j-desc">Short description</label><textarea id="j-desc"></textarea></div>
          <div class="alert hidden" id="jerr" role="alert"></div>
          <div><button class="btn btn-primary" type="submit">Add job</button></div>
        </form></details>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Job</th><th>Area</th><th>Field</th><th>Hours</th><th>What it needs</th><th></th></tr></thead><tbody>
        ${list.map((j) => `<tr><td><b>${esc(j.title)}</b><div class="small muted">${esc(j.employer)}${j.pay ? ' · ' + esc(j.pay) : ''}</div></td><td>${esc(areaName(j.area))}</td><td>${esc(E('sector.' + j.sector))}</td><td>${j.hours === 'either' ? 'Part or full' : j.hours === 'part' ? 'Part-time' : 'Full-time'}${j.termTime ? ', term-time' : ''}</td><td class="small">${esc(demand(j))}</td><td><button type="button" class="link-btn small" data-del="${j.id}" style="color:var(--red)">Remove</button></td></tr>`).join('')}
      </tbody></table></div>`;
    const picks = { skills: new Set(), interests: new Set(), langPlus: new Set() };
    main.querySelectorAll('.chip[data-g]').forEach((b) => b.addEventListener('click', () => {
      const s = picks[b.dataset.g]; s.has(b.dataset.v) ? s.delete(b.dataset.v) : s.add(b.dataset.v); b.setAttribute('aria-pressed', String(s.has(b.dataset.v)));
    }));
    main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Remove this job?')) return;
      await api('/api/staff/jobs/' + b.dataset.del, { method: 'DELETE' }); toast('Job removed'); jobsView();
    }));
    document.getElementById('jf').onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => document.getElementById(id).value, ck = (id) => document.getElementById(id).checked;
      try {
        await api('/api/staff/jobs', { body: { title: v('j-title'), employer: v('j-emp'), pay: v('j-pay'), area: v('j-area'), sector: v('j-sector'), hours: v('j-hours'), liftKg: v('j-lift'), standing: v('j-stand'), walking: v('j-walk'), noise: v('j-noise'), paperwork: v('j-paper'), courseId: v('j-course'),
          early: ck('j-early'), bus: ck('j-bus'), home: ck('j-home'), flexible: ck('j-flexible'), termTime: ck('j-termTime'), training: ck('j-training'), skills: [...picks.skills], interests: [...picks.interests], langPlus: [...picks.langPlus], desc: v('j-desc') } });
        toast('Job added. Run matches again on a client to include it.'); jobsView();
      } catch (ex) { const el = document.getElementById('jerr'); el.textContent = ex.message; el.classList.remove('hidden'); }
    };
  }

  // ---------- Demo tools ----------
  async function demoView() {
    let phone = RD.store.get('rd_demo_phone') || '07700 900777';
    main.innerHTML = `<h1>Demo tools</h1><p class="muted">Try the ways in that don’t need a computer.</p>
      <div class="grid2" style="align-items:start">
        <div class="scard">
          <h2 class="serif">Text line</h2>
          <p class="small">Residents text <b>JOB</b> to ${esc(meta.textNumber)}. This simulator talks to the same endpoint a real SMS provider would call (<code>POST /api/sms</code>, Twilio-style <code>From</code>/<code>Body</code>).</p>
          <label class="field small" for="ph">Pretend phone number</label><input id="ph" type="tel" value="${esc(phone)}" style="max-width:220px;margin-bottom:12px">
          <div class="phone"><div class="phone-top">RightDoor · ${esc(meta.textNumber)}</div><div class="phone-msgs" id="msgs" aria-live="polite"></div>
            <form class="phone-in" id="pf"><label class="sr" for="pm">Message</label><input id="pm" type="text" autocomplete="off" placeholder="Text message"><button type="submit">Send</button></form></div>
          <div class="row" style="margin-top:10px"><button type="button" class="btn btn-ghost btn-small" id="say-job">Send “JOB”</button><button type="button" class="btn btn-ghost btn-small" id="say-stop">Send “STOP”</button></div>
        </div>
        <div class="stack">
          <div class="scard"><h2 class="serif">Phone line</h2>
            <p class="small">Calls to ${esc(meta.phoneLine)} are answered by staff, who go through the check-in on the resident’s behalf with a short script.</p>
            <a class="btn btn-primary btn-small" data-link href="/staff/clients/new?channel=phone">Start a phone check-in</a></div>
          <div class="scard"><h2 class="serif">Paper form</h2>
            <p class="small">Print the check-in sheet for libraries, GP surgeries and the Jobcentre, then type it up here.</p>
            <div class="row">${I.LANGS.map((l) => `<a class="btn btn-outline btn-small" href="/print/form?lang=${l.code}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join('')}</div>
            <p style="margin:12px 0 0"><a class="btn btn-primary btn-small" data-link href="/staff/clients/new?channel=paper">Type up a paper form</a></p></div>
          <div class="scard"><h2 class="serif">AI reader</h2>
            <p class="small" style="margin:0">Now using: <b>${meta.aiMode === 'claude' ? 'Claude (Anthropic API)' : 'built-in rules reader'}</b>. ${meta.aiMode === 'claude' ? '' : 'Start the server with ANTHROPIC_API_KEY set to read notes with Claude.'} Either way, health limits are applied as hard rules in code, and staff approve every plan.</p></div>
          <div class="scard"><h2 class="serif">Texts sent by staff</h2><div id="outbox" class="small muted">None yet.</div></div>
          <div class="scard"><h2 class="serif">Reset</h2><p class="small">Put the demo clients and jobs back to how they started.</p><button type="button" class="btn btn-outline btn-small" id="reset">Reset demo data</button></div>
        </div>
      </div>`;
    const msgs = document.getElementById('msgs');
    async function loadThread() {
      const t = await api('/api/staff/sms?from=' + encodeURIComponent(phone.replace(/[^\d+ ]/g, '').trim()));
      const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
      msgs.innerHTML = t.length ? t.map((m) => `<div class="bubble ${m.dir}">${esc(m.text)}</div>`).join('') : '<p class="small" style="text-align:center;color:#666">Send JOB to start.</p>';
      if (atBottom || t.length < 4) msgs.scrollTop = msgs.scrollHeight;
    }
    async function sendMsg(text) {
      if (!text.trim()) return;
      msgs.insertAdjacentHTML('beforeend', `<div class="bubble in">${esc(text)}</div>`); msgs.scrollTop = msgs.scrollHeight;
      await RD.api('/api/sms', { body: { from: phone, body: text } });
      await loadThread(); msgs.scrollTop = msgs.scrollHeight;
    }
    document.getElementById('ph').onchange = (e) => { phone = e.target.value; RD.store.set('rd_demo_phone', phone); loadThread(); };
    document.getElementById('pf').onsubmit = (e) => { e.preventDefault(); const i = document.getElementById('pm'); const v = i.value; i.value = ''; sendMsg(v); };
    document.getElementById('say-job').onclick = () => sendMsg('JOB');
    document.getElementById('say-stop').onclick = () => sendMsg('STOP');
    document.getElementById('reset').onclick = async () => { if (!confirm('Reset all demo data?')) return; await api('/api/staff/reset', { body: {} }); jobs = null; toast('Demo data reset'); demoView(); };
    const ob = await api('/api/staff/outbox');
    if (ob.length) document.getElementById('outbox').innerHTML = `<ul style="padding-inline-start:18px;margin:0">${ob.slice(0, 6).map((o) => `<li><b>${esc(o.to)}</b> · ${when(o.at)}<br>${esc(o.text)}</li>`).join('')}</ul><p class="small">Put a number above to see the text arrive on the phone.</p>`;
    await loadThread();
    smsTimer = setInterval(() => { if (document.visibilityState === 'visible') loadThread().catch(() => {}); }, 5000);
  }

  route();
})();
