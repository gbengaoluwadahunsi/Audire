// Grades are Kokoro's own published `overallGrade` for each voice, best first.
// Voices graded D and below are left out: they sound flat enough to defeat the
// point of using a neural voice at all.
export const KOKORO_VOICES = [
  { id: 'af_heart',    name: 'Heart · American F',    grade: 'A'  },
  { id: 'af_bella',    name: 'Bella · American F',    grade: 'A-' },
  { id: 'af_nicole',   name: 'Nicole · American F',   grade: 'B-' },
  { id: 'bf_emma',     name: 'Emma · British F',      grade: 'B-' },
  { id: 'af_aoede',    name: 'Aoede · American F',    grade: 'C+' },
  { id: 'af_kore',     name: 'Kore · American F',     grade: 'C+' },
  { id: 'af_sarah',    name: 'Sarah · American F',    grade: 'C+' },
  { id: 'am_fenrir',   name: 'Fenrir · American M',   grade: 'C+' },
  { id: 'am_michael',  name: 'Michael · American M',  grade: 'C+' },
  { id: 'am_puck',     name: 'Puck · American M',     grade: 'C+' },
  { id: 'af_alloy',    name: 'Alloy · American F',    grade: 'C'  },
  { id: 'af_nova',     name: 'Nova · American F',     grade: 'C'  },
  { id: 'bf_isabella', name: 'Isabella · British F',  grade: 'C'  },
  { id: 'bm_george',   name: 'George · British M',    grade: 'C'  },
  { id: 'bm_fable',    name: 'Fable · British M',     grade: 'C'  },
  { id: 'af_sky',      name: 'Sky · American F',      grade: 'C-' },
];

export const KOKORO_DEFAULT_VOICE = 'af_heart';
