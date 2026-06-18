import { regularStarFootprint } from "../../../Libraries/Math/Poly2D.js";
import { createGoalStarDraw } from "../../../Libraries/Render/goalStarDraw.js";

const GOAL_STAR_OUTER_RADIUS = 2;
const GOAL_STAR_INNER_RADIUS = 0.85;
const goalStarVisuals = {
    colors: { side: "#FDD835", sideShadow: "#F9A825", top: "#FFEB3B", topHighlight: "#FFF59D", bottom: "#F57F17", stroke: "#EF6C00" },
    world: { height: 3 },
    lineWidth: 0.45,
};

export default {
    id: "goal_orb",
    draw: createGoalStarDraw(goalStarVisuals),
    visuals: goalStarVisuals,
    sandbox: { spawnLabel: "Goal star", tags: ["goal"], groundNav: false },
    physics: {
        radius: GOAL_STAR_OUTER_RADIUS,
        isKinetic: false,
        spatialRole: "trigger",
        localFootprint: regularStarFootprint(5, GOAL_STAR_OUTER_RADIUS, GOAL_STAR_INNER_RADIUS),
    },
};
