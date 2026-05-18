const canvas = document.getElementById('pixel-canvas');
const onionCanvas = document.getElementById('onion-canvas');
const colorPicker = document.getElementById('color-picker');
const sizeSelector = document.getElementById('grid-size');
const brushSizeSelector = document.getElementById('brush-size');
const toolBtns = document.querySelectorAll('.tool-btn');
const swatches = document.querySelectorAll('.color-swatch');
const workspaceWrapper = document.getElementById('canvas-wrapper');
const canvasContainer = document.querySelector('.canvas-container');
const layerListContainer = document.getElementById('layer-list');

// Selection Variables
let selection = null; 
const marquee = document.getElementById('selection-marquee');

// Slider DOM hooks
const sBrightness = document.getElementById('slider-brightness');
const sContrast = document.getElementById('slider-contrast');
const sSaturation = document.getElementById('slider-saturation');
const sVibrance = document.getElementById('slider-vibrance');
const vBrightness = document.getElementById('val-brightness');
const vContrast = document.getElementById('val-contrast');
const vSaturation = document.getElementById('val-saturation');
const vVibrance = document.getElementById('val-vibrance');
const btnApplyFilters = document.getElementById('btn-apply-filters');

let gridSize = 32;
let currentColor = '#000000';
let currentTool = 'pencil'; 
let isDrawing = false;
let pixels = [];
let onionPixels = [];
let showGrid = true;
let brushSize = 1;

let startX = 0, startY = 0;
let lastX = -1, lastY = -1;
let snapshotState = []; 

let currentScale = 1.0;
const minScale = 0.3; 
const maxScale = 8.0; 

let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 40; 

/* LAYER & ANIMATION ENGINE ARRAYS */
let frames = [];
let currentFrameIndex = 0;
let layers = []; // Points to current frame's layers
let activeLayerId = null;
let layerCounter = 0;

let isPlaying = false;
let playbackInterval;
let fps = 8;
let onionSkinEnabled = false;

class Layer {
    constructor(name) {
        this.id = 'layer_' + (++layerCounter);
        this.name = name;
        this.visible = true;
        this.data = Array(gridSize * gridSize).fill('transparent');
    }
}

// Initialize on Load
init();

function init() {
    frames = [];
    layerCounter = 0;
    layers = [];
    
    createGrid(gridSize);
    
    // Create Default Frame 1
    addLayer("Background");
    addLayer("Layer 1");
    frames.push({ layers: layers });
    currentFrameIndex = 0;
    
    selectLayer(layers[0].id);
    setupEventListeners();
    updateFiltersPreview();
    updateFrameUI();
}

function createGrid(size) {
    canvas.innerHTML = '';
    onionCanvas.innerHTML = '';
    pixels = [];
    onionPixels = [];
    
    canvas.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    canvas.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    canvas.className = `grid-${size}`; 
    
    onionCanvas.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    onionCanvas.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    onionCanvas.className = `grid-${size}`; 
    
    if (!showGrid) canvas.classList.add('hide-grid');

    for (let i = 0; i < size * size; i++) {
        // Main canvas pixel
        const pixel = document.createElement('div');
        pixel.classList.add('pixel');
        pixel.dataset.index = i;
        pixel.addEventListener('mousedown', startDrawing);
        pixel.addEventListener('mouseenter', draw);
        canvas.appendChild(pixel);
        pixels.push(pixel);

        // Onion canvas pixel
        const oPixel = document.createElement('div');
        oPixel.classList.add('pixel');
        onionCanvas.appendChild(oPixel);
        onionPixels.push(oPixel);
    }
    
    undoStack = [];
    redoStack = [];
    currentScale = 1.0;
    canvasContainer.style.transform = "scale(1)";
    resetSliders();
}

/* VIRTUAL CANVAS LAYERS COMPOSITOR */
function renderComposition() {
    for (let i = 0; i < gridSize * gridSize; i++) {
        let blendedColor = 'transparent';
        
        for (let j = layers.length - 1; j >= 0; j--) {
            const layer = layers[j];
            if (layer.visible && layer.data[i] !== 'transparent') {
                blendedColor = layer.data[i];
            }
        }
        pixels[i].style.backgroundColor = blendedColor === 'transparent' ? '' : blendedColor;
    }
}

