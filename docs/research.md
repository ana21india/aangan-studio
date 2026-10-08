# Research: Vaani AI, Cal.com, HubSpot, Telegram (as of 2026-10-07)

Method: WebFetch/WebSearch of official pages. For Vaani, whose docs are a JS single-page app, I also downloaded the site's JS bundles with curl and read the developer-portal source. Anything not confirmed is marked UNVERIFIED.

---
## 1. Vaani AI

### 1.0 Which "Vaani"? (confidence: MEDIUM, about 60%)
At least five unrelated products share the name:

| Product | Site | Notes |
|---|---|---|
| VaaniAI / VaaniAIOS (Tech Brainbucks Infosoft Pvt Ltd) | https://vaaniai.io (portal: portal.vaaniai.io) | Indian; lists Marathi, Hindi, English; has Pune pages; developer portal with API key + HMAC webhooks. Best match, assumed below. |
| VaaniYantra | https://vaaniyantra.com (docs seen only on raw-IP host 34.138.86.231.sslip.io) | Twilio/Plivo/Exotel numbers, signed webhooks, from Rs5/min. Docs host looked unofficial; low trust. |
| Vaani Labs | https://vaanilabs.in | Mumbai, enterprise, 40+ languages, no public API docs found |
| Vaani Research Labs | https://vaaniresearch.com | Bangalore, enterprise |
| Vaani by OMind | https://mvdocs.omind.ai | Docs URL returned 404 |

The user said "Vaani AI", which matches the vaaniai.io brand ("Vaani AI" in its llms.txt). CONFIRM WITH THE USER which vendor they have an account with. Sections 1.1-1.8 are from vaaniai.io unless stated.

Sources: https://vaaniai.io/llms.txt, https://vaaniai.io/sitemap.xml, https://vaaniai.io/assets/ClientDeveloperPortal-Bqrir_zG.js (the in-app "API & Webhooks Console"), https://vaaniai.io/assets/ClientKnowledgeBase-B-5r0cAS.js, https://vaaniai.io/assets/sovereign-index-BNnJoURt.js. The public /docs page is client-rendered and exposes only marketing text. No static API reference was found.

### 1.1 Inbound phone number in India
- Telephony is via Tata Smartflo (also "Jio and Airtel SIP"), per llms.txt. A "DID Bank" and "DIDs" admin page exist in the app, and `GET /crm/agents` returns `assigned_dids` (e.g. "+918065076920"), so numbers (DIDs) are provisioned by the platform and assigned to an agent.
- UNVERIFIED: whether you can bring your own number, port one, or forward from an existing landline. No self-serve doc found. Ask sales (sales@vaaniai.io, +91 70206 09101).
- The portal onboarding asks for PAN, GST-style fields, address proof and a signed service agreement (seen in the bundle), so expect KYC.

### 1.2 Knowledge documents and system prompt; can a sync script use an API?
- Dashboard: "AI Knowledge Base Hub". Upload PDF, DOCX, TXT, CSV, JSON up to 10 MB; documents are queried in real time during calls; you map/unmap documents to agents with checkboxes. System prompt: the agent form has `system_prompt` (textarea), `greeting_message`, `agent_language`, `agent_persona`.
- Internal routes exist in the front-end bundle: `GET/POST /tenant/knowledge-base`, `PUT/DELETE /tenant/knowledge-base/{id}`. These are dashboard (session) routes and are NOT in the public developer portal.
- Public API-key endpoints documented (header `x-api-key`): `POST /voice/calls/initiate`, `POST /crm/leads`, `POST /crm/leads/webhook/{client_id}`, `GET /crm/agents` (read only), `POST /campaigns`, `POST /campaigns/:id/leads`, `POST /campaigns/:id/start`, `GET /campaigns/:id`, `GET /voice/call-logs`. Base URL = `<portal origin>/api`. There is no knowledge-base or prompt management in this list.
- Verdict: a sync script via public API is NOT confirmed possible. UNVERIFIED whether `/tenant/knowledge-base` accepts API keys (I could not call it without an account). Plan A: upload via dashboard. Plan B: ask Vaani support to confirm API-key access to those routes.

