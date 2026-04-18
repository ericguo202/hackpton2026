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

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (instance) return instance;
  if (pending) return pending;

  pending = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    const landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        // GPU gives ~2-3x the FPS on supported devices; falls back to CPU
        // transparently when WebGL is unavailable (older Safari).
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    instance = landmarker;
    return landmarker;
  })();

  return pending;
}

export type { FaceLandmarkerResult };
