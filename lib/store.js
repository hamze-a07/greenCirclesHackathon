// Tiny JSON file store. Everything stays on this computer in data/db.json.
const fs = require('fs');
const path = require('path');
const { JOBS, STAFF } = require('./data');
const svc = require('./service');

const FILE = process.env.RIGHTDOOR_DB || path.join(__dirname, '..', 'data', 'db.json');
let db = null;
let timer = null;

function flush() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}
function save() { clearTimeout(timer); timer = setTimeout(flush, 30); }

const SEED_CLIENTS = [
  { name: 'Tariq H.', age: 54, area: 'heywood', phone: '07700 900456', lang: 'en', channel: 'person', consent: true, by: 'Priya S.',
    notes: 'Tariq is 54 and lives in Heywood. He hurt his lower back two years ago and cannot lift anything over 5 kg or stand for long. He worked in stock control at a warehouse for 10 years and is good with computers. He wants part-time work he can get to on the bus. Speaks Urdu and English.' },
  { name: 'Amina K.', age: 38, area: 'rochdale', phone: '07700 900321', lang: 'en', channel: 'web', consent: true,
    answers: { enjoy: ['helping', 'children', 'organising', 'customers'], prefs: ['calm', 'part', 'bus'], contact: 'text',
      freeText: 'I volunteered at a community centre for two years, worked in a shop, and looked after family members. I speak Urdu and English.' } },
  { name: 'Janet O.', age: 61, area: 'middleton', phone: '07700 900789', lang: 'en', channel: 'text', consent: true,
    answers: { enjoy: ['helping', 'organising'], exp: ['care', 'office'], lim: ['walking', 'standing'], hours: 'h16to30', travel: ['bus'], langs: ['en'] },
    approve: { note: 'Lovely to speak to you, Janet. I have booked you in with a WorkWell coach next Tuesday at Middleton library.', stepsDone: 1 } },
  { name: 'Piotr K.', age: 47, area: 'rochdale', phone: '07700 900654', lang: 'pl', channel: 'phone', consent: true, by: 'Sam T.',
    notes: 'Piotr called the phone line. He has anxiety and finds busy or noisy places hard. He used to be a delivery driver and did some warehouse work. Speaks Polish and English. Would like something quiet, maybe working from home, and some help with confidence.' }
];

async function seed() {
  const fresh = { version: 1, createdAt: new Date().toISOString(), jobs: JSON.parse(JSON.stringify(JOBS)), clients: [], sms: {}, smsSessions: {}, outbox: [] };
  for (const s of SEED_CLIENTS.slice().reverse()) {
    const c = svc.createClient(fresh, s);
    await svc.processClient(c, fresh.jobs);
    if (s.approve) {
      svc.approve(c, { jobs: c.matches.slice(0, 2).map((m) => m.jobId), support: c.support.map((x) => x.id), note: s.approve.note }, STAFF[0]);
      c.steps.slice(0, s.approve.stepsDone).forEach((st) => { st.done = true; });
    }
  }
  return fresh;
}

async function load() {
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { db = await seed(); flush(); }
  return db;
}
async function reset() { db = await seed(); flush(); return db; }
const get = () => db;

module.exports = { load, save, flush, get, reset, FILE };