function renderOnionSkin() {
    if (!onionSkinEnabled || currentFrameIndex === 0) {
        onionCanvas.style.display = 'none';
        return;
    }
    
    onionCanvas.style.display = 'grid';
    const prevLayers = frames[currentFrameIndex - 1].layers;
    
    for (let i = 0; i < gridSize * gridSize; i++) {
        let blendedColor = 'transparent';
        for (let j = prevLayers.length - 1; j >= 0; j--) {
            if (prevLayers[j].visible && prevLayers[j].data[i] !== 'transparent') {
                blendedColor = prevLayers[j].data[i];
            }
        }
        onionPixels[i].style.backgroundColor = blendedColor === 'transparent' ? '' : blendedColor;
    }
}

/* TIMELINE & FRAME MANAGEMENT */
function loadFrame(index) {
    currentFrameIndex = index;
    layers = frames[currentFrameIndex].layers;
    
    // Ensure activeLayerId is still valid in new frame
    if (!layers.find(l => l.id === activeLayerId)) {
        activeLayerId = layers[0] ? layers[0].id : null;
    }
    
    rebuildLayerUI();
    if(activeLayerId) selectLayer(activeLayerId);
    
    renderComposition();
    renderOnionSkin();
    updateFrameUI();
}

function updateFrameUI() {
    const frameList = document.getElementById('frame-list');
    frameList.innerHTML = '';
    
    frames.forEach((frame, index) => {
        const item = document.createElement('div');
        item.classList.add('frame-item');
        if (index === currentFrameIndex) item.classList.add('active');
        item.textContent = index + 1;
        
        item.addEventListener('click', () => {
            if (isPlaying) togglePlay();
            loadFrame(index);
        });
        frameList.appendChild(item);
    });
}

function addNewFrame(duplicate = false) {
    let newLayers = [];
    if (duplicate) {
        // Deep copy current layers
        newLayers = layers.map(l => ({
            id: 'layer_' + (++layerCounter),
            name: l.name,
            visible: l.visible,
            data: [...l.data]
        }));
    } else {
        // Create blank layers matching current structure
        newLayers = layers.map(l => ({
            id: 'layer_' + (++layerCounter),
            name: l.name,
            visible: l.visible,
            data: Array(gridSize * gridSize).fill('transparent')
        }));
    }
    
    frames.splice(currentFrameIndex + 1, 0, { layers: newLayers });
    loadFrame(currentFrameIndex + 1);
}

function deleteFrame() {
    if (frames.length <= 1) {
        alert("You must have at least one frame!");
        return;
    }
    frames.splice(currentFrameIndex, 1);
    const nextIndex = Math.min(currentFrameIndex, frames.length - 1);
    loadFrame(nextIndex);
}

function togglePlay() {
    const btnPlay = document.getElementById('btn-play');
    isPlaying = !isPlaying;
    
    if (isPlaying) {
        btnPlay.textContent = "⏸️ Pause";
        btnPlay.style.backgroundColor = "var(--highlight)";
        btnPlay.style.color = "white";
        
        playbackInterval = setInterval(() => {
            let nextIndex = (currentFrameIndex + 1) % frames.length;
            loadFrame(nextIndex);
        }, 1000 / fps);
    } else {
        btnPlay.textContent = "▶️ Play";
        btnPlay.style.backgroundColor = "";
        btnPlay.style.color = "";
        clearInterval(playbackInterval);
    }
}

function addLayer(name = null) {
    const layerName = name || `Layer ${layers.length + 1}`;
    const newLayer = new Layer(layerName);
    layers.unshift(newLayer);
    
    rebuildLayerUI();
    if(pixels.length > 0) renderComposition();
    selectLayer(newLayer.id);
}

