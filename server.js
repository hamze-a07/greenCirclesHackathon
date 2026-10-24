// RightDoor — local server. No dependencies: run `node server.js`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const svc = require('./lib/service');
const sms = require('./lib/sms');
const { buildProfile, match, reasonText } = require('./lib/match');
const { extract, aiMode, CATEGORIES } = require('./lib/extract');
const { SERVICES, STAFF, COURSES } = require('./lib/data');
const I18N = require('./public/js/i18n-data.js');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const STAFF_PIN = process.env.STAFF_PIN || '1234';
const TEXT_NUMBER = process.env.TEXT_NUMBER || '07700 900123';
const PHONE_LINE = process.env.PHONE_LINE || '0161 496 0123';
const PUBLIC = path.join(__dirname, 'public');

const sessions = new Map(); // token -> staff

const PAGES = [
  [/^\/$/, 'index.html'],
  [/^\/app\/discover\/?$/, 'discover.html'],
  [/^\/app\/check-in\/?$/, 'checkin.html'],
  [/^\/app\/track(\/[A-Z0-9-]+)?\/?$/i, 'track.html'],
  [/^\/staff(\/.*)?$/, 'staff.html'],
  [/^\/print\/form\/?$/, 'print.html']
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store', ...extra });
  res.end(data);
}
const json = (res, status, obj, extra) => send(res, status, obj, undefined, extra);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = req.headers['content-type'] || '';
      try {
        if (!raw) return resolve({});
        if (ct.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(raw)));
        resolve(JSON.parse(raw));
      } catch { reject(new Error('Bad request body')); }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
const staffOf = (req) => sessions.get(cookies(req).rd_staff) || null;

