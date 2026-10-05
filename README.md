# FreeBlock

FreeBlock helps students turn gaps between classes into realistic plans. The first prototype is timetable-aware: it is designed to read a student's timetable, identify free windows, and use TinyFish to search and verify live UCL and London activities that fit the window.

## Current prototype

The UI is in English and includes:

- a secure timetable connection entry point;
- manual date/time fallback for testing;
- interest, budget, and search-scope controls;
- timetable → search → verify loading states;
- responsive recommendation cards with source links.

The browser UI currently uses a small demo result adapter so the event-search flow can be tested without exposing credentials. The timetable connection is implemented server-side in `server.mjs`: the private URL is accepted only in the request body, never logged or persisted, and only class summaries/free blocks are returned to the browser. The production event adapter should call TinyFish Search, then TinyFish Fetch on promising event URLs. No password should ever be collected by the app itself.

The private iCalendar URL is intentionally absent from client-side source, Git history, and logs. It is not permanently stored for this prototype.

## TinyFish workflow

1. Open a Browser Context Profile setup session for the student's timetable system.
2. The student signs in in TinyFish's secure browser and saves the session.
3. Run TinyFish Agent on the timetable page to extract classes, dates, and times.
4. Generate free windows from the extracted timetable.
5. Run TinyFish Search with the selected date, time, interests, and budget.
6. Run TinyFish Fetch on candidate event pages and reject events outside the window or budget.

## Run locally

This is a dependency-free Node prototype. Run `node server.mjs`, then open `http://127.0.0.1:4173`. The `/api/timetable` endpoint fetches and parses the iCalendar URL server-side.

## Next integration decision

To make timetable login real, confirm which UCL timetable system/URL the student uses. The login handoff can then be wired to a TinyFish Browser Context Profile without asking for credentials in chat.
