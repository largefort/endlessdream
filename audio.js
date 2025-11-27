export function createAudioSystem() {
  const ctx = new (window.AudioContext || window.webkitAudioContext || AudioContext)();
  let started = false;

  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);

  const lowRumble = ctx.createOscillator();
  lowRumble.type = 'sine';
  lowRumble.frequency.value = 38;

  const lowGain = ctx.createGain();
  lowGain.gain.value = 0.0;

  lowRumble.connect(lowGain);
  lowGain.connect(master);
  lowRumble.start();

  const hissNoise = createNoise(ctx);
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'bandpass';
  hissFilter.frequency.value = 900;
  hissFilter.Q.value = 0.8;

  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.0;

  hissNoise.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(master);

  function ensureStarted() {
    if (started || ctx.state === 'running') return;
    ctx.resume();
    started = true;
  }

  window.addEventListener('pointerdown', ensureStarted, { once: true });

  function update(threat, focus) {
    ensureStarted();
    const baseRumble = 0.15;
    const rumble = baseRumble + threat * 0.5 + (1 - focus) * 0.25;
    lowGain.gain.linearRampToValueAtTime(rumble, ctx.currentTime + 0.15);

    const hissBase = 0.02;
    const hiss = hissBase + threat * 0.3;
    hissGain.gain.linearRampToValueAtTime(hiss, ctx.currentTime + 0.1);

    const baseFreq = 36;
    const freqJitter = threat * 12 + (1 - focus) * 6;
    const targetFreq = baseFreq + freqJitter;
    lowRumble.frequency.linearRampToValueAtTime(targetFreq, ctx.currentTime + 0.2);
  }

  return { update };
}

function createNoise(ctx) {
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.start();
  return node;
}

