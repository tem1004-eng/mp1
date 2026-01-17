
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Music, Upload, Play, Pause, RotateCcw, Plus, Minus, 
  Piano as PianoIcon, Guitar as GuitarIcon, Mic, Drum, 
  Loader2, Sparkles, Activity, Camera, X, Zap, Volume2
} from 'lucide-react';
import { InstrumentType, ScoreData, Note, Measure } from './types';
import { geminiService } from './services/geminiService';
import { audioEngine } from './utils/audioEngine';

const NeonEqualizer: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = audioEngine.analyserNode;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barCount = 40;
      const barWidth = width / barCount;
      
      for (let i = 0; i < barCount; i++) {
        // Sample frequency data across the spectrum
        const sampleIndex = Math.floor((i / barCount) * (bufferLength / 2));
        const val = dataArray[sampleIndex];
        const barHeight = isPlaying ? (val / 255) * height : 4;

        const hue = (i / barCount) * 360;
        ctx.fillStyle = isPlaying ? `hsla(${hue}, 80%, 60%, 0.8)` : '#1e293b';
        ctx.shadowBlur = isPlaying ? 15 : 0;
        ctx.shadowColor = `hsla(${hue}, 80%, 60%, 1)`;
        
        const x = i * barWidth;
        const y = height - barHeight;
        
        ctx.beginPath();
        ctx.roundRect(x + 2, y, barWidth - 4, barHeight, [4, 4, 0, 0]);
        ctx.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying]);

  return (
    <div className="w-full bg-slate-950/80 rounded-3xl p-6 border border-slate-800 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)] h-44 flex items-end relative overflow-hidden backdrop-blur-xl">
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_120%,#3b82f6,transparent_70%)]" />
      <canvas ref={canvasRef} className="w-full h-full relative z-10" width={800} height={200} />
    </div>
  );
};

const CameraModal: React.FC<{ onCapture: (base64: string) => void; onClose: () => void }> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (err) {
        alert("Camera access denied. Please check your browser permissions.");
        onClose();
      }
    }
    startCamera();
    return () => stream?.getTracks().forEach(track => track.stop());
  }, []);

  const capture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg').split(',')[1]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-md">
      <div className="relative w-full max-w-2xl aspect-[3/4] bg-slate-900 rounded-[2.5rem] overflow-hidden border-4 border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.2)]">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-10 border border-white/10 rounded-3xl" />
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_15px_rgba(96,165,250,0.8)] animate-[scan_2.5s_linear_infinite]" />
        </div>
        <button onClick={onClose} className="absolute top-6 right-6 p-3 bg-black/60 rounded-full text-white hover:bg-black transition-colors">
          <X size={24} />
        </button>
      </div>
      <div className="mt-10 flex flex-col items-center gap-4">
        <button onClick={capture} className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-full font-black text-xl shadow-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3">
          <Camera size={28} /> Capture Score
        </button>
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Align sheet music within the frame</p>
      </div>
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

