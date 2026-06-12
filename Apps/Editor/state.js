import { getGameState } from "../../GameState/GameState.js";
import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createAabb } from "../../Libraries/Math/Aabb2D.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
import { WallCollisionResolver } from "../../Libraries/Motion/WallCollisionResolver.js";
export const LAB_PREVIEW_RANGE = 160;
export const TILELAB_SANDBOX_SPAWN_PROP = "beach_ball";
function createLabMapBoundsPreview() {
    return {
        playArea: createAabb(),
        cavern: createAabb(),
        playViewportX: NaN,
        playViewportY: NaN,
        playCols: NaN,
        playRows: NaN,
        cavernMode: "",
        cavernCol: NaN,
        cavernRow: NaN,
        cavernCols: NaN,
        cavernRows: NaN,
        centerCol: NaN,
        centerRow: NaN,
        outerRadiusCells: NaN,
        donutThicknessCells: NaN,
    };
}
/** @param {object} entity @param {object} hit @param {object | null} state */
function applyWallDamageHit(entity, hit, state) {
    if (!entity.canDamageWalls || !state) return;
    if (hit.approachDot >= 0) return;
    const impactSpeed = -hit.approachDot;
    if (impactSpeed <= 75) return;
    const damage = entity.strategy?.wallDamage ?? 10;
    hit.segment.handleHit(damage, state);
    entity.vx += 0.25 * impactSpeed * hit.normalX;
    entity.vy += 0.25 * impactSpeed * hit.normalY;
}
export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        const rand = Math.floor(1 + Math.random() * 1000000000);
        this.mapSeed = rand;
        this.floorSeed = rand;
        this.labPlayConfig = { playAreaCols: 256, playAreaRows: 256 };
        this.labCavernConfig = {
            boundsMode: "rect",
            boundsCol: -8,
            boundsRow: -8,
            boundsCols: 32,
            boundsRows: 32,
            centerCol: 8,
            centerRow: 8,
            outerRadiusCells: 16,
            donutThicknessCells: 4,
            fillChance: 0.45,
            iterations: 3,
            wallHeightLevel: 10,
        };
        this.labMapBoundsPreview = createLabMapBoundsPreview();
        this.labShowSandboxPanel = true;
        this.labShowProfilePanel = true;
        this.labShowMapPanel = false;
        this.labShowAnimationPreview = false;
        this.labShowMapOverview = true;
        this.labShowMapOverviewViewport = true;
        this.labShowMapOverviewGenBounds = true;
        this.worldRenderMode = "radial";
        this.viewport = new Viewport(0, 0, 1);
        this.labCanvas = null;
        this.labCtx = null;
        this.sandboxPads = [];
        this.sandboxSurfaceProfileZones = [];
        this.sandboxAssemblyGuides = [];
        this.sandboxAssemblyInstances = [];
        this.wallResolver = new WallCollisionResolver({
            onWallDamage: (entity, hit) => {
                if (!entity.canDamageWalls) return;
                applyWallDamageHit(entity, hit, getGameState());
            },
        });
    }
}
