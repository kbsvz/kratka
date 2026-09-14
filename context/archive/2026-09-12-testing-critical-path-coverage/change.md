---
change_id: testing-critical-path-coverage
title: Bootstrap test runner and cover save/reload + estimator correctness
status: archived
created: 2026-09-12
updated: 2026-09-14
archived_at: 2026-09-14T15:43:49Z
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md`: "Bootstrap runner + critical-path coverage".

Risks covered: #1 (save/reload round-trip data corruption), #3 (thread-count/time estimator math mismatch).
Test types planned: unit + integration.

Risk response intent:
- #1: prove that saving a non-trivial grid+palette and reopening it reproduces the exact cell data, dimensions, and palette; challenge "it rendered something" vs "it rendered the same thing"; avoid asserting against the implementation's own serialization instead of an independently-known input grid.
- #3: prove that computed thread length and time exactly match hand-calculated values from the fixed rate constants for a known grid input; challenge comparing output to itself after a refactor instead of an independent hand-computed value; avoid the oracle problem (asserting against current output).

No test runner exists in this project yet (`package.json` has no vitest/jest/etc.) — this phase also bootstraps it.
