// Text message line. Works with the demo simulator (JSON) or a real SMS provider
// webhook such as Twilio (form fields From and Body, reply as TwiML).
const I18N = require('../public/js/i18n-data.js');
const svc = require('./service');

const SMS_QUESTIONS = ['enjoy', 'exp', 'lim', 'hours', 'travel', 'langs'];
const QMAP = Object.fromEntries(I18N.QUESTIONS.map((q) => [q.id, q]));
const LANG_ORDER = ['en', 'ur', 'bn', 'pl', 'ar'];
const CONSENT = {
  en: 'Your answers go to a council worker so they can help you. Reply STOP at any time.',
  ur: 'آپ کے جوابات کونسل ورکر کو جائیں گے تاکہ وہ آپ کی مدد کر سکیں۔ کسی بھی وقت STOP بھیجیں۔',
  bn: 'আপনার উত্তর একজন কাউন্সিল কর্মীর কাছে যাবে যাতে তিনি আপনাকে সাহায্য করতে পারেন। যেকোনো সময় STOP পাঠান।',
  pl: 'Twoje odpowiedzi trafią do pracownika urzędu, aby mógł Ci pomóc. W każdej chwili wyślij STOP.',
  ar: 'ستصل إجاباتك إلى موظف المجلس ليتمكن من مساعدتك. أرسل STOP في أي وقت.'
};
const STOPPED = {
  en: 'You will not get any more messages.', ur: 'آپ کو مزید پیغامات نہیں ملیں گے۔', bn: 'আপনি আর কোনো বার্তা পাবেন না।',
  pl: 'Nie otrzymasz więcej wiadomości.', ar: 'لن تصلك رسائل أخرى.'
};

function welcome() {
  return 'Welcome to RightDoor. We help you find work that fits your health.\nReply with a number for your language:\n'
    + LANG_ORDER.map((c, i) => `${i + 1} ${I18N.LANGS.find((l) => l.code === c).name}`).join('\n');
}

function questionText(lang, step) {
  const q = QMAP[SMS_QUESTIONS[step]];
  const t = (k) => I18N.t(lang, k);
  const opts = q.opts.map((o, i) => `${i + 1} ${t(`opt.${q.id}.${o}`)}`).join('\n');
  return `${step + 1}/${SMS_QUESTIONS.length} ${t('q.q' + q.n)}\n${opts}\n${t('sms.howto')}`;
}

function log(db, from, dir, text) {
  db.sms[from] = db.sms[from] || [];
  db.sms[from].push({ dir, text, at: new Date().toISOString() });
  if (db.sms[from].length > 200) db.sms[from] = db.sms[from].slice(-200);
}

async function handle(db, fromRaw, bodyRaw) {
  const from = String(fromRaw || '').replace(/[^\d+ ]/g, '').trim().slice(0, 20) || 'unknown';
  const body = String(bodyRaw || '').trim().slice(0, 300);
  log(db, from, 'in', body);
  const replies = [];
  const say = (txt) => { replies.push(txt); log(db, from, 'out', txt); };
  let s = db.smsSessions[from];
  const word = body.toUpperCase();

  if (word === 'STOP') {
    const lang = s ? s.lang : 'en';
    delete db.smsSessions[from];
    say(`${STOPPED[lang]} ${I18N.t(lang, 'sms.restart')}`);
    return replies;
  }
  if (!s || /^(JOB|JOBS|START|HELLO|HI|RESTART)$/.test(word)) {
    db.smsSessions[from] = { step: 'lang', lang: 'en', answers: {}, at: new Date().toISOString() };
    say(welcome());
    return replies;
  }
  const nums = (body.match(/\d+/g) || []).map(Number);

  if (s.step === 'lang') {
    const n = nums[0];
    if (!n || n < 1 || n > LANG_ORDER.length) { say(welcome()); return replies; }
    s.lang = LANG_ORDER[n - 1];
    s.step = 0;
    say(CONSENT[s.lang]);
    say(questionText(s.lang, 0));
    return replies;
  }

  const q = QMAP[SMS_QUESTIONS[s.step]];
  if (!(nums.length === 1 && nums[0] === 0)) {
    const picked = [...new Set(nums.filter((n) => n >= 1 && n <= q.opts.length))].map((n) => q.opts[n - 1]);
    if (!picked.length) { say(I18N.t(s.lang, 'sms.invalid')); say(questionText(s.lang, s.step)); return replies; }
    s.answers[q.id] = q.multi ? picked : picked[0];
  }
  s.step += 1;
  if (s.step < SMS_QUESTIONS.length) { say(questionText(s.lang, s.step)); return replies; }

  // Finished: create the check-in and reply with fields and a reference number.
  const client = svc.createClient(db, { name: 'Text line ' + from.slice(-4), phone: from, lang: s.lang, channel: 'text', consent: true, answers: { ...s.answers, contact: 'text' } });
  await svc.processClient(client, db.jobs);
  delete db.smsSessions[from];
  const fields = client.fields.length ? client.fields.map((f) => I18N.t(s.lang, 'sector.' + f.sector)).join(', ') : '—';
  say(I18N.t(s.lang, 'sms.done', { fields, code: client.code }));
  return replies;
}

function sendTo(db, phone, text) { log(db, String(phone).replace(/[^\d+ ]/g, '').trim(), 'out', text); }

module.exports = { handle, sendTo, SMS_QUESTIONS };
