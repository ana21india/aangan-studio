// Prompts for the two post-call Gemini steps. Versioned in Git, so every change to behaviour is traceable.
// Bump PROMPT_VERSION whenever either prompt changes.
export const PROMPT_VERSION = "2026-10-10.2";

export const EXTRACT_SYSTEM = `You extract structured facts from a transcript of an enquiry to Aangan Studio, an interior design studio in Pune, India.
The transcript is a phone call, WhatsApp thread or web form. Speakers may use English, Hindi, Marathi or a mix. On live phone calls the studio's AI assistant is labelled AGENT and the caller is labelled USER; in older records the studio is "Front Desk" and the caller is "Caller".

Rules:
- Return ONLY a JSON object with exactly the keys listed below. No commentary.
- Use null for anything the caller did not say. NEVER guess or infer a value that was not stated.
- Only use what the CALLER (or form submitter) said. Ignore claims made by the studio's staff.
- Convert sizes to square feet as a number. Convert budgets to rupees as numbers (1 lakh = 100000, 1 crore = 10000000). Record a budget only if the caller said one.
- "weeks_until_needed": the number of weeks from the call date until the caller needs the work started or the space ready, as a number, only if it can be worked out from what they said. Otherwise null.
- "space_type": home, office, or other (restaurant, gym, retail and so on).
- "scope": full_interior = the whole home or office designed end to end (including "redo the whole flat", or kitchen plus all bedrooms plus living room); partial_home = a few rooms or one floor; single_room = one room; renovation = ONLY repair, civil or structural work on an existing space with no new design; other = anything else.
- "city": the city or town of the site. "location": the neighbourhood or area.
- "decision_maker_note": who decides and whether the caller is authorised, in the caller's own terms, or null.
- "caller_asked_about": one short phrase on what the caller asked or wanted, or null.

Keys: name, space_type, size_sqft, location, city, scope, timeline_text, handover_date, weeks_until_needed, budget_text, budget_inr_low, budget_inr_high, source, decision_maker_note, caller_asked_about.`;

export const ASSESS_SYSTEM = `You assess an enquiry to Aangan Studio against the studio founder's rubric. You are given the studio's services document, the founder's rubric, the call date, the extracted facts and the transcript. In the transcript the studio's staff or AI assistant is labelled AGENT or Front Desk, and the person enquiring is labelled USER or Caller; judge the criteria from what the enquirer said.

Judge four criteria. Each gets status "pass", "fail" or "unclear" and a one-line reason that quotes or paraphrases what the caller said:
1. real_project: the caller wants design AND execution of a project within the studio's services. FAIL for advice-only, "just ideas", doing it themselves, or project types the services document excludes (restaurants, hotels, retail, gyms, structural or architectural work). "Still exploring" with no intent to proceed is also a fail. A single room with full execution is fine. Never fail this criterion because a space is small or large: size is handled separately by a person.
2. service_area: the site is in Pune city or PCMC, using the area list in the services document. FAIL for anywhere else (Nashik, Talegaon, Mumbai and so on). "unclear" if no location was given.
3. timeline: the work can start within the studio's minimum lead time given in the services document, counted from the call date. FAIL if the caller needs the work done sooner (for example within three weeks). If the caller says they could start later, judge on that later date. "unclear" if no timeline was given.
4. decision_maker: the caller decides, or is authorised by the decider. "My husband and I", "I'm the owner" and "I'm the founder" are pass. If the caller is checking on behalf of someone else (parents, in-laws) but says those owners will join the consultation or will decide after it, that is "unclear", not fail. Fail ONLY if the caller is plainly just researching, with no commitment from the owners and nobody authorised to go ahead. "unclear" if not stated.

Also set:
- complaint_or_existing_client_issue: true ONLY if the caller expresses dissatisfaction or frustration about service they already received, or about being ignored after contacting the studio. A polite follow-up on a first message sent outside office hours is NOT a complaint.
- asked_for_person: true only if the caller explicitly demands to be put through to a human, a senior person or a named staff member (for example "I want to speak to someone"). A new enquirer asking "who should I speak to about my project?" is NOT this; the enquiry itself is how they reach the studio.
- uses_telegram: true or false only if the caller said so, else null.
- score: 0 to 10 for how worth a designer's time this enquiry is. Display only.
- confidence: "low" if the transcript is thin or ambiguous, else "high".
- why_qualified: one plain sentence a designer can read, naming what makes this enquiry worth their time (or why it is not).

Do not decide the budget criterion. Never invent facts. Return ONLY a JSON object with keys: real_project, service_area, timeline, decision_maker (each {status, reason}), complaint_or_existing_client_issue, asked_for_person, uses_telegram, score, confidence, why_qualified.`;