function deleteActiveLayer() {
    if (layers.length <= 1) {
        alert("You must have at least one layer!");
        return;
    }
    const index = layers.findIndex(l => l.id === activeLayerId);
    if (index !== -1) {
        layers.splice(index, 1);
        const nextActive = layers[index] ? layers[index].id : layers[layers.length - 1].id;
        rebuildLayerUI();
        selectLayer(nextActive);
        renderComposition();
    }
}

function selectLayer(id) {
    activeLayerId = id;
    document.querySelectorAll('.layer-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === id);
    });
}

function toggleLayerVisibility(id, event) {
    event.stopPropagation();
    const layer = layers.find(l => l.id === id);
    if (layer) {
        layer.visible = !layer.visible;
        event.target.textContent = layer.visible ? "👁️" : "❌";
        renderComposition();
    }
}

function rebuildLayerUI() {
    layerListContainer.innerHTML = '';
    layers.forEach(layer => {
        const item = document.createElement('div');
        item.classList.add('layer-item');
        item.dataset.id = layer.id;
        if (layer.id === activeLayerId) item.classList.add('active');
        
        item.addEventListener('click', () => selectLayer(layer.id));
        
        const leftWrap = document.createElement('div');
        leftWrap.classList.add('layer-item-left');
        
        const visBtn = document.createElement('button');
        visBtn.classList.add('layer-visibility-btn');
        visBtn.textContent = layer.visible ? "👁️" : "❌";
        visBtn.addEventListener('click', (e) => toggleLayerVisibility(layer.id, e));
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = layer.name;
        
        leftWrap.appendChild(visBtn);
        leftWrap.appendChild(nameSpan);
        item.appendChild(leftWrap);
        
        layerListContainer.appendChild(item);
    });
}

/* DEEP UNDO / REDO CONTROLS */
function captureState() {
    return JSON.stringify(layers.map(l => ({ id: l.id, data: [...l.data] })));
}

function applyState(snapshotString) {
    const parsed = JSON.parse(snapshotString);
    parsed.forEach(savedLayer => {
        const target = layers.find(l => l.id === savedLayer.id);
        if (target) target.data = savedLayer.data;
    });
    renderComposition();
}

function undo() {
    if (undoStack.length > 0) {
        redoStack.push(captureState());
        const previousState = undoStack.pop();
        applyState(previousState);
    }
}

function redo() {
    if (redoStack.length > 0) {
        undoStack.push(captureState());
        const nextState = redoStack.pop();
        applyState(nextState);
    }
}

/* DRAW ENGINE RUNTIME INTERACTION HANDLERS */
function startDrawing(e) {
    if (!e.target.classList.contains('pixel')) return;
    if (e.preventDefault) e.preventDefault(); 

    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (!activeLayer || !activeLayer.visible) return; 

    const index = parseInt(e.target.dataset.index);
    startX = index % gridSize;
    startY = Math.floor(index / gridSize);
    
    lastX = startX;
    lastY = startY;

    // Handle initial selection tracking setup
    if (currentTool === 'select') {
        isDrawing = true;
        selection = { startX: startX, startY: startY, endX: startX, endY: startY };
        updateMarquee();
        return; 
    }

    // Wipe previous selection bounds if using regular brushes
    if (selection) {
        selection = null;
        updateMarquee();
    }

    undoStack.push(captureState());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = []; 

    isDrawing = true;
    snapshotState = [...activeLayer.data]; 
    applyTool(index);
}

function draw(e) {
    if (isDrawing && e.target.classList.contains('pixel')) {
        const index = parseInt(e.target.dataset.index);
        
        if (currentTool === 'select') {
            selection.endX = index % gridSize;
            selection.endY = Math.floor(index / gridSize);
            updateMarquee();
            return;
        }

        applyTool(index);
    }
}

function stopDrawing() { 
    isDrawing = false; 
    lastX = -1;
    lastY = -1;
}

window.addEventListener('mouseup', stopDrawing);

// Touch support implementations
window.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('pixel')) {
        startDrawing({ target: target, preventDefault: () => e.preventDefault() });
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('pixel')) {
        const index = parseInt(target.dataset.index);
        if (currentTool === 'select') {
            selection.endX = index % gridSize;
            selection.endY = Math.floor(index / gridSize);
            updateMarquee();
        } else {
            applyTool(index);
        }
    }
}, { passive: false });