const App: React.FC = () => {
  const [score, setScore] = useState<ScoreData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPreparingVocals, setIsPreparingVocals] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [tempo, setTempo] = useState(90);
  const [selectedInstruments, setSelectedInstruments] = useState<Set<InstrumentType>>(new Set([InstrumentType.PIANO, InstrumentType.DRUMS]));
  const [currentMeasureIndex, setCurrentMeasureIndex] = useState(0);
  const [vocalAudioMap, setVocalAudioMap] = useState<Record<string, string>>({}); 
  
  const playbackTimerRef = useRef<number | null>(null);
  const measureStartTimeRef = useRef<number>(0);

  const startAnalysis = async (base64: string) => {
    setIsAnalyzing(true);
    setScore(null);
    setVocalAudioMap({});
    
    try {
      const result = await geminiService.analyzeScore(base64);
      setScore(result);
      setTempo(result.tempo || 90);
      await generateAllVocals(result);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Analysis failed. Please try a clearer image.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateAllVocals = async (data: ScoreData) => {
    setIsPreparingVocals(true);
    const voice = selectedInstruments.has(InstrumentType.FEMALE_VOCAL) ? 'Kore' : 'Puck';
    
    const promises = data.measures.map(async (measure, i) => {
      const lyrics = measure.melody.filter(n => n.lyrics).map(n => n.lyrics).join(' ');
      if (lyrics.trim()) {
        try {
          const audio = await geminiService.generateVocalAudio(lyrics, voice);
          return { index: i, audio };
        } catch(e) { return null; }
      }
      return null;
    });

    const results = await Promise.all(promises);
    const map: Record<string, string> = {};
    results.forEach(res => { if (res) map[res.index] = res.audio; });
    setVocalAudioMap(map);
    setIsPreparingVocals(false);
  };

  const playMeasure = useCallback((index: number, startTime: number) => {
    if (!score) return;
    const measure = score.measures[index];
    const beatDuration = 60 / tempo;

    if (selectedInstruments.has(InstrumentType.PIANO) || selectedInstruments.has(InstrumentType.GUITAR)) {
      let offset = 0;
      measure.melody.forEach(note => {
        const inst = selectedInstruments.has(InstrumentType.PIANO) ? InstrumentType.PIANO : InstrumentType.GUITAR;
        audioEngine.playNote(note.pitch, note.duration * beatDuration, inst, startTime + offset);
        offset += note.duration * beatDuration;
      });
    }

    if (selectedInstruments.has(InstrumentType.BASS) && measure.chords.length > 0) {
      const chordDuration = (4 * beatDuration) / measure.chords.length;
      measure.chords.forEach((chord, i) => {
        const root = chord.charAt(0) + "2";
        audioEngine.playNote(root, chordDuration, InstrumentType.BASS, startTime + (i * chordDuration));
      });
    }

    if (selectedInstruments.has(InstrumentType.DRUMS)) {
      for (let i = 0; i < 4; i++) {
        audioEngine.playDrum('hihat', startTime + (i * beatDuration));
        audioEngine.playDrum('hihat', startTime + (i * beatDuration) + (0.5 * beatDuration));
        if (i === 0 || i === 2) audioEngine.playDrum('kick', startTime + (i * beatDuration));
        if (i === 1 || i === 3) audioEngine.playDrum('snare', startTime + (i * beatDuration));
      }
    }

    if (vocalAudioMap[index] && (selectedInstruments.has(InstrumentType.MALE_VOCAL) || selectedInstruments.has(InstrumentType.FEMALE_VOCAL))) {
      audioEngine.playVocalBuffer(vocalAudioMap[index], startTime);
    }
  }, [score, tempo, selectedInstruments, vocalAudioMap]);

  useEffect(() => {
    if (isPlaying && score) {
      const beatDuration = 60 / tempo;
      const measureDuration = 4 * beatDuration;

      const scheduleNext = () => {
        const now = audioEngine.context.currentTime;
        if (measureStartTimeRef.current === 0) measureStartTimeRef.current = now + 0.1;
        
        playMeasure(currentMeasureIndex, measureStartTimeRef.current);
        
        playbackTimerRef.current = window.setTimeout(() => {
          measureStartTimeRef.current += measureDuration;
          setCurrentMeasureIndex(prev => {
            const next = prev + 1;
            if (next >= score.measures.length) {
              setIsPlaying(false);
              return 0;
            }
            return next;
          });
        }, measureDuration * 1000);
      };

      scheduleNext();
    } else {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    }
    return () => { if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current); };
  }, [isPlaying, currentMeasureIndex, score, tempo, playMeasure]);

  const handlePlayToggle = () => {
    audioEngine.init();
    if (!isPlaying) measureStartTimeRef.current = 0;
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#050608] text-slate-200 selection:bg-blue-500 selection:text-white">
      <header className="w-full bg-slate-950/80 backdrop-blur-2xl border-b border-white/5 py-6 px-10 flex items-center justify-between sticky top-0 z-40 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-5">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-[0_0_25px_rgba(37,99,235,0.45)] transform -rotate-3 hover:rotate-0 transition-transform cursor-pointer">
            <Zap size={26} className="text-white fill-current" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase italic leading-tight">Gemini <span className="text-blue-500">FastScan</span></h1>
            <p className="text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase">AI Orchestration Engine</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsCameraOpen(true)} className="bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-2xl flex items-center gap-2.5 text-sm font-bold border border-white/10 transition-all hover:border-blue-500/50">
            <Camera size={18} className="text-blue-400" /> Live Scan
          </button>
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl flex items-center gap-2.5 text-sm font-bold transition-all shadow-lg active:scale-95">
            <Upload size={18} /> Import
            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => startAnalysis((ev.target?.result as string).split(',')[1]);
                reader.readAsDataURL(file);
              }
            }} />
          </label>
        </div>
      </header>

      <main className="w-full max-w-7xl px-8 py-14 flex flex-col gap-12">
        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center p-24 bg-slate-900/40 rounded-[4rem] border border-white/5 shadow-2xl gap-10 animate-pulse backdrop-blur-md">
            <div className="relative">
              <Loader2 size={100} className="animate-spin text-blue-500" />
              <div className="absolute inset-0 bg-blue-500/20 blur-[60px] rounded-full" />
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-4xl font-black italic tracking-tighter text-white">ORCHESTRATING...</h3>
              <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs">Processing multimodal score data</p>
            </div>
          </div>
        )}

        {score && !isAnalyzing && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 animate-in fade-in zoom-in-95 duration-700">
            {/* Visualizer & Core Info */}
            <div className="lg:col-span-8 flex flex-col gap-10">
              <section className="bg-slate-900/60 p-12 rounded-[3.5rem] border border-white/5 shadow-2xl flex flex-col gap-10 relative overflow-hidden group backdrop-blur-lg">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                  <Activity size={200} />
                </div>
                
                <div className="z-10 flex justify-between items-end">
                  <div className="space-y-4">
                    <h2 className="text-5xl font-black text-white italic tracking-tighter leading-none">{score.title || 'FAST PERFORMANCE'}</h2>
                    <div className="flex items-center gap-3">
                      <span className="px-5 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-black uppercase tracking-widest">{score.keySignature}</span>
                      <span className="px-5 py-2 bg-slate-800/80 text-slate-400 border border-white/5 rounded-xl text-xs font-black uppercase tracking-widest">{score.timeSignature}</span>
                      <span className="px-5 py-2 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/> LIVE READY</span>
                    </div>
                  </div>
                </div>

                <NeonEqualizer isPlaying={isPlaying} />

                <div className="z-10 pt-4 space-y-6">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Performance Timeline</span>
                    <div className="flex items-center gap-3">
                       <span className="text-xs font-black text-white italic">MEASURE {currentMeasureIndex + 1} / {score.measures.length}</span>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-white/5 shadow-inner">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 transition-all duration-300 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                      style={{ width: `${((currentMeasureIndex + 1) / score.measures.length) * 100}%` }}
                    />
                  </div>
                </div>
              </section>

              {/* Master Controls */}
              <section className="bg-slate-900/60 px-12 py-10 rounded-[3rem] border border-white/5 shadow-2xl flex items-center justify-between backdrop-blur-lg">
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-2">Global BPM</span>
                  <div className="flex items-center gap-8">
                    <button onClick={() => setTempo(t => Math.max(40, t - 5))} className="w-14 h-14 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-slate-400 border border-white/5 active:scale-90"><Minus size={28} /></button>
                    <div className="flex flex-col items-center">
                       <span className="text-6xl font-black font-mono text-white drop-shadow-2xl tabular-nums">{tempo}</span>
                    </div>
                    <button onClick={() => setTempo(t => Math.min(240, t + 5))} className="w-14 h-14 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-slate-400 border border-white/5 active:scale-90"><Plus size={28} /></button>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <button onClick={() => { setIsPlaying(false); setCurrentMeasureIndex(0); measureStartTimeRef.current = 0; }} className="w-20 h-20 rounded-[2rem] bg-slate-800/80 hover:bg-slate-700 transition-all flex items-center justify-center text-slate-400 active:scale-90 border border-white/5" title="Reset Session">
                    <RotateCcw size={32} />
                  </button>
                  <button 
                    onClick={handlePlayToggle} 
                    disabled={isPreparingVocals}
                    className={`h-28 w-28 rounded-[2.5rem] ${isPlaying ? 'bg-pink-600 shadow-pink-500/30' : 'bg-blue-600 shadow-blue-500/40'} text-white transition-all transform hover:scale-105 active:scale-95 shadow-[0_20px_60px_-15px_rgba(37,99,235,0.5)] flex items-center justify-center border-t border-white/20`}
                  >
                    {isPreparingVocals ? <Loader2 className="animate-spin" size={48} /> : isPlaying ? <Pause size={56} fill="currentColor" /> : <Play size={56} className="ml-2" fill="currentColor" />}
                  </button>
                </div>
              </section>
            </div>

            {/* Ensemble Controls */}
            <div className="lg:col-span-4 flex flex-col gap-10">
              <section className="bg-slate-900/60 p-10 rounded-[3.5rem] border border-white/5 shadow-2xl flex flex-col gap-8 h-full backdrop-blur-lg">
                <div className="flex items-center gap-3 px-2">
                   <Volume2 size={16} className="text-blue-500" />
                   <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">Virtual Band</h3>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <InstrumentToggle icon={<PianoIcon size={22} />} label="CONCERT PIANO" active={selectedInstruments.has(InstrumentType.PIANO)} onClick={() => { const n = new Set(selectedInstruments); n.has(InstrumentType.PIANO) ? n.delete(InstrumentType.PIANO) : n.add(InstrumentType.PIANO); setSelectedInstruments(n); }} />
                  <InstrumentToggle icon={<GuitarIcon size={22} />} label="CLEAN ELECTRIC" active={selectedInstruments.has(InstrumentType.GUITAR)} onClick={() => { const n = new Set(selectedInstruments); n.has(InstrumentType.GUITAR) ? n.delete(InstrumentType.GUITAR) : n.add(InstrumentType.GUITAR); setSelectedInstruments(n); }} />
                  <InstrumentToggle icon={<div className="font-black text-xs">BASS</div>} label="70S FENDER BASS" active={selectedInstruments.has(InstrumentType.BASS)} onClick={() => { const n = new Set(selectedInstruments); n.has(InstrumentType.BASS) ? n.delete(InstrumentType.BASS) : n.add(InstrumentType.BASS); setSelectedInstruments(n); }} />
                  <InstrumentToggle icon={<Drum size={22} />} label="VINTAGE KIT" active={selectedInstruments.has(InstrumentType.DRUMS)} onClick={() => { const n = new Set(selectedInstruments); n.has(InstrumentType.DRUMS) ? n.delete(InstrumentType.DRUMS) : n.add(InstrumentType.DRUMS); setSelectedInstruments(n); }} />
                  <div className="h-px bg-white/5 my-4" />
                  <InstrumentToggle icon={<Mic size={22} className="text-blue-400" />} label="VOX NEURAL MALE" active={selectedInstruments.has(InstrumentType.MALE_VOCAL)} onClick={() => { const n = new Set(selectedInstruments); n.has(InstrumentType.MALE_VOCAL) ? n.delete(InstrumentType.MALE_VOCAL) : n.add(InstrumentType.MALE_VOCAL); setSelectedInstruments(n); }} />
                  <InstrumentToggle icon={<Mic size={22} className="text-pink-400" />} label="VOX NEURAL FEMALE" active={selectedInstruments.has(InstrumentType.FEMALE_VOCAL)} onClick={() => { const n = new Set(selectedInstruments); n.has(InstrumentType.FEMALE_VOCAL) ? n.delete(InstrumentType.FEMALE_VOCAL) : n.add(InstrumentType.FEMALE_VOCAL); setSelectedInstruments(n); }} />
                </div>
                <div className="mt-auto p-6 bg-black/40 rounded-3xl border border-white/5 text-[11px] text-slate-500 italic font-medium leading-relaxed shadow-inner">
                  {isPreparingVocals ? "Syncing parallel neural voices..." : isPlaying ? "Ensemble performing live orchestration." : "Ready for performance. Engaging band members..."}
                </div>
              </section>
            </div>
          </div>
        )}

        {!score && !isAnalyzing && (
          <div className="flex flex-col items-center justify-center p-32 bg-slate-900/40 rounded-[5rem] border-2 border-dashed border-white/5 text-center gap-12 group hover:border-blue-500/30 transition-all duration-700 shadow-3xl backdrop-blur-md">
            <div className="relative">
              <div className="p-16 bg-black/50 rounded-full group-hover:scale-110 transition-transform shadow-[inset_0_4px_20px_rgba(0,0,0,0.8)] border border-white/5">
                <Music size={120} className="text-slate-700 group-hover:text-blue-500 transition-colors duration-500" />
              </div>
              <div className="absolute -top-6 -right-6 p-6 bg-blue-600 rounded-3xl animate-bounce shadow-[0_10px_40px_rgba(37,99,235,0.4)] border-t border-white/20">
                <Zap size={40} className="text-white fill-current" />
              </div>
            </div>
            <div className="space-y-6">
              <h2 className="text-5xl font-black text-white italic tracking-tighter">INSTANT ORCHESTRATION</h2>
              <p className="text-slate-500 max-w-xl mx-auto font-bold text-lg leading-relaxed uppercase tracking-wider">
                Experience high-performance music analysis. Scan any score to perform with neural vocals and virtual instruments in real-time.
              </p>
            </div>
            <div className="flex gap-6">
              <button onClick={() => setIsCameraOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-6 rounded-3xl font-black text-2xl shadow-[0_25px_60px_-15px_rgba(37,99,235,0.5)] transition-all flex items-center gap-4 hover:-translate-y-1 active:scale-95 border-t border-white/20">
                <Camera size={32} /> LIVE SCAN
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto py-20 text-slate-700 text-[10px] font-black tracking-[0.6em] uppercase flex flex-col items-center gap-6 opacity-40">
        <div className="flex gap-16">
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"/> NEURAL PROCESSING</span>
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"/> FAST INFERENCE</span>
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"/> WEB AUDIO ENGINE</span>
        </div>
        <p className="tracking-[1em] text-slate-800">GEMINI FASTSCAN v3.0</p>
      </footer>
    </div>
  );
};

const InstrumentToggle: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center justify-between p-6 rounded-3xl transition-all border ${active ? 'bg-blue-600 text-white border-blue-400 shadow-[0_15px_40px_-10px_rgba(37,99,235,0.6)] scale-[1.03] z-10 border-t border-t-white/20' : 'bg-slate-950/50 text-slate-500 border-white/5 hover:border-white/10 shadow-sm active:scale-95'}`}>
    <div className="flex items-center gap-5 font-black italic tracking-tighter">
      <div className={`${active ? 'text-white' : 'text-slate-600'} transition-colors`}>{icon}</div>
      <span className="text-sm tracking-wide">{label}</span>
    </div>
    {active && <div className="h-2.5 w-2.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,1)] animate-pulse" />}
  </button>
);

export default App;
