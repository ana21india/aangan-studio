# Adding a channel (WhatsApp, web form)

Everything from the webhook handler onwards works on one shape, `CallEndedEvent` (`src/lib/voice/types.ts`), and already has a `channel` field (`phone`, `whatsapp`, `web`). The database allows all three values (`calls.channel`), the dashboard shows the channel, and the 40 test enquiries already include 10 WhatsApp threads and 10 web forms that run through the same pipeline. So a new channel only needs an **adapter at the front**: something that turns an incoming message or form into a `CallEndedEvent` and posts it.

## The shape

```json
{
  "providerCallId": "web-2026-10-14-0001",
  "channel": "web",
  "callerPhone": "+919812345678",
  "startedAt": "2026-10-14T09:12:00Z",
  "endedAt": null,
  "durationSec": null,
  "status": "completed",
  "transcript": "Name: Sumit Bhatt\nProject type: Residential, full home\nLocation: Kalyani Nagar\n...",
  "recordingUrl": null,
  "providerCostInr": null
}
```

- `providerCallId` must be unique per enquiry. It is the idempotency key, so a duplicate delivery never creates a second handoff.
- `callerPhone` must be present, in E.164. A form therefore needs a phone field; a WhatsApp message already has the sender's number.
- `transcript` is plain text. For a form, flatten its fields into labelled lines. For WhatsApp, join the messages with sender labels (`CALLER:` and `STUDIO:`). Gemini reads this text exactly as it reads a phone transcript.
- No Vaani minutes are charged for a text channel; only the Gemini tokens are logged.

## How to send it

`POST /api/webhooks/vaani/call-ended` accepts this body when it is signed: an HMAC-SHA256 of the raw body, hex, in the `x-vaani-signature` header, using `VAANI_WEBHOOK_SECRET`. `scripts/e2e.ts` is a working example of building and posting a signed event, and `src/lib/voice/mock.ts` shows how the test enquiries are converted. (The route name says "vaani" for historical reasons; it accepts any channel's normalised record.)

## What happens next, with no changes

Verify, deduplicate, store the caller and call, merge with an earlier enquiry from the same number within 60 minutes, extract and score with Gemini, then route: a designer handoff with an Accept button and a HubSpot deal for qualified enquiries, a HubSpot contact only for the others, and a front-desk alert for unsure ones. The Telegram booking-link fallback works unchanged because the phone number is known.

## What a real WhatsApp integration would still need

- **Receiving messages:** Vaani offers a WhatsApp integration in which an agent answers incoming messages, but its event format is undocumented here. Alternatively use the WhatsApp Business API directly and write the adapter above. Either way, a conversation must be closed into one transcript (for example after a quiet period) before it is posted.
- **Replying:** the pipeline does not reply to the sender; the agent or a person does. If a reply is wanted, add a small sender next to `src/lib/telegram/client.ts`.
- **Office hours:** `in_hours` is computed from the event's start time, so a message sent at night is correctly counted as after hours.
- **Consent:** a form should carry the same notice the call greeting gives (that an AI processes the enquiry).
