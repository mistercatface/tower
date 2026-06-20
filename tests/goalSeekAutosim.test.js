import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGoalSeekAutosim } from "../Libraries/Sandbox/autosim/goalSeekAutosim.js";
import { FRAME_MS } from "./frameMs.js";

describe("goalSeekAutosim", () => {
    it("issues setMoveTarget once per goal until the nav target is lost", () => {
        let setMoveTargetCalls = 0;
        const seeker = { id: 1, x: 0, y: 0, isDead: false };
        const goal = { id: 2, x: 100, y: 0, isDead: false };
        const behavior = {
            setMoveTarget(prop, world) {
                setMoveTargetCalls++;
                behavior._hasTarget = true;
            },
            hasMoveTarget() {
                return behavior._hasTarget === true;
            },
        };
        const autosim = createGoalSeekAutosim(
            {
                entityRegistry: {
                    getLive(id) {
                        if (id === 1) return seeker;
                        if (id === 2) return goal;
                        return null;
                    },
                },
                sandbox: { entityMeta: { setActiveBehaviorId() {} } },
            },
            {
                getSeekerPropId: () => 1,
                getGoalPropId: () => 2,
                navBehaviorId: "rollToCursorHpa",
                behaviorById: new Map([["rollToCursorHpa", behavior]]),
                eatRadius: 4,
                onConsume() {},
            },
        );
        autosim.start();
        assert.equal(setMoveTargetCalls, 1);
        autosim.tick(FRAME_MS);
        autosim.tick(FRAME_MS);
        assert.equal(setMoveTargetCalls, 1);
        behavior._hasTarget = false;
        autosim.tick(FRAME_MS);
        assert.equal(setMoveTargetCalls, 2);
    });
});
