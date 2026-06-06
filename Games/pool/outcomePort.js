import { ensurePoolState } from "./balls.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").OutcomePort} OutcomePort */
/** @type {OutcomePort} */
export const poolOutcomePort = {
    getRunOutcome(state) {
        return ensurePoolState(state).won ? "won" : null;
    },
};
