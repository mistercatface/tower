# FSM AI IMPLEMENTATION PLANNING

MUST READ BEFORE CONTINUING: `[hygiene.md](hygiene.md)` · `[objects.md](objects.md)` · `[frame.md](frame.md)` · `[passthrough.md](fsm/history.md)`

---

### Flow locomotion ← **NEXT**

**Problem:** Flee escape/regroup uses cell-pick heuristics; crowds want smooth local flow.

**Do:** Replace flee **steering only** (not decision reach) with backward flow sampling at agent cell. Decision scoring stays on `navReachHorizon`.

**Rules:**

- Flow windows are locomotion-only — never on utility scoring hot path.
- Flow reads/writes follow step 7 frame pattern — no new per-tick opts bags.
- Snake + flee in same PR when touching shared adapter code.

**8 done when:** Flee escape/regroup uses flow downhill; reach for scoring unchanged; step 7 gates still green.

---

## PR rules (every step)

- Net negative LOC unless you explain why.
- Tests migrate with the dialect — same PR, no shims.
- No new getters, resolvers, `Libraries/AI/decision/` package, or passthrough wrappers.
- Read `[hygiene.md](hygiene.md)` before opening the PR.

---

## Later (not gated on 7/8)

- Strategy / game theory / GOAP — see `[AI.md](../../AI.md)` tier 8 (not started).
- Generic perception→memory→slot pipeline — deferred; step 7 collapses bags without building a framework.
- Decision context pooling across agents — not the model; one frame **per instance**, not module scratch.

