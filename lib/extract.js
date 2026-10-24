// Reads free-text notes and turns them into a structured profile and a short summary.
// Uses Claude when ANTHROPIC_API_KEY is set; otherwise (or if the call fails) a
// built-in rules reader. Either way, the output is limited to known option ids,
// and health limits are then applied as hard rules by match.js.
const I18N = require('../public/js/i18n-data.js');

const ALLOWED = {};
for (const q of I18N.QUESTIONS) ALLOWED[q.id] = q.opts;
const CATEGORIES = ['physical health', 'mental health', 'long-term condition', 'neurodivergence or learning disability', 'sensory', 'more than one', 'not stated'];

const NUMWORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
const NEG = /(can'?t|cannot|can not|unable|struggl|difficult|hard to|avoid|no |not |pain|limit|without|shouldn'?t|mustn'?t|stop)/;

function negated(text, re) {
  const g = new RegExp(re.source, 'gi');
  let m;
  while ((m = g.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const sentenceStart = before.lastIndexOf('.');
    if (NEG.test(sentenceStart >= 0 ? before.slice(sentenceStart) : before)) return true;
  }
  return false;
}
const has = (text, re) => re.test(text);

const CONDITIONS = [
  ['physical health', /lower back|back (injury|pain|problem)|hurt (his|her|their|my) back/i, (t) => (/injur|hurt/i.test(t) ? 'Lower back injury' : 'Back pain')],
  ['physical health', /arthritis/i, () => 'Arthritis'],
  ['physical health', /\bknee/i, () => 'Knee problems'],
  ['physical health', /\bhip\b/i, () => 'Hip problems'],
  ['physical health', /chronic pain|fibromyalgia/i, () => 'Chronic pain'],
  ['physical health', /mobility|wheelchair/i, () => 'Reduced mobility'],
  ['mental health', /anxiety|anxious|panic/i, () => 'Anxiety'],
  ['mental health', /depress/i, () => 'Depression'],
  ['mental health', /low mood/i, () => 'Low mood'],
  ['mental health', /\bptsd\b/i, () => 'PTSD'],
  ['mental health', /\bstress\b/i, () => 'Stress'],
  ['long-term condition', /diabet/i, () => 'Diabetes'],
  ['long-term condition', /heart (condition|problem|failure|attack)/i, () => 'Heart condition'],
  ['long-term condition', /\bcopd\b|asthma|breathing/i, () => 'Breathing condition'],
  ['long-term condition', /epilep/i, () => 'Epilepsy'],
  ['long-term condition', /multiple sclerosis|\bms\b/i, () => 'MS'],
  ['long-term condition', /long covid/i, () => 'Long Covid'],
  ['long-term condition', /cancer/i, () => 'Cancer treatment'],
  ['neurodivergence or learning disability', /autis/i, () => 'Autism'],
  ['neurodivergence or learning disability', /\badhd\b/i, () => 'ADHD'],
  ['neurodivergence or learning disability', /dyslexi/i, () => 'Dyslexia'],
  ['neurodivergence or learning disability', /learning disabilit/i, () => 'Learning disability'],
  ['sensory', /\bdeaf|hearing/i, () => 'Hearing loss'],
  ['sensory', /sight|visual|blind/i, () => 'Sight loss']
];

const EXP = [
  ['retail', /\b(shop|retail|till|cashier|supermarket|sales assistant)\b/i],
  ['care', /\b(carer|caring for|care work|care home|looked after|looking after|look after|looks after)\b/i],
  ['warehouse', /\b(warehouse|stock|forklift|picking|packing)\b/i],
  ['office', /\b(office|admin|administration|reception|data entry|clerk)\b/i],
  ['cleaning', /\bclean(er|ing)\b/i],
  ['volunteer', /\bvolunteer/i],
  ['trades', /\b(builder|building site|joiner|plumb|electrician|mechanic|repairs|decorat)\w*/i],
  ['kitchen', /\b(kitchen|chef|catering|takeaway|restaurant)\b/i],
  ['childcare', /\b(childcare|nursery|childminder|teaching assistant)\b/i],
  ['driver', /\b(driver|delivery|deliveries|taxi)\b/i]
];
const LANG = [['ur', /urdu/i], ['pa', /punjabi/i], ['bn', /bengali|bangla|sylheti/i], ['pl', /polish/i], ['ar', /arabic/i], ['en', /english/i]];
const AREAS = [['rochdale', /rochdale (town|centre)|lives in rochdale|in rochdale\b/i], ['heywood', /heywood/i], ['middleton', /middleton/i], ['littleborough', /littleborough/i], ['milnrow', /milnrow|newhey/i], ['wardle', /wardle/i]];

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function joinOr(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1]; }
function joinAnd(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }

function localExtract(notes = '') {
  const text = String(notes || '');
  const out = { enjoy: [], exp: [], lim: [], times: [], travel: [], areas: [], langs: [], helps: [], prefs: [], skillsExtra: [], hours: '', liftMax: null, age: null, condition: '', category: 'not stated', uncertain: [], mode: 'rules' };
  if (!text.trim()) return out;

  // Health
  const cats = new Set(), conds = [];
  for (const [cat, re, label] of CONDITIONS) if (re.test(text)) { cats.add(cat); conds.push(label(text)); }
  out.condition = [...new Set(conds)].slice(0, 2).join(' and ');
  out.category = cats.size > 1 ? 'more than one' : (cats.size ? [...cats][0] : 'not stated');

  if (negated(text, /\b(lift|lifting|carry|carrying)\b/) || /heavy lifting/i.test(text)) out.lim.push('lifting');
  if (negated(text, /\bstand(ing)?\b/)) out.lim.push('standing');
  if (negated(text, /\b(walk(ing)?|stairs)\b/) || /wheelchair/i.test(text)) out.lim.push('walking');
  if (negated(text, /\b(noise|noisy|loud|busy|crowd(s|ed)?)\b/) || /(busy|noisy|crowded) (places|rooms)/i.test(text)) out.lim.push('noise');
  if (/dyslexi/i.test(text) || negated(text, /\b(read|reading|writing)\b/)) out.lim.push('reading');
  if (negated(text, /\bearly (starts?|mornings?)\b/)) out.lim.push('early');
  if (/lower back|back injury/i.test(text) && !out.lim.includes('lifting')) { out.lim.push('lifting'); out.uncertain.push('Lifting limit assumed from back injury: please confirm'); }
  const kg = text.match(/(?:over|more than|above|heavier than)\s*(\d{1,2})\s*kg/i) || text.match(/(\d{1,2})\s*kg/i);
  if (kg) out.liftMax = parseInt(kg[1], 10);

  // Experience and skills
  for (const [id, re] of EXP) if (re.test(text)) out.exp.push(id);
  if (/\b(computer|computers|excel|spreadsheets?|it skills|typing|laptop)\b/i.test(text)) {
    if (negated(text, /\b(computer|computers|laptop|online)\b/) || /help with (computers|getting online)/i.test(text)) out.helps.push('computers');
    else out.skillsExtra.push('computers');
  }
  if (/(enjoys?|likes?|loves?|good with)\s+(helping|people)/i.test(text)) out.enjoy.push('helping');
  if (/(enjoys?|likes?|loves?|good with)\s+(children|kids)/i.test(text)) out.enjoy.push('children');
  if (/(enjoys?|likes?|loves?)\s+(being\s+)?(outdoors|outside)/i.test(text)) out.enjoy.push('outdoors');
  if (/(enjoys?|likes?|loves?)\s+(cooking|baking)/i.test(text)) out.enjoy.push('cooking');
  if (/(enjoys?|likes?|loves?|good at)\s+(talking|chatting) to (people|customers)/i.test(text)) out.enjoy.push('customers');
  if (/organis/i.test(text)) out.enjoy.push('organising');
  for (const [id, re] of LANG) if (re.test(text)) out.langs.push(id);
  for (const [id, re] of AREAS) if (re.test(text)) out.areas.push(id);

  // Hours, times, travel, help
  if (/part[- ]time|few hours|school hours|mornings only|(\b(1\d|[1-9])\b)\s*hours/i.test(text)) out.hours = 'part';
  if (/full[- ]time/i.test(text) && !negated(text, /full[- ]time/)) out.hours = 'full';
  if (/school hours|term[- ]time/i.test(text)) out.times.push('school');
  if (/evenings?/i.test(text) && !negated(text, /evenings?/)) out.times.push('evenings');
  if (/flexible/i.test(text)) out.times.push('anytime');
  if (/\bbus(es)?\b/i.test(text)) out.travel.push('bus');
  if (/\b(drives|own car|has a car|can drive)\b/i.test(text)) out.travel.push('car');
  if (/(work|working) from home|home[- ]based/i.test(text)) out.travel.push('home');
  if (/\b(quiet|calm)\b/i.test(text)) out.helps.push('calm');
  if (/confidence/i.test(text)) out.helps.push('confidence');
  if (/\b(course|training|qualification)/i.test(text)) out.helps.push('course');
  if (/mentor|buddy/i.test(text)) out.helps.push('mentor');
  if (/adjustment|special (chair|equipment)|adapted/i.test(text)) out.helps.push('adjust');

  const age = text.match(/\b(?:is|aged?|age)\s*(\d{2})\b/i) || text.match(/\b(\d{2})\s*(?:years old|yo|y\/o)\b/i);
  if (age) out.age = parseInt(age[1], 10);

  // Summary
  const n = (w) => (/^\d+$/.test(w) ? w : String(NUMWORDS[w.toLowerCase()] || w));
  let yearsPhrase = '';
  let m = text.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\s+years?\s+(?:in|of|doing|as an?|as)\s+([a-z ]{3,30}?)(?=[.,;]|\s+(?:at|and|for|but|with)\b|$)/i);
  if (m) yearsPhrase = `${n(m[1])} years in ${m[2].trim()}`;
  else {
    m = text.match(/(?:worked|working|work)\s+(?:in|as an?|at)\s+([a-z ]{3,30}?)\s+(?:at [a-z ]+? )?for\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\s+years?/i);
    if (m) yearsPhrase = `${n(m[2])} years in ${m[1].trim()}`;
  }
  const limPhrase = { lifting: out.liftMax ? `lift over ${out.liftMax} kg` : 'do heavy lifting', standing: 'stand for long', walking: 'walk far or use stairs', noise: 'work in busy or noisy places', reading: 'do lots of reading or writing', early: 'start early' };
  const lims = out.lim.map((l) => limPhrase[l]);
  const parts = [];
  if (out.condition && lims.length) parts.push(`${out.condition}: cannot ${joinOr(lims)}.`);
  else if (out.condition) parts.push(`${out.condition}.`);
  else if (lims.length) parts.push(`Cannot ${joinOr(lims)}.`);
  if (out.hours === 'part') parts.push('Wants part-time work.');
  if (out.hours === 'full') parts.push('Wants full-time work.');
  const expBits = [];
  if (yearsPhrase) expBits.push(yearsPhrase);
  else if (out.exp.length) expBits.push('Experience in ' + joinAnd(out.exp.map((e) => I18N.t('en', 'opt.exp.' + e).toLowerCase())));
  if (out.langs.length) expBits.push('speaks ' + joinAnd(out.langs.map((l) => I18N.t('en', 'opt.langs.' + l))));
  if (expBits.length) parts.push(cap(expBits.join('; ')) + '.');
  if (out.helps.includes('computers')) parts.push('Would like help with computers.');
  out.summary = parts.join(' ') || 'Not enough in the notes to summarise yet.';
  if (!out.lim.length && out.category === 'not stated') out.uncertain.push('No health limits mentioned: ask about them');
  if (!out.exp.length && !out.skillsExtra.length) out.uncertain.push('No past work or skills mentioned');

  for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = [...new Set(out[k])];
  return out;
}

