import { ObjectPool } from "../Libraries/DataStructures/ObjectPool.js";

export const Pools = {
    projectiles: new ObjectPool(null, 100),
    // To pool walls/enemies later, simply uncomment these and register their factory functions:
    // enemies: new ObjectPool(null, 20),
    // walls: new ObjectPool(null, 200),
};
