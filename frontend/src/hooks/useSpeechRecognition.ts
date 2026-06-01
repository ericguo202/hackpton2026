/**
 * useSpeechRecognition — thin wrapper over the browser-native Web Speech API.
 *
 * Powers the optional voice dictation on the bio fields (Onboarding step 3 and
 * Personalize). It is a *progressive enhancement*: `supported` is false on
 * browsers without the API (notably Firefox), and callers must hide the mic UI
 * in that case so typing always remains available. It is deliberately NOT the
 * ElevenLabs STT path — that is a record-blob-then-upload flow for the interview
 * recorder, the wrong shape for an inline textbox.
 *
 * `onResult` fires once per finalized phrase (already trimmed); the latest
 * interim guess is surfaced via `interim` for a live greyed preview. The
 * callback is held in a ref so the recognition listeners always see the freshest
 * closure without re-binding.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal Web Speech API typings — the DOM lib doesn't ship these reliably
// across TS targets, so we declare just the surface we touch.
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Options = {
  onResult: (finalText: string) => void;
};

export type SpeechRecognitionState = {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

export function useSpeechRecognition({ onResult }: Options): SpeechRecognitionState {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Refresh the callback ref every render so listeners use the latest closure.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Tracks user intent: in `continuous` mode Chrome fires `onend` after a pause,
  // and we restart only while the user still wants to be listening.
  const wantListeningRef = useRef(false);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) onResultRef.current(finalText);
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText.trim());
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantListeningRef.current = false;
        setListening(false);
        setError(
          'Microphone access is blocked. Enable it in your browser to dictate.',
        );
      } else {
        setError('Speech recognition had a problem. Please try again.');
      }
    };

    rec.onend = () => {
      // Restart while the user still wants to listen (Chrome auto-ends on pause).
      if (wantListeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // start() throws if it's mid-restart; fall through to idle.
        }
      }
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = rec;
    return () => {
      wantListeningRef.current = false;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // ignore — already stopped
      }
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || wantListeningRef.current) return;
    setError(null);
    setInterim('');
    wantListeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      // Already started — keep the listening state in sync.
      setListening(true);
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    wantListeningRef.current = false;
    setInterim('');
    setListening(false);
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore — already stopped
      }
    }
  }, []);

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, interim, error, start, stop, toggle };
}