function sanitize(raw) {
  const clean = { mode: 'claude' };
  for (const k of ['enjoy', 'exp', 'lim', 'times', 'travel', 'areas', 'langs', 'helps']) {
    clean[k] = Array.isArray(raw[k]) ? [...new Set(raw[k].filter((v) => ALLOWED[k].includes(v)))] : [];
  }
  clean.lim = clean.lim.filter((v) => v !== 'private');
  clean.prefs = [];
  clean.skillsExtra = Array.isArray(raw.skillsExtra) && raw.skillsExtra.includes('computers') ? ['computers'] : [];
  clean.hours = ['part', 'full'].includes(raw.hours) ? raw.hours : '';
  clean.liftMax = Number.isFinite(raw.liftMax) && raw.liftMax >= 0 && raw.liftMax < 50 ? raw.liftMax : null;
  clean.age = Number.isFinite(raw.age) && raw.age > 15 && raw.age < 100 ? raw.age : null;
  clean.condition = typeof raw.condition === 'string' ? raw.condition.slice(0, 80) : '';
  clean.category = CATEGORIES.includes(raw.category) ? raw.category : 'not stated';
  clean.summary = typeof raw.summary === 'string' ? raw.summary.slice(0, 400) : '';
  clean.uncertain = Array.isArray(raw.uncertain) ? raw.uncertain.filter((u) => typeof u === 'string').slice(0, 5).map((u) => u.slice(0, 140)) : [];
  return clean;
}

