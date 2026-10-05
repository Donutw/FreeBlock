import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs/promises';

const PORT = Number(process.env.PORT || 4173);
const HOST = '127.0.0.1';

function unfold(text) { return text.replace(/\r?\n[ \t]/g, ''); }
function unescape(value = '') { return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }
function parseDate(value, params = '') {
  const raw = value.replace(/^[^:]*:/, '');
  const allDay = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(raw);
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))), allDay };
}
function parseEvents(text) {
  const events = []; let current;
  for (const line of unfold(text).split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT' && current) {
      const start = current.dtstart && parseDate(current.dtstart.value, current.dtstart.params);
      const end = current.dtend && parseDate(current.dtend.value, current.dtend.params);
      if (start && end) events.push({ title: unescape(current.summary || 'Class'), start: start.date, end: end.date, allDay: start.allDay });
      current = undefined;
    } else if (current) {
      const colon = line.indexOf(':'); if (colon < 0) continue;
      const [name, ...params] = line.slice(0, colon).split(';'); const value = line.slice(colon + 1);
      if (name === 'DTSTART' || name === 'DTEND') current[name.toLowerCase()] = { value, params: params.join(';') };
      if (name === 'SUMMARY') current.summary = value;
    }
  }
  return events;
}
function dayBounds(date) { const d = new Date(`${date}T00:00:00`); const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); return { start, end: new Date(start.getTime() + 86400000) }; }
function scheduleFor(events, date) {
  const { start, end } = dayBounds(date); const from = new Date(start.getTime() + 8 * 3600000); const until = new Date(start.getTime() + 23 * 3600000);
  const classes = events.filter(e => !e.allDay && e.end > start && e.start < end).sort((a, b) => a.start - b.start);
  const freeBlocks = []; let cursor = from;
  for (const item of classes) {
    const s = new Date(Math.max(item.start, from)); const e = new Date(Math.min(item.end, until));
    if (s > cursor && s - cursor >= 1800000) freeBlocks.push({ start: cursor.toISOString(), end: s.toISOString(), durationMinutes: Math.round((s - cursor) / 60000) });
    if (e > cursor) cursor = e;
  }
  if (until > cursor && until - cursor >= 1800000) freeBlocks.push({ start: cursor.toISOString(), end: until.toISOString(), durationMinutes: Math.round((until - cursor) / 60000) });
  return { classes: classes.map(e => ({ title: e.title, start: e.start.toISOString(), end: e.end.toISOString() })), freeBlocks };
}
async function body(req) { let raw = ''; for await (const chunk of req) raw += chunk; return JSON.parse(raw || '{}'); }
function json(res, status, payload) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(payload)); }

const server = http.createServer(async (req, res) => {
  try {
    const target = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === 'POST' && target.pathname === '/api/timetable') {
      const { icalUrl, date } = await body(req);
      if (typeof icalUrl !== 'string' || !/^https:\/\//i.test(icalUrl) || typeof date !== 'string') return json(res, 400, { error: 'Please provide an HTTPS iCalendar URL and a date.' });
      // Never log or persist icalUrl. It exists only for this request.
      const response = await fetch(icalUrl, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'FreeBlock timetable reader' } });
      if (!response.ok) return json(res, 502, { error: 'The timetable URL could not be fetched.' });
      const ics = await response.text();
      if (!ics.includes('BEGIN:VCALENDAR')) return json(res, 422, { error: 'That URL did not return a valid iCalendar file.' });
      return json(res, 200, scheduleFor(parseEvents(ics), date));
    }
    if (req.method === 'GET') {
      const file = (target.pathname === '/' ? '/index.html' : target.pathname).replaceAll('..', '');
      const content = await fs.readFile(new URL(`.${file}`, import.meta.url));
      const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/plain';
      res.writeHead(200, { 'content-type': type }); res.end(content); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'The timetable URL took too long to respond.'
      : 'The local server could not reach that timetable URL. It may require an authenticated browser session or outbound network access.';
    json(res, 502, { error: message });
  }
});
server.listen(PORT, HOST, () => console.log(`FreeBlock running at http://${HOST}:${PORT}`));
