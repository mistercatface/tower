
// Keyboard Tracker (Global)
const WORKSHOP_INPUT = { keys: new Set() };
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    WORKSHOP_INPUT.keys.add(k);
    if (WORKSHOP_DATA.selectedNodeId) {
        if (k === 'g') WORKSHOP_DATA.transformMode = 'translate';
        if (k === 'r') WORKSHOP_DATA.transformMode = 'rotate';
        if (k === 'x' || k === 'y' || k === 'z') WORKSHOP_DATA.axisLock = k;
        if (k === 'escape') {
            WORKSHOP_DATA.transformMode = null;
            WORKSHOP_DATA.axisLock = null;
        }
        if (k === 'delete' || k === 'backspace') {
             const id = WORKSHOP_DATA.selectedNodeId;
             WORKSHOP_NODES.delete(id);
             for (let i = WORKSHOP_BEAMS.length -1; i >= 0; i--) {
                 if(WORKSHOP_BEAMS[i].startNodeId === id || WORKSHOP_BEAMS[i].endNodeId === id) WORKSHOP_BEAMS.splice(i, 1);
             }
             WORKSHOP_DATA.selectedNodeId = null;
             updatePropertiesPanel();
        }
    }
});
window.addEventListener('keyup', (e) => {
    WORKSHOP_INPUT.keys.delete(e.key.toLowerCase());
});

