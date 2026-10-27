# Trains the ~100k-param intent brain from scratch (numpy only) and builds ../aj_agent.js
import json, glob, re, random, base64, math, os
import numpy as np

random.seed(1); np.random.seed(1)
F, H = 2048, 48           # hashed feature buckets, hidden units
HERE = os.path.dirname(os.path.abspath(__file__))

def fnv(s):
    h = 0x811c9dc5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return h

def feats(text):
    t = re.sub(r"[^a-z0-9\u0b80-\u0bff' ]+", " ", text.lower())
    words = t.split()
    d = {}
    def add(k):
        i = fnv(k) % F
        d[i] = d.get(i, 0) + 1
    for w in words:
        add("w:" + w)
        p = "<" + w + ">"
        for j in range(len(p) - 2):
            add("c:" + p[j:j+3])
    for a, b in zip(words, words[1:]):
        add("b:" + a + "_" + b)
    n = math.sqrt(sum(v*v for v in d.values())) or 1.0
    return {i: v / n for i, v in d.items()}

def dense(batch):
    X = np.zeros((len(batch), F), dtype=np.float32)
    for r, text in enumerate(batch):
        for i, v in feats(text).items():
            X[r, i] = v
    return X

# ---- data ----
classes, data = [], []
for f in sorted(glob.glob(os.path.join(HERE, "data_categories", "*.json"))):
    d = json.load(open(f))
    classes.append(d["category"])
    data += [(p, len(classes) - 1) for p in d["prompts"]]
classes.append("llm_fallback")
_nat = json.load(open(os.path.join(HERE, "natural_seed.json")))
HELD = {"hey aj whats good","good evening","how long have you been running","show me your memory usage","remind me to call mom at 6","help me debug this javascript function","write a poem about the ocean","translate good morning to french","who made you","explain how volcanoes erupt"}
for _c, _ps in _nat.items():
    data += [(p, classes.index(_c)) for p in _ps if p not in HELD] * 6   # natural phrasing, upweighted
fb = json.load(open(os.path.join(HERE, "fallback_queries.json")))
FB = len(classes) - 1
data += [(q, FB) for q in fb] * 3   # upweight the small negative set
C = len(classes)

data = [d for d in data if d[0] not in HELD]
random.shuffle(data)
cut = int(len(data) * 0.85)
train, test = data[:cut], data[cut:]

def augment(text):
    w = text.split()
    out = [text]
    if len(w) > 2:
        out.append(" ".join(w[:random.randrange(len(w))] + w[random.randrange(len(w)):]) if False else " ".join(x for x in w if random.random() > 0.2) or text)
    s = list(text)
    if len(s) > 4:
        i = random.randrange(len(s) - 1); s[i], s[i+1] = s[i+1], s[i]
    out.append("".join(s))
    return out

Xt_txt, yt = [], []
for p, y in train:
    for a in augment(p):
        Xt_txt.append(a); yt.append(y)
Xt = dense(Xt_txt); yt = np.array(yt)
Xv = dense([p for p, _ in test]); yv = np.array([y for _, y in test])

# ---- model ----
W1 = (np.random.randn(F, H) * math.sqrt(2.0 / F) * 3).astype(np.float32); b1 = np.zeros(H, np.float32)
W2 = (np.random.randn(H, C) * math.sqrt(2.0 / H)).astype(np.float32);     b2 = np.zeros(C, np.float32)
params = [W1, b1, W2, b2]
print("parameters:", sum(p.size for p in params))
m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]; t_step = 0

def fwd(X, W1, b1, W2, b2):
    h = np.maximum(0, X @ W1 + b1)
    z = h @ W2 + b2
    z -= z.max(1, keepdims=True)
    e = np.exp(z); return h, e / e.sum(1, keepdims=True)

def acc(X, y, P=None):
    P = P or (W1, b1, W2, b2)
    return float((fwd(X, *P)[1].argmax(1) == y).mean())

