# Canvas / imageSmoothing backlog

Policy: `imageSmoothingEnabled` is never true. Set once when a surface is born (or resized), not on every draw or `getContext`.

- [x] **`createOffscreenCanvas` / `resizeOffscreenCanvas`** — `Libraries/Canvas/offscreenCanvas.js`. Returns the canvas only (no `{ canvas, ctx }` allocation). Callers cache `getContext("2d")` locally if they need it.
- [x] **Migrate offscreen sites** — all `new OffscreenCanvas` call sites use `createOffscreenCanvas`; reused buffers use `resizeOffscreenCanvas` (`LabAnimationPreview`).
- [ ] **One-time init on DOM canvases** — sim canvas, lab `preview.js`, `InspectViewer`, `mapOverview`, animation stage: set smoothing false once where the element is acquired, not in draw helpers.
- [ ] **Drop per-frame / per-draw re-sets** — e.g. `WorldSurfaceEngine` ground loop, `CombatParticles`, `sceneRenderer` patch paths: remove redundant `= false` after the owning canvas is initialized.
- [ ] **Optional dev guard** — assert if smoothing is true before textured blits (catch regressions without prod overhead).
