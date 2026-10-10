# Draws docs/as-built-swimlane.svg in the same structure as the original plan (components map v5):
# lanes down the left, six layers across (Trigger, Input, Context, Processing, AI, Output), a "Qualified?" decision.
import html

LANES = [("Caller", ""), ("Vaani AI", "voice + live AI"), ("Gemini", "API, post-call"), ("Neon", "database + logs"),
         ("HubSpot", "CRM"), ("Vercel", "webhook + hosting"), ("Cal.com", "booking"), ("Telegram", "handoff + alerts"),
         ("Designer /", "front desk"), ("Nikhil", "founder + admins"), ("GitHub", "code + deploy")]
COLS = [("Trigger", 150, 370), ("Input", 370, 590), ("Context", 590, 820), ("Processing", 820, 1050), ("AI", 1050, 1390), ("Output", 1390, 2040)]
TOP = 100
LH = 92
BH = 70
W = 2040
KIND = {"ai": ("#efecfb", "#5b4bb7"), "out": ("#e2f3ec", "#1f7a5c"), "esc": ("#fdeacb", "#b46a14"),
        "sys": ("#ffffff", "#555555"), "build": ("#f0ede6", "#8a8578")}
B = {}


def box(i, lane, cx, w, title, subs, kind, dashed=False):
    B[i] = dict(lane=lane, cx=cx, w=w, title=title, subs=subs, kind=kind, dashed=dashed)


def cy(i):
    return TOP + B[i]["lane"] * LH + LH // 2


