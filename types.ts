
export interface Note {
  pitch: string; // e.g., "C4", "G#3"
  duration: number; // in beats (e.g., 1 for quarter note, 0.5 for eighth)
  lyrics?: string;
}

export interface Measure {
  chords: string[]; // e.g., ["Cmaj7", "G7"]
  melody: Note[];
  drumGroove?: string; // Descriptive: "standard 4/4 rock", "swing"
}

export interface ScoreData {
  title: string;
  tempo: number;
  timeSignature: string;
  keySignature: string;
  measures: Measure[];
}

export enum InstrumentType {
  PIANO = 'piano',
  GUITAR = 'guitar',
  BASS = 'bass',
  DRUMS = 'drums',
  MALE_VOCAL = 'maleVocal',
  FEMALE_VOCAL = 'femaleVocal'
}

export interface PlaybackState {
  isPlaying: boolean;
  tempo: number;
  currentMeasure: number;
  selectedInstruments: Set<InstrumentType>;
}
