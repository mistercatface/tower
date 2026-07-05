# Workspace Agent Rules

These rules are project-scoped behavior constraints for all AI agents editing the `tower` codebase.

## 1. Test Decoupling & Stability

- **KEEP TEST SPECIFIC CODE INSIDE THE TEST FOLDER. DO NOT PUT TEST CODE OUTSIDE THE TEST FOLDER.**

## 2. Test Execution

- **Run Tests using Node/npm directly instead of CMD**: Always run test scripts using `npm run test` or `node scripts/run-tests.mjs` directly rather than invoking them through `cmd.exe /c`.
