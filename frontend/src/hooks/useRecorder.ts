import { useCallback, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording' | 'stopped';

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
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  // Retain the raw tracks so `stop()` + `reset()` can fully release the
  // camera/mic — `MediaRecorder.stop()` only releases the recorder's
  // own stream, not the video siblings.
  const tracksRef = useRef<MediaStreamTrack[]>([]);

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
    const recorder = new MediaRecorder(audioOnly);
    recorderRef.current = recorder;
    chunksRef.current   = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      // Release every track from the combined stream so the green
      // camera/mic indicator actually disappears.
      tracksRef.current.forEach((t) => t.stop());
      setVideoStream(null);
    };

    if (videoTracks.length) {
      setVideoStream(new MediaStream(videoTracks));
    } else {
      setVideoStream(null);
    }

    recorder.start();
    setState('recording');
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setState('stopped');
  }, []);

  const reset = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setState('idle');
    recorderRef.current = null;
    chunksRef.current   = [];
    // In case `stop()` was skipped (e.g. an error during submit).
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    setVideoStream(null);
  }, [audioUrl]);

  return { state, start, stop, audioBlob, audioUrl, videoStream, reset };
}
