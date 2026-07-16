/**
 * Lazy singleton for MediaPipe's FaceLandmarker (Tasks API).
 *
 * We load exactly one FaceLandmarker instance per page. `detectForVideo` is
 * fast (≈10ms on a modern laptop GPU) and returns the same 468 mesh points
 * plus the 10 iris points that `backend/opencv.py` uses — so the TS port in
 * `faceHeuristics.ts` can index the exact same constants (LEFT_IRIS = 468…).
 *
 * WASM assets are pulled from the jsDelivr CDN (the documented path for
 * `@mediapipe/tasks-vision`), and the model itself is served locally out of
 * `frontend/public/models/` so the browser can cache it without a cross-
 * origin hop. Keep the model path in sync with what Vite serves at
 * `/models/face_landmarker.task`.
 */

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

const WASM_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';
const MODEL_URL = '/models/face_landmarker.task';

let instance: FaceLandmarker | null = null;
let pending: Promise<FaceLandmarker> | null = null;
let overlayInstance: FaceLandmarker | null = null;
let overlayPending: Promise<FaceLandmarker> | null = null;
let replayInstance: FaceLandmarker | null = null;
let replayPending: Promise<FaceLandmarker> | null = null;

async function createLandmarker(runningMode: 'VIDEO' | 'IMAGE'): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU',
    },
    runningMode,
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (instance) return instance;
  if (pending) return pending;

  pending = (async () => {
    const landmarker = await createLandmarker('VIDEO');
    instance = landmarker;
    return landmarker;
  })();

  return pending;
}

/**
 * A SECOND live VIDEO-mode landmarker, dedicated to the `CameraPreview` mesh
 * overlay. `detectForVideo` requires strictly monotonically increasing
 * timestamps *per instance*, and the overlay's rAF loop runs independently of
 * the `useFaceAnalyzer` scoring loop — feeding both from the shared `instance`
 * interleaves their timestamps and eventually one arrives out of order, which
 * aborts the MediaPipe graph ("Packet timestamp mismatch on ... norm_rect").
 * Giving the overlay its own instance keeps the two clocks independent. Only
 * paid for while the mesh is toggled on.
 */
export async function getOverlayFaceLandmarker(): Promise<FaceLandmarker> {
  if (overlayInstance) return overlayInstance;
  if (overlayPending) return overlayPending;

  overlayPending = (async () => {
    const landmarker = await createLandmarker('VIDEO');
    overlayInstance = landmarker;
    return landmarker;
  })();

  return overlayPending;
}

export async function getReplayFaceLandmarker(): Promise<FaceLandmarker> {
  if (replayInstance) return replayInstance;
  if (replayPending) return replayPending;

  replayPending = (async () => {
    const landmarker = await createLandmarker('IMAGE');
    replayInstance = landmarker;
    return landmarker;
  })();

  return replayPending;
}

export type { FaceLandmarkerResult };
