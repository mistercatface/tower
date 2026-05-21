export class Coin {
    constructor(x, y, radius, value) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.value = value;
        this.isDead = false;
    }

    update(dt) {
    }
}

export class Enemy {
    constructor(x, y, radius, speed, health, color, reward, type = "standard") {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
        this.health = health;
        this.maxHealth = health;
        this.color = color;
        this.reward = reward;
        this.type = type;
        this.isDead = false;
        this.attackRange = radius + 60;
        this.fireTimer = 0;
        this.fireRate = 1500;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.angle = Math.atan2(-y, -x);
        this.turnSpeed = 10;
        this.isDodging = false;
        this.dodgeTargetX = null;
        this.dodgeTargetY = null;
        this.dodgeCooldownTimer = 0;
        this.isEngaged = false;
    }

    update(dt, target, gridSystem, walls, missiles = [], spatialHash = null) {
        if (this.dodgeCooldownTimer > 0) {
            this.dodgeCooldownTimer -= dt;
        }

        if (this.type === "dodger" && this.dodgeCooldownTimer <= 0 && !this.isDodging) {
            for (const m of missiles) {
                const dist = Math.hypot(m.x - this.x, m.y - this.y);
                if (dist < 100 && !m.isDead) {
                    const angleToEnemy = Math.atan2(this.y - m.y, this.x - m.x);
                    let angleDiff = angleToEnemy - m.angle;
                    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

                    if (Math.abs(angleDiff) < 0.5) {
                        if (Math.random() < 0.5) {
                            const perpAngle1 = m.angle + Math.PI / 2;
                            const perpAngle2 = m.angle - Math.PI / 2;
                            const dodgeDist = 25;
                            let dodged = false;
                            const angles = Math.random() < 0.5 ? [perpAngle1, perpAngle2] : [perpAngle2, perpAngle1];

                            for (const dodgeAngle of angles) {
                                const destX = this.x + Math.cos(dodgeAngle) * dodgeDist;
                                const destY = this.y + Math.sin(dodgeAngle) * dodgeDist;

                                if (gridSystem) {
                                    const { col, row } = gridSystem.worldToGrid(destX, destY);
                                    if (col >= 0 && col < gridSystem.cols && row >= 0 && row < gridSystem.rows) {
                                        if (gridSystem.grid[row * gridSystem.cols + col] === 0) {
                                            this.isDodging = true;
                                            this.dodgeTargetX = destX;
                                            this.dodgeTargetY = destY;
                                            this.dodgeCooldownTimer = 2000;
                                            dodged = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (dodged) break;
                        } else {
                            this.dodgeCooldownTimer = 500;
                        }
                    }
                }
            }
        }

        if (this.isDodging) {
            const dx = this.dodgeTargetX - this.x;
            const dy = this.dodgeTargetY - this.y;
            const dist = Math.hypot(dx, dy);
            const moveDist = (this.speed * 1.5) * (dt / 1000);

            const targetAngle = Math.atan2(dy, dx);
            let dodgeAngleDiff = targetAngle - this.angle;
            dodgeAngleDiff = Math.atan2(Math.sin(dodgeAngleDiff), Math.cos(dodgeAngleDiff));
            this.angle += dodgeAngleDiff * Math.min(1, (this.turnSpeed * 1.5) * (dt / 1000));

            if (dist <= moveDist) {
                this.x = this.dodgeTargetX;
                this.y = this.dodgeTargetY;
                this.isDodging = false;
            } else {
                this.x += (dx / dist) * moveDist;
                this.y += (dy / dist) * moveDist;
            }
            return false;
        }

        const distToTarget = Math.hypot(this.x - target.x, this.y - target.y);

        if (distToTarget <= target.radius + this.attackRange) {
            this.isEngaged = true;
        }

        let desiredX = 0;
        let desiredY = 0;

        if (!this.isEngaged) {
            if (gridSystem) {
                let { col, row } = gridSystem.worldToGrid(this.x, this.y);
                let flow = null;
                let targetField = gridSystem.flowField;

                if (col >= 0 && col < gridSystem.cols && row >= 0 && row < gridSystem.rows) {
                    flow = targetField[row * gridSystem.cols + col];
                }

                if (!flow) {
                    let bestDist = Infinity;
                    for (let r = -2; r <= 2; r++) {
                        for (let c = -2; c <= 2; c++) {
                            const nc = col + c;
                            const nr = row + r;
                            if (nc >= 0 && nc < gridSystem.cols && nr >= 0 && nr < gridSystem.rows) {
                                const nFlow = targetField[nr * gridSystem.cols + nc];
                                if (nFlow) {
                                    const dist = Math.hypot(c, r);
                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        flow = nFlow;
                                    }
                                }
                            }
                        }
                    }
                }

                if (flow && (flow.x !== 0 || flow.y !== 0)) {
                    const cx = col * gridSystem.cellSize + gridSystem.centerX - gridSystem.offsetX + (gridSystem.cellSize / 2);
                    const cy = row * gridSystem.cellSize + gridSystem.centerY - gridSystem.offsetY + (gridSystem.cellSize / 2);

                    const len = Math.hypot(flow.x, flow.y);
                    const fx = flow.x / len;
                    const fy = flow.y / len;

                    const dx = this.x - cx;
                    const dy = this.y - cy;

                    const t = dx * fx + dy * fy;
                    const projX = cx + fx * t;
                    const projY = cy + fy * t;

                    const targetX = projX + fx * 10.0;
                    const targetY = projY + fy * 10.0;

                    const steerDx = targetX - this.x;
                    const steerDy = targetY - this.y;
                    const steerLen = Math.hypot(steerDx, steerDy);

                    if (steerLen > 0) {
                        desiredX = steerDx / steerLen;
                        desiredY = steerDy / steerLen;
                    } else {
                        desiredX = fx;
                        desiredY = fy;
                    }
                } else {
                    const dx = target.x - this.x;
                    const dy = target.y - this.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 0) {
                        desiredX = dx / dist;
                        desiredY = dy / dist;
                    }
                }
            } else {
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    desiredX = dx / dist;
                    desiredY = dy / dist;
                }
            }
        } else {
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                desiredX = dx / dist;
                desiredY = dy / dist;
            }
            this.fireTimer += dt;
        }

        let sepX = 0;
        let sepY = 0;
        let pushX = 0;
        let pushY = 0;

        if (spatialHash) {
            const neighbors = spatialHash.getNearby(this);
            for (const other of neighbors) {
                if (other === this || other.isDead) continue;

                let dx = this.x - other.x;
                let dy = this.y - other.y;
                let dist = Math.hypot(dx, dy);

                if (dist === 0) {
                    dx = Math.random() - 0.5;
                    dy = Math.random() - 0.5;
                    dist = Math.hypot(dx, dy);
                }

                const avoidRadius = this.radius + other.radius + 15;
                if (dist < avoidRadius) {
                    const weight = 1 - (dist / avoidRadius);
                    sepX += (dx / dist) * weight;
                    sepY += (dy / dist) * weight;
                }

                const minSep = this.radius + other.radius + 0.1;
                if (dist < minSep) {
                    const overlap = minSep - dist;
                    pushX += (dx / dist) * overlap * 0.5;
                    pushY += (dy / dist) * overlap * 0.5;
                }
            }
        }

        let sepLen = Math.hypot(sepX, sepY);
        if (sepLen > 0) {
            const maxSep = 1.0;
            if (sepLen > maxSep) {
                sepX = (sepX / sepLen) * maxSep;
                sepY = (sepY / sepLen) * maxSep;
            }
        }

        if (!this.isEngaged && (desiredX !== 0 || desiredY !== 0)) {
            let finalX = desiredX + sepX;
            let finalY = desiredY + sepY;

            const len = Math.hypot(finalX, finalY);
            if (len > 0) {
                finalX /= len;
                finalY /= len;
            }

            const targetAngle = Math.atan2(finalY, finalX);
            let angleDiff = targetAngle - this.angle;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            this.angle += angleDiff * Math.min(1, this.turnSpeed * (dt / 1000));

            const moveDist = this.speed * (dt / 1000);
            this.x += finalX * moveDist;
            this.y += finalY * moveDist;

        } else if (this.isEngaged) {
            const targetAngle = Math.atan2(desiredY, desiredX);
            let angleDiff = targetAngle - this.angle;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            this.angle += angleDiff * Math.min(1, this.turnSpeed * (dt / 1000));
        }

        this.x += pushX;
        this.y += pushY;

        if (walls) {
            for (let i = 0; i < 2; i++) {
                for (const wall of walls) {
                    for (const seg of wall.segments) {
                        if (seg.isDead) continue;

                        const dx = this.x - seg.x;
                        const dy = this.y - seg.y;
                        const distanceSq = dx * dx + dy * dy;
                        const minDistance = this.radius + (seg.size * 0.5);

                        if (distanceSq < minDistance * minDistance) {
                            if (distanceSq === 0) {
                                this.x += minDistance;
                            } else {
                                const distance = Math.sqrt(distanceSq);
                                const overlap = minDistance - distance;
                                this.x += (dx / distance) * overlap;
                                this.y += (dy / distance) * overlap;
                            }
                        }
                    }
                }
            }
        }

        if (this.isEngaged && this.fireTimer >= this.fireRate) {
            this.fireTimer = 0;
            return true;
        }

        return false;
    }
}

