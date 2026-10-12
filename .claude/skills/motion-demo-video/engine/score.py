"""Synthesize the score + sound design for the Moments v2 composition from its own cue list.

usage: python score.py cues.json out.wav [--samples DIR] [--stems]

Samples (optional, recommended): DIR/piano/<C2..C7>.mp3 = Salamander Grand Piano (CC-BY 3.0, credit it),
DIR/sfx/*.mp3 = Pixabay-licensed SFX from HyperFrames. Sampled one-shots are placed so their loudest
moment (not their file start) lands on the cue frame.

Every hit is placed at a cue time exported by index.html (window.__cues), so sound and picture share
one clock. Music runs on the same 100 BPM grid the timeline constants were snapped to.
Only numpy; ffmpeg writes the file.
"""
import json
import subprocess
import sys

import numpy as np

SR = 44100
BEAT = 0.6                      # 100 BPM
BAR0 = 1.8                      # bars start at 1.8 + 2.4k, so 4.2 / 6.6 / 18.6 / 23.4 / 30.6 are downbeats
rng = np.random.default_rng(7)

data = json.load(open(sys.argv[1]))
SAMPLES = sys.argv[sys.argv.index('--samples') + 1] if '--samples' in sys.argv else None
T, DUR, CUES = data['T'], data['duration'], data['cues']
N = int((DUR + 3) * SR)
music, drums, sfx, verb = (np.zeros((2, N)) for _ in range(4))
kick_env = np.zeros(N)          # sidechain source
impact_duck = np.zeros(N)       # music dips under the flood impact so the hit reads


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def add(bus, t, sig, gain=1.0, pan=0.0, send=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i] * gain
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    bus[0, i:i + len(sig)] += sig * gl
    bus[1, i:i + len(sig)] += sig * gr
    if send:
        verb[0, i:i + len(sig)] += sig * gl * send
        verb[1, i:i + len(sig)] += sig * gr * send


def mx(*xs):
    """Sum signals of different lengths."""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


