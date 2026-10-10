import html
W_COL=168; BOX_W=150; BOX_H=64; LANE_H=88; LEFT=150; TOP=84
lanes=["Caller and staff","Vaani AI\n(the live call)","Cal.com","Our app on Vercel\n(webhooks + pipeline)","Gemini\n(after the call only)","Neon database","Telegram","HubSpot","GitHub, Vercel, timer","Dashboard\n(admins only)"]
COL={"user":("#fff4d6","#c9a227"),"vaani":("#efe7ff","#7a54d6"),"cal":("#e3f0ff","#3b82c4"),"app":("#dff5ea","#2f9e6e"),"ai":("#ffe7e2","#e0654d"),"db":("#e8eaf0","#667085"),"tg":("#e0f4fb","#1f9bd0"),"crm":("#ffeedd","#e8833a"),"ops":("#f0f0f0","#8a8a8a"),"dash":("#fff0f6","#c2447e")}
B={}
def box(i,lane,col,kind,lines,dashed=False):
    B[i]=dict(lane=lane,col=col,kind=kind,lines=lines.split("\n"),dashed=dashed)
box("A1",0,0,"user","Caller phones in\n(browser test now;\nreal number later)")
box("F1",0,3,"user","Front-desk person\ngets the transfer")
box("V1",1,1,"vaani","Answers live.\nSays: AI assistant,\ncall is recorded")
box("V2",1,2,"vaani","One question at a time.\nGate check: real project,\ncity, timeline, owner, budget")
box("V3",1,3,"vaani","Fit: books a slot.\nNot a fit: kind close.\nUpset: transfers")
box("V4",1,4,"vaani","Call ends. Sends events:\nstarted, transfer,\npost-processing")
box("C1",2,3,"cal","Check free times\nand book the\nconsultation")
box("C2",2,6,"cal","Booking webhook:\ncreated / cancelled")
box("W1",3,5,"app","/webhooks/vaani/events\nsecret token checked,\nanswers 200 at once")
box("W2",3,6,"app","Pipeline: no duplicates,\nmerge repeat calls (60 min),\nattach waiting booking")
box("W3",3,8,"app","Rules in code: budget,\ncategory, score,\nhandoff note, costs")
box("G1",4,7,"ai","1. Extract the facts\n2. Judge 4 criteria\n(never on the call)")
box("D1",5,6,"db","Callers, calls, transcripts,\nenquiries, handoffs,\nbookings, costs, settings")
box("TG1",6,9,"tg","Designers' group:\nhandoff + Accept button\n(booked time shown)")
box("TG2",6,10,"tg","Front desk: complaint,\nmissed call, doubtful\nbudget / owner / size")
box("TG3",6,4,"tg","Fallback only: caller taps\nStart on the bot, shares\nnumber, gets booking link",True)
box("H1",7,9,"crm","Contact for every caller.\nDeal if qualified.\nMoves to Meeting Booked")
box("GH1",8,8,"ops","Timer every 5 min:\nnudges, reminders,\noverdue handoffs")
box("GH2",8,1,"ops","Push to GitHub, Vercel\ndeploys. Instructions\nsync with vaani:sync")
box("DB1",9,6,"dash","Calls, outcomes, costs,\nfollow-ups, transcripts.\nLogin for 2 admins")
def geo(i):
    b=B[i]; x=LEFT+b["col"]*W_COL+(W_COL-BOX_W)//2; y=TOP+b["lane"]*LANE_H+(LANE_H-BOX_H)//2
    return x,y
