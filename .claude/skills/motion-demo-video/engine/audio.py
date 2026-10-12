"""Shared audio toolkit for the cue-driven ad scores.

Sampler for VSCO-2-CE (CC0) / Salamander / Pixabay one-shots, plus buses, convolution reverb,
sidechain, and a mixdown that writes WAV through ffmpeg. numpy only.
"""
import glob
import os
import re
import subprocess

import numpy as np

SR = 44100
rng = np.random.default_rng(7)
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
_cache = {}


CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.decoded')


def load(path):
    """Decode once to 44.1 kHz mono float; cached on disk because VSCO WAVs take ~50 s to decode per run."""
    if path not in _cache:
        import hashlib
        os.makedirs(CACHE, exist_ok=True)
        key = os.path.join(CACHE, hashlib.md5(os.path.abspath(path).encode()).hexdigest() + '.npy')
        if os.path.exists(key):
            _cache[path] = np.load(key)
            return _cache[path]
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                             capture_output=True, check=True).stdout
        _cache[path] = np.frombuffer(raw, np.float32).astype(np.float64)
        np.save(key, _cache[path])
    return _cache[path]


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def name_to_midi(s):
    """'C4' -> 60, 'A#1' -> 34, 'Fs3'/'Ds2' (tonejs style) -> F#3 / D#2."""
    s = s.replace('s', '#') if re.fullmatch(r'[A-G]s-?\d', s) else s
    m = re.fullmatch(r'([A-G][#b]?)(-?\d)', s)
    return 12 * (int(m.group(2)) + 1) + NOTE[m.group(1)] if m else None


def repitch(x, semis):
    if abs(semis) < 1e-3:
        return x
    r = 2 ** (semis / 12)
    return np.interp(np.arange(0, len(x) - 1, r), np.arange(len(x)), x)


def peak_at(x):
    h = int(0.01 * SR)
    return int(np.argmax(np.convolve(x ** 2, np.ones(h), 'same'))) / SR


def mx(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


def band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    w = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * w, len(x))


def sweep(x, lo_curve, hi_curve, hop=512):
    win = np.hanning(hop * 2)
    out = np.zeros(len(x) + hop * 2)
    f = np.fft.rfftfreq(hop * 2, 1 / SR)
    for s in range(0, len(x), hop):
        seg = x[s:s + hop * 2]
        if len(seg) < hop * 2:
            seg = np.pad(seg, (0, hop * 2 - len(seg)))
        c = min(s + hop, len(x) - 1)
        w = 1 / (1 + (lo_curve[c] / np.maximum(f, 1)) ** 4) / (1 + (f / hi_curve[c]) ** 4)
        out[s:s + hop * 2] += np.fft.irfft(np.fft.rfft(seg * win) * w, hop * 2)
    return out[:len(x)]


class Sampler:
    """Multi-sampled instrument. Picks the nearest recorded note, repitches, and loops sustains past their length."""

    def __init__(self, folder, layer=None, gain=1.0, loop=True, octave=0):
        """octave: correction for libraries that name middle C 'C3' (most of VSCO-2-CE needs +1; measured with f0)."""
        self.notes = {}
        files = sorted(glob.glob(os.path.join(folder, '*.wav')) + glob.glob(os.path.join(folder, '*.mp3')))
        for f in files:
            stem = os.path.basename(f).rsplit('.', 1)[0]
            if layer and not re.search(layer, stem):
                continue
            m = None
            for tok in re.split(r'[_\-]', stem):
                m = name_to_midi(tok)
                if m is not None:
                    break
            if m is None:
                continue
            m += 12 * octave
            if m in self.notes:
                continue
            x = load(f)
            s = int(np.argmax(np.abs(x) > 0.02 * np.abs(x).max()))           # trim leading silence
            x = x[max(0, s - int(0.004 * SR)):]
            self.notes[m] = x / (np.sqrt(np.mean(x[: int(0.6 * SR)] ** 2)) * 6 + 1e-9)
        if not self.notes:
            raise FileNotFoundError(f'no samples matched in {folder} (layer={layer})')
        self.gain, self.loop = gain, loop

    def __call__(self, m, dur, vel=0.5, attack=0.0, release=0.4):
        base = min(self.notes, key=lambda k: abs(k - m))
        x = repitch(self.notes[base], m - base)
        need = int((dur + release) * SR)
        if self.loop and need > len(x) - int(0.1 * SR):
            x = self._extend(x, need)
        x = x[:need].copy()
        t = np.arange(len(x)) / SR
        env = np.ones(len(x))
        if attack > 0:
            env *= np.minimum(1, t / attack)
        env *= np.where(t > dur, np.exp(-(t - dur) / max(release / 3, 1e-3)), 1)
        return x * env * vel * self.gain

    @staticmethod
    def _extend(x, need):
        """Crossfade-loop the steady middle of a sustained sample."""
        a, b = int(len(x) * 0.35), int(len(x) * 0.85)
        if b - a < int(0.3 * SR):
            return np.pad(x, (0, need - len(x)))
        seg = x[a:b]
        fade = int(0.08 * SR)
        out = x[:b].copy()
        while len(out) < need:
            nxt = seg.copy()
            ramp = np.linspace(0, 1, fade)
            out[-fade:] = out[-fade:] * (1 - ramp) + nxt[:fade] * ramp
            out = np.concatenate([out, nxt[fade:]])
        return out