function serveStatic(req, res, pathname) {
  let file = null;
  for (const [re, f] of PAGES) if (re.test(pathname)) { file = f; break; }
  const target = path.normalize(path.join(PUBLIC, file || decodeURIComponent(pathname)));
  if (!target.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(target, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, TYPES[path.extname(target)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  });
}

const jobsById = () => Object.fromEntries(store.get().jobs.map((j) => [j.id, j]));
const findClient = (id) => store.get().clients.find((c) => c.id === id);
const findByCode = (code) => store.get().clients.find((c) => c.code === String(code || '').toUpperCase().trim());

function staffClientSummary(c) {
  const top = c.matches && c.matches[0];
  const j = top && jobsById()[top.jobId];
  return { id: c.id, code: c.code, name: c.name, age: c.age, area: c.area, channel: c.channel, lang: c.lang, status: c.status, createdAt: c.createdAt,
    topMatch: j ? `${j.title} · ${j.employer}` : null, category: c.ai && c.ai.category, unsure: (c.matches || []).some((m) => m.unsure),
    stepsDone: (c.steps || []).filter((s) => s.done).length, steps: (c.steps || []).length };
}

function residentResult(result) {
  const byId = jobsById();
  const job = (m) => { const j = byId[m.jobId]; return { id: j.id, title: j.title, employer: j.employer, area: j.area, pay: j.pay, desc: j.desc, sector: j.sector, reasons: m.reasons, tags: m.tags, course: m.course, unsure: m.unsure }; };
  const ranked = result.ranked.filter((m) => m.score >= 2);
  return {
    fields: result.fields.map((f) => ({ ...f, jobs: f.jobs.slice(0, 4).map((id) => job(ranked.find((m) => m.jobId === id))) })),
    jobs: result.matches.map(job),
    support: result.support.map((s) => ({ id: s.id, name: SERVICES[s.id].name })),
    noMatch: result.noMatch
  };
}

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const db = store.get();

  if (p === '/api/meta' && m === 'GET') {
    return json(res, 200, { textNumber: TEXT_NUMBER, phoneLine: PHONE_LINE, aiMode: aiMode(), jobCount: db.jobs.length, services: SERVICES, courses: COURSES, staff: STAFF.map((s) => s.name), categories: CATEGORIES });
  }

  // ---------- Resident ----------
  if (p === '/api/match' && m === 'POST') {
    const body = await readBody(req);
    const answers = svc.cleanAnswers(body.answers);
    const ex = await extract(answers.freeText || '');
    const profile = buildProfile(answers, ex);
    return json(res, 200, residentResult(match(profile, db.jobs, { category: ex.category, channel: 'web' })));
  }
  if (p === '/api/checkins' && m === 'POST') {
    const body = await readBody(req);
    if (!body.consent) return json(res, 400, { error: 'consent' });
    const client = svc.createClient(db, { ...body, channel: body.channel === 'skip' ? 'skip' : 'web' });
    await svc.processClient(client, db.jobs);
    store.save();
    return json(res, 201, { code: client.code, ...residentResult({ matches: client.matches, ranked: client.ranked, fields: client.fields, support: client.support, noMatch: !client.matches.length }) });
  }
  let r = p.match(/^\/api\/track\/([A-Za-z0-9-]+)$/);
  if (r && m === 'GET') {
    const c = findByCode(r[1]);
    if (!c) return json(res, 404, { error: 'not_found' });
    return json(res, 200, svc.publicView(c, jobsById(), SERVICES));
  }
  r = p.match(/^\/api\/track\/([A-Za-z0-9-]+)\/steps\/(\d+)$/);
  if (r && m === 'POST') {
    const c = findByCode(r[1]);
    if (!c || !c.steps[+r[2]]) return json(res, 404, { error: 'not_found' });
    const body = await readBody(req);
    c.steps[+r[2]].done = !!body.done;
    c.log.push({ at: svc.now(), by: 'Resident', action: `${body.done ? 'Ticked' : 'Unticked'} a step` });
    store.save();
    return json(res, 200, svc.publicView(c, jobsById(), SERVICES));
  }

  // ---------- Text line (public webhook) ----------
  if (p === '/api/sms' && m === 'POST') {
    const body = await readBody(req);
    const replies = await sms.handle(db, body.From || body.from, body.Body || body.body);
    store.save();
    if (body.From) {
      const esc = (s) => s.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
      return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><Response>${replies.map((t) => `<Message>${esc(t)}</Message>`).join('')}</Response>`, 'text/xml; charset=utf-8');
    }
    return json(res, 200, { replies });
  }

  // ---------- Staff ----------
  if (p === '/api/staff/login' && m === 'POST') {
    const body = await readBody(req);
    const staff = STAFF.find((s) => s.id === body.id);
    const ok = staff && typeof body.pin === 'string' && body.pin.length === STAFF_PIN.length && crypto.timingSafeEqual(Buffer.from(body.pin), Buffer.from(STAFF_PIN));
    if (!ok) return json(res, 401, { error: 'Wrong name or PIN' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, staff);
    return json(res, 200, { staff }, { 'Set-Cookie': `rd_staff=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200` });
  }
  if (p === '/api/staff/logout' && m === 'POST') {
    sessions.delete(cookies(req).rd_staff);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'rd_staff=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (p === '/api/staff/options' && m === 'GET') return json(res, 200, { staff: STAFF, pinHint: STAFF_PIN === '1234' ? 'Demo PIN: 1234' : '' });

  if (p.startsWith('/api/staff/')) {
    const staff = staffOf(req);
    if (!staff) return json(res, 401, { error: 'login' });

    if (p === '/api/staff/me' && m === 'GET') return json(res, 200, { staff, aiMode: aiMode() });
    if (p === '/api/staff/clients' && m === 'GET') return json(res, 200, db.clients.map(staffClientSummary));
    if (p === '/api/staff/clients' && m === 'POST') {
      const body = await readBody(req);
      if (!body.consent) return json(res, 400, { error: 'The resident needs to agree before you save their details.' });
      const client = svc.createClient(db, { ...body, by: staff.name });
      await svc.processClient(client, db.jobs);
      store.save();
      return json(res, 201, client);
    }
    r = p.match(/^\/api\/staff\/clients\/([a-f0-9]+)(\/[a-z]+)?$/);
    if (r) {
      const c = findClient(r[1]);
      if (!c) return json(res, 404, { error: 'not_found' });
      const action = r[2];
      if (!action && m === 'GET') return json(res, 200, c);
      if (!action && m === 'PATCH') {
        const body = await readBody(req);
        if (typeof body.summary === 'string') { c.ai.summary = body.summary.slice(0, 600); c.log.push({ at: svc.now(), by: staff.name, action: 'Edited the summary' }); }
        if (CATEGORIES.includes(body.category)) { c.ai.category = body.category; c.categoryOverride = body.category; c.log.push({ at: svc.now(), by: staff.name, action: `Set category: ${body.category}` }); }
        if (typeof body.staffNotes === 'string') c.staffNotes = body.staffNotes.slice(0, 3000);
        if (typeof body.notes === 'string') { c.notes = body.notes.slice(0, 6000); c.log.push({ at: svc.now(), by: staff.name, action: 'Updated the notes' }); }
        if (body.answers) c.answers = svc.cleanAnswers({ ...c.answers, ...body.answers });
        if (body.notes !== undefined || body.answers || body.category) await svc.processClient(c, db.jobs);
        store.save();
        return json(res, 200, c);
      }
      if (action === '/process' && m === 'POST') { await svc.processClient(c, db.jobs); store.save(); return json(res, 200, c); }
      if (action === '/approve' && m === 'POST') { svc.approve(c, await readBody(req), staff); store.save(); return json(res, 200, c); }
      if (action === '/status' && m === 'POST') {
        const body = await readBody(req);
        if (['processed', 'approved', 'inwork'].includes(body.status)) { c.status = body.status; c.log.push({ at: svc.now(), by: staff.name, action: `Status: ${body.status}` }); }
        store.save(); return json(res, 200, c);
      }
      if (action === '/send' && m === 'POST') {
        const body = await readBody(req);
        if (!c.plan) return json(res, 400, { error: 'Approve the plan first.' });
        const t = (k, prm) => I18N.t(c.lang, k, prm);
        const byId = jobsById();
        if (body.via === 'text') {
          if (!c.phone) return json(res, 400, { error: 'No phone number on file.' });
          const jobs = c.plan.jobs.map((id) => byId[id] && `${byId[id].title} (${byId[id].employer})`).filter(Boolean).join(', ');
          const support = c.plan.support.map((id) => SERVICES[id] && SERVICES[id].name).filter(Boolean).join(', ');
          const text = `RightDoor: ${t('ui.st_approved')}. ${jobs}${support ? ' · ' + support : ''}. ${t('ui.yourCode')}: ${c.code}. ${c.plan.note || ''}`.trim();
          sms.sendTo(db, c.phone, text);
          db.outbox.unshift({ at: svc.now(), to: c.phone, clientId: c.id, via: 'text', text });
        }
        c.sent.push({ at: svc.now(), via: body.via === 'text' ? 'text' : 'letter', by: staff.name });
        c.log.push({ at: svc.now(), by: staff.name, action: body.via === 'text' ? 'Sent the plan by text' : 'Printed the plan as a letter' });
        store.save(); return json(res, 200, c);
      }
      if (!action && m === 'DELETE') {
        db.clients.splice(db.clients.indexOf(c), 1); store.save(); return json(res, 200, { ok: true });
      }
    }
    if (p === '/api/staff/jobs' && m === 'GET') return json(res, 200, db.jobs);
    if (p === '/api/staff/jobs' && m === 'POST') {
      const b = await readBody(req);
      const str = (v, n = 80) => String(v || '').slice(0, n).trim();
      const arr = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);
      const q = Object.fromEntries(I18N.QUESTIONS.map((x) => [x.id, x.opts]));
      if (!str(b.title) || !str(b.employer)) return json(res, 400, { error: 'Title and employer are needed.' });
      const job = {
        id: 'j-' + svc.newId(), title: str(b.title), employer: str(b.employer), area: q.areas.includes(b.area) ? b.area : 'rochdale',
        sector: I18N.SECTORS.includes(b.sector) ? b.sector : 'office', hours: ['part', 'full', 'either'].includes(b.hours) ? b.hours : 'part', pay: str(b.pay, 40),
        liftKg: Math.max(0, Math.min(50, +b.liftKg || 0)), standing: ['low', 'some', 'long'].includes(b.standing) ? b.standing : 'some',
        walking: ['low', 'some', 'lots'].includes(b.walking) ? b.walking : 'some', noise: ['quiet', 'some', 'busy'].includes(b.noise) ? b.noise : 'some',
        paperwork: ['low', 'some', 'heavy'].includes(b.paperwork) ? b.paperwork : 'some', early: !!b.early, bus: !!b.bus, home: !!b.home, flexible: !!b.flexible,
        termTime: !!b.termTime, training: !!b.training, skills: arr(b.skills, [...q.exp, 'computers']), interests: arr(b.interests, q.enjoy), langPlus: arr(b.langPlus, q.langs),
        desc: str(b.desc, 300), addedBy: staff.name
      };
      if (b.courseId && COURSES[b.courseId]) job.requires = { label: COURSES[b.courseId].name, courseId: b.courseId };
      db.jobs.unshift(job); store.save();
      return json(res, 201, job);
    }
    r = p.match(/^\/api\/staff\/jobs\/([a-z0-9-]+)$/);
    if (r && m === 'DELETE') {
      const i = db.jobs.findIndex((j) => j.id === r[1]);
      if (i < 0) return json(res, 404, { error: 'not_found' });
      db.jobs.splice(i, 1); store.save(); return json(res, 200, { ok: true });
    }
    if (p === '/api/staff/sms' && m === 'GET') {
      const from = url.searchParams.get('from');
      if (from) return json(res, 200, db.sms[from] || []);
      return json(res, 200, Object.entries(db.sms).map(([k, v]) => ({ from: k, last: v[v.length - 1], count: v.length })));
    }
    if (p === '/api/staff/outbox' && m === 'GET') return json(res, 200, db.outbox);
    if (p === '/api/staff/reset' && m === 'POST') { await store.reset(); return json(res, 200, { ok: true }); }
    if (p === '/api/staff/explain' && m === 'POST') {
      // English reason text for a reason list (used by the staff screens)
      const b = await readBody(req);
      return json(res, 200, (b.reasons || []).map((x) => reasonText(x)));
    }
  }
  return json(res, 404, { error: 'not_found' });
}

async function main() {
  await store.load();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method) && url.pathname !== '/api/sms') {
          // Same-origin check for browser requests
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-site request blocked' });
        }
        return await api(req, res, url);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      console.error(err);
      json(res, err.message === 'Bad request body' ? 400 : 500, { error: err.message || 'Server error' });
    }
  });
  server.listen(PORT, HOST, () => {
    console.log(`\n  RightDoor is running at http://localhost:${PORT}\n`);
    console.log(`  Residents:  http://localhost:${PORT}/`);
    console.log(`  Staff:      http://localhost:${PORT}/staff   (PIN ${STAFF_PIN === '1234' ? '1234' : 'set by STAFF_PIN'})`);
    console.log(`  AI:         ${aiMode() === 'claude' ? 'Claude API (ANTHROPIC_API_KEY found)' : 'built-in rules (set ANTHROPIC_API_KEY to use Claude)'}`);
    console.log(`  Data file:  ${store.FILE}\n`);
  });
  const stop = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

main();