export class Projectile {
    constructor(x, y, radius, speed, target) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
        this.target = target;
        this.isDead = false;
        this.angle = 0;
    }

    move(dt) {
        this.x += Math.cos(this.angle) * this.speed * (dt / 1000);
        this.y += Math.sin(this.angle) * this.speed * (dt / 1000);
    }

    checkOutOfBounds(canvasBounds) {
        const padding = 500;
        if (this.x < -padding || this.x > canvasBounds.width + padding || this.y < -padding || this.y > canvasBounds.height + padding) {
            this.isDead = true;
            return true;
        }
        return false;
    }
}

export class EnemyMissile extends Projectile {
    constructor(x, y, radius, speed, target, damage) {
        super(x, y, radius, speed, target);
        this.damage = damage;
        this.angle = Math.atan2(target.y - y, target.x - x);
    }

    update(dt, canvasBounds) {
        this.move(dt);
        this.checkOutOfBounds(canvasBounds);
    }
}

export class Missile extends Projectile {
    constructor(x, y, radius, speed, target, angle) {
        super(x, y, radius, speed, target);
        this.angle = angle;
    }

    update(dt, enemiesList, canvasBounds) {
        if (this.target && enemiesList.includes(this.target)) {
            this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        } else {
            this.target = null;
        }
        this.move(dt);
        this.checkOutOfBounds(canvasBounds);
    }
}

