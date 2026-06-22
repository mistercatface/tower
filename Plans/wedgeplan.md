## Plan: compound flee agent (kill fake weld / sync)

**Goal:** One kinetic prop = ball + wedge **shape** (collision + draw). One `facing`, one roll nav, no second entity, no chain between head and wedge, no `syncPresentation` pose teleport.

**Explicitly not doing:** weld constraints, `syncFleeAgentWedgeFacing`, ball↔wedge distance link, or “island facing sync” for flee. Editor welds can stay a **later** sandbox feature; flee is not a weld consumer.

---

### Current junk to remove (after compound works)

| Remove                                                                                     | Why                         |
| ------------------------------------------------------------------------------------------ | --------------------------- |
| `syncFleeAgentWedgeFacing.js`                                                              | Entire fake weld            |
| `fleeAgentSpecies.syncPresentation`                                                        | No wedge to sync            |
| `FleeAgentInstance.syncWedgeFacing`                                                        | Same                        |
| Second segment in `spawnFleeAgent` + chain link head↔wedge                                 | One body                    |
| `followerId` / `wedgeId` on instance (or keep as dead alias only one tick)                 | One member                  |
| Tests asserting wedge sync / two-member chain / distance constraint between ball and wedge | Replace with compound tests |

Keep `spawnAgentChain` for snakes; flee stops using it for the wedge.

---

### Part 1 — Geometry + collision (no gameplay change yet)

**Ship**

1. **`fleeAgentFootprint.js`** (colocated with flee spawn) — single source of truth:
    - Input: `bodyRadius` (same as today’s `startRadius` scaling).
    - Output: `{ collisionParts, wedgeLocalVerts, boundingRadius }`.
    - **Circle:** existing ball radius at body origin.
    - **Wedge:** reuse `flee_wedge` triangle proportions; transform into **ball-local** space so tip points along **+x** (forward), base sits at the forward rim (same intent as today’s spawn + sync).
    - Do **not** rely on two centers at chain rest length; author verts once in head space.

2. **`applyFleeAgentCompoundGeometry(prop, bodyRadius)`** at spawn:
    - `prop.collisionParts = [circle, polygon]`
    - `prop.shape = circle` (primary / fracture / radius bookkeeping — match how chunks use `collisionParts[0]`).
    - `syncKineticRigidBody(prop)` after parts change.
    - Invalidate broadphase when geometry applied.

3. **Prove:** small unit test — given `bodyRadius`, parts length === 2, circle radius === `bodyRadius`, wedge verts ahead of center, `getEntityCollisionParts(prop)` returns both; SAT self-test doesn’t need internal part pairs (they’re on same entity).

**Moves needle:** flee is one broadphase entity, `KINETIC_PAIR_TIER.COMPOUND` when needed vs other props.

---

### Part 2 — Draw (ball + triangle, one prop cache entry)

**Ship**

1. **New asset `flee_agent`** (or `flee_ball` — pick one id, wire config):
    - `physics`: `isKinetic`, `rolls`, `canChain`, friction/density like current flee ball.
    - **No** separate `flee_wedge` spawn in flee pipeline.
    - `draw`: custom recipe (not chained primitives) — **sphere at origin + wedge extrusion** using same local verts as collision wedge part; reuse colors from `flee_wedge` / neutral coats.
    - Register in `Assets/props/index.js`, `Config/games/snake.js` → `fleeAgent.bodyPropId: "flee_agent"` (drop `wedgePropId` from flee spawn path).

2. **Prop cache key:** bucket `bodyRadius` (and faction tint if any) in `getCustomSpriteCacheKey` if scale varies.

3. **Optional:** keep `flee_wedge` in sandbox palette as a **standalone shape** for the editor; flee sim doesn’t spawn it.

**Prove:** visually ball + triangle ahead, rotates with `facing` when rolling; no second prop in entity list for flee.

---

### Part 3 — Spawn + agent lifecycle

**Ship**

1. **`spawnFleeAgent`** simplified:
    - `spawnPlacedSandboxProp(state, x, y, flee_agent, faction)`
    - Scale radius, `applyFleeAgentCompoundGeometry`, `applySnakeSegmentGameplay`, `canChain`, spawn group meta, `setChainHead` on **single** prop.
    - Return `{ head, members: [head], spawnGroupId }` (no `pack.body`).

2. **`FleeAgentInstance`**
    - `headId` only; remove wedge sync and `followerId` from hot path.
    - `syncMembersFromGraph` → `[headId]` (or keep graph call; with no link it’s already one id).

3. **`fleeAgentSpecies`**
    - Delete `syncPresentation`.
    - `die` → `clearChainLinksForMembers` on one member; `shatterSnakeSegments` on `[head]` (compound shatters as one prop today; fracture may emit one shard set — acceptable v1).

4. **Call sites:** `setupSnakeGame`, `spawnFleeAgentsInScene`, population ctx — stop passing `followerId` if nothing needs it.

**Prove:** flee agents in snake game explore/flee with **one** entity per agent; no `syncAgentsAfterPhysics` flee hook.

---

### Part 4 — Combat + tests

**Ship**

1. **Combat:** `buildAgentMemberToInstanceMap` already maps all chain members; with one member, predator ram hits **compound** hull on head (circle or wedge part). Update ram test to strike head offset toward wedge (still one prop id).

2. **Replace `fleeAgentSpawn.test.js`:**
    - Spawns one prop, type `flee_agent`.
    - `kineticConstraints` has **no** distance link for flee internal wedge.
    - After physics + roll thrust: wedge **visual/collision** still ahead (assert wedge part world verts or heading vs velocity), **without** calling sync.
    - Flee-from-threat + shatter tests still pass.

3. **Optional:** one test that compound SAT overlaps where old separate wedge would have been hit.

**Prove:** same gameplay as today when sync “worked,” without post-physics teleport.

---

### Part 5 — Docs + plan cleanup

- **`Plans/plan.md`:** strike Part 3 “flee + weld”; replace with this compound plan. Mark flee weld consumer as **cancelled**; weld editor work stays optional future tier, not flee blocker.
- **`Plans/physics.md`:** note flee reference consumer = **compound `collisionParts`**, not weld.

---

### Order of work (minimal thrash)

```text
1. footprint + applyFleeAgentCompoundGeometry + test (spawn still old — temporary)
2. flee_agent asset + draw
3. spawn/lifecycle delete sync + second prop
4. tests + combat tweak
5. delete sync file + plan.md
```

One PR or 2–3 small PRs along those lines.

---

### Review bar (ship clean)

- [ ] No `syncFleeAgentWedgeFacing` import anywhere.
- [ ] No flee-specific `syncPresentation`.
- [ ] Flee spawn: **one** kinetic prop, **zero** constraints between ball and wedge.
- [ ] Wedge collision is ball-local `collisionParts[1]`, not a second `WorldProp`.
- [ ] Roll nav only touches head `facing` — no second body fighting it.
- [ ] `flee_wedge` not required for flee spawn (palette-only ok).

---

### What you get at the end

Same player read (rolling ball + forward triangle), same flee AI, same combat membership — but the sim treats it as **one extended shape**, which matches how you’ve been thinking about it and avoids the entire fake-weld / sync / double-physics circus.
