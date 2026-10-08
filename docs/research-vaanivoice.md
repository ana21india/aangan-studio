# Research: Vaani (vaanivoice.ai), Cal.com, HubSpot, Telegram (as of 2026-10-07)

Supersedes the Vaani section of docs/research.md, which covered a different company (vaaniai.io). Do not reuse its Vaani claims. Cal.com, HubSpot and Telegram sections are carried over unchanged from that file.

Method: WebFetch of the official docs site https://docs.vaanivoice.ai (Mintlify-style, with a machine-readable index at https://docs.vaanivoice.ai/llms.txt; every page is fetchable as `.md`). Fetch results were summarised by a small model, so field names are as reported by it; confirm exact JSON against a real test call. I could not call the API (no account/key).

---
## 1. Vaani (vaanivoice.ai) - official docs

### 1.0 Identity
- Marketing site https://vaanivoice.ai describes "Vaani AI Research", "Stealth Mode - Private Beta", with "Get a Demo" and "Join our Beta Program" CTAs; no pricing or docs links in the fetched text. https://vaanivoice.ai/pricing and /sitemap.xml return 404.
- Docs: https://docs.vaanivoice.ai ("Vaani Backend API", API v2.0.0). Base URL `https://api.vaanivoice.ai`, all paths under `/api/`. Auth header `X-API-Key: vaani_<key>` (key created in app.vaanivoice.ai Settings). One page shows `sk-vaani-...` as the key format; treat the prefix as UNVERIFIED.
- A recording URL in the docs sample points to `uat.vaaniresearch.com`, so the platform seems tied to vaaniresearch.com (Bangalore company in the earlier report). Different from vaaniai.io.
- Doc pages used: getting-started/{overview,create-account,create-agent,setup-telephony}, concepts, sdk, guides/{webhook-setup,integrations,call-logs}, api-reference/{introduction,create-agent,update-persona,update-training,update-experience,update-analysis,update-deployment,call-history,call-details,campaigns/webhooks}, api-reference/openapi.json. All under https://docs.vaanivoice.ai/ (add `.md`).