class OneShot:
    def __init__(self, path, gain=1.0):
        x = load(path)
        self.x = x / (np.abs(x).max() + 1e-9) * gain
        self.pk = peak_at(self.x)

    def at(self, semis=0.0):
        """(signal, seconds-to-peak) so callers can put the peak on a cue."""
        if not semis:
            return self.x, self.pk
        return repitch(self.x, semis), self.pk / 2 ** (semis / 12)


class Mix:
    def __init__(self, duration, tail=3.0):
        self.dur = duration
        self.N = int((duration + tail) * SR)
        self.buses = {}
        self.verb = np.zeros((2, self.N))
        self.duck_src = np.zeros(self.N)

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.N))
        return self.buses[name]

    def add(self, bus, t, sig, gain=1.0, pan=0.0, send=0.0):
        b = self.bus(bus)
        i = int(round(t * SR))
        if i >= self.N or i + len(sig) <= 0:
            return
        if i < 0:
            sig, i = sig[-i:], 0
        sig = sig[: self.N - i] * gain
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        b[0, i:i + len(sig)] += sig * gl
        b[1, i:i + len(sig)] += sig * gr
        if send:
            self.verb[0, i:i + len(sig)] += sig * gl * send
            self.verb[1, i:i + len(sig)] += sig * gr * send

    def hit(self, bus, t, shot, gain=1.0, semis=0.0, pan=0.0, send=0.0):
        """Place a one-shot so its loudest moment lands on t."""
        x, pk = shot.at(semis)
        self.add(bus, t - pk, x, gain, pan, send)

    def duck(self, t, depth=1.0, dur=0.35, tau=0.12):
        i, L = int(t * SR), int(dur * SR)
        seg = self.duck_src[i:i + L]
        self.duck_src[i:i + L] = np.maximum(seg, depth * np.exp(-np.arange(len(seg)) / SR / tau))

    def render(self, out_path, duck_buses=('music',), duck_amount=0.3, wet=0.5, rt=2.4, fade=1.2, stems=False):
        ir_len = int(rt * SR)
        ti = np.arange(ir_len) / SR
        irs = []
        for _ in range(2):
            ir = rng.standard_normal(ir_len) * np.exp(-ti / (rt / 4.5))
            ir = band(ir, 180, 7500)
            ir[: int(0.022 * SR)] = 0
            irs.append(ir / np.sqrt((ir ** 2).sum()))
        size = 1 << int(np.ceil(np.log2(self.N + ir_len)))
        wetsig = np.stack([np.fft.irfft(np.fft.rfft(self.verb[c], size) * np.fft.rfft(irs[c], size), size)[: self.N] for c in range(2)])
        gain = 1 - duck_amount * self.duck_src
        mix = wetsig * wet
        for name, b in self.buses.items():
            mix = mix + (b * gain if name in duck_buses else b)
        if stems:
            db = lambda b, t: 20 * np.log10(np.sqrt((b[:, int(t * SR):int((t + 2) * SR)] ** 2).mean()) + 1e-9)  # noqa: E731
            for name, b in list(self.buses.items()) + [('wet', wetsig * wet)]:
                print(f'{name:7s}', ' '.join(f'{db(b, t):4.0f}' for t in range(0, int(self.dur), 2)))
            print('t:     ', ' '.join(f'{t:4d}' for t in range(0, int(self.dur), 2)))
        mix = np.stack([band(mix[c], 28, 18500) for c in range(2)])
        end = int(self.dur * SR)
        fd = np.ones(self.N)
        if fade:
            fd[end - int(fade * SR):end] = np.linspace(1, 0, int(fade * SR)) ** 2
        mix = (mix * fd)[:, :end]
        mix = np.tanh(mix * 1.05) / 1.05
        mix /= np.abs(mix).max() / 0.9
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s16le', out_path],
                       input=mix.T.astype(np.float32).tobytes(), check=True)


def master(wav_in, wav_out, lufs=-16.0, limit=0.84):
    """Linear gain to the LUFS target, then a peak limiter (loudnorm alone left peaks at 1.0)."""
    log = subprocess.run(['ffmpeg', '-v', 'info', '-i', wav_in, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True).stderr
    measured = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', log)[-1])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav_in, '-af', f'volume={lufs - measured}dB,alimiter=limit={limit}:level=false', '-ar', '48000', wav_out], check=True)
    return measured
