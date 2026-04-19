import { useCallback, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording' | 'stopped';

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
 */
export function useRecorder() {
  const [state, setState]           = useState<RecorderState>('idle');
  const [audioBlob, setAudioBlob]   = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]     = useState<string | null>(null);
  const [replayBlob, setReplayBlob] = useState<Blob | null>(null);
  const [replayUrl, setReplayUrl]   = useState<string | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const replayRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const replayChunksRef = useRef<Blob[]>([]);
  const pendingStopsRef = useRef(0);
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

  const start = useCallback(async () => {
    // Try for both tracks. If the user denies camera only, fall back to
    // audio-only so the answer still goes through.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
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
  }, [audioUrl, replayUrl]);

  return { state, start, stop, audioBlob, audioUrl, replayBlob, replayUrl, videoStream, reset };
}
