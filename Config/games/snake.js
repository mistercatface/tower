/** Snake autosim gameplay defaults — spacing/eat radius derived from prop radii at runtime. */
export const SNAKE_GAME_DEFAULTS = {
    segmentPropId: "blue_ball",
    goalPropId: "goal_orb",
    segmentCount: 3,
    /** Center-to-center rest length = segment diameter × linkSlack. */
    linkSlack: 1.05,
    eatMargin: 2,
    growDirX: -1,
    growDirY: 0,
    cavern: { mapSeedOffset: 11, wallHeightLevel: 1 },
};
