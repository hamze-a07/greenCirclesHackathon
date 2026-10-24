// Client records: create, process (AI read + hard-rule matching), approve.
const crypto = require('crypto');
const { extract } = require('./extract');
const { buildProfile, match } = require('./match');
const { COURSES } = require('./data');

const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';
function newCode(existing) {
  let code;
  do {
    code = 'RD-' + Array.from(crypto.randomBytes(4), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  } while (existing.has(code));
  return code;
}
const newId = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();

function cleanAnswers(a = {}) {
  const out = {};
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : []);
  for (const k of ['enjoy', 'exp', 'lim', 'times', 'travel', 'areas', 'langs', 'helps', 'prefs']) out[k] = arr(a[k]);
  out.hours = typeof a.hours === 'string' ? a.hours : '';
  out.contact = typeof a.contact === 'string' ? a.contact : '';
  out.freeText = typeof a.freeText === 'string' ? a.freeText.slice(0, 2000) : '';
  return out;
}

async function processClient(client, jobs) {
  const text = [client.notes, client.answers && client.answers.freeText].filter(Boolean).join('\n');
  const ex = await extract(text);
  const profile = buildProfile(client.answers, ex);
  const result = match(profile, jobs, { category: ex.category, channel: client.channel });
  client.ai = {
    mode: ex.mode, at: now(), summary: ex.summary, condition: ex.condition, category: client.categoryOverride || ex.category,
    uncertain: ex.uncertain || []
  };
  if (!text.trim()) client.ai.summary = summaryFromAnswers(profile);
  if (!client.age && ex.age) client.age = ex.age;
  if (!client.area && profile.areas.length) client.area = profile.areas.find((a) => a !== 'anywhere') || '';
  client.profile = profile;
  client.matches = result.matches;
  client.ranked = result.ranked;
  client.excluded = result.excluded;
  client.fields = result.fields;
  client.support = result.support;
  if (client.status === 'new') client.status = 'processed';
  client.log.push({ at: now(), by: ex.mode === 'claude' ? 'AI (Claude)' : 'AI (built-in rules)', action: 'Read the answers and suggested matches' });
  return client;
}

function summaryFromAnswers(p) {
  const I18N = require('../public/js/i18n-data.js');
  const en = (k) => I18N.t('en', k);
  const bits = [];
  if (p.lim.length) bits.push('Finds these harder: ' + p.lim.map((l) => en('opt.lim.' + l).toLowerCase()).join(', ') + '.');
  if (p.limPrivate) bits.push('Chose not to share health needs.');
  if (p.prefs.includes('part')) bits.push('Wants part-time work.');
  if (p.exp.length) bits.push('Experience: ' + p.exp.map((e) => en('opt.exp.' + e).toLowerCase()).join(', ') + '.');
  if (p.langs.length) bits.push('Speaks ' + p.langs.map((l) => en('opt.langs.' + l)).join(' and ') + '.');
  return bits.join(' ') || 'Few answers given yet.';
}

function createClient(db, input) {
  const codes = new Set(db.clients.map((c) => c.code));
  const client = {
    id: newId(), code: newCode(codes), createdAt: now(), status: 'new',
    name: String(input.name || '').slice(0, 60).trim() || 'Resident',
    age: Number.isFinite(+input.age) && +input.age > 0 ? +input.age : null,
    area: typeof input.area === 'string' ? input.area : '',
    phone: String(input.phone || '').slice(0, 30),
    lang: ['en', 'ur', 'bn', 'pl', 'ar'].includes(input.lang) ? input.lang : 'en',
    channel: ['web', 'person', 'phone', 'paper', 'text', 'skip'].includes(input.channel) ? input.channel : 'web',
    consent: !!input.consent,
    notes: String(input.notes || '').slice(0, 6000),
    answers: cleanAnswers(input.answers),
    staffNotes: '', plan: null, steps: [], log: [], sent: []
  };
  client.log.push({ at: now(), by: input.by || 'Resident', action: `Checked in (${client.channel})` });
  db.clients.unshift(client);
  return client;
}

function approve(client, { jobs = [], support = [], note = '' }, staff) {
  const jobIds = jobs.filter((id) => (client.ranked || []).some((m) => m.jobId === id)).slice(0, 5);
  const supportIds = support.filter((s) => typeof s === 'string').slice(0, 6);
  client.plan = { jobs: jobIds, support: supportIds, note: String(note || '').slice(0, 1000), by: staff.name, at: now() };
  const steps = [];
  for (const s of supportIds) steps.push({ type: 'support', id: s, done: false });
  for (const j of jobIds) steps.push({ type: 'job', id: j, done: false });
  const courses = new Set();
  for (const j of jobIds) {
    const m = client.ranked.find((r) => r.jobId === j);
    if (m && m.course && !courses.has(m.course.id)) { courses.add(m.course.id); steps.push({ type: 'course', id: m.course.id, done: false }); }
  }
  // Keep "done" ticks from an earlier version of the plan.
  for (const st of steps) {
    const old = (client.steps || []).find((o) => o.type === st.type && o.id === st.id);
    if (old) st.done = old.done;
  }
  client.steps = steps;
  client.status = client.status === 'inwork' ? 'inwork' : 'approved';
  client.log.push({ at: now(), by: staff.name, action: `Approved plan: ${jobIds.length} job(s), ${supportIds.length} referral(s)` });
  return client;
}

function publicView(client, jobsById, services) {
  const plan = client.plan && {
    note: client.plan.note, by: client.plan.by, at: client.plan.at,
    jobs: client.plan.jobs.map((id) => {
      const j = jobsById[id];
      const m = (client.ranked || []).find((r) => r.jobId === id) || {};
      return j && { id, title: j.title, employer: j.employer, area: j.area, pay: j.pay, desc: j.desc, reasons: m.reasons || [], tags: m.tags || [], course: m.course || null };
    }).filter(Boolean),
    support: client.plan.support.map((id) => services[id] && { id, name: services[id].name }).filter(Boolean)
  };
  const steps = (client.steps || []).map((s, i) => ({
    i, type: s.type, id: s.id, done: s.done,
    label: s.type === 'job' ? (jobsById[s.id] ? `${jobsById[s.id].title}, ${jobsById[s.id].employer}` : s.id)
      : s.type === 'course' ? (COURSES[s.id] ? COURSES[s.id].name : s.id)
        : (services[s.id] ? services[s.id].name : s.id)
  }));
  return { code: client.code, name: client.name.split(' ')[0], status: client.status, lang: client.lang, createdAt: client.createdAt, plan, steps };
}

module.exports = { createClient, processClient, approve, publicView, cleanAnswers, newId, now };