### 1.1 Inbound phone number in India; bring your own number
- Two ways (https://docs.vaanivoice.ai/getting-started/setup-telephony.md): (a) "Direct provisioning": Settings > Telephony > Provision a Number, pick country and area code, assign to agent; (b) "Bring your own SIP trunk": connect Twilio, Telnyx or Vonage with SIP host, username, password, port; outbound number in E.164.
- India: docs use `+91XXXXXXXXXX` examples and say India is among supported regions ("a growing list of countries"). UNVERIFIED: whether Vaani can provision an Indian DID specifically (the docs only say India is supported), cost of a number, KYC/TRAI requirements, and whether you can port an existing Indian number or forward from a landline to a provisioned number or to your own SIP trunk. Ask the vendor. Practical BYO route: an Indian DID from a carrier that offers SIP (UNVERIFIED that Vaani accepts non-Twilio/Telnyx/Vonage trunks).
- Assigning a number to an agent for inbound: `PATCH /api/agent/{agent_id}/deployment` with `{"deployment":{"phone":{"call_type":{"Inbound":"+91...","Outbound":["+91..."]}}}}`; `""` clears inbound (https://docs.vaanivoice.ai/api-reference/update-deployment.md). Call history has a `call_type` of Inbound/Outbound, so inbound is supported.

### 1.2 System prompt and knowledge documents; API for a sync script
- System prompt: dashboard Agent Config, or API `PATCH https://api.vaanivoice.ai/api/agent/{agent_id}/persona` with `{"identity":{"system_prompt":"...","personality":{"tone":"friendly"},"greeting_message":{"agent_message":"...","agent_speech_delay":1,"interruptible":true}}}` (https://docs.vaanivoice.ai/api-reference/update-persona.md). Body is merged; omitted fields stay. Prompt supports `{variable}` placeholders filled from call `metadata` (names must match exactly). Create agent: `POST` create-agent with `agent_display_name` and optional `config` (persona, training, experience, analysis, deployment_config). Also list and delete agents. The Python SDK `vaani-sdk` wraps these (https://docs.vaanivoice.ai/sdk.md).
- Knowledge: `PATCH /api/agent/{agent_id}/training` accepts `knowledge: {use_rag: bool, rag_knowledge_base_dict: {...provider config...}}` and `know_how: {faq:{q:a}, pain_points:{...}, guardrails:{...}}` (https://docs.vaanivoice.ai/api-reference/update-training.md).
  - A sync script can therefore push the system prompt, FAQ pairs and guardrails via API today. FAQ key/value pairs are the easiest route for short facts.
  - UNVERIFIED: any endpoint to upload files (PDF, DOCX) as knowledge. `rag_knowledge_base_dict` is described only as "RAG provider configuration" (likely points at an external vector store you host); no upload endpoint appears in llms.txt or openapi.json. The docs do not describe a dashboard document-upload feature either. Ask the vendor how to load documents.
- Caveat: openapi.json as fetched lists only trigger-call, call-history, transcript, stream and call_details, not the agent PATCH endpoints, so the spec is incomplete versus the guide pages.

### 1.3 Post-call webhook (https://docs.vaanivoice.ai/guides/webhook-setup.md)
- Register URL in dashboard Settings > Webhooks. Must be public HTTP(S), return 200. Works for inbound and outbound.
- Events (about 10): `call_started`, `call_ringing`, `user_picked_up_at`, `call_rejected`, `call_no_answer`, `call_failed`, `human_transfer_initiated`, `human_transfer_successful`, `human_transfer_failed`, `call_ended`, `call_postprocessing`.
- The post-call event to use is `call_postprocessing` (sample):
```
{ "event":"call_postprocessing","call_id":"outbound-1784899978-36cec598",
  "timestamp":"2026-07-24T13:34:22.278854+00:00",
  "data":{ "room_name":"...","call_id":"...","call_duration":55150.02 (MILLISECONDS),
    "end_reason":"Call ended","summary":"...","entities":{"name":"..."},
    "dispositions":{"acas":"Name Collected"},
    "recording_url":"https://.../api/stream/<call_id>",
    "transcript":"[13:33:14] AGENT: ...\n[..] USER: ..." } }
```
  `call_ended` is a lighter event: `{event, room_name, call_duration (SECONDS), end_reason}`. Do not mix the two units.
- Field mapping: transcript = `data.transcript` (one string, timestamped AGENT:/USER: lines); duration = `data.call_duration` (ms in postprocessing); recording = `data.recording_url` (a Vaani stream URL, so it likely needs your X-API-Key to download; UNVERIFIED); id = `call_id`; status = `end_reason` plus `dispositions` (no explicit `status` field in the sample).
- NOT in the sample: caller number, cost, direction. Get them with `GET /api/call-history` (`from_number`, `to_number`, `call_cost` in credits, `call_status`, `call_type`) or call details, keyed by `call_id`. UNVERIFIED whether the real payload contains more fields than the sample.
- Signature: the webhook-setup guide documents NO signature, retry or timeout details. The campaign webhooks page (https://docs.vaanivoice.ai/api-reference/campaigns/webhooks.md) documents HMAC-SHA256 with headers `X-Vaani-Signature` and `X-Vaani-Timestamp`, 5 s response limit, retries at 0/5/25/125/625 s (5 attempts), idempotency by event id, with events `call.completed`, `call.failed`, `call.no_answer` and `campaign.*`. These are campaign (outbound batch) webhooks and use different event names. UNVERIFIED that the dashboard webhook above is signed. Mitigation: put a secret token in the webhook URL path or query and check it, and log the headers of a real test call.

### 1.4 Warm transfer to a phone number
- Webhook events `human_transfer_initiated/successful/failed` carry `transfer_type: "warm"` and `phone_number: "+91..."`, `reason`, `sip_status` (busy etc.). So warm transfer to a phone number exists as a feature.
- UNVERIFIED: how to configure the destination (persona `actions` is the likely place; no page documents it) and whether cold transfer exists. Ask vendor or inspect the dashboard Agent Config.

### 1.5 Marathi, Hindi, English; mid-call switching
- UNVERIFIED. Docs say only "select which language your agent speaks" (affects STT and TTS) and persona example `senses_capabilities.language: "en"`; STT/LLM/TTS providers are configurable per agent (example: Deepgram nova-3, OpenAI gpt-4o, ElevenLabs). No language list and no mention of Marathi, Hindi or code-switching in the fetched pages. Marketing page mentions en-IN only. Whether Marathi works depends on the chosen STT/TTS provider; test in the dashboard. Mid-call switching: no documentation.

### 1.6 SMS or WhatsApp
- WhatsApp: yes as a channel integration (https://docs.vaanivoice.ai/guides/integrations.md): connect a WhatsApp Business account via OAuth and assign an agent to answer incoming WhatsApp messages. That is inbound chat handling; sending an outbound WhatsApp message from a call is not documented.
- SMS: no documentation found. UNVERIFIED. Send SMS or Telegram from your own backend.
- Also documented: a Cal.com integration so the agent can book meetings during calls (Cal.com API key and event type), which may reduce your own Cal.com glue.

### 1.7 Missed or never-connected calls
- Partly. Outbound: events `call_no_answer`, `call_rejected`, `call_failed` (with SIP error). Inbound: only a general `call_started`/`call_ringing`. Call history is described as filterable by status (the guide's header mentions "missed, not connected, failed"), but the fetched page body gave no status enum. UNVERIFIED for inbound calls that ring but are never answered by the agent. Plan: reconcile via `GET /api/call-history` (has `call_status`, `post_processing_status`).

### 1.8 Pricing in INR
- UNVERIFIED. No pricing page (vaanivoice.ai/pricing returns 404), no pricing in docs. Calls cost "credits" (`call_cost`), and the SDK has `InsufficientBalanceError`, so it is prepaid balance. Exchange rate of credits to INR unknown. Get a written quote. A web search returned no Vaani pricing (other Indian vendors quote roughly Rs3-7/min, not Vaani figures).

### 1.9 API to list calls or fetch a call
- Yes.
  - `GET https://api.vaanivoice.ai/api/call-history?page=1&page_size=50` (max 200). Returns call_id, call_type, call_status, agent_id/name, client id/name, from_number, to_number, Start_time, End_time, duration_ms, call_cost (credits), call_summary, call_eval_tag, recording_api, call_transcription, call_metadata, chat_history, callback_requested, post_processing_status; plus pagination (total_count, has_next). No documented date or status filter parameters in the API (the dashboard has them).
  - `GET /api/call_details/{call_id}` (openapi shows `/api/call_details/{client}/{call_id}`; inconsistent, test both): transcription, entity, conversation_eval, summary, call_eval_tag.
  - `GET /api/transcript/{call_id}`, `GET /api/stream/{call_id}` (audio).
  - `POST /api/trigger-call/` (outbound: agent_id, contact_number, name, voice, metadata, outbound_number).

### Vaani summary
Works: inbound numbers (provisioned or BYO SIP), agent prompt, FAQ and guardrails settable by API, post-call webhook with transcript/summary/recording/duration, warm-transfer events, call list/fetch API, Cal.com and WhatsApp integrations.
Doesn't (per docs): no cost, caller number or explicit status in the webhook sample; no documented SMS.
Unverified: Indian DID availability and number porting, document upload for knowledge, webhook signature for the dashboard webhook, Marathi/Hindi support and language switching, warm-transfer configuration, missed inbound calls, INR pricing.

---
## 2. Cal.com

(a) Prefill (https://cal.com/docs/core-features/bookings/prefill-fields): `?name=...&email=...`; phone via booking question `attendeePhoneNumber=%2B91...` (URL-encode the +), or as location `location={"value":"phone","optionValue":"%2B91..."}`; also `notes=`, `guests=`; custom questions use their identifier (Advanced > Booking Questions). Example: `https://cal.com/USER/EVENT?name=Asha&email=a%40b.com&attendeePhoneNumber=%2B919999999999&notes=call_123`. The event type needs a phone question for `attendeePhoneNumber` to show. Carrying a call id via a custom question identifier or `notes` should work; hidden-field prefill is UNVERIFIED.

(b) BOOKING_CREATED (https://cal.com/docs/core-features/webhooks): envelope `{triggerEvent, createdAt, payload}`; payload includes `uid, bookingId, iCalUID, status, startTime, endTime, title, type, eventTitle, eventTypeId, organizer{id,name,email,timezone,...}, attendees[]`, `responses`, `userFieldsResponses`, `customInputs`, `metadata`, `location`, `videoCallData`, `price`, `currency`. Signature: header `x-cal-signature-256` = hex HMAC-SHA256 of the raw body with the secret you set on the webhook. Version header `x-cal-webhook-version`. Exact key of attendee phone inside `responses` is UNVERIFIED; log a test payload.

(c) Free plan and webhooks: CONFLICTING / UNVERIFIED. https://cal.com/pricing lists Webhooks as a feature, but one fetch summary placed it only under Teams ($12/user/mo) and up, while Cal.com's comparison page and third parties imply free includes webhooks. Test on a free account (Settings > Developer > Webhooks). No documented count or rate limits found.

---
## 3. HubSpot

(a) Scopes (private app, now labelled "legacy app": Development > Legacy apps > Create legacy app > Private): `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`. Move a stage with `PATCH /crm/v3/objects/deals/{id}` setting `dealstage`. Associate a deal to a contact via `associations` with the association type id. Docs: https://developers.hubspot.com/docs/api-reference/crm-deals-v3/guide and .../crm-contacts-v3/guide. Contact needs email, firstname or lastname; upsert is by email (or a unique custom property). Phone-only contacts do not dedupe natively: search first (`POST /crm/v3/objects/contacts/search`) or add a unique custom phone property.

(b) IDs: `GET /crm/v3/pipelines/deals` returns each pipeline `id` and its `stages[].id` (also `/crm/v3/pipelines/deals/{pipelineId}/stages`); UI: Settings > Objects > Deals > Pipelines. The guide (https://developers.hubspot.com/docs/api-reference/crm-pipelines-v3/guide) names `crm.pipelines.orders.read`, which is odd for deals; deals read scope probably suffices (UNVERIFIED, test). Default pipeline id is typically `default` (UNVERIFIED for this account).

(c) Free tier: private apps are available on Free, Starter, Professional and Enterprise; max 20 per account (https://developers.hubspot.com/docs/api/private-apps). They are flagged "legacy" in favour of the new developer platform but still work. Deals exist in free CRM; Free/Starter are limited to 1 deal pipeline (third-party sources, not confirmed on HubSpot's own page).

---
## 4. Telegram Bot API

- Bot messaging a user who has not started it: not allowed. Official pages fetched (api, features, faq) do not state it explicitly, so UNVERIFIED in official text; the well-known behaviour is `sendMessage` failing with 403 "bot can't initiate conversation with a user". Design so the caller taps a link first.
- Deep link: `t.me/BOT?start=PAYLOAD`; payload up to 64 chars, characters `A-Z a-z 0-9 _ -` (https://core.telegram.org/bots/features#deep-linking). Bot receives `/start PAYLOAD`. A call id fits (a UUID is 36 chars); use base64url for anything else. Vaani call ids like `inbound-1784899978-36cec598` also fit.
- Contact share: `ReplyKeyboardMarkup` with `KeyboardButton(request_contact=true)` returns a `Contact` (`phone_number, first_name, last_name?, user_id?, vcard?`) (https://core.telegram.org/bots/api#keyboardbutton). Private chats only. From general knowledge: users can forward someone else's contact, so check `contact.user_id == message.from.id`; the number may lack a "+", so normalise to E.164 before matching Vaani's `from_number`.
- Webhook secret: `setWebhook` with `secret_token` (1-256 chars, `A-Za-z0-9_-`); each update carries header `X-Telegram-Bot-Api-Secret-Token`; compare to your value (https://core.telegram.org/bots/api#setwebhook).
- Broadcast limit about 30 messages/sec (https://core.telegram.org/bots/faq).

---
## Final summary (under 200 words)

Works: vaanivoice.ai has real public docs. Inbound numbers via Vaani-provisioned numbers or your own SIP trunk (Twilio/Telnyx/Vonage); `PATCH /agent/{id}/persona` sets the system prompt and `/training` sets FAQ, guardrails and RAG config, so a sync script is feasible. `call_postprocessing` webhook carries transcript, duration (ms), recording URL, summary, entities, dispositions. Warm-transfer events exist. Call list and fetch-by-id APIs exist. WhatsApp and Cal.com integrations exist.

Doesn't (per docs): webhook sample lacks caller number, cost and explicit status (fetch them from call-history); no SMS documented.

Unverified: Indian DID availability and porting; file upload for knowledge documents; signature on the dashboard webhook (only campaign webhooks document HMAC `X-Vaani-Signature`); Marathi/Hindi support and mid-call switching; transfer configuration; unanswered inbound call reporting; any INR pricing (no pricing page). Ask Vaani sales for these in writing.
