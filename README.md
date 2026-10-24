# RightDoor

Helping Rochdale residents with health conditions or disabilities find the right support and the right job, with or without a computer.
Team Rochdale · Green Circles AI Hackathon, 16 October 2026.

## Run it

You need Node.js 18 or newer. There is nothing to install.

```bash
cd rightdoor
node server.js
```

Then open **http://localhost:3000**.

| Who | Where | Notes |
|---|---|---|
| Residents | http://localhost:3000 | No login. Pick a language, text size and high contrast at the top. |
| Staff | http://localhost:3000/staff | Sign in as Priya S. or Sam T., PIN **1234** |
| Printable form | http://localhost:3000/print/form?lang=ur | `en`, `ur`, `bn`, `pl`, `ar` |

### Use Claude to read the notes (optional)

```bash
ANTHROPIC_API_KEY=sk-ant-... node server.js
# optional: RIGHTDOOR_MODEL=claude-sonnet-5-5 (default)
```

Without a key the built-in rules reader is used, so the demo works offline. With a key, Claude writes the summary and pulls out skills, limits and preferences. Either way the output is limited to known options, and **health limits are applied as hard rules in code**, never by the AI.

### Other settings

`PORT` (3000), `HOST` (127.0.0.1), `STAFF_PIN` (1234), `TEXT_NUMBER`, `PHONE_LINE`, `RIGHTDOOR_DB` (data file path).
Delete `data/db.json` (or use **Demo tools → Reset**) to go back to the demo data.

## What maps to each slide

| Slide | In the product |
|---|---|
| Finding the Right Door: Jobs Match | `/app/discover`: "What do you enjoy, and what are you good at?" chips, free text, "I would like work that is", **Find fields that fit me**, **Skip, I'll ask a council worker** |
| How it works: landing page | `/`: two big buttons, Text size A A A, High contrast, 3-step "How it works", the ways in |
| The Diagnostic | `/app/check-in`: Question X of 10 with progress bar, every question optional, **Read aloud**, Back/Next, Prefer not to say |
| Safe and fair by design | `/staff/clients/:id`: AI summary, Category, Cannot do (red), Existing skills, three best-fitting jobs with tags, **Why** and **Course**. Health limits are hard rules; ruled-out jobs are listed with the reason; low-confidence matches say "Not sure"; a person approves every plan |
| With a helper / phone call | `/staff/clients/new`: face to face, phone (with script) or paper form; staff type notes and/or tick answers. No login for the resident |
| No computer needed | Text line (text JOB, answer by number, in 5 languages), phone line, printable sheet in 5 languages, letters printed in the resident's language |
| Residents track progress | `/app/track`: reference number, status timeline, worker's note, steps to tick off |
| Better Together | Referral routing to WorkWell, Working Well, Live Well, work and skills hubs, Digitech Library, Access to Work and Jobcentre Plus: it replaces nothing |

## Text line with a real SMS provider

`POST /api/sms` accepts Twilio-style form fields (`From`, `Body`) and replies with TwiML, so a Twilio number's messaging webhook can point straight at it (through a tunnel such as ngrok when running locally). The **Demo tools** page has a phone simulator that uses the same endpoint.

## How the matching works

1. **Read**: notes and free text become a profile (Claude or built-in rules).
2. **Rule out**: any job that breaks a health limit is removed: lifting over the stated kg, long standing, lots of walking, busy or noisy places, heavy paperwork, early starts. Hours, home-working and language needs are also checked.
3. **Score**: existing skills first, then interests, languages, hours, quiet, seated, area, bus route, term-time.
4. **Explain**: every suggestion carries reason codes shown in the resident's language, plus a course when there is a skill gap.
5. **Flag**: weak fits, few answers or health needs not shared are marked "not sure".
6. **Route**: suggests which services to refer to, and why.
7. **Decide**: staff tick what they've agreed with the person, add a note and approve. Only then does the resident see a plan.

## Notes before a real pilot

- Jobs, employers, pay and courses are **sample data**. Phone numbers use Ofcom's reserved drama ranges.
- Service descriptions are short summaries and should be checked with each service.
- Translations into Urdu, Bengali, Polish and Arabic were written for the prototype and need checking by native speakers.
- Data is stored in plain JSON on this machine. A pilot would need proper hosting, encryption, a DPIA, staff accounts through the council's sign-in and a retention policy for health information.
- Resident reference numbers act as the only key to the progress page; a pilot should add a second check such as the last digits of their phone number.

## Files

```
server.js            HTTP server and API (no dependencies)
lib/data.js          sample jobs, courses, services, staff
lib/extract.js       notes reader (Claude or built-in rules)
lib/match.js         hard health rules, scoring, reasons, routing
lib/service.js       client records, approval, resident view
lib/sms.js           text line conversation
lib/store.js         JSON store and demo seed
public/              resident pages, staff app, print form, styles, 5-language text
```
