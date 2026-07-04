# Workspace Agent Rules

These rules are project-scoped behavior constraints for all AI agents editing the `tower` codebase.

## 1. Test Decoupling & Stability

- **KEEP TEST SPECIFIC CODE INSIDE THE TEST FOLDER. DO NOT PUT TEST CODE OUTSIDE THE TEST FOLDER.**
- **Consolidate Mocks**: Do not define custom inline mock objects (such as mock navigators or custom environment bounds) inside test files. Reuse or extend standard harness factories in `tests/harness/snakeGameHarness.js`.
- **Use Seeded RNGs**: Never use unseeded random number generators (like `Math.random()`) in code paths evaluated during tests. Always pass or accept a seeded pseudo-RNG function.
- **Deterministic Simulation Ticks**: Ensure simulation test suites (like glass fracture or combat boids) run on discrete, manual ticks (`engine.step(16)`) and avoid any real-world async time delays.
