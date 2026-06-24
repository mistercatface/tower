import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
export function grantSnakeSteeringLease(instance) {
    instance.steeringEpoch = (instance.steeringEpoch ?? 0) + 1;
    const head = instance.head;
    head._snakeSteering = { headId: instance.headId, epoch: instance.steeringEpoch };
}
export function revokeSnakeSteeringLease(instance) {
    instance.steeringEpoch = (instance.steeringEpoch ?? 0) + 1;
    const head = instance.head;
    clearSnakeSteeringLeaseFromProp(head);
    head._snakeSteering = { headId: instance.headId, epoch: instance.steeringEpoch - 1 };
}
export function clearSnakeSteeringLeaseFromProp(prop) {
    delete prop._snakeSteering;
    clearGroundRollDrive(prop);
}
export function maySnakeHeadReceiveRoll(world, prop) {
    const snakeGame = world?.sandbox?.snakeGame;
    if (!snakeGame) return true;
    const instance = snakeGame.instancesByHeadId.get(prop.id);
    if (instance && instance.lifecycle === "alive" && snakeGame.registry.aliveByHeadId.has(prop.id)) {
        const lease = prop._snakeSteering;
        return !!lease && instance.steeringEpoch === lease.epoch;
    }
    const isChainHead = getSandboxEntityMeta(world).isChainHead(prop.id);
    if (isChainHead || prop._snakeSteering) {
        clearSnakeSteeringLeaseFromProp(prop);
        return false;
    }
    return true;
}
