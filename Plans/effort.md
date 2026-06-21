# Effort-aware snake decisions

Add a **cost** half to the decision scoring so snakes weigh _what they'd gain_ against
_what it'd take to get there_. Today scoring is value-only (weights + hunger pressure,
argmax wins). Effort makes a full snake grab point-blank prey but ignore (and quickly
abandon) anything far, while a starving snake commits to cross-map chases.

## Core formula

Each travel-to target (prey, food) is scored as **net value**:

```
net = value(hunger)  −  costPerCell(hunger) × reach
```

- `value(hunger)` — how much the snake wants it, scaled by hunger.
- `costPerCell(hunger)` — how much each cell of distance hurts; this is the snake's effort
  _tolerance_, and it scales with hunger in the opposite direction from value.
- `reach` — distance to the target, measured in cells (see below).

Because value and cost both swing with hunger in opposite directions, the whole behavior
range falls out of one term:

| State     | value           | costPerCell | result                                                              |
| --------- | --------------- | ----------- | ------------------------------------------------------------------- |
| Satisfied | small (but > 0) | high        | only engages targets right next to it; bails as soon as reach grows |
| Hungry    | medium          | medium      | engages at moderate range, moderate persistence                     |
| Desperate | high            | low         | engages far, chases long, barely cares about distance               |

`explore` stays a flat floor. When a target's `net` falls below it, the snake goes back to
wandering — that _is_ the "give up," with no special-case abandon logic.

## reach: euclidean for acquisition, pathLen for persistence

- **Acquisition — a candidate that is currently in sight and not yet committed:**
  `reach` = straight-line distance in cells. Line-of-sight already guarantees the line is
  wall-free, and it's bounded by vision range, so euclidean ≈ real cost and is cheap. No
  pathfinding to candidates the snake didn't pick.
- **Persistence — the target the snake is already committed to (often now out of sight):**
  `reach` = `routeStatus.pathLen` (real path steps). When prey rounds a corner, pathLen
  climbs, eroding `net`; a full snake peels off fast, a starving one hangs on. The route
  already exists for the committed target, so pathLen is free.

Selection rule: if the candidate **is** the committed target → use pathLen; otherwise → use
its euclidean distance.

## Prerequisite: surface target distances

- Add `preyDist` and `foodDist` (euclidean, in cells) to the blackboard, mirroring how
  `threatDist` already flows from perception into facts. This is the only new data plumbing.
- `pathLen` already lives in `routeStatus`.
- Keep everything in **cells** so a single `costPerCell` applies to both euclidean and
  pathLen reach.

## Scoring changes

- **`scorePrey`** — replace the hard `−∞ when satisfied` (PR3) with a small positive
  `value(hunger)`, then subtract `costPerCell(hunger) × reach`. Satisfied snakes now grab
  adjacent prey opportunistically but ignore anything more than a step or two away.
- **`scoreFood`** — keep its hunger-scaled value (`weights.food + foodHungerBonus × deficit`),
  subtract the same effort term.
- **`scoreFlee`** — unchanged. Fleeing is about danger, not effort (severity already encodes
  threat distance).
- **`scoreExplore`** — unchanged flat floor.

Flee still dominates when it should: lethal flee returns `Infinity`; soft flee can be
outscored by cheap food/prey, which is the intended "risk it while hungry" behavior (PR7).

## Behavior that emerges

- Full + prey adjacent → small value, tiny reach → `net` > explore → grabs it.
- Full + prey far → small value, big reach → `net` < explore → ignores it.
- Chasing prey that flees (committed) → pathLen grows → `net` erodes → full snake abandons
  quickly, hungry snake sustains, desperate snake sustains far longer.
- Desperate → low cost + high value → engages at long range and chases through detours.

## Observability

Put `reach`, computed `cost`, and final `net` for each candidate into `candidateScores` /
the decision snapshot, and add a compact form to the FSM debug line. Goal: read
_"prey: value 45, reach 7, cost 63, net −18 → below explore, ignored"_ instead of guessing
why a snake did or didn't react. This is the whole point of measuring reach honestly.

## New config

One block, on the same numeric scale as the existing `decisionWeights` so values stay legible:

- `effort.costPerCell`: `{ satisfied, hungry, desperate }` — high → low.
- prey `value` per hunger state: `{ satisfied (small), hungry, desperate }` — replaces the
  hard ignore from PR3.

## Tests

- PR3 "satisfied ignores prey" → becomes "satisfied ignores **far** prey, grabs **adjacent**
  prey."
- New: "a full snake abandons a lengthening chase; a desperate one sustains it" — drive
  pathLen up and watch `net` cross below explore at different hunger levels.
- New: effort fields (`reach`/`cost`/`net`) present in the decision snapshot.

## Tuning order

1. Land it roughly behavior-neutral: pick `costPerCell` so current engagement ranges about
   hold.
2. Raise satisfied `costPerCell` until full snakes only grab point-blank prey.
3. Lower desperate `costPerCell` until they commit to cross-map chases.
4. Use the snapshot `reach`/`cost`/`net` numbers to tune — never guess.
