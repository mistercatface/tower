import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
export function grantSnakeSteeringLease(instance, state) {
    instance.steeringEpoch = (instance.steeringEpoch ?? 0) + 1;
    const head = state.entityRegistry.get(instance.headId);
    if (!head) return;
    head._snakeSteering = { headId: instance.headId, epoch: instance.steeringEpoch };
}
export function revokeSnakeSteeringLease(instance, state) {
    instance.steeringEpoch = (instance.steeringEpoch ?? 0) + 1;
    const head = state.entityRegistry.get(instance.headId);
    if (!head) return;
    clearSnakeSteeringLeaseFromProp(head);
    head._snakeSteering = { headId: instance.headId, epoch: instance.steeringEpoch - 1 };
}
export function clearSnakeSteeringLeaseFromProp(prop) {
    delete prop._snakeSteering;
    clearGroundRollDrive(prop);
}
export function isSnakeSteeringLeaseValid(world, prop) {
    const lease = prop._snakeSteering;
    if (!lease) return true;
    const snakeGame = world.sandbox?.snakeGame;
    if (!snakeGame?.instancesByHeadId) return false;
    const instance = snakeGame.instancesByHeadId.get(lease.headId);
    if (!instance || instance.lifecycle !== "alive") return false;
    return instance.steeringEpoch === lease.epoch;
}