// 5. INPUT HANDLER (HOTKEY SUPPORT)
function handleWorkshopInput(e, type) {
    if (!WORKSHOP_CURSOR.valid && type !== 'mouseup' && !WORKSHOP_DATA.isDragging && type !== 'wheel') return;

    if (type === 'mousedown' && e.button === 0) {
        if (WORKSHOP_DATA.activeTool === 'select') {
            if (WORKSHOP_CURSOR.snapped && WORKSHOP_CURSOR.snapTargetId) {
                WORKSHOP_DATA.selectedNodeId = WORKSHOP_CURSOR.snapTargetId;
                WORKSHOP_DATA.isDragging = true;
                WORKSHOP_DATA.dragStartPos = { x: e.clientX, y: e.clientY };
                
                // Initialize Transform
                const n = WORKSHOP_NODES.get(WORKSHOP_DATA.selectedNodeId);
                if (n) {
                    WORKSHOP_DATA.objStartPos = { ...n.pos };
                    WORKSHOP_DATA.objStartRot = { ...n.rot };
                    n.velocity = { x: 0, y: 0, z: 0 };
                }
                WORKSHOP_DATA.transformMode = 'translate';
                WORKSHOP_DATA.axisLock = null;
                updatePropertiesPanel();
            } else {
                WORKSHOP_DATA.selectedNodeId = null;
                WORKSHOP_DATA.isDragging = false;
                WORKSHOP_DATA.transformMode = null;
                updatePropertiesPanel();
            }
        }
        else if (['node', 'cube', 'cylinder', 'cone', 'wedge', 'capsule'].includes(WORKSHOP_DATA.activeTool)) {
            const id = Math.random().toString(36).substr(2, 9);
            let color = WORKSHOP_CONFIG.COLORS.node;
            if(WORKSHOP_DATA.activeTool === 'cube') color = WORKSHOP_CONFIG.COLORS.cube;
            if(WORKSHOP_DATA.activeTool === 'cylinder') color = WORKSHOP_CONFIG.COLORS.cylinder;
            if(WORKSHOP_DATA.activeTool === 'cone') color = WORKSHOP_CONFIG.COLORS.cone;

            const px = isNaN(WORKSHOP_CURSOR.x) ? 0 : WORKSHOP_CURSOR.x;
            const pz = isNaN(WORKSHOP_CURSOR.z) ? 0 : WORKSHOP_CURSOR.z;

            WORKSHOP_NODES.set(id, {
                id, type: WORKSHOP_DATA.activeTool, velocity: { x: 0, y: 0, z: 0 },
                parentId: null, pos: { x: px, y: 0, z: pz }, rot: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 }, taper: 1.0, material: 'matte', color: color,
                anim: { type: 'none', axis: 'y', speed: 1.0, amp: 0.5, phase: 0.0 },
                localTransform: { pos: {x:0,y:0,z:0}, rot: {x:0,y:0,z:0} },
                worldTransform: { pos: {x:0,y:0,z:0}, rot: {x:0,y:0,z:0} }
            });
            WORKSHOP_DATA.selectedNodeId = id; 
            WORKSHOP_DATA.isDragging = false; 
            updatePropertiesPanel();
        }
        else if (WORKSHOP_DATA.activeTool === 'beam') {
             if (!WORKSHOP_CURSOR.snapped) return; 
             if (!WORKSHOP_DATA.pendingBeamStartId) {
                 WORKSHOP_DATA.pendingBeamStartId = WORKSHOP_CURSOR.snapTargetId;
                 WORKSHOP_DATA.pendingBeamAnchor = { ...WORKSHOP_CURSOR.snapLocalOffset };
             } else {
                 if (WORKSHOP_DATA.pendingBeamStartId !== WORKSHOP_CURSOR.snapTargetId) {
                     const startId = WORKSHOP_DATA.pendingBeamStartId;
                     const endId = WORKSHOP_CURSOR.snapTargetId;
                     WORKSHOP_BEAMS.push({
                         id: Math.random().toString(36).substr(2, 9),
                         startNodeId: startId, endNodeId: endId, length: 1.0, 
                         anchorA: WORKSHOP_DATA.pendingBeamAnchor, anchorB: { ...WORKSHOP_CURSOR.snapLocalOffset },
                         color: WORKSHOP_CONFIG.COLORS.beam, slack: 0, width: 1.0
                     });
                     const endNode = WORKSHOP_NODES.get(endId);
                     if (endNode && !endNode.parentId && endNode.parentId !== startId) {
                         setParent(endId, startId);
                         updatePropertiesPanel();
                     }
                 }
                 WORKSHOP_DATA.pendingBeamStartId = null;
                 WORKSHOP_DATA.pendingBeamAnchor = null;
             }
        }
    }
    else if (type === 'wheel') {
        if (WORKSHOP_DATA.isDragging && WORKSHOP_DATA.selectedNodeId) {
            const node = WORKSHOP_NODES.get(WORKSHOP_DATA.selectedNodeId);
            if (node && WORKSHOP_DATA.objStartPos) {
                e.preventDefault();
                const liftSpeed = 0.005;
                const dy = -e.deltaY * liftSpeed;
                node.pos.y += dy;
                WORKSHOP_DATA.objStartPos.y += dy; 
                updatePropertiesPanel();
            }
        }
    }
    else if (type === 'mousemove' && WORKSHOP_DATA.isDragging) {
        const node = WORKSHOP_NODES.get(WORKSHOP_DATA.selectedNodeId);
        if (node && (!WORKSHOP_DATA.objStartPos || !WORKSHOP_DATA.dragStartPos)) {
            WORKSHOP_DATA.objStartPos = { ...node.pos };
            WORKSHOP_DATA.objStartRot = { ...node.rot };
            WORKSHOP_DATA.dragStartPos = { x: e.clientX, y: e.clientY };
        }
        if (node) {
            const dx = (e.clientX - WORKSHOP_DATA.dragStartPos.x);
            const dy = (e.clientY - WORKSHOP_DATA.dragStartPos.y);
            
            if (WORKSHOP_DATA.transformMode === 'rotate') {
                const sens = 0.01;
                if (WORKSHOP_DATA.axisLock === 'x') {
                    node.rot.x = WORKSHOP_DATA.objStartRot.x + (dy * sens);
                } else if (WORKSHOP_DATA.axisLock === 'y') {
                    node.rot.y = WORKSHOP_DATA.objStartRot.y + (dx * sens);
                } else if (WORKSHOP_DATA.axisLock === 'z') {
                    node.rot.z = WORKSHOP_DATA.objStartRot.z + (dx * sens);
                } else {
                    node.rot.y = WORKSHOP_DATA.objStartRot.y + (dx * sens);
                    node.rot.x = WORKSHOP_DATA.objStartRot.x + (dy * sens);
                }
            } else {
                const pState = getProjectionState(viewport);
                const ppu = pState.ppu || 1; 
                const sensitivity = 1 / ppu;
                const dWx = dx * sensitivity;
                const dWy = dy * sensitivity; 
                let move = { x: dWx, y: 0, z: dWy };

                if (WORKSHOP_DATA.axisLock === 'x') { move.y = 0; move.z = 0; }
                else if (WORKSHOP_DATA.axisLock === 'y') { move.x = 0; move.z = 0; move.y = -dWy; }
                else if (WORKSHOP_DATA.axisLock === 'z') { move.x = 0; move.y = 0; }

                let localMove = move;
                if (node.parentId && WORKSHOP_NODES.has(node.parentId)) {
                    const p = WORKSHOP_NODES.get(node.parentId);
                    localMove = unrotatePoint(move, p.worldTransform.rot);
                }
                node.pos.x = WORKSHOP_DATA.objStartPos.x + localMove.x;
                node.pos.y = WORKSHOP_DATA.objStartPos.y + localMove.y;
                node.pos.z = WORKSHOP_DATA.objStartPos.z + localMove.z;
            }
            updatePropertiesPanel(); 
        }
    }
    else if (type === 'mouseup') {
        WORKSHOP_DATA.isDragging = false;
    }
}