lr, bs, epochs = 4e-3, 128, 40
for ep in range(epochs):
    idx = np.random.permutation(len(Xt))
    for s in range(0, len(idx), bs):
        b = idx[s:s+bs]; X, y = Xt[b], yt[b]
        h, P = fwd(X, W1, b1, W2, b2)
        dz = P.copy(); dz[np.arange(len(b)), y] -= 1; dz /= len(b)
        dW2 = h.T @ dz + 1e-5 * W2; db2 = dz.sum(0)
        dh = dz @ W2.T; dh[h <= 0] = 0
        dW1 = X.T @ dh + 1e-5 * W1; db1 = dh.sum(0)
        t_step += 1
        for i, (p, g) in enumerate(zip(params, [dW1, db1, dW2, db2])):
            m[i] = 0.9 * m[i] + 0.1 * g; v[i] = 0.999 * v[i] + 0.001 * g * g
            p -= lr * (m[i] / (1 - 0.9 ** t_step)) / (np.sqrt(v[i] / (1 - 0.999 ** t_step)) + 1e-8)
    if ep % 8 == 7 or ep == epochs - 1:
        print(f"epoch {ep+1}: train {acc(Xt, yt):.3f}  heldout {acc(Xv, yv):.3f}")

# ---- int8 quantize ----
def q(W):
    s = float(np.abs(W).max() / 127.0) or 1.0
    return np.clip(np.round(W / s), -127, 127).astype(np.int8), s
q1, s1 = q(W1); q2, s2 = q(W2)
Pq = (q1.astype(np.float32) * s1, b1, q2.astype(np.float32) * s2, b2)
print(f"heldout after int8: {acc(Xv, yv, Pq):.3f}")

# ---- natural-language sanity check (hand-written, NOT from the templates) ----
natural = [("hey aj whats good", "greetings"), ("good evening", "greetings"),
 ("how long have you been running", "status_diagnostics"), ("show me your memory usage", "status_diagnostics"),
 ("remind me to call mom at 6", "scheduling_reminders"), ("help me debug this javascript function", "coding_help"),
 ("write a poem about the ocean", "writing_creative"), ("translate good morning to french", "translation_language"),
 ("who made you", "identity_smalltalk"), ("explain how volcanoes erupt", "llm_fallback")]
Xn = dense([a for a, _ in natural]); pr = fwd(Xn, *Pq)[1]
ok = 0
for (a, want), row in zip(natural, pr):
    got = classes[int(row.argmax())]; ok += got == want
    print(f"  {a!r:45} -> {got:24} {row.max():.2f} {'OK' if got == want else 'want ' + want}")
print(f"natural check: {ok}/{len(natural)}")

# ---- knowledge chunks (RAG docs) from README ----
kb = []
readme = os.path.join(HERE, "..", "README.md")
if os.path.exists(readme):
    for para in re.split(r"\n\s*\n", open(readme, encoding="utf-8").read()):
        c = re.sub(r"[#*`>|]+", " ", para); c = re.sub(r"\s+", " ", c).strip()
        if len(c) > 40: kb.append(c[:420])
extra = os.path.join(HERE, "knowledge.json")
if os.path.exists(extra): kb += json.load(open(extra))

phrases = [[p, y] for p, y in sorted(data, key=lambda r: r[1]) if y != FB]
phrases = list(dict(((p, y), 1) for p, y in phrases).keys())
blob = {"F": F, "H": H, "C": C, "classes": classes,
        "w1": base64.b64encode(q1.tobytes()).decode(), "s1": s1,
        "b1": [round(float(x), 5) for x in b1],
        "w2": base64.b64encode(q2.tobytes()).decode(), "s2": s2,
        "b2": [round(float(x), 5) for x in b2],
        "phrases": phrases, "knowledge": kb}
tpl = open(os.path.join(HERE, "runtime.tpl.js"), encoding="utf-8").read()
out = tpl.replace("/*__DATA__*/null", json.dumps(blob, separators=(",", ":"), ensure_ascii=False))
open(os.path.join(HERE, "..", "aj_agent.js"), "w", encoding="utf-8").write(out)
print("built aj_agent.js:", len(out) // 1024, "KB;", len(phrases), "phrases;", len(kb), "knowledge chunks")