window.addEventListener('touchend', stopDrawing);

function applyTool(index) {
    const currentX = index % gridSize;
    const currentY = Math.floor(index / gridSize);
    const activeLayer = layers.find(l => l.id === activeLayerId);

    if (currentTool === 'pencil' || currentTool === 'eraser') {
        const targetColor = (currentTool === 'pencil') ? currentColor : 'transparent';
        
        if (lastX !== -1 && lastY !== -1) {
            drawLine(lastX, lastY, currentX, currentY, targetColor, activeLayer);
        } else {
            drawBrush(currentX, currentY, targetColor, activeLayer);
        }
        
        lastX = currentX;
        lastY = currentY;
    } 
    else if (currentTool === 'bucket') {
        floodFill(index, currentColor, activeLayer);
    } 
    else if (currentTool === 'line' || currentTool === 'rect' || currentTool === 'oval') {
        activeLayer.data = [...snapshotState]; 
        if (currentTool === 'line') drawLine(startX, startY, currentX, currentY, currentColor, activeLayer);
        if (currentTool === 'rect') drawRectangle(startX, startY, currentX, currentY, currentColor, activeLayer);
        if (currentTool === 'oval') drawOval(startX, startY, currentX, currentY, currentColor, activeLayer);
    }
    
    renderComposition();
}

function updateMarquee() {
    if (!selection) {
        marquee.classList.remove('active');
        return;
    }
    
    marquee.classList.add('active');
    const left = Math.min(selection.startX, selection.endX);
    const top = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.startX - selection.endX) + 1;
    const height = Math.abs(selection.startY - selection.endY) + 1;

    const pixelSize = canvas.clientWidth / gridSize;
    marquee.style.left = `${left * pixelSize}px`;
    marquee.style.top = `${top * pixelSize}px`;
    marquee.style.width = `${width * pixelSize}px`;
    marquee.style.height = `${height * pixelSize}px`;
}

function drawBrush(cx, cy, color, layer) {
    const size = brushSize;
    const offsetStart = Math.floor((size - 1) / 2);

    for (let yOffset = 0; yOffset < size; yOffset++) {
        for (let xOffset = 0; xOffset < size; xOffset++) {
            const targetX = cx + xOffset - offsetStart;
            const targetY = cy + yOffset - offsetStart;
            
            if (targetX >= 0 && targetX < gridSize && targetY >= 0 && targetY < gridSize) {
                const pixelIndex = targetY * gridSize + targetX;
                layer.data[pixelIndex] = color;
            }
        }
    }
}

// Drawing Algorithms
function drawLine(x0, y0, x1, y1, color, layer) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = (x0 < x1) ? 1 : -1, sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;
    while (true) {
        drawBrush(x0, y0, color, layer);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

function drawRectangle(x0, y0, x1, y1, color, layer) {
    const left = Math.min(x0, x1), right = Math.max(x0, x1);
    const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
    for (let x = left; x <= right; x++) { drawBrush(x, top, color, layer); drawBrush(x, bottom, color, layer); }
    for (let y = top; y <= bottom; y++) { drawBrush(left, y, color, layer); drawBrush(right, y, color, layer); }
}

function drawOval(x0, y0, x1, y1, color, layer) {
    const left = Math.min(x0, x1), right = Math.max(x0, x1);
    const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
    const rx = (right - left) / 2, ry = (bottom - top) / 2;
    const xc = left + rx, yc = top + ry;
    if (rx <= 0 || ry <= 0) { drawBrush(x0, y0, color, layer); return; }
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const dx = x - xc, dy = y - yc;
            const val = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
            if (val <= 1.1 && val >= 0.5) {
                if ((x === left || x === right || y === top || y === bottom) || val > 0.75) drawBrush(x, y, color, layer);
            }
        }
    }
}