def band(x, lo, hi):
    """Static brick-ish bandpass in the frequency domain (soft edges)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    w = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * w, len(x))


def sweep(x, lo_curve, hi_curve, hop=512):
    """Time-varying bandpass by overlap-add FFT chunks; curves are per-sample arrays (Hz)."""
    win = np.hanning(hop * 2)
    out = np.zeros(len(x) + hop * 2)
    f = np.fft.rfftfreq(hop * 2, 1 / SR)
    for s in range(0, len(x), hop):
        seg = x[s:s + hop * 2]
        if len(seg) < hop * 2:
            seg = np.pad(seg, (0, hop * 2 - len(seg)))
        c = min(s + hop, len(x) - 1)
        lo, hi = lo_curve[c], hi_curve[c]
        w = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
        out[s:s + hop * 2] += np.fft.irfft(np.fft.rfft(seg * win) * w, hop * 2)
    return out[:len(x)]


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def repitch(x, semis):
    r = 2 ** (semis / 12)
    return np.interp(np.arange(0, len(x) - 1, r), np.arange(len(x)), x)


def peak_at(x):
    """Seconds from file start to the loudest 10 ms (the transient to put on the cut)."""
    h = int(0.01 * SR)
    e = np.convolve(x ** 2, np.ones(h), 'same')
    return int(np.argmax(e)) / SR


PIANO, SFXS = {}, {}
if SAMPLES:
    names = ['C', 'Ds', 'Fs', 'A']
    for octv in range(2, 8):
        for k, nm in enumerate(names):
            m = 12 * (octv + 1) + k * 3
            try:
                x = load(f'{SAMPLES}/piano/{nm}{octv}.mp3')
                PIANO[m] = x / (np.abs(x[: int(0.5 * SR)]).max() + 1e-9)   # samples ship at uneven levels
            except subprocess.CalledProcessError:
                pass
    for nm in ['impact-bass-1', 'riser', 'whoosh', 'whoosh-cinematic', 'key-press', 'click-soft', 'pop', 'sparkle', 'chime']:
        x = load(f'{SAMPLES}/sfx/{nm}.mp3')
        SFXS[nm] = (x / (np.abs(x).max() + 1e-9), peak_at(x))


def shot(name, semis=0.0):
    """(signal, peak offset) for a sampled one-shot, optionally repitched."""
    x, pk = SFXS[name]
    if semis:
        x = repitch(x, semis)
        pk /= 2 ** (semis / 12)
    return x, pk


# ---------------------------------------------------------------- instruments
def epiano(m, dur, vel=0.5):
    f = mtof(m)
    t = tt(dur + 1.6)
    idx = 1.8 * vel * np.exp(-t / 0.22) + 0.25
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    y += 0.12 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.35)
    env = (1 - np.exp(-t / 0.002)) * np.exp(-t / (1.4 * (262 / f) ** 0.35))
    env *= np.where(t > dur, np.exp(-(t - dur) / 0.3), 1)
    return y * env * vel


def piano(m, dur, vel=0.5):
    if not PIANO:
        return epiano(m, dur, vel)
    base = min(PIANO, key=lambda k: abs(k - m))
    x = repitch(PIANO[base], m - base)[: int((dur + 1.2) * SR)]
    t = np.arange(len(x)) / SR
    env = np.where(t > dur, np.exp(-(t - dur) / 0.35), 1)
    return x * env * vel * 1.7


def bell(m, vel=0.4, decay=1.6):
    f = mtof(m)
    t = tt(decay * 2.5)
    idx = 3.0 * np.exp(-t / 0.08) + 0.6
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t))
    y += 0.3 * np.sin(2 * np.pi * 2.0 * f * t) * np.exp(-t / 0.4)
    return y * (1 - np.exp(-t / 0.001)) * np.exp(-t / decay) * vel


def pad(ms, t0, t1, bright=4.0, vel=0.12):
    t = tt(t1 - t0 + 1.4)
    y = np.zeros(len(t))
    for m in ms:
        for det in (-0.07, 0.0, 0.07):
            f = mtof(m + det)
            ph = rng.uniform(0, 2 * np.pi)
            for n in range(1, 11):
                if f * n > 9000:
                    break
                y += np.sin(2 * np.pi * f * n * t + ph * n) * np.exp(-n / bright) / n
    y /= len(ms) * 3
    env = np.minimum(1, t / 0.6) * np.where(t > t1 - t0, np.exp(-(t - (t1 - t0)) / 0.45), 1)
    env *= 1 + 0.06 * np.sin(2 * np.pi * 0.25 * t)
    return y * env * vel


def bass(m, dur, vel=0.5):
    f = mtof(m)
    t = tt(dur + 0.15)
    y = np.tanh(1.6 * (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t)))
    env = (1 - np.exp(-t / 0.006)) * (0.75 + 0.25 * np.exp(-t / 0.15))
    env *= np.where(t > dur, np.exp(-(t - dur) / 0.04), 1)
    return y * env * vel


def kick(vel=1.0):
    t = tt(0.5)
    f = 46 + 95 * np.exp(-t / 0.035)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    y += rng.standard_normal(len(t)) * np.exp(-t / 0.0025) * 0.25
    return y * vel


def hat(vel=0.3, open_=False):
    t = tt(0.25 if open_ else 0.07)
    n = band(rng.standard_normal(len(t)), 6000, 16000)
    return n * np.exp(-t / (0.09 if open_ else 0.022)) * vel


def clap(vel=0.5):
    t = tt(0.35)
    n = band(rng.standard_normal(len(t)), 900, 4200)
    env = np.exp(-t / 0.11)
    for d in (0.0, 0.011, 0.022):
        env += np.where((t >= d) & (t < d + 0.008), 1.4, 0)
    return n * env * vel / 2.5


def tick(vel=0.3, freq=2400, soft=False):
    t = tt(0.04)
    n = band(rng.standard_normal(len(t)), 1500 if soft else 2500, 6000 if soft else 11000) * np.exp(-t / 0.0035)
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.006) * 0.4
    return mx(n, s) * vel


def whoosh(dur, rising=True, vel=0.35):
    L = int(dur * SR)
    x = rng.standard_normal(L)
    k = np.linspace(0, 1, L)
    c = 250 * (12 ** k) if rising else 3000 * (12 ** -k)
    y = sweep(x, c * 0.6, c * 2.2)
    env = np.sin(np.pi * k) ** 2
    return y * env * vel


def riser(dur, vel=0.4):
    L = int(dur * SR)
    k = np.linspace(0, 1, L)
    c = 200 * (40 ** k)
    y = sweep(rng.standard_normal(L), c * 0.5, c * 2.5) * (k ** 2.2)
    f = mtof(50) * (4 ** k)
    y += 0.25 * np.sin(2 * np.pi * np.cumsum(f) / SR) * (k ** 3)
    return y * vel


def boom(vel=0.9):
    t = tt(2.2)
    f = 40 + 60 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7) * vel


def crash(vel=0.4, decay=1.8):
    t = tt(decay * 2)
    return band(rng.standard_normal(len(t)), 3500, 15000) * np.exp(-t / decay) * (1 - np.exp(-t / 0.002)) * vel


# ---------------------------------------------------------------- harmony (bar chords on the grid)
CH = {  # bass root, voicing
    'D': (38, [62, 66, 69, 76]), 'Bm': (35, [62, 66, 69, 73]), 'G': (31, [59, 62, 66, 69]),
    'A': (33, [61, 64, 69, 71]), 'Em': (28, [59, 62, 66, 67]), 'Asus': (33, [62, 64, 69, 71]),
}
bar = lambda k: BAR0 + 2.4 * k  # noqa: E731
LAND = [c['t'] for c in CUES if c['type'] == 'land'][0]
SUM = [c['t'] for c in CUES if c['type'] == 'stab']
CHORDS = [  # (start, chord)
    (0.0, 'D'), (bar(1), 'Bm'), (bar(2), 'G'), (bar(3), 'A'), (bar(4), 'D'), (bar(5), 'Bm'),
    (bar(6), 'G'), (bar(7), 'A'), (bar(8), 'Em'), (T['flood'] + 0.6, 'D'), (bar(10), 'Bm'),
    (SUM[0], 'G'), (SUM[1], 'A'), (SUM[2], 'Bm'), (T['toLogo'], 'G'), (T['logo'], 'Asus'), (LAND, 'D'),
]
END = DUR


def chord_at(t):
    cur = CHORDS[0][1]
    for s, c in CHORDS:
        if s <= t:
            cur = c
    return cur


QUIET = (T['viewerPan'], T['fly2'])            # "조용한 댓글": drums out, intimate
CLIMAX = (T['flood'] + 0.6, T['sum'])
GROOVE_IN = bar(2)                             # 6.6: drums enter right after the dot becomes the search box

# pad under everything, brighter as the piece builds
for i, (s, c) in enumerate(CHORDS):
    e = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else END
    bright = 2.5 if s < GROOVE_IN else 3.5 if s < CLIMAX[0] else 5.5 if s < T['toLogo'] else 3.0
    vel = 0.11 if s < 1.8 else 0.12 if s < CLIMAX[0] else 0.12
    if QUIET[0] <= s < QUIET[1]:
        bright, vel = 2.2, 0.10
    add(music, s, pad(CH[c][1], s, e + 0.05, bright, vel), pan=0, send=0.5)

# bass: whole notes in the groove, eighths in the climax, out in the intro and the quiet section
for i, (s, c) in enumerate(CHORDS):
    e = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else END - 0.5
    if s < GROOVE_IN or QUIET[0] <= s < QUIET[1] or s >= T['toLogo'] and c != 'D':
        continue
    root = CH[c][0] + 12
    if CLIMAX[0] <= s < CLIMAX[1]:
        t = s
        while t < e - 0.01:
            add(music, t, bass(root, 0.26, 0.2), send=0.0)
            t += 0.3
    else:
        add(music, s, bass(root, e - s - 0.05, 0.17 if c != 'D' or s < LAND else 0.14))

# electric piano arpeggios: eighths in grooves, quarters in the quiet section
ARP = [0, 1, 2, 3, 2, 1, 2, 3]
t = GROOVE_IN
while t < T['toLogo'] - 0.01:
    q = QUIET[0] <= t < QUIET[1]
    step = 0.6 if q else 0.3
    k = int(round((t - GROOVE_IN) / step))
    ms = CH[chord_at(t)][1]
    vel = 0.16 if q else 0.13 if t < CLIMAX[0] else 0.17
    add(music, t, piano(ms[ARP[k % 8]] + (12 if q else 0), step * 1.4, vel), pan=0.25 * np.sin(k), send=0.45 if q else 0.3)
    t += step

# climax hook on bells: the hero dot's timbre carries the melody
HOOK = [(0.0, 81, 1.2), (1.2, 78, 0.6), (1.8, 76, 0.6), (2.4, 74, 1.2), (3.6, 73, 0.3), (3.9, 74, 0.3)]
for off, m, d in HOOK:
    if CLIMAX[0] + off < CLIMAX[1]:
        add(music, CLIMAX[0] + off, mx(bell(m, 0.16, 1.0), piano(m, d, 0.18)), pan=-0.1, send=0.4)

# ---------------------------------------------------------------- drums
def on_beats(a, b, every=BEAT, offset=0.0):
    t = a + offset
    while t < b - 1e-6:
        yield round(t, 4)
        t += every


def put_kick(t, v=0.85):
    add(drums, t, kick(v))
    k = kick_env
    i = int(t * SR)
    L = int(0.35 * SR)
    k[i:i + L] = np.maximum(k[i:i + L], np.exp(-np.arange(L) / SR / 0.12)[: len(k[i:i + L])])


sections = [(GROOVE_IN, QUIET[0], 'A'), (QUIET[1], T['dotZoom'], 'B'), (CLIMAX[0], CLIMAX[1], 'C'), (CLIMAX[1], T['toLogo'], 'D')]
for a, b, kind in sections:
    for t in on_beats(a, b, 1.2):
        put_kick(t, 0.42 if kind == 'A' else 0.62 if kind != 'C' else 0.75)
    if kind == 'C':
        for t in on_beats(a, b, 2.4, 1.5):
            put_kick(t, 0.6)
    for t in on_beats(a, b, 0.3):
        add(drums, t, hat(0.09 if kind == 'A' else 0.15), pan=0.3)
    if kind == 'C':
        for t in on_beats(a, b, 0.3, 0.15):
            add(drums, t, hat(0.06), pan=-0.3)
    if kind != 'A' or a >= bar(4):
        for t in on_beats(a + 0.6, b, 1.2):
            add(drums, t, clap(0.45 if kind == 'C' else 0.32), send=0.25)
# claps join the first groove from bar 4 (11.4), building toward the photo flight
for t in on_beats(bar(4) + 0.6, QUIET[0], 1.2):
    add(drums, t, clap(0.26), send=0.25)

# build into the flood: kicks on every beat, accelerating snare roll, a breath before the hit
hit = T['flood'] + 0.6
for t in on_beats(T['dotZoom'], hit - 0.3, 0.6):
    put_kick(t, 0.8)
roll, t, gap = [], T['dotZoom'] + 0.6, 0.3
while t < hit - 0.18:
    roll.append(t)
    t += gap
    gap = max(0.075, gap * 0.86)
for i, t in enumerate(roll):
    add(drums, t, clap(0.12 + 0.35 * i / len(roll)), send=0.3)

# ---------------------------------------------------------------- sound design from cues
PENTA = [74, 76, 78, 81, 83, 86, 88, 90]
for c in CUES:
    t, ty = c['t'], c['type']
    i = c.get('i', 0)
    if ty == 'swap':                                   # each real moment title = one note, climbing
        add(sfx, t, piano(PENTA[i], 0.5, 0.17), pan=-0.2 + 0.08 * i, send=0.45)
    elif ty == 'pop' and SFXS:
        x, pk = shot('pop', (i % 6) * 0.7 - 1.5)
        add(sfx, t - pk, x, 0.09, pan=((i * 37) % 11 - 5) / 6, send=0.15)
    elif ty == 'pop':
        tl = tt(0.08)
        f = 900 + 60 * (i % 6) - 500 * (1 - np.exp(-tl / 0.012))
        add(sfx, t, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tl / 0.03) * 0.07, pan=((i * 37) % 11 - 5) / 6, send=0.2)
    elif ty == 'count':                                # ticker that slows with the count's power2.out ease
        for k in range(22):
            p = k / 22
            u = 1 - np.sqrt(1 - p)
            add(sfx, t + u * c['dur'], tick(0.12, 1800 + 1600 * p), pan=0.1, send=0.1)
        add(sfx, t + c['dur'], bell(86, 0.12, 0.6), send=0.3)
    elif ty == 'word':
        add(sfx, t, piano([62, 66, 69, 71][i], 0.6, 0.18), send=0.4)
    elif ty == 'ding':                                 # the hero dot is born: its bell
        add(sfx, t, mx(bell(86, 0.32), bell(93, 0.08)), send=0.6)
    elif ty == 'whoosh':
        add(sfx, t, whoosh(c['dur'] + 0.15, rising=False, vel=0.28), send=0.2)
    elif ty == 'morph':                                # dot stretches into the search box: a short swell up
        L = int(c['dur'] * SR)
        k = np.linspace(0, 1, L)
        y = sweep(rng.standard_normal(L), 400 * 10 ** k, 1500 * 10 ** k) * k ** 1.5 * 0.3
        add(sfx, t, y, send=0.3)
        add(sfx, t + c['dur'], bell(81, 0.18, 0.8), send=0.5)
    elif ty == 'key' and SFXS:
        x, pk = shot('key-press', rng.uniform(-1, 1))
        add(sfx, t - pk, x, 0.30 * rng.uniform(0.8, 1.0), pan=0.15 * (i % 3 - 1))
    elif ty == 'keySoft' and SFXS:
        x, pk = shot('click-soft', rng.uniform(-3, -1.5))
        add(sfx, t - pk, x, 0.12 * rng.uniform(0.8, 1.0), pan=0.35, send=0.1)
    elif ty == 'key':
        add(sfx, t, tick(0.32 * rng.uniform(0.75, 1.0), rng.uniform(2200, 2900)), pan=0.15 * (i % 3 - 1))
    elif ty == 'keySoft':                              # quieter, duller keys for the "quiet comment"
        add(sfx, t, tick(0.17 * rng.uniform(0.75, 1.0), rng.uniform(1300, 1700), soft=True), pan=0.35)
    elif ty == 'enter':
        tl = tt(0.12)
        add(sfx, t, mx(np.sin(2 * np.pi * np.cumsum(170 - 60 * tl / 0.12) / SR) * np.exp(-tl / 0.03) * 0.4, tick(0.3, 1500)))
    elif ty == 'shimmer' and SFXS:
        x, pk = shot('sparkle')
        add(sfx, t, x, 0.16, send=0.4)
    elif ty == 'shimmer':                              # results sharpen: a rising sparkle
        for k, m in enumerate([74, 78, 81, 86, 90, 93]):
            add(sfx, t + k * c['dur'] / 6, bell(m, 0.07, 0.5), pan=-0.5 + 0.2 * k, send=0.5)
    elif ty == 'cam':
        zr = c['zr']
        if 0.85 < zr < 1.18:
            continue
        if SFXS:                                       # whoosh peak = the move's top speed (middle of an inOut ease)
            x, pk = shot('whoosh', 2.0 if zr < 1 else -2.0)
            add(sfx, t + c['dur'] * 0.5 - pk, x, 0.16 + 0.05 * min(3, abs(np.log(zr))), pan=-0.2 if zr < 1 else 0.2, send=0.25)
            continue
        add(sfx, t, whoosh(c['dur'], rising=zr < 1, vel=0.12 + 0.06 * min(3, abs(np.log(zr)))), pan=0.0, send=0.25)
    elif ty == 'fly' and SFXS:
        x, pk = shot('whoosh-cinematic')
        add(sfx, t + c['dur'] * 0.5 - pk, x, 0.2, pan=-0.1, send=0.3)
        add(sfx, t + c['dur'] * 0.9, bell(78, 0.1, 0.7), send=0.5)
    elif ty == 'fly':
        add(sfx, t, whoosh(c['dur'], rising=True, vel=0.22), pan=-0.2, send=0.3)
        add(sfx, t + c['dur'] * 0.9, bell(78, 0.1, 0.7), send=0.5)
    elif ty == 'riser' and SFXS:                       # riser's loudest point lands just before the hit, then a breath
        x, pk = shot('riser')
        L = int((c['to'] - t - 0.15) * SR)
        seg = x[max(0, int(pk * SR) - L):int(pk * SR)]
        seg = seg * np.linspace(0.2, 1, len(seg)) ** 1.5
        add(sfx, c['to'] - 0.15 - len(seg) / SR, seg, 0.3, send=0.3)
    elif ty == 'riser':
        add(sfx, t, riser(c['to'] - t - 0.15, 0.32), send=0.3)
    elif ty == 'impact':                               # flood covers the screen
        if SFXS:
            x, pk = shot('impact-bass-1')
            add(sfx, t - pk, x, 0.55, send=0.3)
            add(sfx, t, crash(0.18, 1.6))
        else:
            add(sfx, t, mx(boom(0.75), crash(0.3, 1.6)))
        i0 = int(t * SR)
        L = int(1.0 * SR)
        impact_duck[i0:i0 + L] = np.maximum(impact_duck[i0:i0 + L], np.exp(-np.arange(L) / SR / 0.35))
        add(sfx, t, crash(0.12, 2.2), send=0.8)
        for m in CH['D'][1] + [86]:
            add(music, t, piano(m, 1.2, 0.24), send=0.5)
    elif ty == 'suck':                                 # flood collapses into the greeting's dot
        L = int(c['dur'] * 0.55 * SR)
        k = np.linspace(0, 1, L)
        y = sweep(rng.standard_normal(L), 3000 * 0.2 ** k, 9000 * 0.2 ** k) * (1 - k) ** 2 * 0.25
        add(sfx, t, y, send=0.3)
        add(sfx, t + c['dur'] * 0.5, bell(86, 0.18, 0.7), send=0.5)
    elif ty == 'stab':
        m = CH[['G', 'A', 'Bm'][i]][1]
        for n in m:
            add(music, t, piano(n, 0.55, 0.15), send=0.35)
        add(music, t, bass(CH[['G', 'A', 'Bm'][i]][0] + 12, 0.55, 0.2))
        put_kick(t, 0.6)
        add(drums, t, clap(0.22), send=0.3)
    elif ty == 'chime' and SFXS:
        x, pk = shot('chime')
        add(sfx, t - pk, x, 0.12, send=0.5)
    elif ty == 'chime':
        add(sfx, t, bell(81, 0.16, 1.0), send=0.6)
    elif ty == 'letter':
        add(sfx, t, bell(PENTA[i], 0.05, 0.4), pan=-0.4 + 0.12 * i, send=0.4)
    elif ty == 'land':                                 # the dot lands as the logo's period: resolution
        if i == 0:
            add(sfx, t, mx(bell(86, 0.36, 2.0), bell(74, 0.12, 2.0)), send=0.7)
            add(sfx, t, boom(0.3))
            for m in [50, 57, 62, 66, 69, 76]:
                add(music, t, piano(m, 2.8, 0.22), send=0.6)
        else:
            add(sfx, t, bell(86, 0.12 / i, 0.5), send=0.6)
    elif ty == 'tag':
        add(sfx, t, piano(78, 1.2, 0.14), send=0.6)
    elif ty == 'cta':
        add(sfx, t, mx(piano(81, 1.6, 0.12), bell(90, 0.05, 1.2)), send=0.7)
    elif ty == 'pill':
        add(sfx, t, bell(93, 0.035, 0.25), pan=0.0, send=0.3)

# ---------------------------------------------------------------- mix
duck = (1 - 0.3 * kick_env) * (1 - 0.5 * impact_duck)   # gentle pump + a dip under the impact
music *= duck

ir_len = int(2.6 * SR)
ti = np.arange(ir_len) / SR
irs = []
for ch in range(2):
    ir = rng.standard_normal(ir_len) * np.exp(-ti / 0.55)
    ir = band(ir, 200, 7000)
    ir[: int(0.02 * SR)] = 0
    irs.append(ir / np.sqrt((ir ** 2).sum()))
size = 1 << int(np.ceil(np.log2(N + ir_len)))
wet = np.stack([np.fft.irfft(np.fft.rfft(verb[c], size) * np.fft.rfft(irs[c], size), size)[:N] for c in range(2)])

mix = music + drums * 0.9 + sfx + wet * 0.55
if '--stems' in sys.argv:
    db = lambda b, t: 20 * np.log10(np.sqrt((b[:, int(t * SR):int((t + 2) * SR)] ** 2).mean()) + 1e-9)  # noqa: E731
    for name, b in [('music', music), ('drums', drums * 0.9), ('sfx', sfx), ('wet', wet * 0.55)]:
        print(f'{name:6s}', ' '.join(f'{db(b, t):4.0f}' for t in range(0, 36, 2)))
mix[:, :] = np.stack([band(mix[c], 28, 18000) for c in range(2)])
end = int(DUR * SR)
fade = np.ones(N)
fade[end - int(1.2 * SR):end] = np.linspace(1, 0, int(1.2 * SR)) ** 2
mix = mix * fade
mix = mix[:, :end]
mix = np.tanh(mix * 1.1) / 1.1
mix /= np.abs(mix).max() / 0.9
pcm = mix.T.astype(np.float32).tobytes()
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s16le', sys.argv[2]], input=pcm, check=True)
print('wrote', sys.argv[2], f'{DUR:.2f}s, {len(CUES)} cues')
