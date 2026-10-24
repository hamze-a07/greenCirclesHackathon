// Sample jobs, courses and support services for the demo.
// Employers and vacancies are fictional sample data. Service descriptions are short
// summaries for the pilot and should be checked with each service before going live.

// Job demand fields used by the hard health rules:
//   liftKg   – heaviest regular lift (0 = none)
//   standing – 'low' | 'some' | 'long'
//   walking  – 'low' | 'some' | 'lots'
//   noise    – 'quiet' | 'some' | 'busy'
//   paperwork– 'low' | 'some' | 'heavy'
//   early    – starts before 7am
const JOBS = [
  { id: 'j-office-calder', title: 'Office Administrator', employer: 'Calder Logistics', area: 'heywood', sector: 'office', hours: 'part', pay: '£13.10 an hour',
    liftKg: 0, standing: 'low', walking: 'low', noise: 'quiet', paperwork: 'some', early: false, bus: true, home: false, flexible: false, termTime: false, training: false,
    skills: ['office', 'warehouse', 'computers'], interests: ['organising', 'computers'], langPlus: [],
    desc: 'Keep stock records and orders up to date for a busy depot. Desk-based in a quiet office.' },
  { id: 'j-phone-pennine', title: 'Phone Adviser', employer: 'Pennine Parts', area: 'rochdale', sector: 'phone', hours: 'part', pay: '£12.90 an hour',
    liftKg: 0, standing: 'low', walking: 'low', noise: 'some', paperwork: 'low', early: false, bus: true, home: false, flexible: true, termTime: false, training: true,
    skills: ['retail', 'warehouse', 'office'], interests: ['customers', 'helping'], langPlus: ['ur', 'pa'],
    desc: 'Take orders and answer questions from local garages by phone. Seated work, training given.' },
  { id: 'j-ta-greenbank', title: 'Teaching Assistant', employer: 'Greenbank School', area: 'rochdale', sector: 'schools', hours: 'part', pay: '£12.85 an hour',
    liftKg: 5, standing: 'some', walking: 'some', noise: 'some', paperwork: 'some', early: false, bus: true, home: false, flexible: false, termTime: true, training: false,
    skills: ['childcare', 'care', 'volunteer'], interests: ['children', 'helping'], langPlus: ['ur', 'bn', 'pa', 'pl', 'ar'],
    requires: { label: 'a Level 2 award', courseId: 'c-stl2' },
    desc: 'Support small groups with reading and maths. Light duties, school hours only.' },
  { id: 'j-care-days', title: 'Care Assistant (days)', employer: 'Roch Valley Care Home', area: 'rochdale', sector: 'care', hours: 'either', pay: '£12.75 an hour',
    liftKg: 25, standing: 'long', walking: 'lots', noise: 'some', paperwork: 'low', early: true, bus: true, home: false, flexible: false, termTime: false, training: true,
    skills: ['care'], interests: ['helping'], langPlus: ['ur', 'pa', 'pl'],
    desc: 'Personal care for older residents, including moving and handling. Shifts start at 7am.' },
  { id: 'j-companion', title: 'Companionship Support Worker', employer: 'Moorside Home Support', area: 'middleton', sector: 'care', hours: 'part', pay: '£12.80 an hour',
    liftKg: 0, standing: 'some', walking: 'some', noise: 'quiet', paperwork: 'low', early: false, bus: true, home: false, flexible: true, termTime: false, training: true,
    skills: ['care', 'volunteer'], interests: ['helping'], langPlus: ['ur', 'pa', 'bn', 'pl'],
    desc: 'Visit older people at home for company, shopping lists and appointments. No personal care.' },
  { id: 'j-warehouse', title: 'Warehouse Operative', employer: 'Kingsway Distribution', area: 'milnrow', sector: 'warehouse', hours: 'full', pay: '£13.00 an hour',
    liftKg: 25, standing: 'long', walking: 'lots', noise: 'busy', paperwork: 'low', early: true, bus: true, home: false, flexible: false, termTime: false, training: true,
    skills: ['warehouse'], interests: ['organising', 'fixing'], langPlus: [],
    desc: 'Picking and packing orders on a large warehouse floor. Early and late shifts.' },
  { id: 'j-stock-seated', title: 'Stock Controller', employer: 'Heywood Distribution Park', area: 'heywood', sector: 'warehouse', hours: 'part', pay: '£13.40 an hour',
    liftKg: 0, standing: 'low', walking: 'some', noise: 'some', paperwork: 'some', early: false, bus: true, home: false, flexible: false, termTime: false, training: false,
    skills: ['warehouse', 'office', 'computers'], interests: ['organising', 'computers'], langPlus: [],
    desc: 'Check stock levels on screen and plan deliveries. Mostly seated, no lifting.' },
  { id: 'j-library', title: 'Library Assistant', employer: 'Middleton Library', area: 'middleton', sector: 'community', hours: 'part', pay: '£12.80 an hour',
    liftKg: 10, standing: 'some', walking: 'some', noise: 'quiet', paperwork: 'low', early: false, bus: true, home: false, flexible: false, termTime: false, training: true,
    skills: ['retail', 'office', 'volunteer', 'computers'], interests: ['helping', 'organising', 'computers', 'customers'], langPlus: ['ur', 'bn', 'pl', 'ar'],
    desc: 'Help visitors find books, use computers and join groups. Some shelving with trolleys.' },
  { id: 'j-reception', title: 'Receptionist', employer: 'Littleborough Health Centre', area: 'littleborough', sector: 'office', hours: 'part', pay: '£12.90 an hour',
    liftKg: 0, standing: 'low', walking: 'low', noise: 'some', paperwork: 'some', early: false, bus: true, home: false, flexible: false, termTime: false, training: true,
    skills: ['office', 'retail'], interests: ['customers', 'helping', 'organising', 'computers'], langPlus: ['ur', 'pa', 'bn', 'pl'],
    desc: 'Greet patients, book appointments and answer the phone. Seated at the front desk.' },
  { id: 'j-kitchen', title: 'Kitchen Assistant', employer: 'Schools Catering Team', area: 'heywood', sector: 'food', hours: 'part', pay: '£12.75 an hour',
    liftKg: 15, standing: 'long', walking: 'some', noise: 'busy', paperwork: 'low', early: true, bus: true, home: false, flexible: false, termTime: true, training: true,
    skills: ['kitchen', 'cleaning'], interests: ['cooking'], langPlus: [],
    requires: { label: 'a food hygiene certificate', courseId: 'c-food' },
    desc: 'Prepare and serve school lunches. Term-time only, starts early.' },
  { id: 'j-delivery', title: 'Delivery Driver', employer: 'Northern Parcels', area: 'rochdale', sector: 'transport', hours: 'full', pay: '£13.20 an hour',
    liftKg: 15, standing: 'some', walking: 'lots', noise: 'some', paperwork: 'low', early: true, bus: false, home: false, flexible: false, termTime: false, training: true,
    skills: ['driver'], interests: ['driving'], langPlus: [],
    requires: { label: 'a full UK driving licence', courseId: null },
    desc: 'Deliver parcels around the borough in a company van.' },
  { id: 'j-parks', title: 'Parks Assistant', employer: 'Hollingworth Lake Parks Team', area: 'littleborough', sector: 'outdoor', hours: 'either', pay: '£12.80 an hour',
    liftKg: 15, standing: 'long', walking: 'lots', noise: 'quiet', paperwork: 'low', early: false, bus: true, home: false, flexible: false, termTime: false, training: true,
    skills: ['trades', 'cleaning'], interests: ['outdoors', 'fixing'], langPlus: [],
    desc: 'Look after paths, planting and visitor areas around the lake.' },
  { id: 'j-retail', title: 'Retail Assistant', employer: 'Riverside Market Stores', area: 'rochdale', sector: 'retail', hours: 'part', pay: '£12.75 an hour',
    liftKg: 10, standing: 'long', walking: 'some', noise: 'busy', paperwork: 'low', early: false, bus: true, home: false, flexible: true, termTime: false, training: true,
    skills: ['retail'], interests: ['customers'], langPlus: ['ur', 'pa', 'bn', 'pl'],
    desc: 'Serve customers on the till and keep shelves stocked.' },
  { id: 'j-cs-home', title: 'Customer Service Adviser (from home)', employer: 'Moorland Energy', area: 'rochdale', sector: 'phone', hours: 'either', pay: '£12.95 an hour',
    liftKg: 0, standing: 'low', walking: 'low', noise: 'quiet', paperwork: 'some', early: false, bus: false, home: true, flexible: true, termTime: false, training: true,
    skills: ['retail', 'office'], interests: ['customers', 'computers', 'helping'], langPlus: ['ur', 'pl'],
    requires: { label: 'basic computer skills', courseId: 'c-digital' },
    desc: 'Help customers with their energy bills by phone and webchat, working from home. Equipment provided.' },
  { id: 'j-interpreter', title: 'Community Interpreter', employer: 'Rochdale Language Link', area: 'rochdale', sector: 'community', hours: 'part', pay: '£15.00 an hour',
    liftKg: 0, standing: 'some', walking: 'some', noise: 'some', paperwork: 'some', early: false, bus: true, home: false, flexible: true, termTime: false, training: false,
    skills: ['volunteer', 'care'], interests: ['helping', 'customers'], langPlus: ['ur', 'pa', 'bn', 'pl', 'ar'], needsSecondLanguage: true,
    requires: { label: 'a Level 3 interpreting qualification', courseId: 'c-interp' },
    desc: 'Interpret at GP and council appointments. Book the sessions that suit you.' },
  { id: 'j-it', title: 'IT Helpdesk Trainee', employer: 'Rochdale Digital Hub', area: 'rochdale', sector: 'digital', hours: 'full', pay: '£12.90 an hour',
    liftKg: 0, standing: 'low', walking: 'low', noise: 'quiet', paperwork: 'some', early: false, bus: true, home: false, flexible: false, termTime: false, training: true,
    skills: ['office', 'computers'], interests: ['computers', 'fixing', 'helping'], langPlus: [],
    requires: { label: 'Essential Digital Skills', courseId: 'c-digital' },
    desc: 'Help staff fix laptop and printer problems. Full training given.' },
  { id: 'j-caretaker', title: 'Caretaker', employer: 'Heywood Community Centre', area: 'heywood', sector: 'trades', hours: 'part', pay: '£12.85 an hour',
    liftKg: 25, standing: 'long', walking: 'lots', noise: 'some', paperwork: 'low', early: true, bus: true, home: false, flexible: false, termTime: false, training: false,
    skills: ['trades', 'cleaning'], interests: ['fixing', 'organising'], langPlus: [],
    desc: 'Open up the building, set out rooms and do small repairs.' },
  { id: 'j-data', title: 'Data Entry Clerk', employer: 'Pennine Housing Co-op', area: 'rochdale', sector: 'office', hours: 'part', pay: '£12.80 an hour',
    liftKg: 0, standing: 'low', walking: 'low', noise: 'quiet', paperwork: 'heavy', early: false, bus: true, home: false, flexible: true, termTime: false, training: true,
    skills: ['office', 'computers'], interests: ['computers', 'organising'], langPlus: [],
    desc: 'Type up repair requests and tenant records. Quiet office, flexible hours.' },
  { id: 'j-lunch', title: 'Lunchtime Supervisor', employer: 'Middleton Primary School', area: 'middleton', sector: 'schools', hours: 'part', pay: '£12.75 an hour',
    liftKg: 0, standing: 'long', walking: 'some', noise: 'busy', paperwork: 'low', early: false, bus: true, home: false, flexible: false, termTime: true, training: true,
    skills: ['childcare', 'care', 'volunteer'], interests: ['children', 'helping'], langPlus: ['ur', 'bn', 'pa'],
    desc: 'Look after children in the dining hall and playground, 11:45 to 1:15.' },
  { id: 'j-community', title: 'Community Centre Assistant', employer: 'Wardle Community Centre', area: 'wardle', sector: 'community', hours: 'part', pay: '£12.80 an hour',
    liftKg: 10, standing: 'some', walking: 'some', noise: 'some', paperwork: 'low', early: false, bus: true, home: false, flexible: true, termTime: false, training: true,
    skills: ['volunteer', 'office', 'retail', 'care'], interests: ['helping', 'organising', 'customers'], langPlus: ['ur', 'bn', 'pa', 'pl', 'ar'],
    desc: 'Welcome visitors, run the café counter and help with groups.' },
  { id: 'j-nursery', title: 'Nursery Assistant', employer: 'Milnrow Little Stars', area: 'milnrow', sector: 'schools', hours: 'either', pay: '£12.75 an hour',
    liftKg: 10, standing: 'long', walking: 'some', noise: 'busy', paperwork: 'low', early: true, bus: true, home: false, flexible: false, termTime: false, training: false,
    skills: ['childcare'], interests: ['children'], langPlus: ['ur', 'pl'],
    requires: { label: 'a Level 2 early years qualification', courseId: 'c-early' },
    desc: 'Play, read and care for children aged 2 to 4.' },
  { id: 'j-cafe', title: 'Café Assistant', employer: 'Canal Side Café', area: 'littleborough', sector: 'food', hours: 'part', pay: '£12.75 an hour',
    liftKg: 10, standing: 'long', walking: 'some', noise: 'some', paperwork: 'low', early: false, bus: true, home: false, flexible: true, termTime: false, training: true,
    skills: ['kitchen', 'retail'], interests: ['cooking', 'customers'], langPlus: [],
    requires: { label: 'a food hygiene certificate', courseId: 'c-food' },
    desc: 'Make drinks and simple food, and serve customers.' }
];