function floodFill(startIndex, targetColor, layer) {
    const startColor = layer.data[startIndex];
    
    let standardizedTargetColor = targetColor;
    if (targetColor !== 'transparent') {
        const tempDiv = document.createElement('div');
        tempDiv.style.backgroundColor = targetColor;
        document.body.appendChild(tempDiv);
        standardizedTargetColor = window.getComputedStyle(tempDiv).backgroundColor;
        document.body.removeChild(tempDiv);
    }

    if (startColor === standardizedTargetColor) return;
    const queue = [startIndex], visited = new Set([startIndex]);

    while (queue.length > 0) {
        const currentIndex = queue.shift();
        layer.data[currentIndex] = targetColor;
        const x = currentIndex % gridSize, y = Math.floor(currentIndex / gridSize);
        const neighbors = [
            { nx: x, ny: y - 1, idx: currentIndex - gridSize }, { nx: x, ny: y + 1, idx: currentIndex + gridSize }, 
            { nx: x - 1, ny: y, idx: currentIndex - 1 }, { nx: x + 1, ny: y, idx: currentIndex + 1 }
        ];
        for (let { nx, ny, idx } of neighbors) {
            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                if (!visited.has(idx)) {
                    if (layer.data[idx] === startColor) {
                        queue.push(idx); visited.add(idx);
                    }
                }
            }
        }
    }
}

/* HARDWARE FX RENDERING PREVIEWS */
function updateFiltersPreview() {
    vBrightness.textContent = sBrightness.value + '%';
    vContrast.textContent = sContrast.value + '%';
    vSaturation.textContent = sSaturation.value + '%';
    vVibrance.textContent = (sVibrance.value > 0 ? '+' : '') + sVibrance.value + '%';

    const simulatedSaturation = Math.max(0, parseInt(sSaturation.value) + (parseInt(sVibrance.value) * 1.2));
    canvas.style.filter = `brightness(${sBrightness.value}%) contrast(${sContrast.value}%) saturate(${simulatedSaturation}%)`;
}

function resetSliders() {
    sBrightness.value = 100;
    sContrast.value = 100;
    sSaturation.value = 100;
    sVibrance.value = 0;
    updateFiltersPreview();
}

function applyFiltersPermanently() {
    const activeLayer = layers.find(l => l.id === activeLayerId);
    if(!activeLayer) return;

    undoStack.push(captureState());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = gridSize;
    tempCanvas.height = gridSize;
    const ctx = tempCanvas.getContext('2d');

    activeLayer.data.forEach((color, index) => {
        if (color && color !== 'transparent') {
            ctx.fillStyle = color;
            ctx.fillRect(index % gridSize, Math.floor(index / gridSize), 1, 1);
        }
    });

    const imgData = ctx.getImageData(0, 0, gridSize, gridSize);
    const data = imgData.data;

    const b = parseInt(sBrightness.value) / 100;
    const c = parseInt(sContrast.value) / 100;
    const s = parseInt(sSaturation.value) / 100;
    const v = parseInt(sVibrance.value) / 100; 

    for (let i = 0; i < data.length; i += 4) {
        if (data[i+3] === 0) continue; 

        let r = data[i];
        let g = data[i+1];
        let bl = data[i+2];

        r *= b; g *= b; bl *= b;
        r = ((r / 255 - 0.5) * c + 0.5) * 255;
        g = ((g / 255 - 0.5) * c + 0.5) * 255;
        bl = ((bl / 255 - 0.5) * c + 0.5) * 255;

        const luma = 0.299 * r + 0.587 * g + 0.114 * bl;
        const maxColor = Math.max(r, g, bl);
        const amt = (maxColor - luma) / 255;
        const vibranceFactor = v * (1.0 - amt) * 1.5; 
        const totalSaturation = s + vibranceFactor;

        r = luma + (r - luma) * totalSaturation;
        g = luma + (g - luma) * totalSaturation;
        bl = luma + (bl - luma) * totalSaturation;

        data[i] = Math.min(255, Math.max(0, r));
        data[i+1] = Math.min(255, Math.max(0, g));
        data[i+2] = Math.min(255, Math.max(0, bl));
    }

    for (let index = 0; index < gridSize * gridSize; index++) {
        const dataIndex = index * 4;
        if (data[dataIndex + 3] > 0) {
            activeLayer.data[index] = `rgb(${Math.round(data[dataIndex])}, ${Math.round(data[dataIndex+1])}, ${Math.round(data[dataIndex+2])})`;
        } else {
            activeLayer.data[index] = 'transparent';
        }
    }

    resetSliders(); 
    renderComposition();
    alert(`Filters baked permanently into data fields for: ${activeLayer.name}!`);
}