### 1.3 Post-call webhook
Event `status_complete`, registered in the Developer portal (HTTPS URL only). Sample from the portal (it is an OUTBOUND call example):
```
{ "event":"status_complete","timestamp":"...",
  "call": { "id","call_sid","lead_id","external_lead_id","lead_name",
    "callee_number","direction":"outbound","status":"completed",
    "duration":78,"disposition","outcome","confidence_score",
    "sentiment","sentiment_score","intent_score","intent_signals":[],
    "qualification_tier","deal_value","next_followup_date","summary",
    "transcript":"AI: ...\nCustomer: ...",
    "recording_url":"https://storage.vaaniaios.com/recordings/...mp3",
    "call_start_time","call_end_time","metadata":{...} } }
```
- Transcript is one newline-separated string ("AI: ... / Customer: ..."), not an array. `duration` is seconds. Recording is `recording_url`. Status is `status` plus `disposition`/`outcome`.
- Caller number for inbound: UNVERIFIED. Only `callee_number` appears in the sample; semantics for inbound are undocumented. Log a raw payload from a real test call.
- Cost: no cost field documented. UNVERIFIED.
- Signature: header `X-Vaani-Signature` = hex HMAC-SHA256 of the raw body using the endpoint's Webhook Secret (Node and Python examples in portal; use timing-safe compare). Your server must return HTTP 200 `{"received":true}` within 5 seconds. Retry policy: UNVERIFIED.
- Polling alternative: `GET /voice/call-logs` (id, phone, duration, disposition, summary, recording_url).

### 1.4 Warm transfer to a human number
- Marketing copy: "Live Monitor & Human Transfer ... hand off seamlessly to a human agent on the same call", and "Owner-in-the-Loop" ("transfer to me" mid-call, in the call-screener product). Appears to be a product feature.
- UNVERIFIED: how to configure the destination number, warm vs cold, any API. Ask the vendor.

### 1.5 Marathi / Hindi / English
- Confirmed in the agent-creation UI: `agent_language` options include `hi-IN`, `bilingual` (Hinglish), `en-IN`, `mr-IN` (with a Marathi default greeting), plus Gujarati, Tamil, Telugu, Kannada, Malayalam, Bengali. llms.txt claims native speech-to-speech for English, Hindi, Hinglish, Tamil, Telugu, Gujarati, Marathi. Pune pages say "Marathi, Hindi & English".
- Mid-call language switching: only the "bilingual (Hinglish)" mode is documented. Auto-detect or switching to Marathi mid-call is UNVERIFIED. Test with real Marathi calls; quality claims are marketing.

### 1.6 SMS
- Marketing says follow-ups via "WhatsApp, RCS, SMS, and email from approved templates, triggered by call outcomes"; sample dialogue says an SMS and WhatsApp booking pass was sent. No API or setup doc; Indian DLT template registration would apply. UNVERIFIED in practice. Do not rely on it; send SMS/Telegram from your own backend.

### 1.7 Missed / never-connected calls
- The webhook console lists only `status_complete`. Whether it fires for calls that never connected (hang-up before pickup, rejected) is UNVERIFIED. Marketing says it "captures ~95% of missed calls" (calls an owner would miss), not a missed-call report. Plan: also poll `GET /voice/call-logs` and compare against telephony records.

