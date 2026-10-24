// Matching engine. Health limits are hard rules applied in code, never left to the AI.
const { COURSES } = require('./data');
const I18N = require('../public/js/i18n-data.js');

const uniq = (a) => [...new Set((a || []).filter(Boolean))];

// Each rule returns a reason the job is ruled out, or null.
const HEALTH_RULES = {
  lifting: (j, p) => (j.liftKg > (p.liftMax == null ? 5 : p.liftMax) ? `Lifting up to ${j.liftKg} kg` : null),
  standing: (j) => (j.standing === 'long' ? 'Long periods of standing' : null),
  walking: (j) => (j.walking === 'lots' ? 'Lots of walking' : null),
  noise: (j) => (j.noise === 'busy' ? 'Busy or noisy workplace' : null),
  reading: (j) => (j.paperwork === 'heavy' ? 'Lots of reading and writing' : null),
  early: (j) => (j.early ? 'Early starts' : null)
};

function buildProfile(answers = {}, extracted = {}) {
  const a = answers || {}, e = extracted || {};
  const merge = (k) => uniq([...(a[k] || []), ...(e[k] || [])]);
  const p = {
    enjoy: merge('enjoy'),
    exp: merge('exp').filter((x) => x !== 'none'),
    noExp: (a.exp || []).includes('none'),
    lim: merge('lim').filter((x) => x !== 'private'),
    limPrivate: (a.lim || []).includes('private'),
    hours: a.hours || e.hours || '',
    times: merge('times'), travel: merge('travel'), areas: merge('areas'),
    langs: merge('langs'), helps: merge('helps'), prefs: merge('prefs'),
    liftMax: e.liftMax != null ? e.liftMax : (a.liftMax != null ? a.liftMax : null),
    skillsExtra: uniq(e.skillsExtra || [])
  };
  if (e.hours === 'part' && !a.hours) p.hours = 'part';
  if (['upto16', 'h16to30', 'part'].includes(p.hours)) p.prefs.push('part');
  if (p.hours === 'full') p.prefs.push('full');
  if (p.times.includes('school')) p.prefs.push('term');
  if (p.times.includes('anytime')) p.prefs.push('flexible');
  if (p.travel.includes('bus')) p.prefs.push('bus');
  if (p.travel.includes('home')) p.prefs.push('home');
  if (p.helps.includes('calm') || p.lim.includes('noise')) p.prefs.push('calm');
  if (p.lim.includes('standing')) p.prefs.push('seated');
  p.prefs = uniq(p.prefs);
  if (p.lim.includes('lifting') && p.liftMax == null) p.liftMax = 5;
  p.skills = uniq([...p.exp, ...p.skillsExtra, ...(p.enjoy.includes('computers') ? ['computers'] : [])]);
  p.answered = ['enjoy', 'exp', 'lim', 'times', 'travel', 'areas', 'langs', 'helps', 'prefs'].filter((k) => p[k].length).length
    + (p.hours ? 1 : 0) + (p.limPrivate ? 1 : 0) + (p.noExp ? 1 : 0);
  return p;
}

const skillKey = (s) => (s === 'computers' ? 'opt.enjoy.computers' : 'opt.exp.' + s);

function ruleOut(job, p) {
  const why = [];
  for (const lim of p.lim) {
    const rule = HEALTH_RULES[lim];
    const r = rule && rule(job, p);
    if (r) why.push(r);
  }
  const health = why.length > 0;
  if (p.prefs.includes('part') && !p.prefs.includes('full') && job.hours === 'full') why.push('Full-time only');
  if (p.travel.length && p.travel.every((t) => t === 'home') && !job.home) why.push('Not home-based');
  if (job.needsSecondLanguage && !p.langs.some((l) => l !== 'en')) why.push('Needs a second language');
  return why.length ? { why, health } : null;
}

function scoreJob(job, p) {
  let s = 0;
  const reasons = [];
  const unsureWhy = [];
  const add = (k, x, lit) => reasons.push(x === undefined ? { k } : { k, x, lit: !!lit });

  const sk = job.skills.filter((x) => p.skills.includes(x));
  if (sk.length) { s += 4 + (sk.length > 1 ? 3 : 0); add('skill', skillKey(sk[0])); }
  const ints = job.interests.filter((x) => p.enjoy.includes(x));
  if (ints.length) { s += 2 + (ints.length > 1 ? 1 : 0); add('enjoy', 'opt.enjoy.' + ints[0]); }
  const langs = job.langPlus.filter((l) => l !== 'en' && p.langs.includes(l));
  if (langs.length) { s += 3; add('lang', 'opt.langs.' + langs[0]); }
  if (p.prefs.includes('part') && job.hours !== 'full') { s += 2; add('part'); }
  if (p.prefs.includes('full') && job.hours !== 'part') { s += 1; add('full'); }
  if (p.prefs.includes('calm') && job.noise === 'quiet') { s += 2; add('quiet'); }
  if (p.prefs.includes('seated') && job.standing === 'low') { s += 2; add('seated'); }
  if (p.lim.includes('lifting') && job.liftKg === 0) { s += 1; add('nolift'); }
  if (p.prefs.includes('term') && job.termTime) { s += 2; add('term'); }
  if (p.prefs.includes('flexible') && job.flexible) { s += 1; add('flex'); }
  if (p.prefs.includes('home') && job.home) { s += 3; add('home'); }
  if (p.areas.includes(job.area)) { s += 2; add('area', 'opt.areas.' + job.area); }
  else if (p.areas.length && !p.areas.includes('anywhere') && !job.home) s -= 1;
  if (p.prefs.includes('bus') && job.bus) { s += 1; add('bus'); }

  let course = null;
  if (job.requires) {
    if (job.requires.courseId) {
      course = COURSES[job.requires.courseId];
      s -= 1;
      add('course', job.requires.label, true);
    } else if (!p.skills.includes('driver') && !p.travel.includes('car')) {
      s -= 3;
      unsureWhy.push(`Needs ${job.requires.label}: check`);
    }
  }
  if (job.training && !sk.length) { s += 1; add('noexp'); }
  if (!sk.length && !ints.length) s -= 2;

  if (s < 5) unsureWhy.push('Weak fit');
  if (p.answered < 3) unsureWhy.push('Few answers to go on');
  if (p.limPrivate) unsureWhy.push('Health needs not shared');
  return { jobId: job.id, score: s, reasons: reasons.slice(0, 4), course, unsure: unsureWhy.length > 0, unsureWhy };
}

