// Distinct prebuilt voices. "slow" uses an inline style tag that the TTS model obeys without speaking it
// (a "Say slowly: ..." prefix gets spoken; a system instruction is rejected by this model).
export const VOICES = [
  { key: 'kore', voiceName: 'Kore', style: null, note: 'female, firm' },
  { key: 'puck', voiceName: 'Puck', style: null, note: 'male, upbeat' },
  { key: 'gacrux_slow', voiceName: 'Gacrux', style: '[slowly, elderly voice]', note: 'mature voice, slow elderly style tag' },
];