export class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1.0;
        this.isDead = false;
    }

    update(dt) {
        this.life -= dt / 1000;
        this.y -= 20 * (dt / 1000);
        if (this.life <= 0) {
            this.isDead = true;
        }
    }
}

function distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

export class Planet {
    constructor(x, y, radius, maxHealth) {
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.radius = radius;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.healAccumulator = 0;
        this.targetX = null;
        this.targetY = null;
        this.isMoving = false;
        this.moveSpeed = 25;
        this.targetNodeX = null;
        this.targetNodeY = null;
    }

    update(dt, gridSystem, isAttacking = false, walls = [], externalSpeedMod = 1.0) {
        let speedModifier = externalSpeedMod;

        if (!this.isMoving || this.targetX === null || this.targetY === null) return false;

        const distToDest = Math.hypot(this.x - this.targetX, this.y - this.targetY);
        if (distToDest < 2) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.isMoving = false;
            this.targetX = null;
            this.targetY = null;
            this.targetNodeX = null;
            this.targetNodeY = null;
            return true; 
        }

        let hasLineOfSight = true;
        if (walls && walls.length > 0) {
            const start = { x: this.x, y: this.y };
            const end = { x: this.targetX, y: this.targetY };
            
            for (const wall of walls) {
                for (const seg of wall.segments) {
                    if (seg.isDead) continue;
                    const dist = distToSegment(seg, start, end);
                    if (dist < seg.size * 0.5 + this.radius) {
                        hasLineOfSight = false;
                        break;
                    }
                }
                if (!hasLineOfSight) break;
            }
        }

        if (hasLineOfSight) {
            this.targetNodeX = this.targetX;
            this.targetNodeY = this.targetY;
        } else if (gridSystem) {
            if (this.targetNodeX === null || this.targetNodeY === null) {
                const nextNode = gridSystem.getPlayerNextNodeCenter(this.x, this.y);
                if (nextNode) {
                    this.targetNodeX = nextNode.x;
                    this.targetNodeY = nextNode.y;
                } else {
                    this.targetNodeX = this.targetX;
                    this.targetNodeY = this.targetY;
                }
            }
        }

        const dx = this.targetNodeX - this.x;
        const dy = this.targetNodeY - this.y;
        const distToNode = Math.hypot(dx, dy);
        const moveAngle = Math.atan2(dy, dx);
        const moveDist = this.moveSpeed * speedModifier * (dt / 1000);

        if (distToNode <= moveDist) {
            this.x = this.targetNodeX;
            this.y = this.targetNodeY;
            this.targetNodeX = null;
            this.targetNodeY = null;
        } else {
            this.x += Math.cos(moveAngle) * moveDist;
            this.y += Math.sin(moveAngle) * moveDist;
        }
        
        return true;
    }
}

export class Turret {
    constructor(angle, turnSpeed) {
        this.angle = angle;
        this.turnSpeed = turnSpeed;
    }
}

export class Wall {
    constructor(x, y, radius, startAngle, endAngle, size) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.size = size;
        this.alpha = 0;
        this.segments = [];
        
        const arcLength = radius * Math.abs(endAngle - startAngle);
        const numSegments = Math.max(1, Math.ceil(arcLength / (size * 1.1)));
        const angleStep = (endAngle - startAngle) / numSegments;
        
        for (let i = 0; i < numSegments; i++) {
            const angle = startAngle + i * angleStep + angleStep / 2;
            this.segments.push({
                x: x + Math.cos(angle) * radius,
                y: y + Math.sin(angle) * radius,
                angle: angle,
                size: size,
                maxHealth: 30,
                health: 30,
                isDead: false
            });
        }
    }

    update(dt) {
        if (this.alpha < 1) {
            this.alpha = Math.min(1, this.alpha + dt / 1000);
        }
    }
}