function jobTags(job, p) {
  const all = [];
  const push = (k, rel) => all.push({ k, rel });
  if (job.liftKg === 0) push('nolift', p.lim.includes('lifting'));
  else if (job.liftKg <= 5) push('light', p.lim.includes('lifting'));
  if (job.hours === 'part') push('part', p.prefs.includes('part'));
  if (job.hours === 'full') push('full', p.prefs.includes('full'));
  if (job.noise === 'quiet') push('quiet', p.prefs.includes('calm'));
  if (job.standing === 'low') push('seated', p.prefs.includes('seated'));
  if (job.termTime) push('term', p.prefs.includes('term'));
  if (job.bus) push('bus', p.prefs.includes('bus'));
  if (job.home) push('home', p.prefs.includes('home'));
  if (job.flexible) push('flex', p.prefs.includes('flexible'));
  if (job.training) push('train', p.noExp);
  const lang = job.langPlus.find((l) => l !== 'en' && p.langs.includes(l));
  if (lang) all.push({ k: 'lang', x: 'opt.langs.' + lang, rel: true });
  all.sort((a, b) => (b.rel ? 1 : 0) - (a.rel ? 1 : 0));
  return all.slice(0, 3).map(({ k, x }) => (x ? { k, x } : { k }));
}

function routeSupport(p, ctx = {}) {
  const out = [];
  const add = (id, reason) => { if (!out.find((o) => o.id === id)) out.push({ id, reason }); };
  const cat = ctx.category || 'not stated';
  const hasHealth = p.lim.length > 0 || p.limPrivate || (cat !== 'not stated' && cat !== '');
  if (hasHealth) add('workwell', 'Health affects work: health and work coach');
  if (['mental health', 'long-term condition', 'more than one'].includes(cat) || p.lim.length >= 2) add('workingwell', 'More than one need: longer-term support');
  if (p.helps.includes('confidence') || p.helps.includes('mentor') || cat === 'mental health') add('livewell', 'Wants help with confidence or wellbeing');
  if (p.helps.includes('course') || p.helps.includes('employers') || p.noExp || ctx.needsCourse) add('hubs', ctx.needsCourse ? 'A matched job needs a course' : 'Wants training or help applying');
  if (p.helps.includes('computers') || ['text', 'phone', 'paper', 'skip'].includes(ctx.channel)) add('digitech', p.helps.includes('computers') ? 'Asked for help with computers' : 'Came in without a computer: offer a laptop or data loan');
  if (p.helps.includes('adjust')) add('accesswork', 'Asked for changes at work');
  if (!out.length) add('jobcentre', 'General job search help');
  return out.slice(0, 4);
}

// Main entry: returns top 3 matches, every ruled-out job (with why), fields and support.
function match(profile, jobs, ctx = {}) {
  const eligible = [], excluded = [];
  for (const job of jobs) {
    const out = ruleOut(job, profile);
    if (out) excluded.push({ jobId: job.id, why: out.why, health: out.health });
    else eligible.push({ job, ...scoreJob(job, profile), tags: jobTags(job, profile) });
  }
  eligible.sort((a, b) => b.score - a.score);
  const strip = ({ job, ...rest }) => rest;
  const ranked = eligible.map(strip);
  const matches = ranked.filter((m) => m.score >= 3).slice(0, 3);

  const bySector = {};
  for (const m of eligible) {
    if (m.score < 2) continue;
    (bySector[m.job.sector] = bySector[m.job.sector] || []).push(m);
  }
  const fields = Object.entries(bySector)
    .map(([sector, list]) => ({ sector, count: list.length, score: list[0].score + 0.5 * (list.length - 1), jobs: list.map((m) => m.jobId), reasons: list[0].reasons.slice(0, 3) }))
    .sort((a, b) => b.score - a.score).slice(0, 3);

  const needsCourse = matches.some((m) => m.course);
  const support = routeSupport(profile, { ...ctx, needsCourse });
  return { matches, ranked, excluded, fields, support, noMatch: matches.length === 0 };
}

// English text for staff screens and SMS.
function reasonText(r, lang = 'en') {
  let x;
  if (r.x !== undefined) {
    x = r.lit ? r.x : I18N.t(lang, r.x);
    if (!r.lit && lang === 'en' && /^opt\.(enjoy|exp)\./.test(r.x)) x = x.toLowerCase();
  }
  return I18N.t(lang, 'r.' + r.k, { x });
}

module.exports = { buildProfile, match, reasonText, jobTags, HEALTH_RULES };
