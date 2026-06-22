import { createAgentIntent } from "../../../AI/agentIntent/createAgentIntent.js";
import { addChainLink, hasChainLinkBetween } from "../../../Sandbox/chainLinks.js";
import { decelerateRoll, getKineticRollConfig, steerRollToward, clearGroundRollDrive } from "../../../Sandbox/kineticRollActuator.js";
import { fleeHornMountOffsetFromBallCenter } from "../../../Props/fleeHornWedge.js";
import { getCirclePropRadius } from "../../../Props/propScale.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { perceiveHornSatelliteWorld } from "./resolveHornMountBall.js";
function resolveMountForwardDir(mount, minSpeed) {
    const drive = mount._groundRollDrive;
    if (drive?.kind === "thrust") {
        const thrustLen = Math.hypot(drive.dirX, drive.dirY);
        if (thrustLen > 1e-6) return { x: drive.dirX / thrustLen, y: drive.dirY / thrustLen };
    }
    const vx = mount.vx ?? 0;
    const vy = mount.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed > minSpeed) return { x: vx / speed, y: vy / speed };
    const facing = mount.facing ?? 0;
    return { x: Math.cos(facing), y: Math.sin(facing) };
}
export function resolveHornRimSlotWorld(mount, wedgeScale, minSpeed) {
    const bodyRadius = getCirclePropRadius(mount);
    const forward = resolveMountForwardDir(mount, minSpeed);
    const offset = fleeHornMountOffsetFromBallCenter(bodyRadius, wedgeScale);
    return { x: mount.x + forward.x * offset, y: mount.y + forward.y * offset };
}
function buildRimHoldContext(agent, state, instance, registry, hornConfig) {
    const world = perceiveHornSatelliteWorld(agent, instance, state, registry, hornConfig);
    return { agent, state, world, instance, wedgeScale: hornConfig.wedgeScale ?? 1, rimHoldMinSpeed: hornConfig.rimHoldMinSpeed ?? 8, rimHoldStopRadius: hornConfig.rimHoldStopRadius ?? null };
}
function steerHornTowardRimSlot(ctx) {
    const mount = ctx.world.mountBall;
    if (!mount) return;
    const rim = resolveHornRimSlotWorld(mount, ctx.wedgeScale, ctx.rimHoldMinSpeed);
    const dx = rim.x - ctx.agent.x;
    const dy = rim.y - ctx.agent.y;
    const dist = Math.hypot(dx, dy);
    const arriveRadius = ctx.rimHoldStopRadius ?? Math.max(ctx.agent.radius * 0.4, 1.5);
    const rollConfig = getKineticRollConfig(ctx.agent);
    if (dist <= arriveRadius) {
        decelerateRoll(ctx.agent, rollConfig, ctx.state);
        return;
    }
    const forward = resolveMountForwardDir(mount, ctx.rimHoldMinSpeed);
    const offset = fleeHornMountOffsetFromBallCenter(getCirclePropRadius(mount), ctx.wedgeScale);
    const leadAlongForward = (ctx.agent.x - mount.x) * forward.x + (ctx.agent.y - mount.y) * forward.y;
    let steerX = dx / dist;
    let steerY = dy / dist;
    if (leadAlongForward < offset * 0.85) {
        steerX = forward.x * 0.65 + steerX * 0.35;
        steerY = forward.y * 0.65 + steerY * 0.35;
        const steerLen = Math.hypot(steerX, steerY);
        if (steerLen > 1e-6) {
            steerX /= steerLen;
            steerY /= steerLen;
        }
    }
    steerRollToward(ctx.agent, steerX, steerY, rollConfig, ctx.state);
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
            steerHornTowardRimSlot(ctx);
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
                if (!hasChainLinkBetween(state, ball.id, horn.id)) addChainLink(state, ball.id, horn.id, hornConfig.linkSlack);
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
            wedgeScale: hornConfig.wedgeScale ?? 1,
            rimHoldMinSpeed: hornConfig.rimHoldMinSpeed ?? 8,
            rimHoldStopRadius: hornConfig.rimHoldStopRadius ?? null,
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
        applyRimHold(agent, state) {
            if (intent.getMode() !== "bound") return;
            const ctx = buildRimHoldContext(agent, state, instance, registry, hornConfig);
            if (!ctx.world.mountBall) return;
            steerHornTowardRimSlot(ctx);
        },
        clearIntent(agent, state) {
            intent.clear(agent, state);
        },
    };
}
