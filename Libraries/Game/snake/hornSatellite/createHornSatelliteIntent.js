import { createAgentIntent } from "../../../AI/agentIntent/createAgentIntent.js";
import { addChainLink, hasChainLinkBetween } from "../../../Sandbox/chainLinks.js";
import { decelerateRoll, getKineticRollConfig, steerRollToward, clearGroundRollDrive } from "../../../Sandbox/kineticRollActuator.js";
import { fleeHornChainRestLength } from "../../../Props/fleeHornWedge.js";
import { getCirclePropRadius } from "../../../Props/propScale.js";
import { resolvePropQuantizeSteps } from "../../../Props/propStrategy.js";
import { quantizeAngle } from "../../../Math/Angle.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { perceiveHornSatelliteWorld } from "./resolveHornMountBall.js";

function syncHornFacingFromMount(horn, mount) {
    const drive = mount._groundRollDrive;
    let dirX = 0;
    let dirY = 0;
    if (drive?.kind === "thrust") {
        dirX = drive.dirX;
        dirY = drive.dirY;
    } else {
        const vx = mount.vx ?? 0;
        const vy = mount.vy ?? 0;
        const speed = Math.hypot(vx, vy);
        if (speed > 8) {
            dirX = vx / speed;
            dirY = vy / speed;
        } else {
            const facing = mount.facing ?? 0;
            dirX = Math.cos(facing);
            dirY = Math.sin(facing);
        }
    }
    const len = Math.hypot(dirX, dirY);
    if (len < 1e-6) return;
    const facing = quantizeAngle(Math.atan2(dirY, dirX), resolvePropQuantizeSteps(horn).facing);
    if (Math.abs((horn.facing ?? 0) - facing) < 1e-4) return;
    horn.facing = facing;
    horn.stateTimer = (horn.stateTimer ?? 0) + 1;
}

function createSeekingMountState() {
    return {
        update(ctx) {
            const target = ctx.world.mountBall;
            if (!target) {
                decelerateRoll(ctx.agent, getKineticRollConfig(ctx.agent), ctx.state);
                return;
            }
            const dx = target.x - ctx.agent.x;
            const dy = target.y - ctx.agent.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= ctx.bindDistance) {
                ctx.effects.tryBindMount(target);
                return;
            }
            if (dist <= 0) return;
            steerRollToward(ctx.agent, dx / dist, dy / dist, getKineticRollConfig(ctx.agent), ctx.state);
        },
    };
}

function createBoundMountState() {
    return {
        enter(ctx) {
            const mount = ctx.world.mountBall;
            if (mount) ctx.effects.tryBindMount(mount);
        },
        update(ctx) {
            const mount = ctx.world.mountBall;
            if (!mount || mount.id !== ctx.instance.mountBallId) {
                ctx.effects.releaseMount("mount_lost");
                ctx.effects.transitionTo("seeking", "mount_lost");
                return;
            }
            syncHornFacingFromMount(ctx.agent, mount);
            decelerateRoll(ctx.agent, getKineticRollConfig(ctx.agent), ctx.state);
        },
    };
}

export function createHornSatelliteIntent({ selfHeadId, spawnGroupId, registry, instance }) {
    const config = getSnakeGameConfig();
    const hornConfig = config.hornSatellite;
    const intent = createAgentIntent({
        initialMode: "seeking",
        perceiveWorld: (agent, state) => perceiveHornSatelliteWorld(agent, instance, state, registry, hornConfig),
        pickPolicy: (world) => {
            if (world.mountBall) return { mode: "bound", targetId: world.mountBall.id, reason: instance.mountBallId ? "mounted" : "acquired" };
            return { mode: "seeking", targetId: null, reason: "scan" };
        },
        transitionReason: (prevMode, nextMode) => (nextMode === "bound" ? "acquired" : prevMode === "bound" ? "mount_lost" : "scan"),
        states: { seeking: createSeekingMountState(), bound: createBoundMountState() },
        createEffects: ({ state }) => ({
            tryBindMount(ball) {
                const horn = state.entityRegistry.getLive(selfHeadId);
                if (!horn || !ball) return;
                if (!hasChainLinkBetween(state, ball.id, horn.id)) {
                    const bodyRadius = getCirclePropRadius(ball);
                    const wedgeScale = horn._fleeHornWedgeScale ?? hornConfig.wedgeScale ?? 1;
                    addChainLink(state, ball.id, horn.id, hornConfig.linkSlack, fleeHornChainRestLength(bodyRadius, wedgeScale, hornConfig.linkSlack));
                }
                instance.mountBallId = ball.id;
            },
            releaseMount() {
                instance.mountBallId = null;
                const horn = state.entityRegistry.getLive(selfHeadId);
                if (horn) clearGroundRollDrive(horn);
            },
        }),
        createContext: (ctx) => ({
            ...ctx,
            instance,
            bindDistance: hornConfig.bindDistance,
        }),
        onClear(agent, state) {
            instance.mountBallId = null;
            if (agent) clearGroundRollDrive(agent);
        },
        onResetMode(agent, state) {
            instance.mountBallId = null;
            if (agent) clearGroundRollDrive(agent);
        },
    });
    return {
        ...intent,
        headId: selfHeadId,
        tick(agent, state) {
            intent.perceive(agent, state);
            return intent.transition(agent, state);
        },
        clearIntent(agent, state) {
            intent.clear(agent, state);
        },
    };
}
