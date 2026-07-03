import { useCallback, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording' | 'stopped';
type StartOptions = { video?: boolean };

function pickSupportedMimeType(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Capture the candidate's answer and expose a parallel video stream
 * for delivery scoring.
 *
 * `getUserMedia` is requested with both audio and video so the single
 * permission prompt covers both features. We then split tracks:
 * `MediaRecorder` binds to an audio-only `MediaStream` (tiny webm/opus
 * blob, identical on-wire payload to the original audio-only flow), and
 * `videoStream` is handed out unchanged for the mirrored `<CameraPreview>`
 * and the MediaPipe analyzer hook (see `useFaceAnalyzer`).
 *
 * Camera denial is not fatal — if the video track is unavailable we
 * still construct the audio-only recorder and leave `videoStream: null`
 * so the analyzer noops and the delivery score drops off. Audio denial
 * IS fatal; we re-throw so the page can surface a mic-permission error.
 *
 * When video WAS requested but couldn't be acquired, we raise
 * `cameraUnavailable` so the page can tell the user the answer went
 * audio-only (no delivery score) instead of degrading silently — this is
 * the common iOS-Safari case where `getUserMedia({video:true})` is refused
 * without a fresh user gesture.
 */
export function useRecorder() {
  const [state, setState]           = useState<RecorderState>('idle');
  const [audioBlob, setAudioBlob]   = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]     = useState<string | null>(null);
  const [replayBlob, setReplayBlob] = useState<Blob | null>(null);
  const [replayUrl, setReplayUrl]   = useState<string | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  // True when a start() asked for video but ended up audio-only (camera
  // refused/unavailable). Reset on each start() outcome and on reset().
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const replayRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const replayChunksRef = useRef<Blob[]>([]);
  const pendingStopsRef = useRef(0);
  // Bumped on every `start()` and `reset()`. Each recorder's `onstop`
  // captures the generation it was created under and refuses to commit a
  // blob if it no longer matches — so a recording discarded mid-flight
  // (e.g. "Restart turn" mid-recording) can't clobber the retake's audio
  // when its async `stop`/`dataavailable` events fire late.
  const generationRef = useRef(0);
  // Retain the raw tracks so `stop()` + `reset()` can fully release the
  // camera/mic — `MediaRecorder.stop()` only releases the recorder's
  // own stream, not the video siblings.
  const tracksRef = useRef<MediaStreamTrack[]>([]);

  const maybeReleaseTracks = useCallback(() => {
    pendingStopsRef.current -= 1;
    if (pendingStopsRef.current > 0) return;
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    setVideoStream(null);
  }, []);

  const start = useCallback(async (options: StartOptions = {}) => {
    const wantsVideo = options.video !== false;
    // Try for both tracks only after the user has opted into delivery
    // analytics. If camera setup fails, fall back to audio-only so the answer
    // still goes through.
    let stream: MediaStream;
    if (!wantsVideo) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    }

    // Mark this as the current recording generation. Both `onstop`
    // closures below capture `myGen` and bail if it's been superseded.
    const myGen = ++generationRef.current;

    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    // Video was wanted but none came back → the camera fell through to the
    // audio-only path. Surface it so the UI can say so (see hook doc).
    setCameraUnavailable(wantsVideo && videoTracks.length === 0);
    tracksRef.current = [...audioTracks, ...videoTracks];

    const audioOnly = new MediaStream(audioTracks);
    const audioMimeType = pickSupportedMimeType([
      'audio/webm;codecs=opus',
      'audio/webm',
    ]);
    const recorder = audioMimeType
      ? new MediaRecorder(audioOnly, { mimeType: audioMimeType })
      : new MediaRecorder(audioOnly);
    recorderRef.current = recorder;
    chunksRef.current   = [];
    replayRecorderRef.current = null;
    replayChunksRef.current = [];
    pendingStopsRef.current = videoTracks.length ? 2 : 1;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (myGen !== generationRef.current) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      maybeReleaseTracks();
    };

    if (videoTracks.length) {
      setVideoStream(new MediaStream(videoTracks));
      const replayMimeType = pickSupportedMimeType([
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]);
      const replayRecorder = replayMimeType
        ? new MediaRecorder(stream, { mimeType: replayMimeType })
        : new MediaRecorder(stream);
      replayRecorderRef.current = replayRecorder;
      replayRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) replayChunksRef.current.push(e.data);
      };
      replayRecorder.onstop = () => {
        if (myGen !== generationRef.current) return;
        const blob = new Blob(replayChunksRef.current, { type: replayRecorder.mimeType });
        setReplayBlob(blob);
        setReplayUrl(URL.createObjectURL(blob));
        maybeReleaseTracks();
      };
    } else {
      setVideoStream(null);
      setReplayBlob(null);
      setReplayUrl(null);
    }

    recorder.start();
    replayRecorderRef.current?.start();
    setState('recording');
  }, [maybeReleaseTracks]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    replayRecorderRef.current?.stop();
    setState('stopped');
  }, []);

  const reset = useCallback(() => {
    // Invalidate any in-flight recorder so a late `onstop` (e.g. from a
    // recording abandoned via "Restart turn") can't commit its blob, and
    // detach the handlers so a pending final `dataavailable` can't push a
    // stale tail chunk into the freshly-cleared `chunksRef`.
    generationRef.current += 1;
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
    }
    if (replayRecorderRef.current) {
      replayRecorderRef.current.ondataavailable = null;
      replayRecorderRef.current.onstop = null;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (replayUrl) URL.revokeObjectURL(replayUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setReplayBlob(null);
    setReplayUrl(null);
    setState('idle');
    recorderRef.current = null;
    replayRecorderRef.current = null;
    chunksRef.current   = [];
    replayChunksRef.current = [];
    pendingStopsRef.current = 0;
    // In case `stop()` was skipped (e.g. an error during submit).
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    setVideoStream(null);
    setCameraUnavailable(false);
  }, [audioUrl, replayUrl]);

  return { state, start, stop, audioBlob, audioUrl, replayBlob, replayUrl, videoStream, cameraUnavailable, reset };
}
