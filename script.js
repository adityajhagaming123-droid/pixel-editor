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

let gridSize = 32;
let currentColor = '#000000';
let currentTool = 'pencil'; 
let isDrawing = false;
let pixels = [];
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

let frames = [];
let currentFrameIndex = 0;
let layers = []; 
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

init();

function init() {
    frames = [];
    layerCounter = 0;
    layers = [];
    createGrid(gridSize);
    addLayer("Background");
    addLayer("Layer 1");
    frames.push({ layers: layers });
    currentFrameIndex = 0;
    selectLayer(layers[0].id);
    setupEventListeners();
    updateFrameUI();
}

function createGrid(size) {
    canvas.innerHTML = '';
    pixels = [];
    canvas.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    canvas.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    for (let i = 0; i < size * size; i++) {
        const pixel = document.createElement('div');
        pixel.classList.add('pixel');
        canvas.appendChild(pixel);
        pixels.push(pixel);
    }
}

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

function selectLayer(id) {
    activeLayerId = id;
    document.querySelectorAll('.layer-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === id);
    });
}

function addLayer(name = null) {
    const layerName = name || `Layer ${layers.length + 1}`;
    const newLayer = new Layer(layerName);
    layers.unshift(newLayer);
    rebuildLayerUI();
    renderComposition();
    selectLayer(newLayer.id);
}

function rebuildLayerUI() {
    layerListContainer.innerHTML = '';
    layers.forEach(layer => {
        const item = document.createElement('div');
        item.classList.add('layer-item');
        item.dataset.id = layer.id;
        if (layer.id === activeLayerId) item.classList.add('active');
        item.addEventListener('click', () => selectLayer(layer.id));
        item.innerHTML = `<div class="layer-item-left"><span>${layer.name}</span></div>`;
        layerListContainer.appendChild(item);
    });
}

function updateFrameUI() {
    const frameList = document.getElementById('frame-list');
    frameList.innerHTML = '';
    frames.forEach((frame, index) => {
        const item = document.createElement('div');
        item.classList.add('frame-item');
        if (index === currentFrameIndex) item.classList.add('active');
        item.textContent = index + 1;
        item.addEventListener('click', () => loadFrame(index));
        frameList.appendChild(item);
    });
}

function loadFrame(index) {
    currentFrameIndex = index;
    layers = frames[currentFrameIndex].layers;
    rebuildLayerUI();
    renderComposition();
    updateFrameUI();
}

function captureState() {
    return JSON.stringify(layers.map(l => ({ id: l.id, data: [...l.data] })));
}

// --- SELECTION ENGINE ---

function getPixelCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * gridSize);
    const y = Math.floor(((clientY - rect.top) / rect.height) * gridSize);
    return {
        x: Math.max(0, Math.min(gridSize - 1, x)),
        y: Math.max(0, Math.min(gridSize - 1, y))
    };
}

function updateMarquee() {
    if (!selection) {
        marquee.classList.remove('active');
        marquee.style.display = 'none';
        return;
    }
    marquee.style.display = 'block';
    marquee.classList.add('active');
    
    const x1 = Math.min(selection.startX, selection.endX);
    const y1 = Math.min(selection.startY, selection.endY);
    const x2 = Math.max(selection.startX, selection.endX);
    const y2 = Math.max(selection.startY, selection.endY);

    const pixelSize = canvas.offsetWidth / gridSize;
    marquee.style.left = `${x1 * pixelSize}px`;
    marquee.style.top = `${y1 * pixelSize}px`;
    marquee.style.width = `${(x2 - x1 + 1) * pixelSize}px`;
    marquee.style.height = `${(y2 - y1 + 1) * pixelSize}px`;
}

function handlePointerDown(clientX, clientY) {
    const coords = getPixelCoords(clientX, clientY);
    startX = coords.x;
    startY = coords.y;
    isDrawing = true;

    if (currentTool === 'select') {
        selection = { startX: startX, startY: startY, endX: startX, endY: startY };
        updateMarquee();
    } else {
        selection = null;
        updateMarquee();
        undoStack.push(captureState());
        const activeLayer = layers.find(l => l.id === activeLayerId);
        snapshotState = [...activeLayer.data];
        applyToolAtCoords(startX, startY);
    }
}

function handlePointerMove(clientX, clientY) {
    if (!isDrawing) return;
    const coords = getPixelCoords(clientX, clientY);
    
    if (currentTool === 'select') {
        selection.endX = coords.x;
        selection.endY = coords.y;
        updateMarquee();
    } else {
        applyToolAtCoords(coords.x, coords.y);
    }
}

function applyToolAtCoords(x, y) {
    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (!activeLayer) return;
    const index = y * gridSize + x;
    if (currentTool === 'pencil') activeLayer.data[index] = currentColor;
    if (currentTool === 'eraser') activeLayer.data[index] = 'transparent';
    renderComposition();
}

function setupEventListeners() {
    canvas.addEventListener('mousedown', (e) => handlePointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => isDrawing = false);

    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
            const activeLayer = layers.find(l => l.id === activeLayerId);
            const x1 = Math.min(selection.startX, selection.endX);
            const y1 = Math.min(selection.startY, selection.endY);
            const x2 = Math.max(selection.startX, selection.endX);
            const y2 = Math.max(selection.startY, selection.endY);

            undoStack.push(captureState());
            for (let i = y1; i <= y2; i++) {
                for (let j = x1; j <= x2; j++) {
                    activeLayer.data[i * gridSize + j] = 'transparent';
                }
            }
            renderComposition();
        }
    });

    document.getElementById('btn-pencil').addEventListener('click', () => currentTool = 'pencil');
    document.getElementById('btn-eraser').addEventListener('click', () => currentTool = 'eraser');
    document.getElementById('btn-select').addEventListener('click', () => currentTool = 'select');
}