const COURSES = {
  'c-stl2': { id: 'c-stl2', name: 'Supporting Teaching and Learning, Level 2', provider: 'Work and skills hub', length: '12 weeks, 1 day a week' },
  'c-food': { id: 'c-food', name: 'Food Safety and Hygiene, Level 2', provider: 'Work and skills hub', length: '1 day' },
  'c-digital': { id: 'c-digital', name: 'Essential Digital Skills', provider: 'Digitech Library', length: '6 sessions, free' },
  'c-interp': { id: 'c-interp', name: 'Community Interpreting, Level 3', provider: 'Work and skills hub', length: '10 weeks' },
  'c-early': { id: 'c-early', name: 'Early Years Practitioner, Level 2', provider: 'Work and skills hub', length: '6 months, part-time' }
};

const SERVICES = {
  workwell: { id: 'workwell', name: 'WorkWell', staff: 'Health and work coaches (GMCA). Official referral routes include Jobcentre Plus and GP practices.' },
  workingwell: { id: 'workingwell', name: 'Working Well (Ingeus)', staff: 'Longer-term support for people with health conditions or disabilities.' },
  livewell: { id: 'livewell', name: 'Live Well', staff: 'Wellbeing, confidence and community support.' },
  hubs: { id: 'hubs', name: 'Work and skills hubs', staff: 'CVs, courses, applications and job search help.' },
  digitech: { id: 'digitech', name: 'Digitech Library', staff: 'Free laptops and data loans from Rochdale libraries, plus digital skills help.' },
  accesswork: { id: 'accesswork', name: 'Access to Work (DWP)', staff: 'Grants for workplace adjustments, equipment and travel.' },
  jobcentre: { id: 'jobcentre', name: 'Jobcentre Plus', staff: 'Benefits advice and work coach appointments.' }
};

const STAFF = [
  { id: 'priya', name: 'Priya S.', role: 'Employment support officer' },
  { id: 'sam', name: 'Sam T.', role: 'WorkWell coach' }
];

module.exports = { JOBS, COURSES, SERVICES, STAFF };
