const RADIO_STATIONS = [
  { name: '甜甜圈 FM', bpm: 106, root: 220, scale: [0, 2, 4, 7, 9], mood: 'pop' },
  { name: '海风电台', bpm: 88, root: 174.6, scale: [0, 3, 5, 7, 10], mood: 'chill' },
  { name: '夜行 SYNTH', bpm: 122, root: 146.8, scale: [0, 2, 3, 7, 8], mood: 'synth' },
];

export { RADIO_STATIONS };

export function createAudio() {
  const audio = {
    context: null, master: null, compressor: null, volume: 0.35,
    engine: null, engineGain: null, siren: null, sirenGain: null,
    radioGain: null, radioOn: false, radioIndex: 0, radioTimer: null,
    nextNote: 0, step: 0, noise: null,
  };

  function start() {
    if (audio.context) {
      audio.context.resume();
      return audio.context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const context = new AudioContext();
    audio.context = context;
    audio.compressor = context.createDynamicsCompressor();
    audio.compressor.threshold.value = -18;
    audio.compressor.ratio.value = 6;
    audio.master = context.createGain();
    audio.master.gain.value = audio.volume;
    audio.master.connect(audio.compressor).connect(context.destination);

    audio.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = audio.noise.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;

    audio.engineGain = context.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineGain.connect(audio.master);
    audio.engine = context.createOscillator();
    audio.engine.type = 'sawtooth';
    audio.engine.frequency.value = 58;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engine.connect(engineFilter).connect(audio.engineGain);
    audio.engine.start();

    audio.sirenGain = context.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenGain.connect(audio.master);
    audio.siren = context.createOscillator();
    audio.siren.type = 'square';
    audio.siren.frequency.value = 660;
    const sirenFilter = context.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1500;
    audio.siren.connect(sirenFilter).connect(audio.sirenGain);
    audio.siren.start();

    audio.radioGain = context.createGain();
    audio.radioGain.gain.value = 0;
    audio.radioGain.connect(audio.master);
    audio.radioTimer = setInterval(scheduleRadio, 40);
    return context;
  }

  function tone(frequency, duration, type = 'sine', gain = 0.08, slide = 1.35) {
    const context = audio.context;
    if (!context || !audio.volume) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * slide),
      now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain * audio.volume, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(audio.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function noiseBurst(duration, gain, filterFrequency, sweep = 1) {
    const context = audio.context;
    if (!context || !audio.volume) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = audio.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrequency, now);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, filterFrequency * sweep), now + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain * audio.volume, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(envelope).connect(audio.master);
    source.start(now);
    source.stop(now + duration);
  }

  function beep(frequency = 420, duration = 0.12, type = 'sine') {
    tone(frequency, duration, type, 0.06, 1.35);
  }

  function gunshot(power = 1) {
    noiseBurst(0.09 + power * 0.05, 0.4 * power, 2400, 0.16);
    tone(150 - power * 30, 0.12, 'square', 0.18, 0.3);
  }

  function explosion() {
    noiseBurst(0.85, 0.9, 900, 0.09);
    tone(90, 0.7, 'sawtooth', 0.32, 0.22);
    tone(48, 0.9, 'sine', 0.3, 0.35);
  }

  function impact() {
    noiseBurst(0.16, 0.32, 500, 0.25);
    tone(70, 0.18, 'square', 0.16, 0.5);
  }

  function footstep() {
    noiseBurst(0.07, 0.12, 900, 0.4);
  }

  function ui(kind = 'move') {
    if (kind === 'cash') { tone(880, 0.09, 'square', 0.05, 1.0); setTimeout(() =>
      tone(1320, 0.14, 'square', 0.05, 1.0), 70); return; }
    if (kind === 'deny') { tone(180, 0.18, 'square', 0.06, 0.6); return; }
    if (kind === 'success') { tone(660, 0.12, 'triangle', 0.07, 1.5); setTimeout(() =>
      tone(990, 0.2, 'triangle', 0.07, 1.3), 110); return; }
    tone(520, 0.06, 'sine', 0.04, 1.1);
  }

  function missionStart() {
    tone(330, 0.16, 'triangle', 0.08, 1.2);
    setTimeout(() => tone(440, 0.16, 'triangle', 0.08, 1.2), 140);
    setTimeout(() => tone(550, 0.26, 'triangle', 0.09, 1.3), 280);
  }

  function setSiren(on, heat = 0) {
    if (!audio.sirenGain) return;
    audio.sirenGain.gain.setTargetAtTime(on ? 0.055 * audio.volume : 0,
      audio.context.currentTime, 0.25);
    if (on) {
      audio.siren.frequency.setTargetAtTime(660 + heat * 90, audio.context.currentTime, 0.6);
    }
  }

  function setEngine(speed, active) {
    if (!audio.engineGain) return;
    const now = audio.context.currentTime;
    audio.engine.frequency.setTargetAtTime(56 + Math.abs(speed) * 7.5, now, 0.12);
    audio.engineGain.gain.setTargetAtTime(active ? audio.volume * 0.02 : 0, now, 0.1);
  }

  function setVolume(volume) {
    audio.volume = Math.max(0, Math.min(1, volume));
    if (audio.master) audio.master.gain.value = audio.volume;
    if (audio.radioOn) setRadio(true);
  }

  function station() { return RADIO_STATIONS[audio.radioIndex]; }

  function setRadio(on) {
    audio.radioOn = on;
    if (!audio.radioGain) return;
    audio.radioGain.gain.setTargetAtTime(on ? 0.11 * audio.volume : 0,
      audio.context.currentTime, 0.3);
    if (on) audio.nextNote = audio.context.currentTime + 0.05;
  }

  function cycleRadio() {
    audio.radioIndex = (audio.radioIndex + 1) % RADIO_STATIONS.length;
    audio.step = 0;
    if (audio.context) audio.nextNote = audio.context.currentTime + 0.05;
    return station();
  }

  function radioNote(frequency, duration, type, gain, at) {
    const oscillator = audio.context.createOscillator();
    const envelope = audio.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(audio.radioGain);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  function radioDrum(at) {
    const source = audio.context.createBufferSource();
    source.buffer = audio.noise;
    const filter = audio.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2600;
    const envelope = audio.context.createGain();
    envelope.gain.setValueAtTime(0.16, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    source.connect(filter).connect(envelope).connect(audio.radioGain);
    source.start(at);
    source.stop(at + 0.05);
  }

  function scheduleRadio() {
    if (!audio.radioOn || !audio.context || !audio.volume) return;
    if (audio.context.state !== 'running') return;
    const ahead = audio.context.currentTime + 0.15;
    const beat = 60 / station().bpm / 4;
    let guard = 0;
    while (audio.nextNote < ahead && guard++ < 12) {
      const step = audio.step % 32;
      const bar = Math.floor(audio.step / 32) % 4;
      const scale = station().scale;
      const at = audio.nextNote;
      if (step % 8 === 0) {
        const bass = station().root / 2 * [1, 1.122, 0.891, 1.26][bar];
        radioNote(bass, beat * 6, 'triangle', 0.22, at);
      }
      if (step % 4 === 0) {
        const chordRoot = [0, 2, 4, 1][bar];
        for (const offset of [0, 2, 4]) {
          const degree = scale[(chordRoot + offset) % scale.length];
          radioNote(station().root * Math.pow(2, degree / 12), beat * 3.4,
            'sine', 0.055, at);
        }
      }
      if (step % 2 === 0) radioDrum(at);
      if (step % 2 === 1 && Math.random() > 0.35) {
        const degree = scale[Math.floor(Math.random() * scale.length)];
        radioNote(station().root * 2 * Math.pow(2, degree / 12), beat * 1.6,
          'square', 0.055, at);
      }
      audio.nextNote += beat;
      audio.step++;
    }
  }

  return {
    audio, start, beep, gunshot, explosion, impact, footstep, ui,
    missionStart, setSiren, setEngine, setVolume, setRadio, cycleRadio,
    station, get radioIndex() { return audio.radioIndex; },
    get radioOn() { return audio.radioOn; },
  };
}