def L(i, dy=0):
    return (B[i]["cx"] - B[i]["w"] // 2, cy(i) + dy)


def R(i, dy=0):
    return (B[i]["cx"] + B[i]["w"] // 2, cy(i) + dy)


def T(i, dx=0):
    return (B[i]["cx"] + dx, cy(i) - BH // 2)


def Bo(i, dx=0):
    return (B[i]["cx"] + dx, cy(i) + BH // 2)


box("A1", 0, 260, 190, "Calls in", ["Browser test now;", "real number later"], "sys")
box("A2", 0, 480, 190, "Caller's voice", ["Speech + call time"], "sys")
box("A3", 0, 1860, 250, "Booked on the call", ["Picks a time with the agent"], "out")
box("V1", 1, 1190, 230, "Answers + converses", ["Own AI: greeting, questions,", "gate check, books, transfers"], "ai")
box("G1", 2, 1190, 230, "Extract, judge, note", ["Gemini API, post-call only"], "ai")
box("K1", 3, 705, 200, "Knowledge", ["services, qualified, FAQ", "(pricing never sent)"], "sys")
box("N1", 3, 935, 200, "Call + cost log", ["Transcript, fields,", "bookings, costs"], "sys")
box("H1", 4, 1860, 250, "Contact + deal", ["Deal only if qualified;", "moves to Meeting Booked"], "out")
box("S1", 5, 935, 200, "Webhook handler", ["Token check, store,", "dedupe, route"], "sys")
box("D1", 5, 1480, 120, "Qualified?", [], "sys")
box("C2", 6, 1190, 230, "Check times + book", ["Cal.com tools, during the call"], "sys")
box("C3", 6, 935, 200, "Booking webhook", ["created / cancelled"], "sys")
box("FB", 6, 1860, 250, "Fallback booking link", ["Telegram bot sends the link", "if not booked on the call"], "out", True)
box("T1", 7, 1860, 250, "Handoff note", ["Telegram: designers' group", "with Accept button"], "out")
box("FD", 8, 1480, 190, "Front desk", ["Callback / transfer"], "esc")
box("DA", 8, 1860, 250, "Designer accepts", ["Calls with full context"], "out")
box("ND", 9, 1860, 250, "Dashboard", ["Calls, outcomes, cost per call", "login, on Vercel"], "out")
box("GH1", 10, 705, 200, "Code repo", ["Code + prompts versioned"], "build")
box("GH2", 10, 935, 200, "Follow-up timer", ["every 5 min: nudges,", "reminders, overdue"], "build")

P = []  # (points, label, label_x, label_y, dashed, colour)


def path(pts, label=None, lx=0, ly=0, dashed=False, color="#444444"):
    P.append((pts, label, lx, ly, dashed, color))


path([R("A1"), L("A2")])
a2 = R("A2")
v1t = T("V1")
path([a2, (v1t[0], a2[1]), v1t])
k = T("K1")
v1l = L("V1", -14)
path([k, (k[0], v1l[1]), v1l], "grounds live agent", 720, cy("V1") - 22, True)
v1b = L("V1", 14)
s1r = R("S1", -12)
path([v1b, (1062, v1b[1]), (1062, s1r[1]), s1r], "post-call webhook", 905, cy("G1") + 4)
s1b = R("S1", 12)
g1b = Bo("G1")
path([s1b, (g1b[0], s1b[1]), g1b], "API call", g1b[0] + 8, cy("S1") - 40)
path([T("S1"), Bo("N1")], "writes", 945, (cy("S1") + cy("N1")) // 2)
v1r = R("V1", 10)
c2r = R("C2")
path([v1r, (1345, v1r[1]), (1345, c2r[1]), c2r], "books in the call", 1352, cy("C2") - 40)
v1r2 = R("V1", -10)
a3b = Bo("A3")
path([v1r2, (1860, v1r2[1]), a3b], "booking made on the call", 1440, v1r2[1] - 6)
path([T("C3"), Bo("S1")], "matched by phone", 950, (cy("C3") + cy("S1")) // 2 + 5)
g1r = R("G1")
d1l = (1420, cy("D1"))
path([g1r, (1405, g1r[1]), (1405, d1l[1]), d1l])
d1r = (1540, cy("D1"))
h1l = L("H1")
fbl = L("FB")
t1l = L("T1")
tx = 1690
path([d1r, (tx, d1r[1]), (tx, h1l[1]), h1l], "Yes", 1552, d1r[1] - 8, False, "#1f7a5c")
path([(tx, d1r[1]), (tx, fbl[1]), fbl], None, 0, 0, True)
path([(tx, d1r[1]), (tx, t1l[1]), t1l])
d1t = (1480, cy("D1") - 40)
h1t = T("H1")
path([d1t, (1480, h1t[1] - 26), (h1t[0], h1t[1] - 26), h1t], "No: contact only", 1530, h1t[1] - 32, False, "#b34a1d")
path([(1480, cy("D1") + 40), T("FD")], "Unsure / wants a person", 1495, cy("FD") - 62, False, "#b46a14")
path([Bo("T1"), T("DA")])
fbr = R("FB")
a3r = R("A3")
path([fbr, (2008, fbr[1]), (2008, a3r[1]), a3r], "caller books via link", 1745, cy("FB") - 41, True)
n1l = L("N1")
ndl = L("ND")
path([n1l, (800, n1l[1]), (800, ndl[1]), ndl], "dashboard reads Neon", 1000, cy("ND") - 8, True)
gh1t = T("GH1")
s1l = L("S1")
path([gh1t, (705, s1l[1]), s1l], "auto-deploys", 712, cy("GH1") - 62, True)
gh2r = R("GH2")
fdb = Bo("FD")
path([gh2r, (1480, gh2r[1]), fdb], "reminders via Telegram", 1100, gh2r[1] - 6, True)

H = 1260
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="DejaVu Sans, Verdana, Segoe UI, Arial, sans-serif">']
o.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
o.append('<defs><marker id="ar" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#444"/></marker></defs>')
o.append('<text x="22" y="38" font-size="25" font-weight="700" fill="#1d1d1d">Aangan Studio · Phone enquiry components map (as built, 10 Oct 2026)</text>')
o.append(f'<rect x="22" y="56" width="{W - 44}" height="44" fill="#2e3d49"/>')
o.append('<text x="86" y="84" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">Lane</text>')
for name, x0, x1 in COLS:
    o.append(f'<text x="{(x0 + x1) // 2}" y="84" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">{name}</text>')
for n, (a, b) in enumerate(LANES):
    y = TOP + n * LH
    o.append(f'<rect x="22" y="{y}" width="{W - 44}" height="{LH}" fill="{"#f6f7f9" if n % 2 == 0 else "#eceff3"}"/>')
    o.append(f'<rect x="22" y="{y}" width="128" height="{LH}" fill="#dfe3e8"/>')
    ty = y + LH // 2 + (-4 if b else 6)
    o.append(f'<text x="86" y="{ty}" font-size="16" font-weight="700" fill="#222" text-anchor="middle">{html.escape(a)}</text>')
    if b:
        o.append(f'<text x="86" y="{ty + 19}" font-size="12" fill="#555" text-anchor="middle">{html.escape(b)}</text>')
for name, x0, x1 in COLS[1:]:
    o.append(f'<line x1="{x0}" y1="{TOP}" x2="{x0}" y2="{TOP + len(LANES) * LH}" stroke="#c8ccd2" stroke-dasharray="4 5"/>')
for pts, label, lx, ly, dashed, color in P:
    d = "M" + " L".join(f"{x},{y}" for x, y in pts)
    dash = 'stroke-dasharray="7 5"' if dashed else ""
    o.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.7" {dash} marker-end="url(#ar)"/>')
    if label:
        o.append(f'<text x="{lx}" y="{ly}" font-size="12" font-weight="700" fill="{color if color != "#444444" else "#555555"}" paint-order="stroke" stroke="#f6f7f9" stroke-width="4">{html.escape(label)}</text>')
for i, b in B.items():
    fill, stroke = KIND[b["kind"]]
    x = b["cx"] - b["w"] // 2
    y = cy(i) - BH // 2
    if i == "D1":
        c = (b["cx"], cy(i))
        o.append(f'<polygon points="{c[0]},{c[1] - 40} {c[0] + 60},{c[1]} {c[0]},{c[1] + 40} {c[0] - 60},{c[1]}" fill="#fff" stroke="#555" stroke-width="1.6"/>')
        o.append(f'<text x="{c[0]}" y="{c[1] + 5}" font-size="14" font-weight="700" fill="#1d1d1d" text-anchor="middle">Qualified?</text>')
        continue
    dash = 'stroke-dasharray="6 4"' if b["dashed"] else ""
    o.append(f'<rect x="{x}" y="{y}" width="{b["w"]}" height="{BH}" rx="9" fill="{fill}" stroke="{stroke}" stroke-width="1.7" {dash}/>')
    n = len(b["subs"])
    ty = y + (BH - (19 + 15 * n)) // 2 + 15
    o.append(f'<text x="{b["cx"]}" y="{ty}" font-size="14.5" font-weight="700" fill="#1d1d1d" text-anchor="middle">{html.escape(b["title"])}</text>')
    for j, t in enumerate(b["subs"]):
        o.append(f'<text x="{b["cx"]}" y="{ty + 19 + j * 15}" font-size="11.5" fill="#444" text-anchor="middle">{html.escape(t)}</text>')

fy = TOP + len(LANES) * LH + 28
notes = [
    "* pricing.md is stored but never given to the live agent (pricing mode: none). Neon = system of record and dashboard data; HubSpot = sales pipeline view of contacts and deals.",
    "Vaani runs the live conversation with its own AI and books with its Cal.com tools during the call; Gemini is called by API only after the call. Rules (category, budget, score) run in plain code.",
    'SMS was not used: the plan\'s "Cal.com link sent by SMS" became booking on the call itself, with a Telegram link as the fallback. Extension: WhatsApp and the web form join at the Input layer; everything downstream stays the same.',
]
for j, t in enumerate(notes):
    o.append(f'<text x="22" y="{fy + j * 22}" font-size="13" fill="#333">{html.escape(t)}</text>')
ly = fy + len(notes) * 22 + 22
legend = [("AI step", "ai", False), ("Output", "out", False), ("Escalation", "esc", False), ("System step", "sys", False),
          ("Build / deploy", "build", False), ("Fallback (dashed)", "out", True)]
x = 22
for name, kind, dsh in legend:
    fill, stroke = KIND[kind]
    dash = 'stroke-dasharray="4 3"' if dsh else ""
    o.append(f'<rect x="{x}" y="{ly - 13}" width="26" height="18" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.5" {dash}/>')
    o.append(f'<text x="{x + 34}" y="{ly + 1}" font-size="13" fill="#333">{name}</text>')
    x += 34 + len(name) * 8 + 40
o.append("</svg>")
open("docs/as-built-swimlane.svg", "w", encoding="utf-8").write("\n".join(o))
print("ok")
