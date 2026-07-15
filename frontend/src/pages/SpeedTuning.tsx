/**
 * SpeedTuning — local bench for fine-tuning per-voice ElevenLabs TTS pace.
 *
 * Pick a voice + a speed (0.7–1.2), hit Generate, and listen to the same
 * fixed paragraph so pace can be compared apples-to-apples across voices.
 * Rudimentary UI on purpose — it exists only to pick the per-voice
 * Normal/Slower constants that now live on `voice_pool.VoiceProfile`.
 *
 * STATUS: parked, NOT routed. The `/speed` <Route> and the backend
 * `speed_tuning` router registration were removed once the constants were set;
 * this page + `backend/app/api/v1/endpoints/speed_tuning.py` are kept for the
 * next time voices are added/retuned. To use it again, re-add the `/speed`
 * <Route> in `App.tsx` and re-register the speed_tuning router.
 */

import { useState } from 'react';

import { useApi } from '../hooks/useApi';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { VOICE_PROFILES } from '../lib/voices';

const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;
const STEP = 0.01;

type PreviewResponse = {
  voice_id: string;
  speed: number;
  text: string;
  audio_url: string;
};

export default function SpeedTuning() {
  const { apiFetch } = useApi();
  const [voiceId, setVoiceId] = useState(VOICE_PROFILES[0].id);
  const [speed, setSpeed] = useState(1.1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVoice = VOICE_PROFILES.find((v) => v.id === voiceId);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PreviewResponse>('/api/v1/speed-tuning/preview', {
        method: 'POST',
        body: JSON.stringify({ voice_id: voiceId, speed }),
      });
      setAudioUrl(res.audio_url);
    } catch (err) {
      setError(err instanceof ApiError ? extractApiErrorDetail(err) : String(err));
      setAudioUrl(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Voice speed tuning</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Temporary bench for picking per-voice Normal / Slower speeds. Same paragraph every time.
      </p>

      <label style={{ display: 'block', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Voice</div>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
        >
          {VOICE_PROFILES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.accent}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Speed: <span style={{ fontFamily: 'monospace' }}>{speed.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={STEP}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#999', fontSize: '0.8rem' }}>
          <span>{MIN_SPEED} (slowest)</span>
          <span>{MAX_SPEED} (fastest)</span>
        </div>
      </label>

      <button
        onClick={generate}
        disabled={loading}
        style={{
          padding: '0.6rem 1.2rem',
          fontSize: '1rem',
          cursor: loading ? 'default' : 'pointer',
          background: '#C41E3A',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
        }}
      >
        {loading ? 'Generating…' : 'Generate'}
      </button>

      {error && (
        <p style={{ color: '#C41E3A', marginTop: '1rem' }}>Error: {error}</p>
      )}

      {audioUrl && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ marginBottom: 4, color: '#666' }}>
            {selectedVoice?.name} @ {speed.toFixed(2)}
          </div>
          {/* remount on change so a new clip auto-loads into the player */}
          <audio key={`${voiceId}:${audioUrl}`} src={audioUrl} controls autoPlay style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}