### 1.8 Pricing
- https://vaaniai.io/pricing and llms.txt: Rs6,500 / month per dedicated concurrent channel, unlimited minutes, 7-day free trial, no card. A wallet/PAYG balance also exists (API returns 402 "Wallet balance insufficient"). GST (18%) likely extra (UNVERIFIED).
- CONFLICT: a search snippet attributed other figures (Rs22,499/channel/month, Rs3.20/min overage, Rs31,999 for 5 channels) to Vaani AI. I could not reproduce this on vaaniai.io; treat as UNVERIFIED (possibly a different Vaani or a stale page). Get a written quote.
- For reference, VaaniYantra: from Rs5/min (https://34.138.86.231.sslip.io/docs/user-guide).

---
## 2. Cal.com

(a) Prefill (https://cal.com/docs/core-features/bookings/prefill-fields): `?name=...&email=...`; phone via booking question `attendeePhoneNumber=%2B91...` (URL-encode the +), or as location `location={"value":"phone","optionValue":"%2B91..."}`; also `notes=`, `guests=`; custom questions use their identifier (Advanced > Booking Questions). Example: `https://cal.com/USER/EVENT?name=Asha&email=a%40b.com&attendeePhoneNumber=%2B919999999999&notes=call_123`. The event type needs a phone question for `attendeePhoneNumber` to show. Carrying a call id via a custom question identifier or `notes` should work; hidden-field prefill is UNVERIFIED.

(b) BOOKING_CREATED (https://cal.com/docs/core-features/webhooks): envelope `{triggerEvent, createdAt, payload}`; payload includes `uid, bookingId, iCalUID, status, startTime, endTime, title, type, eventTitle, eventTypeId, organizer{id,name,email,timezone,...}, attendees[]`, `responses`, `userFieldsResponses`, `customInputs`, `metadata`, `location`, `videoCallData`, `price`, `currency`. Signature: header `x-cal-signature-256` = hex HMAC-SHA256 of the raw body with the secret you set on the webhook. Version header `x-cal-webhook-version`. Exact key of attendee phone inside `responses` is UNVERIFIED; log a test payload.

(c) Free plan and webhooks: CONFLICTING / UNVERIFIED. https://cal.com/pricing lists Webhooks as a feature, but one fetch summary placed it only under Teams ($12/user/mo) and up, while Cal.com's comparison page and third parties imply free includes webhooks. I could not resolve which plan column holds it. Test on a free account (Settings > Developer > Webhooks). No documented count or rate limits found.

---
## 3. HubSpot

(a) Scopes (private app, now labelled "legacy app": Development > Legacy apps > Create legacy app > Private): `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`. Move a stage with `PATCH /crm/v3/objects/deals/{id}` setting `dealstage`. Associate a deal to a contact via `associations` with the association type id. Docs: https://developers.hubspot.com/docs/api-reference/crm-deals-v3/guide and .../crm-contacts-v3/guide. Contact needs email, firstname or lastname; upsert is by email (or a unique custom property). Phone-only contacts do not dedupe natively: search first (`POST /crm/v3/objects/contacts/search`) or add a unique custom phone property.

(b) IDs: `GET /crm/v3/pipelines/deals` returns each pipeline `id` and its `stages[].id` (also `/crm/v3/pipelines/deals/{pipelineId}/stages`); UI: Settings > Objects > Deals > Pipelines. The guide (https://developers.hubspot.com/docs/api-reference/crm-pipelines-v3/guide) names `crm.pipelines.orders.read`, which is odd for deals; deals read scope probably suffices (UNVERIFIED, test). Default pipeline id is typically `default` (UNVERIFIED for this account).

(c) Free tier: private apps are available on Free, Starter, Professional and Enterprise; max 20 per account (https://developers.hubspot.com/docs/api/private-apps). They are flagged "legacy" in favour of the new developer platform but still work. Deals exist in free CRM; Free/Starter are limited to 1 deal pipeline (third-party sources, not confirmed on HubSpot's own page).

---
## 4. Telegram Bot API

- Bot messaging a user who has not started it: not allowed. The official pages I fetched (api, features, faq) do not state it explicitly, so this is UNVERIFIED in official text; the well-known behaviour is `sendMessage` failing with 403 "bot can't initiate conversation with a user". Design so the caller taps a link first.
- Deep link: `t.me/BOT?start=PAYLOAD`; payload up to 64 chars, characters `A-Z a-z 0-9 _ -` (https://core.telegram.org/bots/features#deep-linking). Bot receives `/start PAYLOAD`. A call id fits (a UUID is 36 chars); use base64url for anything else.
- Contact share: `ReplyKeyboardMarkup` with `KeyboardButton(request_contact=true)` returns a `Contact` (`phone_number, first_name, last_name?, user_id?, vcard?`) (https://core.telegram.org/bots/api#keyboardbutton). Private chats only. From general knowledge (not confirmed in fetched text): users can forward someone else's contact, so check `contact.user_id == message.from.id`; the number may lack a "+", so normalise to E.164 before matching Vaani's number.
- Webhook secret: `setWebhook` with `secret_token` (1-256 chars, `A-Za-z0-9_-`); each update carries header `X-Telegram-Bot-Api-Secret-Token`; compare to your value (https://core.telegram.org/bots/api#setwebhook).
- Broadcast limit about 30 messages/sec (https://core.telegram.org/bots/faq).

---
## Summary (what works / doesn't / surprises)

Works: Vaani (vaaniai.io) offers a post-call HMAC-SHA256 webhook (`X-Vaani-Signature`) with transcript, duration, recording URL, summary and status; Marathi (`mr-IN`), Hindi, English and Hinglish are selectable; flat Rs6,500/channel/month. Cal.com prefill of name, email and phone and signed BOOKING_CREATED webhooks are documented. HubSpot private apps with contact and deal scopes work on free CRM. Telegram deep-link payload (64 chars) and `secret_token` verification are solid.

Doesn't / unconfirmed: no public Vaani API for knowledge base or prompt, so a sync script is unproven (dashboard upload only). No cost field; inbound caller-number field undocumented. SMS, warm-transfer setup, never-connected-call events and mid-call language switching are marketing-only. A bot cannot message first, so the caller must tap the link.

Surprises: "Vaani" is at least five different companies, and the docs are only readable from the SPA bundle. The webhook sample is outbound-only. Cal.com free-plan webhook availability conflicts across its own pages. HubSpot free is limited to one deal pipeline. Vaani pricing quoted elsewhere (Rs22,499) conflicts with the site.
