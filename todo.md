# Canvas / imageSmoothing backlog

Policy: `imageSmoothingEnabled` is never true. Set once when a surface is born (or resized), not on every draw or `getContext`.

- [x] **`createOffscreenCanvas` / `resizeOffscreenCanvas`** — `Libraries/Canvas/offscreenCanvas.js`. Returns the canvas only (no `{ canvas, ctx }` allocation). Callers cache `getContext("2d")` locally if they need it.
- [x] **Migrate offscreen sites** — all `new OffscreenCanvas` call sites use `createOffscreenCanvas`; reused buffers use `resizeOffscreenCanvas` (`LabAnimationPreview`).
- [x] **One-time init on DOM canvases** — smoothing false at mount/resize via `applySquareCanvasResize`; cached ctx on `state.labCtx` / overview / animation preview; `InspectViewer.mount`.
- [x] **Drop per-frame / per-draw re-sets** — removed from `WorldSurfaceEngine`, `CombatParticles`, `sceneRenderer.begin`, map overview paint.
- [ ] **Optional dev guard** — assert if smoothing is true before textured blits (catch regressions without prod overhead).
