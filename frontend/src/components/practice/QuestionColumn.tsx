import { useEffect, useState, type RefObject } from 'react';
import { Play, Volume2 } from 'lucide-react';

import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface Props {
  questionText: string;
  /** True when this question drills into the current story (a follow-up), so
   *  the label reads "Follow-up question" instead of "Question". */
  isFollowup: boolean;
  audioUrl: string;
  showQuestionText: boolean;
  replayKey: number;
  // Shared with Practice so `handleAudioEnded` can synchronously tear the
  // element down before the recorder's getUserMedia flips the iOS audio
  // session (which otherwise replays this element over the recording).
  audioRef: RefObject<HTMLAudioElement | null>;
  onAudioEnded: () => void;
  className?: string;
}

export function QuestionColumn({
  questionText,
  isFollowup,
  audioUrl,
  showQuestionText,
  replayKey,
  audioRef,
  onAudioEnded,
  className,
}: Props) {
  // Playback is programmatic (not the `autoPlay` attribute) so we can react to
  // the browser's autoplay decision. Where audible autoplay is permitted
  // (desktop, Android Chrome) `.play()` resolves and the question just plays.
  // iOS Safari blocks any audible autoplay not tied to a *fresh* user gesture,
  // and our `.play()` runs in an effect seconds after the Setup tap (across an
  // async session-create + a route change), so on iOS it reliably rejects with
  // NotAllowedError. That's not an error state — it's the expected iOS path, so
  // `blocked` drives an intentional "Tap to hear your question" start
  // affordance (the tap is the gesture; playback runs, then `onEnded` starts
  // recording as usual). Set exclusively inside the async promise callbacks to
  // stay clear of `react-hooks/set-state-in-effect` (mirrors the
  // `.play().catch()` precedent in useFaceAnalyzer).
  const [blocked, setBlocked] = useState(false);
  // Drives the "Playing question…" cue while the hidden audio plays. Set from
  // native media events so both the effect-driven autoplay and the tap-to-play
  // path update it, and it clears on end/teardown.
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    const played = el.play();
    if (played) {
      played
        .then(() => setBlocked(false))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            setBlocked(true);
          }
        });
    }
    // `replayKey` re-triggers playback on Re-record / Restart / new turn;
    // `audioUrl` covers the src swap directly.
  }, [audioUrl, replayKey, audioRef]);

  function handleStartQuestion() {
    // Runs inside a real user gesture, so iOS permits playback. When it ends,
    // `onEnded` fires normally → recording starts (no special wiring).
    audioRef.current?.play().catch(() => undefined);
    setBlocked(false);
  }

  return (
    <div
      className={cn(
        // On mobile the column hugs its content so the camera below isn't
        // pushed far down by an unused `h-full` slot. On desktop it fills
        // the grid row and vertically centers its content.
        'flex flex-col p-6',
        'min-[900px]:h-full min-[900px]:justify-center min-[900px]:overflow-y-auto min-[900px]:border-r min-[900px]:border-border min-[900px]:p-12',
        className,
      )}
    >
      <p className="mb-4 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        {isFollowup ? 'Follow-up question' : 'Question'}
      </p>
      {/* Invisible underlay holds the real question's wrapped height; the
          visible overlay swaps between the real text and a placeholder so
          toggling never resizes the column. */}
      <div className="relative">
        <p
          aria-hidden="true"
          className="invisible font-display text-xl leading-snug md:text-2xl"
        >
          {questionText}
        </p>
        <p
          className={cn(
            'absolute inset-0 font-display text-xl leading-snug md:text-2xl',
            showQuestionText ? 'text-text' : 'italic text-text-subtle',
          )}
        >
          {showQuestionText ? questionText : 'Listen to the question, then answer.'}
        </p>
      </div>
      {/* Hidden — the question plays once behind the scenes; replaying is done
          via Restart turn (which remounts this element through `replayKey`).
          `display:none` doesn't stop <audio> playback. */}
      <audio
        key={replayKey}
        ref={audioRef}
        src={audioUrl}
        playsInline
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          onAudioEnded();
        }}
        className="hidden"
      />
      {playing && (
        <div
          className="mt-6 flex items-center gap-2 text-text-muted"
          aria-live="polite"
        >
          <Volume2 className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />
          <span className="text-sm">Playing question…</span>
        </div>
      )}
      {/* Intended start step where the browser blocks audible autoplay (iOS
          Safari): the tap is the user gesture that lets the question play. Not
          shown where autoplay is permitted — there the question plays on load. */}
      {blocked && (
        <Button
          type="button"
          variant="amber"
          size="lg"
          onClick={handleStartQuestion}
          className="mt-6 gap-2 self-start"
        >
          <Play className="h-5 w-5" aria-hidden="true" />
          Tap to hear your question
        </Button>
      )}
    </div>
  );
}