function toggleGrid() {
    showGrid = !showGrid;
    const gridBtn = document.getElementById('btn-toggle-grid');
    if (showGrid) {
        canvas.classList.remove('hide-grid');
        gridBtn.textContent = '🌐 Hide Grid';
    } else {
        canvas.classList.add('hide-grid');
        gridBtn.textContent = '🌐 Show Grid';
    }
}

function setTool(toolName, activeBtn) {
    currentTool = toolName;
    toolBtns.forEach(btn => btn.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');

    // Remove visible marquee states if switching to a non-selection framework
    if (selection && currentTool !== 'select') {
        selection = null;
        updateMarquee();
    }
}

function updateActiveSwatch(activeSwatch) {
    swatches.forEach(swatch => swatch.classList.remove('active'));
    if (activeSwatch) activeSwatch.classList.add('active');
}

function setupEventListeners() {
    workspaceWrapper.addEventListener('wheel', function(e) {
        e.preventDefault(); 
        if (e.deltaY < 0) { currentScale += 0.1; } else { currentScale -= 0.1; }
        currentScale = Math.min(Math.max(currentScale, minScale), maxScale);
        canvasContainer.style.transform = `scale(${currentScale})`;
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) { redo(); } else { undo(); } }
            if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
        } else {
            if (e.key.toLowerCase() === 'g') toggleGrid();
            
            // Delete key selection clear processing 
            if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
                const activeLayer = layers.find(l => l.id === activeLayerId);
                if (!activeLayer) return;

                undoStack.push(captureState());
                if (undoStack.length > MAX_HISTORY) undoStack.shift();
                redoStack = [];

                const left = Math.min(selection.startX, selection.endX);
                const top = Math.min(selection.startY, selection.endY);
                const right = Math.max(selection.startX, selection.endX);
                const bottom = Math.max(selection.startY, selection.endY);

                for (let y = top; y <= bottom; y++) {
                    for (let x = left; x <= right; x++) {
                        activeLayer.data[y * gridSize + x] = 'transparent';
                    }
                }
                renderComposition();
                selection = null;
                updateMarquee();
            }
        }
    });

    document.getElementById('btn-pencil').addEventListener('click', (e) => setTool('pencil', e.currentTarget));
    // Binding event interface link to the selection node
    const btnSelect = document.getElementById('btn-select');
    if (btnSelect) {
        btnSelect.addEventListener('click', (e) => setTool('select', e.currentTarget));
    }
    document.getElementById('btn-eraser').addEventListener('click', (e) => setTool('eraser', e.currentTarget));
    document.getElementById('btn-bucket').addEventListener('click', (e) => setTool('bucket', e.currentTarget));
    document.getElementById('btn-line').addEventListener('click', (e) => setTool('line', e.currentTarget));
    document.getElementById('btn-rect').addEventListener('click', (e) => setTool('rect', e.currentTarget));
    document.getElementById('btn-oval').addEventListener('click', (e) => setTool('oval', e.currentTarget));
    document.getElementById('btn-toggle-grid').addEventListener('click', toggleGrid);
    
    document.getElementById('btn-add-layer').addEventListener('click', () => addLayer());
    document.getElementById('btn-delete-layer').addEventListener('click', deleteActiveLayer);

    brushSizeSelector.addEventListener('change', (e) => brushSize = parseInt(e.target.value));

    sBrightness.addEventListener('input', updateFiltersPreview);
    sContrast.addEventListener('input', updateFiltersPreview);
    sSaturation.addEventListener('input', updateFiltersPreview);
    sVibrance.addEventListener('input', updateFiltersPreview);
    btnApplyFilters.addEventListener('click', applyFiltersPermanently);

    document.getElementById('btn-clear').addEventListener('click', () => {
        const activeLayer = layers.find(l => l.id === activeLayerId);
        if(activeLayer && confirm(`Clear current drawing content inside ${activeLayer.name}?`)) {
            undoStack.push(captureState()); 
            activeLayer.data.fill('transparent');
            renderComposition();
        }
    });

    colorPicker.addEventListener('input', (e) => {
        currentColor = e.target.value;
        setTool('pencil', document.getElementById('btn-pencil'));
        updateActiveSwatch(null);
    });

    swatches.forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            currentColor = e.target.style.backgroundColor; 
            setTool('pencil', document.getElementById('btn-pencil'));
            updateActiveSwatch(e.target);
        });
    });

    sizeSelector.addEventListener('change', (e) => {
        if(confirm('Changing canvas dimensions will clear all frames. Continue?')) {
            gridSize = parseInt(e.target.value);
            init();
        } else { e.target.value = gridSize; }
    });

    // Timeline Events
    document.getElementById('btn-add-frame').addEventListener('click', () => addNewFrame(false));
    document.getElementById('btn-dup-frame').addEventListener('click', () => addNewFrame(true));
    document.getElementById('btn-del-frame').addEventListener('click', deleteFrame);
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    
    document.getElementById('fps-input').addEventListener('change', (e) => {
        fps = Math.max(1, parseInt(e.target.value) || 8);
        if (isPlaying) { togglePlay(); togglePlay(); } 
    });

    document.getElementById('btn-onion').addEventListener('click', (e) => {
        onionSkinEnabled = !onionSkinEnabled;
        e.target.textContent = onionSkinEnabled ? "🧅 Onion: ON" : "🧅 Onion: OFF";
        e.target.style.backgroundColor = onionSkinEnabled ? "var(--highlight)" : "";
        e.target.style.color = onionSkinEnabled ? "white" : "";
        renderOnionSkin();
    });

    document.getElementById('btn-export').addEventListener('click', exportCurrentFrame);
    document.getElementById('btn-export-spritesheet').addEventListener('click', exportSpriteSheet);
}

