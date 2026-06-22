## VARIOUS

4. Leverage Shared Atomics in SabSlotWorkerHost
   The Advanced Feature: The worker infrastructure relies on SharedArrayBuffer pools to share nav topology, predecessor grids, and path pools without message-passing copies.
   The Underutilized Area: The slot state-management handshake in

SabSlotWorkerHost.js
still sends job completion notifications via standard main-thread worker postMessage loops.
The Easy Win: Use Atomics.wait and Atomics.notify (or lock-free polling of the shared buffers) on slotReadyId and slotRequestId inside SabSlotWorkerHost. This completely eliminates main-thread event loop message-handling overhead for pathfinding updates, lowering latency for multi-agent updates.

1. Incremental Eviction in FlowCacheManager using LruMap
   The Advanced Feature: A fully featured

LruMap
class is used for sprite caching and AI memory.
The Underutilized Area:

FlowCacheManager
handles cache eviction by calling this.invalidate(protocol) which completely wipes the lookup array and resets the slot counter to 0 whenever it exceeds maxCacheSize.
The Easy Win: Rewire FlowCacheManager to use the LruMap pattern to evict only the oldest unused flow field slot. Complete cache invalidation causes sudden CPU spikes and frame drops because all active agents using different flow fields are forced to re-request worker path recalculations at the same time.

##

The worker stack is done enough — this is the perf pass. Your profile points at a clear pattern: almost all time is pixels × noise calls × motif passes, not canvas or messaging. A typical ground chunk runs paintPixelArea → fills sample arrays → composeSurfaceImage (domain warp pre-pass, then each enabled motif scans every pixel) → copyRgbTripletsToRgba → putImageData. Motifs like baseMetal call noise2D two or three times per pixel per pass; domain warp adds two more before motifs even start; profiles stack several motifs. Perlin2D itself is a straightforward octave loop over rawNoise2D/grad — correct, but invoked far too often for the same logical coordinates. ensureNoiseInitialized(seed) also reshuffles the full 512-entry perm table whenever the seed changes between jobs; that's fine occasionally, but expensive if consecutive bakes use different chunk seeds back-to-back.

Paragraph 1 — Perlin: same picture, fewer redundant samples. The highest-confidence, look-identical wins live in deduplicating noise, not swapping algorithms. Many motifs read the same evalX/evalY or warped lookupX/lookupY with different frequency scalings — but some calls are literally the same (x, y, octaves) in one pixel's stack (e.g. grain applied equally to RGB, or warp + motif sharing coordinates). A per-pixel noise memo keyed by quantized (x, y, octaves) (or a small scratch cache for the 2–4 unique samples that pixel needs) eliminates duplicate rawNoise2D work without changing output. At bake scope, cache perm tables by seed (Map of seed → perm Uint8Array) instead of rebuilding via Fisher–Yates on every ensureNoiseInitialized when the seed repeats — common for wall atlases and patches. Micro-opts in Perlin2D also help bit-identically: hoist the fade polynomial, avoid repeated perm[X + perm[Y]] indexing patterns the engine already computes, optionally precompute the 256 grad cases. None of that changes the math; it reduces the constant factor on the function your profile already flags.

Paragraph 2 — composeSurfaceImage: loop structure and warp/motif fusion. Today the structure is motif-outer, pixel-inner: each motif rereads all sample arrays and rewrites the full rgbBuffer. Same result, but poor locality and repeated applyTranslateToSample work. Flipping to pixel-outer, motif-inner (one translate/warp sample setup per pixel, then run all motif passes on that pixel's RGB) is usually a free win — identical blending order if you preserve motif stack sequence. Separately, the upfront domain-warp loop always runs even when warp amplitude is zero; fusing "fill base color + set lookup = eval" avoids a whole pass over the grid. At motif-build time you already filter by surfaceMask — push further by classifying motifs into "uses eval coords" vs "uses warped lookup" vs "HSV post-filter" so a pixel only pays for the coordinate spaces it needs. Filters like HSV (rgbToHsv/hsvToRgb in your trace) aren't noise-heavy but multiply per-pixel work; running them only on motifs that need them, or batching HSV as a final pass over the buffer instead of inside every blended layer, keeps the image the same if pass order matches today's stack.

Paragraph 3 — Bake session: amortize work across pixels and animation frames without lowering resolution. Do not touch surfaceBakeScale or bake dimensions if the goal is zero visual drift — that's the knob that changes look. Instead, amortize at the job level on TileSurfaceWorker: move TileMemoryPool (and a seed→perm cache, optional noise memo cleared per bake) into a BakeSession passed into paintPixelArea/composeSurfaceImage. That cuts allocations and repeated perm init across the worker pool's steady-state bakes. The bigger structural win for animated horizontal patches is bakeHorizontalPatchCanvases calling full bakeRequestToCanvas in a frame loop: each frame reruns domain warp + all motifs even when only resolveBakeProfile changes a subset (timeline-driven tints/offsets). Profile-dependent motifs can be split from static ones — bake the static RGB contribution once per patch geometry/seed, then apply frame-varying motifs as a second pass — only where you can prove separation is identical to the current stack order. Finally, keep copyRgbTripletsToRgba + putImageData as-is until noise is fixed; they're small in your trace. Measure with a single performance.now() wrap in TileSurfaceWorker.onMessage broken down by phase (sample fill / compose / blit) so each change proves itself on one profile and one chunk size.

Bottom line: skip more OOP; go after (1) fewer noise evaluations per pixel, (2) better compose loop locality and warp fusion, (3) bake-session caching and optional static/animated split for flipbooks — all bit-identical if you're careful about motif order and coordinates.