// 6. UI MANAGER
function updatePropertiesPanel() {
    const panel = document.getElementById('workshop-props');
    if (!panel) return;
    const selected = WORKSHOP_NODES.get(WORKSHOP_DATA.selectedNodeId);
    if (!selected) {
        panel.innerHTML = '<div style="color:#666; font-style:italic; padding:10px; font-size:11px;">Select an Object</div>';
        return;
    }
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.innerText = `${selected.type.toUpperCase()}: ${selected.id.substr(0,4)}`;
    title.style.cssText = 'font-weight:bold; margin-bottom:8px; color:#4f9; border-bottom:1px solid #444; font-size:12px;';
    panel.appendChild(title);

    const createPropRow = (label, value, min, max, step, onChange) => {
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '5px', marginBottom: '2px', alignItems: 'center' });
        const lbl = document.createElement('div');
        lbl.innerText = label;
        Object.assign(lbl.style, { width: '15px', fontSize:'10px', color:'#888', fontWeight:'bold' });
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = value;
        Object.assign(slider.style, { flex:'1', height:'4px', appearance:'none', background:'#444', outline:'none', cursor:'ew-resize' });
        const num = document.createElement('input');
        num.type = 'number'; num.step = step; num.value = parseFloat(value).toFixed(2);
        Object.assign(num.style, { width: '40px', background: '#222', border: '1px solid #444', color:'#eee', fontSize:'10px', padding:'2px' });
        const update = (val) => { const v = parseFloat(val); slider.value = v; num.value = v.toFixed(2); onChange(v); };
        slider.oninput = (e) => update(e.target.value);
        num.oninput = (e) => update(e.target.value);
        row.append(lbl, slider, num);
        return row;
    };

    const createGroup = (name, objKey, min, max, step, isRotation = false) => {
        if (!selected[objKey]) return;
        const group = document.createElement('div');
        Object.assign(group.style, { marginBottom: '8px', background:'#222', padding:'5px', borderRadius:'4px' });
        group.innerHTML = `<div style="font-size:9px; color:#aaa; margin-bottom:4px; font-weight:bold;">${name}</div>`;
        ['x', 'y', 'z'].forEach(axis => {
            let val = selected[objKey][axis];
            if (isRotation) val = val * (180 / Math.PI); 
            group.appendChild(createPropRow(axis.toUpperCase(), val, min, max, step, (newVal) => {
                if (isRotation) selected[objKey][axis] = newVal * (Math.PI / 180);
                else selected[objKey][axis] = newVal;
            }));
        });
        panel.appendChild(group);
    };

    const parentRow = document.createElement('div');
    parentRow.style.cssText = 'margin-bottom:8px; background:#222; padding:5px;';
    parentRow.innerHTML = '<div style="font-size:9px; color:#aaa; font-weight:bold;">PARENT (ATTACH)</div>';
    const parentSel = document.createElement('select');
    parentSel.style.cssText = 'width:100%; background:#111; border:1px solid #444; color:#fff; font-size:10px;';
    const optNone = document.createElement('option');
    optNone.value = ''; optNone.innerText = '(None)';
    if (!selected.parentId) optNone.selected = true;
    parentSel.appendChild(optNone);
    WORKSHOP_NODES.forEach((node, id) => {
        if (id !== selected.id) {
            const opt = document.createElement('option');
            opt.value = id; opt.innerText = `${node.type} (${id.substr(0,4)})`;
            if (selected.parentId === id) opt.selected = true;
            parentSel.appendChild(opt);
        }
    });
    parentSel.onchange = (e) => { 
        const newPid = e.target.value || null; setParent(selected.id, newPid); updatePropertiesPanel();
    };
    parentRow.appendChild(parentSel);
    panel.appendChild(parentRow);

    createGroup('LOCAL POS', 'pos', -10, 10, 0.1);
    createGroup('LOCAL ROT', 'rot', -180, 180, 1, true);
    createGroup('SCALE', 'scale', 0.1, 4.0, 0.1);
    
    if (selected.type === 'cube' || selected.type === 'cylinder' || selected.type === 'wedge') {
        const tVal = (selected.taper !== undefined) ? selected.taper : 1.0;
        panel.appendChild(createPropRow('TAPER', tVal, 0.0, 2.0, 0.1, (v) => selected.taper = v));
    }

    // Material Selector
    const matRow = document.createElement('div');
    matRow.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:10px; background:#222; padding:5px;';
    matRow.innerHTML = '<div style="font-size:10px; color:#aaa; font-weight:bold;">MAT</div>';
    const matSel = document.createElement('select');
    ['matte', 'metal', 'glow', 'smooth', 'jelly', 'glass'].forEach(m => {
        const o = document.createElement('option'); o.value = m; o.innerText = m.toUpperCase();
        if(selected.material === m) o.selected = true;
        matSel.appendChild(o);
    });
    matSel.onchange = (e) => { selected.material = e.target.value; updatePropertiesPanel(); };
    matSel.style.cssText = "width:100%; background:#333; color:#fff; border:none; font-size:10px;";
    matRow.appendChild(matSel);
    panel.appendChild(matRow);

    const animGroup = document.createElement('div');
    animGroup.style.cssText = 'margin-bottom:8px; background:#222; padding:5px; borderRadius:4px;';
    animGroup.innerHTML = '<div style="font-size:9px; color:#4af; margin-bottom:4px; font-weight:bold;">ANIMATION</div>';
    const typeSel = document.createElement('select');

      ['none', 'spin', 'wave', 'pulse', 'bob', 'twist', 'orbit'].forEach(t => {
        const o = document.createElement('option'); o.value=t; o.innerText=t.toUpperCase(); 
        if(selected.anim.type===t) o.selected=true;
        typeSel.appendChild(o);
    });
    typeSel.onchange = (e) => { selected.anim.type = e.target.value; updatePropertiesPanel(); };
    typeSel.style.cssText = 'width:100%; margin-bottom:4px; background:#333; color:#fff; border:none; fontSize:10px;';
    animGroup.appendChild(typeSel);

    if(selected.anim.type !== 'none') {
        const axisSel = document.createElement('select');
        ['x', 'y', 'z'].forEach(a => {
            const o = document.createElement('option'); o.value=a; o.innerText='AXIS: '+a.toUpperCase(); 
            if(selected.anim.axis===a) o.selected=true;
            axisSel.appendChild(o);
        });
        axisSel.onchange = (e) => selected.anim.axis = e.target.value;
        axisSel.style.cssText = 'width:100%; margin-bottom:4px; background:#333; color:#fff; border:none; fontSize:10px;';
        animGroup.appendChild(axisSel);
        animGroup.appendChild(createPropRow('SPD', selected.anim.speed, -5, 5, 0.1, (v)=>selected.anim.speed=v));
        if(selected.anim.type === 'wave') {
            animGroup.appendChild(createPropRow('AMP', selected.anim.amp, 0, 3, 0.1, (v)=>selected.anim.amp=v));
            animGroup.appendChild(createPropRow('PHS', selected.anim.phase, 0, 6.28, 0.1, (v)=>selected.anim.phase=v));
        }
    }
    panel.appendChild(animGroup);

    const colRow = document.createElement('div');
    colRow.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:10px; background:#222; padding:5px;';
    colRow.innerHTML = '<div style="font-size:10px; color:#aaa; font-weight:bold;">COLOR</div>';
    const colInput = document.createElement('input');
    colInput.type = 'color'; colInput.value = selected.color;
    colInput.style.cssText = 'border:none; width:40px; height:20px; cursor:pointer;';
    colInput.oninput = (e) => { selected.color = e.target.value; };
    colRow.appendChild(colInput);
    panel.appendChild(colRow);

    const delBtn = document.createElement('button');
    delBtn.innerText = 'DELETE OBJECT';
    Object.assign(delBtn.style, { marginTop:'5px', width:'100%', background:'#522', color:'#fbb', border:'1px solid #844', cursor:'pointer' });
    delBtn.onclick = () => {
        WORKSHOP_NODES.delete(selected.id);
        const toRemove = [];
        WORKSHOP_BEAMS.forEach((b, i) => { if(b.startNodeId === selected.id || b.endNodeId === selected.id) toRemove.push(i); });
        for (let i = toRemove.length -1; i >= 0; i--) WORKSHOP_BEAMS.splice(toRemove[i], 1);
        WORKSHOP_DATA.selectedNodeId = null; updatePropertiesPanel();
    };
    panel.appendChild(delBtn);

    const outgoingBeams = WORKSHOP_BEAMS.filter(b => b.startNodeId === selected.id);
    if (outgoingBeams.length > 0) {
        const beamGroup = document.createElement('div');
        Object.assign(beamGroup.style, { marginTop:'8px', background:'#223', padding:'5px', borderRadius:'4px', border:'1px solid #446' });
        beamGroup.innerHTML = '<div style="font-size:9px; color:#aaf; margin-bottom:4px; font-weight:bold;">ATTACHED CABLES</div>';
        outgoingBeams.forEach((beam) => {
            const row = document.createElement('div');
            row.style.marginBottom = '5px';
            row.innerHTML = `<div style="font-size:9px; color:#88a;">To: ${beam.endNodeId.substr(0,4)}</div>`;
            const slackRow = createPropRow('SLACK', beam.slack || 0, 0, 1.0, 0.05, (v) => beam.slack = v);
            const widthRow = createPropRow('WIDTH', beam.width || 1.0, 0.1, 5.0, 0.1, (v) => beam.width = v);
            beamGroup.append(row, slackRow, widthRow);
        });
        panel.appendChild(beamGroup);
    }
}

