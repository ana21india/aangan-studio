# Privacy and India's DPDP Act: points that need a human decision

This is a checklist for the studio's owner and its legal adviser. It is **not legal advice**, and nothing here has been decided on the studio's behalf.

## What the system stores, and where

| Data | Where | Notes |
|---|---|---|
| Phone number, name | Neon (database), HubSpot contact | Phone numbers are masked in lists, logs and the public demo view. |
| Call transcript and extracted facts (area, size, scope, timeline, how they heard of us) | Neon | Budget is stored only if the caller volunteered it. |
| Call recording | Vaani (a link is stored in Neon) | The recording itself is held by Vaani. |
| The enquiry's handoff note | Neon, Telegram designers' group, HubSpot deal description | Contains the phone number and a summary. |
| Name and phone in the Cal.com booking link | Cal.com, and the browser URL | See point 7. |
| Admin passwords | Neon, as salted hashes only | Never stored in plain text. |

## Already in place

- The call greeting says the caller is speaking to an AI assistant and that the call is recorded.
- Only what the studio needs is collected; the agent never asks for a budget.
- Phone numbers are masked in logs and lists.
- Retention periods are configurable settings: recordings 90 days, transcripts and extracted fields 12 months.
- Secrets are only in environment variables; webhooks are verified; the admin area needs a login (or the explicit, read-only demo switch).

## Decisions and gaps for the owner

1. **Consent and notice.** Is disclosure at the start of the call enough, or should the caller also be able to decline recording and continue? Who is the "data fiduciary", and is a formal privacy notice (and a link to it) needed on the website and the form?
2. **Deletion is not automated.** The retention settings exist, but the job that deletes old recordings, transcripts and HubSpot records has **not been built**. Until it is, nothing is deleted automatically.
3. **Requests from callers.** There is no tool for a caller to see, correct or erase their data. Today this would be done by hand (the clean-up script shows how to remove a caller and their calls). Decide who handles such requests and how fast.
4. **Data leaves India.** Transcripts and numbers pass through services whose servers may be abroad: Vaani, Google (Gemini), HubSpot, Vercel, Neon (the database runs in the US East region), Telegram and Cal.com. Decide whether this is acceptable, or whether an Indian database region and processor agreements are needed.
5. **Gemini and training.** Check the terms of the Gemini API plan in use regarding retention and training on prompts.
6. **Telegram.** Handoff notes with phone numbers are posted to Telegram groups. Decide who may be in those groups, and what happens when a designer leaves.
7. **Personal data in a URL.** The booking link prefills the caller's name and phone number in its address. Such addresses can appear in browser history or logs. Decide whether to keep this convenience.
8. **Public demo view.** `DASHBOARD_PUBLIC_DEMO=true` exposes transcripts and handoff notes to anyone with the link (phone numbers are masked). It is for sample data only and must be off for real callers.
9. **Test data.** The current database holds only test calls with made-up numbers. Confirm none of it needs deleting before go-live.
10. **Incident handling.** Decide who is told, and how, if data is exposed, and keep a record of processing activities.
11. **Children and sensitive data.** The agent does not ask for either, but a caller could volunteer them. Decide what the studio does if that happens.
12. **Access.** Who counts as an admin, how access is removed when someone leaves, and whether two-factor sign-in is needed.
