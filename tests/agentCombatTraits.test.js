import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE, getAgentProfile } from "../Libraries/AI/agents/agentProfile.js";
import {
    COMBAT_TRAIT_DEFAULTS,
    isChainCombatTopology,
    matchesBrainRamResolver,
    shouldSkipPreyHeadRamKill,
} from "../Libraries/Game/snake/agentCombatTraits.js";

function combatTraits(profileId) {
    return { ...COMBAT_TRAIT_DEFAULTS, ...getAgentProfile(profileId).combat };
}

describe("agentCombatTraits", () => {
    it("snake chain can split and accepts flee escape ram", () => {
        applySnakeGameConfig();
        const traits = combatTraits(AGENT_PROFILE.snake);
        assert.equal(isChainCombatTopology(traits), true);
        assert.equal(traits.canSplit, true);
        assert.equal(traits.victimOfFleeEscapeRam, true);
        assert.equal(traits.victimOfHeadStrikeRam, true);
    });

    it("flee ball uses flee head ram and escape ram", () => {
        applySnakeGameConfig();
        const traits = combatTraits(AGENT_PROFILE.flee);
        assert.equal(isChainCombatTopology(traits), false);
        assert.equal(traits.fleeBallHeadRam, true);
        assert.equal(traits.fleeEscapeRam, true);
    });

    it("squid uses squidVsSquid brain ram and arm prey immunity", () => {
        applySnakeGameConfig();
        const traits = combatTraits(AGENT_PROFILE.squid);
        assert.equal(matchesBrainRamResolver(traits, "squidVsSquid"), true);
        assert.equal(traits.victimOfFleeEscapeRam, false);
        assert.equal(traits.preyHeadRamImmuneNonLeader, true);
    });

    it("shouldSkipPreyHeadRamKill covers leader draw and squid arm glance", () => {
        applySnakeGameConfig();
        const snake = combatTraits(AGENT_PROFILE.snake);
        const squid = combatTraits(AGENT_PROFILE.squid);
        assert.equal(shouldSkipPreyHeadRamKill(snake, snake, 10, 10), true);
        assert.equal(shouldSkipPreyHeadRamKill(snake, squid, 99, 10), true);
        assert.equal(shouldSkipPreyHeadRamKill(snake, squid, 10, 10), false);
        assert.equal(shouldSkipPreyHeadRamKill(squid, squid, 10, 10), true);
    });
});
