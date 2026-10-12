import sys, subprocess, numpy as np
f = sys.argv[1]; sr = 22050
raw = subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar',str(sr),'-f','f32le','-'], capture_output=True).stdout
x = np.frombuffer(raw, np.float32)
hop = 512; n = len(x)//hop
frames = x[:n*hop].reshape(n, hop)
rms = np.sqrt((frames**2).mean(1)); db = 20*np.log10(rms+1e-6)
# loudness per second
fps = sr/hop
for s in range(int(len(x)/sr)+1):
    seg = db[int(s*fps):int((s+1)*fps)]
    if len(seg): print(f"{s:2d}s {seg.mean():6.1f} dB " + '#'*int(max(0,seg.mean()+50)))
# onset envelope via spectral flux
win = 1024; spec=[]
for i in range(0, len(x)-win, hop):
    spec.append(np.abs(np.fft.rfft(x[i:i+win]*np.hanning(win))))
S = np.log1p(np.array(spec)); flux = np.maximum(0, np.diff(S, axis=0)).sum(1)
flux = (flux - flux.mean())/flux.std()
ac = np.correlate(flux, flux, 'full')[len(flux)-1:]
best = None
for bpm in np.arange(70, 160, 0.5):
    lag = 60/bpm*fps; v = np.interp(lag, np.arange(len(ac)), ac) + 0.5*np.interp(2*lag, np.arange(len(ac)), ac)
    if best is None or v > best[1]: best = (bpm, v)
print('bpm', best[0])
bpm = best[0]; period = 60/bpm*fps
# phase: best offset
ph = max(np.arange(0, period, 0.5), key=lambda o: sum(np.interp(o+k*period, np.arange(len(flux)), flux) for k in range(int((len(flux)-o)/period))))
print('first beat at', round(ph/fps, 3), 's; beat', round(60/bpm,4))
# strongest onsets
idx = np.argsort(flux)[::-1][:12]
print('top onsets', sorted(round(i/fps,2) for i in idx))
