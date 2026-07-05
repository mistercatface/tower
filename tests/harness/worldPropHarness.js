import { WorldProp } from "../../Libraries/Props/props.js";

export function createTestWorldProp(type, x, y, facing = 0) {
    return new WorldProp(x, y, type, facing);
}
