# Canvas / imageSmoothing backlog

Policy: `imageSmoothingEnabled` is never true. Set once when a surface is born (or resized), not on every draw or `getContext`.

- [x] **`createOffscreenCanvas` / `resizeOffscreenCanvas`** — `Libraries/Canvas/offscreenCanvas.js`. Returns the canvas only (no `{ canvas, ctx }` allocation). Callers cache `getContext("2d")` locally if they need it.
- [x] **Migrate offscreen sites** — all `new OffscreenCanvas` call sites use `createOffscreenCanvas`; reused buffers use `resizeOffscreenCanvas` (`LabAnimationPreview`).
- [x] **One-time init on DOM canvases** — `labCtx` / `overviewCtx` / `previewCtx` assigned at mount; `applySquareCanvasResize` handles smoothing on pixel resize.
- [x] **Drop per-frame / per-draw re-sets** — removed from `WorldSurfaceEngine`, `CombatParticles`, `sceneRenderer.begin`.
