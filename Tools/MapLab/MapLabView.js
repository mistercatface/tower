function rebuildStaticCache(world, options) {
    const grid = world.obstacleGrid;
    if (!grid) return null;

    const minX = grid.minX;
    const maxX = grid.maxX;
    const minY = grid.minY;
    const maxY = grid.maxY;
    const w = Math.ceil(maxX - minX);
    const h = Math.ceil(maxY - minY);

    if (w <= 0 || h <= 0) return null;

    const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    
    // Translate ctx so world coordinates draw relative to (minX, minY)
    ctx.translate(-minX, -minY);

    // 1. Draw HPA* Grid and Regions
    if (options.showPathDebug && world.hierarchicalNavigator) {
        const hnav = world.hierarchicalNavigator;
        if (hnav.grid) {
            ctx.save();
            const startCol = 0;
            const endCol = hnav.cols - 1;
            const startRow = 0;
            const endRow = hnav.rows - 1;

            // 1. Draw Grid Cells
            for (let row = startRow; row <= endRow; row++) {
                for (let col = startCol; col <= endCol; col++) {
                    const isBlocked = hnav.grid[row * hnav.cols + col] === 1;
                    const wx = hnav.minX + col * hnav.cellSize;
                    const wy = hnav.minY + row * hnav.cellSize;

                    if (isBlocked) {
                        ctx.fillStyle = "rgba(244, 67, 54, 0.25)"; // Translucent Red for blocked
                        ctx.fillRect(wx, wy, hnav.cellSize, hnav.cellSize);
                    } else if (!hnav.cellToNode || !hnav.cellToNode[row * hnav.cols + col]) {
                        ctx.fillStyle = "rgba(76, 175, 80, 0.05)"; // Very Faint Green for unassigned/fallback
                        ctx.fillRect(wx, wy, hnav.cellSize, hnav.cellSize);
                    }
                }
            }

            // 2. Draw Region Perimeters
            if (hnav.cellToNode) {
                ctx.beginPath();
                ctx.strokeStyle = "rgba(0, 229, 255, 0.5)"; // Translucent Cyan for borders
                ctx.lineWidth = 1.5;

                for (let row = startRow; row <= endRow; row++) {
                    for (let col = startCol; col <= endCol; col++) {
                        const idx = row * hnav.cols + col;
                        if (hnav.grid[idx] === 1) continue;

                        const node = hnav.cellToNode[idx];
                        if (!node) continue;

                        const wx = hnav.minX + col * hnav.cellSize;
                        const wy = hnav.minY + row * hnav.cellSize;
                        const cellSize = hnav.cellSize;

                        // Check Right Neighbor
                        if (col + 1 < hnav.cols) {
                            const rIdx = idx + 1;
                            if (hnav.grid[rIdx] === 0) {
                                const rightNode = hnav.cellToNode[rIdx];
                                if (rightNode && rightNode.id !== node.id) {
                                    ctx.moveTo(wx + cellSize, wy);
                                    ctx.lineTo(wx + cellSize, wy + cellSize);
                                }
                            }
                        }

                        // Check Bottom Neighbor
                        if (row + 1 < hnav.rows) {
                            const bIdx = idx + hnav.cols;
                            if (hnav.grid[bIdx] === 0) {
                                const bottomNode = hnav.cellToNode[bIdx];
                                if (bottomNode && bottomNode.id !== node.id) {
                                    ctx.moveTo(wx, wy + cellSize);
                                    ctx.lineTo(wx + cellSize, wy + cellSize);
                                }
                            }
                        }
                    }
                }
                ctx.stroke();
            }

            // 3. Draw HPA* Abstract Nodes & Edges
            for (const id in hnav.nodesMap) {
                const node = hnav.nodesMap[id];
                // Draw edges
                for (const edge of node.edges) {
                    const targetNode = hnav.nodesMap[edge.targetId];
                    if (targetNode) {
                        if (edge.path && edge.path.length > 0) {
                            ctx.beginPath();
                            const p0 = hnav.gridToWorld(edge.path[0].col, edge.path[0].row);
                            ctx.moveTo(p0.x, p0.y);
                            for (let k = 1; k < edge.path.length; k++) {
                                const pk = hnav.gridToWorld(edge.path[k].col, edge.path[k].row);
                                ctx.lineTo(pk.x, pk.y);
                            }
                            ctx.strokeStyle = "#ff9800";
                            ctx.lineWidth = 2.5;
                            ctx.stroke();
                        } else {
                            ctx.beginPath();
                            ctx.moveTo(node.x, node.y);
                            ctx.lineTo(targetNode.x, targetNode.y);
                            ctx.strokeStyle = "#ff9800";
                            ctx.lineWidth = 2.5;
                            ctx.stroke();
                        }
                    }
                }

                // Draw node
                ctx.beginPath();
                ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = "#00e5ff";
                ctx.fill();
            }

            ctx.restore();
        }
    }

    // 2. Draw Walls
    if (options.showWalls) {
        for (const seg of world.walls) {
            if (seg.isDead) continue;
            
            ctx.save();
            ctx.translate(seg.x, seg.y);
            ctx.rotate(seg.angle);
            
            const theme = seg.theme || { r: 120, g: 120, b: 120 };
            ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.8)`;
            
            const halfSize = seg.size / 2;
            const thickness = 20; // visual representation of wall thickness
            ctx.fillRect(-halfSize, -thickness/2, seg.size, thickness);
            
            ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 1)`;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-halfSize, -thickness/2, seg.size, thickness);
            
            ctx.restore();
        }
    }

    return {
        canvas,
        minX,
        minY,
        maxX,
        maxY,
        showWalls: options.showWalls,
        showPathDebug: options.showPathDebug,
        wallsCount: world.walls.length
    };
}

