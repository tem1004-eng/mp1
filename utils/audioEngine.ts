
import { InstrumentType } from "../types";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    
    this.analyser.fftSize = 256;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    
    this.masterGain.gain.value = 0.5;
  }

  get context() {
    if (!this.ctx) this.init();
    return this.ctx!;
  }

  get analyserNode() {
    if (!this.analyser) this.init();
    return this.analyser!;
  }

  private getFrequency(pitch: string): number {
    const notes: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 
      'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
    const match = pitch.match(/([A-G][#b]?)([0-9])/);
    if (!match) return 440;
    const note = match[1];
    const octave = parseInt(match[2]);
    const semitones = notes[note] + (octave - 4) * 12;
    return 440 * Math.pow(2, semitones / 12);
  }

  playNote(pitch: string, duration: number, instrument: InstrumentType, startTime: number) {
    const ctx = this.context;
    const freq = this.getFrequency(pitch);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    switch (instrument) {
      case InstrumentType.PIANO:
        osc.type = 'triangle';
        break;
      case InstrumentType.GUITAR:
        osc.type = 'sawtooth';
        break;
      case InstrumentType.BASS:
        osc.type = 'sine';
        break;
      default:
        osc.type = 'sine';
    }

    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playDrum(type: 'kick' | 'snare' | 'hihat', startTime: number) {
    const ctx = this.context;
    
    if (type === 'kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(0.01, startTime + 0.1);
      gain.gain.setValueAtTime(1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.1);
    } else if (type === 'snare') {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
      noise.connect(noiseGain);
      noiseGain.connect(this.masterGain!);
      noise.start(startTime);
    } else {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.05);
      noise.connect(noiseGain);
      noiseGain.connect(this.masterGain!);
      noise.start(startTime);
    }
  }

  async playVocalBuffer(base64: string, startTime: number) {
    const ctx = this.context;
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    
    try {
        const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.masterGain!);
        source.start(startTime);
    } catch(e) {
        console.warn("Could not decode vocal buffer.");
    }
  }
}

export const audioEngine = new AudioEngine();
