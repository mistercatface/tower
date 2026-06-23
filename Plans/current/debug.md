# Snake vision — decouple from viewport

Binding: [`frame.md`](frame.md) · [`hygiene.md`](hygiene.md) · [`fsmroadmap.md`](fsmroadmap.md)

---

## Shipped

- **Step 1 ✅** — Viewport out of combat vision cache (`observerVisionFrame.js`).
- **Step 2 ✅** — Focused-agent debug overlay **removed** (vision/path/target/memory HUD layers, overlay toggle, config flags). Was the flicker source during render.
- **Step 3 ✅** — Sim tick hygiene; food uses per-target grid LOS like actors (`snakeFood.js`, `agentWorldPerception.js`).

---

## Remaining (manual)

- [ ] 64 snakes + squids — no flicker after pan/zoom/Tab
- [ ] Off-screen agents still hunt/flee/eat correctly (brain sync throttle does not gate combat)

---

## Done when

Snake FSM results are stable regardless of camera; no debug overlay re-enters sim perception.