const SYSTEM = `You help council employment staff in Rochdale. You read a staff member's notes about a resident who is out of work because of ill health or disability, and return ONLY a JSON object, no prose.
Rules:
- Only record what the notes actually say. Never guess or diagnose a health condition. If something is unclear, add a short note to "uncertain".
- Use only these ids:
${Object.entries(ALLOWED).map(([k, v]) => `  ${k}: ${v.join(', ')}`).join('\n')}
- category is one of: ${CATEGORIES.join(', ')}.
Schema:
{"summary": "max 40 words, plain English, like: Lower back injury: cannot lift or stand for long. Wants part-time work. 10 years in stock control; speaks Urdu and English.",
 "condition": "as stated, or empty", "category": "...", "enjoy": [], "exp": [], "lim": [], "liftMax": number or null,
 "hours": "part" | "full" | "", "times": [], "travel": [], "areas": [], "langs": [], "helps": [], "skillsExtra": ["computers"] or [], "age": number or null, "uncertain": []}`;

async function claudeExtract(notes) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !String(notes || '').trim()) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.RIGHTDOOR_MODEL || 'claude-sonnet-5-5', max_tokens: 1000, system: SYSTEM, messages: [{ role: 'user', content: `Notes:\n${notes}` }] }),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const txt = (data.content || []).map((c) => c.text || '').join('');
    const json = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
    return sanitize(JSON.parse(json));
  } catch (err) {
    console.warn('[ai] Claude call failed, using built-in rules:', err.message);
    return null;
  }
}

async function extract(notes) {
  const local = localExtract(notes);
  const ai = await claudeExtract(notes);
  if (!ai) return local;
  // Safety net: keep any health limit the rules reader spotted, even if the model missed it.
  ai.lim = [...new Set([...ai.lim, ...local.lim])];
  if (ai.liftMax == null) ai.liftMax = local.liftMax;
  if (!ai.summary) ai.summary = local.summary;
  return ai;
}

module.exports = { extract, localExtract, CATEGORIES, aiMode: () => (process.env.ANTHROPIC_API_KEY ? 'claude' : 'rules') };
