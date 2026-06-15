# Room graph — authored rooms + corridors

Manual replacement for procgen motif pipeline (`sandboxRoomGraphGen.js` / `DEFAULT_SANDBOX_GRAPH_MOTIFS`). Users place **room nodes** on the grid, connect them with **links**, and bake corridors between them. Procgen stays in the repo until bake is proven, then the motif stack is deleted.

## Architecture

```text
Libraries/RoomGraph/     Authoring store + placement + draw (+ bake in PR 3)
Libraries/Sandbox/       Editor wiring only (pick, wire mode, panels, session)
NavGraph / HPA           Cell walkability after bake — separate layer
```

### Data model (on `state.roomGraph`)

```text
RoomNode  { id, col, row, width, height }     // anchor = top-left cell
RoomLink  { id, a, b, corridorCount, corridorWidth, canIntersect, seed }
```

Links are an **undirected graph** (general graph, not necessarily a tree). Corridor direction / belts can add directed semantics later without changing the store.

### Traversal / pathfinding

| Layer | Role |
|-------|------|
| **RoomGraph** | Meta-graph: `neighborNodeIds`, `linksForNode` → room-to-room abstract routes (`runAbstractAStar` pattern) |
| **NavGraph** | In-room and through-corridor cell movement on baked geometry |

Do **not** extend `NavGraph` to store room nodes. Bake produces grid geometry; nav consumes it.

### Wire UI pattern

Clone **button wire mode** (`buttonWireMode` + `drawButtonWires`): select source node → rubber band → click target → commit link. Link settings live on **Selected** (portal-link pattern).

### Prop palette

Spawn-only asset `room_node` (`sandbox.roomNode: true`) — not a WorldProp. Spawn params: width / height. Preview shows full footprint; blocked cells red.

---

## Win conditions (done when)

1. **Authoring** — Place room nodes with size preview; pick, move, delete; connect nodes via wire GUI; edit link corridor settings; reroll corridor.
2. **Bake** — Node outlines + link corridors appear on grid (holes, rails); unbake on delete; reroll rebakes one link.
3. **Persistence** — Scene snapshot includes `roomGraph`; load restores nodes + links; bake runs on apply (or lazy on open).
4. **Procgen retired** — No editor entry point to motifs; `sandboxRoomGraphGen` motif path removed; corridor math lives under `RoomGraph/`.
5. **Traversal-ready** — Adjacency API on store; room centers computable for future abstract pathfinding.

---

## Three PR plan

### PR 1 — `Libraries/RoomGraph/` store + rename + snapshot

**Goal:** Replace `gridRoomNodes.js` and `state.sandboxGridRoomNodes`. Same user-visible behavior (preview, stamp, outlines).

| Add | Purpose |
|-----|---------|
| `roomGraphStore.js` | CRUD, `getRoomGraph(state)`, adjacency helpers |
| `roomGraphPlacement.js` | Stamp, preview, pick, cell blocked checks |
| `roomGraphDraw.js` | Placed node outlines |
| `index.js` | Barrel |

**Rename:** `gridRoomNode` → `RoomNode` / `room_node` / `isRoomNodeSpawnAsset` / `getSpawnRoomNodeCols`.

**Snapshot:** Schema **v8** — `roomGraph: { nodes, links }` in collect/apply/clear.

**Out of scope:** Wire mode, Selected panel, bake, procgen deletion.

**PR 1 done when:**
- [x] All placement/preview code imports from `Libraries/RoomGraph/`
- [x] `gridRoomNodes.js` deleted
- [x] Snapshot round-trips nodes (links array empty)
- [x] Adjacency helpers exported for future nav

---

### PR 2 — Pick, wire mode, Selected panel (links, no bake)

**Goal:** Build the graph in the editor; links are data + overlay only.

- Click node → select; **Selected** + **Scene** list
- **Connect…** → wire mode → click second node → `RoomLink` in store
- Select link in Scene (settings stub until PR 3)
- Rules: no self-link; no duplicate pair (or explicit replace)

**Out of scope:** Corridor geometry, reroll, bake.

**PR 2 done when:**
- [ ] Wire mode matches button-wire UX
- [ ] Links persist in snapshot
- [ ] Selected shows node fields + Connect; link row in Scene

---

### PR 3 — Link settings + corridor bake

**Goal:** Links become real geometry; extract bake from procgen.

| Add | Purpose |
|-----|---------|
| `roomGraphBake.js` | Node outline, link corridor, unbake, reroll |

Extract from `sandboxRoomGraphGen.js`: hole punch, corridor path, rail stamp (not motifs).

**Selected (link):** corridor count, width, canIntersect, reroll, delete.

**Defaults:** e.g. `corridorCount: 2`, `corridorWidth: 2`, `canIntersect: false`, random `seed`.

**PR 3 done when:**
- [ ] Connect + bake produces walkable corridors
- [ ] Reroll / delete link updates geometry
- [ ] Motif procgen unused; old file trimmed or deleted

---

## File map (target)

```text
Libraries/RoomGraph/
  roomGraphStore.js       PR 1
  roomGraphPlacement.js   PR 1
  roomGraphDraw.js        PR 1
  roomGraphBake.js        PR 3
  index.js

Libraries/Sandbox/
  createSandboxController.js   wire mode PR 2
  sandboxSession.js            selection PR 2
  sandboxToyUi.js              panels PR 2–3
  sandboxSceneSnapshot.js      roomGraph PR 1
```