def right(i): x,y=geo(i); return x+BOX_W,y+BOX_H//2
def left(i): x,y=geo(i); return x,y+BOX_H//2
def top(i): x,y=geo(i); return x+BOX_W//2,y
def bottom(i): x,y=geo(i); return x+BOX_W//2,y+BOX_H
paths=[]
def straight(a,b,label=None,dashed=False):
    (x1,y1),(x2,y2)=right(a),left(b)
    paths.append((f"M{x1},{y1} L{x2},{y2}",label,(x1+x2)//2,y1-6,dashed))
def elbow(a,b,label=None,dashed=False):
    (x1,y1),(x2,y2)=right(a),left(b); mx=x2-14
    paths.append((f"M{x1},{y1} L{mx},{y1} L{mx},{y2} L{x2},{y2}",label,mx+4,(y1+y2)//2,dashed))
def vert(a,b,label=None,dashed=False):
    if B[b]["lane"]>B[a]["lane"]: (x1,y1),(x2,y2)=bottom(a),top(b)
    else: (x1,y1),(x2,y2)=top(a),bottom(b)
    paths.append((f"M{x1},{y1} L{x2},{y2}",label,x1+6,(y1+y2)//2,dashed))
elbow("A1","V1"); straight("V1","V2"); straight("V2","V3")
vert("V3","C1","books"); vert("V3","F1","transfer"); straight("V3","V4"); elbow("V4","W1","events")
straight("W1","W2"); vert("W2","D1","stores"); elbow("W2","G1","transcript"); elbow("G1","W3","facts + verdicts")
elbow("W3","TG1","qualified"); elbow("W3","TG2","unsure / alert"); elbow("W3","H1","every caller")
vert("C2","W2","matched by phone"); vert("D1","DB1","read")
elbow("GH1","TG2","reminders",True)
rows=[]
n=len(lanes); Wt=LEFT+11*W_COL+20; Ht=TOP+n*LANE_H+84
o=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {Wt} {Ht}" width="{Wt}" height="{Ht}" font-family="Segoe UI, Arial, sans-serif">']
o.append(f'<rect width="{Wt}" height="{Ht}" fill="#ffffff"/>')
o.append('<defs><marker id="ar" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#475467"/></marker></defs>')
o.append(f'<text x="24" y="34" font-size="22" font-weight="700" fill="#101828">Aangan Studio phone enquiry agent: as built</text>')
o.append(f'<text x="24" y="58" font-size="13" fill="#475467">Left to right = time during and after one call. Solid arrows = main flow. Dashed = fallback or timed job. Built 10 Oct 2026.</text>')
for k,name in enumerate(lanes):
    y=TOP+k*LANE_H
    o.append(f'<rect x="0" y="{y}" width="{Wt}" height="{LANE_H}" fill="{"#f8f9fc" if k%2==0 else "#ffffff"}" stroke="#e4e7ec"/>')
    o.append(f'<rect x="0" y="{y}" width="{LEFT-14}" height="{LANE_H}" fill="#eef1f6" stroke="#e4e7ec"/>')
    for j,t in enumerate(name.split("\n")):
        yy=y+LANE_H//2+(j-(len(name.split("\n"))-1)/2)*16+5
        o.append(f'<text x="12" y="{yy}" font-size="{13 if j==0 else 11}" font-weight="{700 if j==0 else 400}" fill="#344054">{html.escape(t)}</text>')
for d,label,lx,ly,dashed in paths:
    o.append(f'<path d="{d}" fill="none" stroke="#475467" stroke-width="1.6" {"stroke-dasharray=\"6 4\"" if dashed else ""} marker-end="url(#ar)"/>')
    if label: o.append(f'<text x="{lx}" y="{ly}" font-size="10.5" fill="#475467" paint-order="stroke" stroke="#ffffff" stroke-width="3">{html.escape(label)}</text>')
for i,b in B.items():
    x,y=geo(i); fill,stroke=COL[b["kind"]]
    o.append(f'<rect x="{x}" y="{y}" width="{BOX_W}" height="{BOX_H}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.6" {"stroke-dasharray=\"5 3\"" if b["dashed"] else ""}/>')
    for j,t in enumerate(b["lines"]):
        o.append(f'<text x="{x+BOX_W//2}" y="{y+19+j*15}" font-size="10.8" text-anchor="middle" fill="#1d2939">{html.escape(t)}</text>')
ly=TOP+n*LANE_H+26
o.append(f'<text x="24" y="{ly}" font-size="12.5" font-weight="700" fill="#101828">Not used, by choice:</text>')
o.append(f'<text x="160" y="{ly}" font-size="12.5" fill="#344054">no SMS service (the SMS cost line stays at 0; booking happens on the call, Telegram is only the fallback) · no phone number bought (browser test calls get a made-up +915000... number in demo mode) · pricing guide never given to the live agent.</text>')
o.append(f'<text x="24" y="{ly+24}" font-size="12.5" font-weight="700" fill="#101828">Checks along the way:</text>')
o.append(f'<text x="160" y="{ly+24}" font-size="12.5" fill="#344054">duplicate webhooks are ignored · every failure alerts the front desk · agent tested with 37 pretend callers · 101 automated tests · repeat calls within 60 minutes merge into one enquiry.</text>')
o.append('</svg>')
open('docs/as-built-swimlane.svg','w',encoding='utf-8').write("\n".join(o))
print("svg written",Wt,Ht)
