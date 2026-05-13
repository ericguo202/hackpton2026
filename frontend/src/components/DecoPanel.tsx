/**
 * Right-edge decorative dithered-sculpture panel used on the Hero and
 * signed-in Home setup screen. The accent-colored block sits flush to
 * the right with a left-to-right mask that fades it into the cream
 * surface, so it never competes with the primary CTA.
 */

import { ImageDithering } from '@paper-design/shaders-react';

type Props = {
  /** Public path to the sculpture PNG (e.g. "/hero-sculpture.png"). */
  image: string;
  /** Aspect ratio of the masked area as a CSS `aspect-ratio` value (`"478/357"`). */
  aspect: string;
};

export function DecoPanel({ image, aspect }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none hidden xl:block absolute inset-y-0 right-0 bg-accent overflow-hidden"
      style={{
        aspectRatio: aspect,
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0%, black 85%)',
        maskImage:
          'linear-gradient(to right, transparent 0%, black 85%)',
      }}
    >
      <ImageDithering
        originalColors={false}
        inverted={false}
        type="8x8"
        size={2.5}
        colorSteps={2}
        image={image}
        scale={1}
        fit="cover"
        colorBack="#00000000"
        colorFront="#F1E9D2"
        colorHighlight="#EAFF94"
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