export function renderMapLabView(ctx, width, height, world, camera, options, selectedNodeId, playerPos, targetPos, currentPath) {
    ctx.save();
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, width, height);
    
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    
    // Draw static layers using cache
    if (world.obstacleGrid) {
        let cache = world._mapLabCache;
        if (!cache ||
            cache.showWalls !== options.showWalls ||
            cache.showPathDebug !== options.showPathDebug ||
            cache.minX !== world.obstacleGrid.minX ||
            cache.minY !== world.obstacleGrid.minY ||
            cache.maxX !== world.obstacleGrid.maxX ||
            cache.maxY !== world.obstacleGrid.maxY ||
            cache.wallsCount !== world.walls.length
        ) {
            cache = rebuildStaticCache(world, options);
            world._mapLabCache = cache;
        }

        if (cache && cache.canvas) {
            ctx.drawImage(cache.canvas, cache.minX, cache.minY);
        }
    }

    // Dynamic layers on top
    if (options.showGridBounds && world.obstacleGrid) {
        const grid = world.obstacleGrid;
        if (grid.minX !== undefined && grid.maxX !== undefined) {
            ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
            ctx.lineWidth = 10 / camera.zoom;
            ctx.setLineDash([20, 20]);
            ctx.strokeRect(grid.minX, grid.minY, grid.maxX - grid.minX, grid.maxY - grid.minY);
            ctx.setLineDash([]);
        }
    }
    
    if (options.showRoomZones) {
        for (const node of world.mapNodes) {
            const coords = world.getNodeCombatCoords(node);
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, 540, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            ctx.lineWidth = 2 / camera.zoom;
            ctx.stroke();
        }
    }
    
    if (options.showNodes) {
        // Draw connections
        ctx.lineWidth = 4 / camera.zoom;
        for (const node of world.mapNodes) {
            const coordsA = world.getNodeCombatCoords(node);
            for (const targetId of node.connections) {
                const targetNode = world.getMapNode(targetId);
                if (!targetNode) continue;
                const coordsB = world.getNodeCombatCoords(targetNode);
                
                ctx.beginPath();
                ctx.moveTo(coordsA.x, coordsA.y);
                ctx.lineTo(coordsB.x, coordsB.y);
                ctx.strokeStyle = "rgba(85, 85, 85, 0.4)";
                ctx.stroke();
            }
        }
    }

    if (options.showNodes) {
        // Draw nodes
        for (const node of world.mapNodes) {
            const coords = world.getNodeCombatCoords(node);
            
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, 30 / camera.zoom, 0, Math.PI * 2);
            
            const themeColor = node.wallTheme ? `rgb(${node.wallTheme.r}, ${node.wallTheme.g}, ${node.wallTheme.b})` : "#555";
            ctx.fillStyle = themeColor;
            
            if (node.id === selectedNodeId) {
                ctx.lineWidth = 8 / camera.zoom;
                ctx.strokeStyle = "#fff";
            } else {
                ctx.lineWidth = 3 / camera.zoom;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            }
            
            ctx.fill();
            ctx.stroke();
            
            // Draw text
            if (camera.zoom > 0.05) {
                ctx.fillStyle = "#fff";
                ctx.font = `bold ${20 / camera.zoom}px Inter, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(node.id.toString(), coords.x, coords.y);
            }
        }
    }

    // Draw Pathfinding Test Overlays
    if (options.showPathTest) {
        if (currentPath && currentPath.length > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(playerPos.x, playerPos.y);
            for (const wp of currentPath) {
                ctx.lineTo(wp.x, wp.y);
            }
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 4;
            ctx.stroke();

            for (const wp of currentPath) {
                ctx.beginPath();
                ctx.arc(wp.x, wp.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = "#00e5ff";
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        }

        if (playerPos) {
            ctx.save();
            ctx.beginPath();
            const r = 16 / camera.zoom;
            ctx.arc(playerPos.x, playerPos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = "#00bcd4";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 3 / camera.zoom;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.font = `bold ${16 / camera.zoom}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("P", playerPos.x, playerPos.y);
            ctx.restore();
        }

        if (targetPos) {
            ctx.save();
            ctx.beginPath();
            const r = 16 / camera.zoom;
            ctx.arc(targetPos.x, targetPos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = "#e91e63";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 3 / camera.zoom;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.font = `bold ${16 / camera.zoom}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("T", targetPos.x, targetPos.y);
            ctx.restore();
        }
    }
    
    ctx.restore();
}