function setupWorkshopUI() {
    if (!window._workshopEventsBound) {
        window.addEventListener('mousedown', (e) => {
            const ui = document.getElementById('workshop-ui');
            if (ui && ui.contains(e.target)) return;
            handleWorkshopInput(e, 'mousedown');
        });
        window.addEventListener('mousemove', (e) => handleWorkshopInput(e, 'mousemove'));
        window.addEventListener('mouseup', (e) => handleWorkshopInput(e, 'mouseup'));
        window.addEventListener('wheel', (e) => handleWorkshopInput(e, 'wheel'), { passive: false });
        window._workshopEventsBound = true;
    }
    if (document.getElementById('workshop-ui')) return;
    const container = document.createElement('div');
    container.id = 'workshop-ui';
    Object.assign(container.style, {
        position: 'absolute', top: '10px', right: '10px', width: '250px', 
        backgroundColor: 'rgba(30, 30, 36, 0.95)', border: '1px solid #555', borderRadius: '4px',
        color: '#ccc', fontFamily: 'monospace', zIndex: '1000', userSelect: 'none',
        boxShadow: '0 10px 20px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto'
    });
    const header = document.createElement('div');
    header.innerHTML = '<span>⚙️ KINEMATICS LAB</span><span>▼</span>';
    Object.assign(header.style, { padding: '8px 12px', background: '#222', borderBottom:'1px solid #444', cursor: 'pointer', display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:'13px'});
    const content = document.createElement('div');
    Object.assign(content.style, { padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' });
    
    // LIBRARY
    const presetDiv = document.createElement('div');
    presetDiv.innerHTML = '<div style="font-size:10px; color:#888;">LOAD PRESET</div>';
    const presetSel = document.createElement('select');
    const defOpt = document.createElement('option'); defOpt.text='-- Select --'; presetSel.add(defOpt);
    Object.keys(K_PRESETS).forEach(p => { const o = document.createElement('option'); o.value = p; o.innerText = p; presetSel.appendChild(o); });
    presetSel.onchange = (e) => loadPreset(e.target.value);
    Object.assign(presetSel.style, { width: '100%', background:'#333', color:'#fff', border:'1px solid #555', fontSize:'11px', marginBottom:'8px' });
    presetDiv.appendChild(presetSel);
    content.appendChild(presetDiv);

    // EXPORT
    const exportBtn = document.createElement('button');
    exportBtn.innerText = '📋 COPY RIG JSON';
    exportBtn.onclick = exportRig;
    Object.assign(exportBtn.style, { width:'100%', background:'#448', color:'#aaf', border:'1px solid #66a', padding:'5px', cursor:'pointer' });
    content.appendChild(exportBtn);

    // RESOLUTION
    const resDiv = document.createElement('div');
    resDiv.innerHTML = '<div style="font-size:10px; color:#888;">RESOLUTION (WIDTH)</div>';
    const resSelect = document.createElement('select');
    [16, 32, 64, 128, 256, 320, 512, 1024].forEach(r => {
        const opt = document.createElement('option');
        opt.value = r; opt.innerText = r + 'px';
        if(r === WORKSHOP_CONFIG.RESOLUTION) opt.selected = true;
        resSelect.appendChild(opt);
    });
    resSelect.onchange = (e) => { WORKSHOP_CONFIG.RESOLUTION = parseInt(e.target.value); };
    Object.assign(resSelect.style, { width: '100%', background:'#333', color:'#fff', border:'1px solid #555', fontSize:'11px', marginBottom:'8px' });
    resDiv.appendChild(resSelect);
    content.appendChild(resDiv);

    // SLIDER
    const sliderDiv = document.createElement('div');
    sliderDiv.innerHTML = '<div style="font-size:10px; color:#888; margin-bottom:2px;">PLACEMENT HEIGHT (Y)</div>';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '4'; slider.step = '0.2'; slider.value = '0';
    Object.assign(slider.style, { width: '100%', height:'4px', appearance:'none', background:'#444', outline:'none' });
    const valDisp = document.createElement('span'); valDisp.style.float='right'; valDisp.innerText='0.0m';
    slider.oninput = (e) => {
        WORKSHOP_DATA.cursorY = parseFloat(e.target.value);
        valDisp.innerText = WORKSHOP_DATA.cursorY.toFixed(1) + 'm';
    };
    sliderDiv.appendChild(valDisp); sliderDiv.appendChild(slider);
    
    // PHYSICS TOGGLE
    const physicsDiv = document.createElement('div');
    Object.assign(physicsDiv.style, { marginBottom: '8px', display:'flex', gap:'5px' });
    const physBtn = document.createElement('button');
    physBtn.innerText = 'PHYSICS: OFF';
    Object.assign(physBtn.style, { width: '100%', background: '#422', color: '#f88', border: '1px solid #633', cursor:'pointer', fontSize:'11px', padding:'4px' });
    physBtn.onclick = () => {
        WORKSHOP_DATA.physicsEnabled = !WORKSHOP_DATA.physicsEnabled;
        if (WORKSHOP_DATA.physicsEnabled) {
            physBtn.innerText = 'PHYSICS: ON'; physBtn.style.background = '#252'; physBtn.style.color = '#8f8'; physBtn.style.borderColor = '#363';
        } else {
            physBtn.innerText = 'PHYSICS: OFF'; physBtn.style.background = '#422'; physBtn.style.color = '#f88'; physBtn.style.borderColor = '#633';
        }
    };
    physicsDiv.appendChild(physBtn);
    content.appendChild(physicsDiv);

    // SKELETON TOGGLE
    const skelBtn = document.createElement('button');
    skelBtn.innerText = 'BONE VIEW: ON';
    Object.assign(skelBtn.style, { width: '100%', background: '#442', color: '#ff8', border: '1px solid #663', cursor:'pointer', fontSize:'11px', padding:'4px', marginTop:'4px' });
    skelBtn.onclick = () => {
        WORKSHOP_DATA.showSkeleton = !WORKSHOP_DATA.showSkeleton;
        skelBtn.innerText = WORKSHOP_DATA.showSkeleton ? 'BONE VIEW: ON' : 'BONE VIEW: OFF';
        skelBtn.style.color = WORKSHOP_DATA.showSkeleton ? '#ff8' : '#888';
    };
    content.appendChild(skelBtn);

    const toolGrid = document.createElement('div');
    Object.assign(toolGrid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' });
    const tools = [
        { id: 'select', label: 'Select 👆' }, { id: 'node', label: 'Sphere ●' },
        { id: 'cube', label: 'Cube 🧊' }, { id: 'cylinder', label: 'Cylinder 🛢️' },
        { id: 'cone', label: 'Cone ▲' }, { id: 'wedge', label: 'Wedge 📐' },
        { id: 'capsule', label: 'Capsule 💊' },
        { id: 'beam', label: 'Beam ━' }, { id: 'clear', label: 'Clear All ✖' }
    ];
    tools.forEach(t => {
        const btn = document.createElement('div');
        Object.assign(btn.style, {
            background: '#333', border: '1px solid #444', padding: '8px',
            textAlign: 'center', fontSize: '11px', cursor: 'pointer', borderRadius: '3px', color:'#eee'
        });
        btn.innerText = t.label;
        btn.onclick = () => {
            if (t.id === 'clear') {
                WORKSHOP_NODES.clear(); WORKSHOP_BEAMS.length = 0; WORKSHOP_DATA.selectedNodeId = null; updatePropertiesPanel();
            } else {
                WORKSHOP_DATA.activeTool = t.id;
                Array.from(toolGrid.children).forEach(c => { c.style.background = '#333'; c.style.borderColor = '#444'; });
                btn.style.background = '#0055aa'; btn.style.borderColor = '#4488ff';
                WORKSHOP_DATA.pendingBeamStartId = null;
            }
        };
        if(t.id === WORKSHOP_DATA.activeTool) { btn.style.background = '#0055aa'; btn.style.borderColor = '#4488ff'; }
        toolGrid.appendChild(btn);
    });
    const propsPanel = document.createElement('div');
    propsPanel.id = 'workshop-props';
    Object.assign(propsPanel.style, { background: '#161619', padding:'8px', borderRadius:'4px', marginTop:'5px', border:'1px solid #333' });
    content.append(sliderDiv, toolGrid, propsPanel);
    container.append(header, content);
    document.body.appendChild(container);
    let isOpen = false;
    content.style.display = 'none';
    header.onclick = () => { isOpen = !isOpen; content.style.display = isOpen ? 'flex' : 'none'; };
    updatePropertiesPanel();
}