/* EXPORTS */
function exportCurrentFrame() {
    const exportCanvas = document.getElementById('export-canvas');
    const ctx = exportCanvas.getContext('2d');
    exportCanvas.width = gridSize;
    exportCanvas.height = gridSize;
    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    const compositeLayers = [...layers].reverse();
    
    compositeLayers.forEach(layer => {
        if (!layer.visible) return; 
        
        layer.data.forEach((color, index) => {
            if (color && color !== 'transparent') {
                ctx.fillStyle = color;
                const x = index % gridSize;
                const y = Math.floor(index / gridSize);
                ctx.fillRect(x, y, 1, 1);
            }
        });
    });

    const link = document.createElement('a');
    link.download = `frame_${currentFrameIndex + 1}.png`;
    link.href = exportCanvas.toDataURL();
    link.click();
}

function exportSpriteSheet() {
    const exportCanvas = document.getElementById('export-canvas');
    const ctx = exportCanvas.getContext('2d');
    
    exportCanvas.width = gridSize * frames.length;
    exportCanvas.height = gridSize;
    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    frames.forEach((frame, fIndex) => {
        const compositeLayers = [...frame.layers].reverse();
        
        compositeLayers.forEach(layer => {
            if (!layer.visible) return; 
            
            layer.data.forEach((color, index) => {
                if (color && color !== 'transparent') {
                    ctx.fillStyle = color;
                    const x = (fIndex * gridSize) + (index % gridSize);
                    const y = Math.floor(index / gridSize);
                    ctx.fillRect(x, y, 1, 1);
                }
            });
        });
    });

    const link = document.createElement('a');
    link.download = `spritesheet_${frames.length}_frames.png`;
    link.href = exportCanvas.toDataURL();
    link.click();
}
