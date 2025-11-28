import * as THREE from 'three';
import { createControls } from './controls.js';
import { createWorld, updateWorld } from './world.js';
import { createEntitySystem, updateEntities } from './entity.js';
import { createAudioSystem } from './audio.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = false;
// HDR-style tonemapping and color
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.physicallyCorrectLights = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 80);
scene.add(camera);

const clock = new THREE.Clock();

// world & systems
const world = createWorld(scene, camera);
const controls = createControls(camera, renderer.domElement);
const entities = createEntitySystem(scene, camera);
const audio = createAudioSystem();

// flashlight attached to the camera
const flashlight = new THREE.SpotLight(0xfffbe6, 2.4, 18, Math.PI / 7, 0.4, 1.3);
flashlight.position.set(0, 0, 0);
flashlight.castShadow = false;
camera.add(flashlight);
const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, 0, -1);
camera.add(flashlightTarget);
flashlight.target = flashlightTarget;
let flashlightOn = true;
flashlight.visible = flashlightOn;

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'f') {
    flashlightOn = !flashlightOn;
    flashlight.visible = flashlightOn;
  }
});

window.addEventListener('pointerdown', (e) => {
  // on touch devices, tap near the top-right corner to toggle flashlight
  if (window.innerWidth <= 900) {
    const xNorm = e.clientX / window.innerWidth;
    const yNorm = e.clientY / window.innerHeight;
    if (xNorm > 0.7 && yNorm < 0.3) {
      flashlightOn = !flashlightOn;
      flashlight.visible = flashlightOn;
    }
  }
});

const focusFill = document.getElementById('focus-fill');
const whisperEl = document.getElementById('whisper');
const statsStepsEl = document.getElementById('stats-steps');
const statsMilesEl = document.getElementById('stats-miles');

// TITLE / SAVE SLOT UI ELEMENTS
const overlayEl = document.getElementById('overlay');
const loadingScreenEl = document.getElementById('loading-screen');
const titleScreenEl = document.getElementById('title-screen');
const loadingFillEl = document.getElementById('loading-fill');
const btnContinueEl = document.getElementById('btn-continue');
const btnNewGameEl = document.getElementById('btn-new-game');

const slotStatusEls = {
  1: document.getElementById('slot1-status'),
  2: document.getElementById('slot2-status'),
  3: document.getElementById('slot3-status')
};
const slotMetaEls = {
  1: document.getElementById('slot1-meta'),
  2: document.getElementById('slot2-meta'),
  3: document.getElementById('slot3-meta')
};
const slotContinueBtns = {
  1: document.getElementById('slot1-continue'),
  2: document.getElementById('slot2-continue'),
  3: document.getElementById('slot3-continue')
};
const slotNewBtns = {
  1: document.getElementById('slot1-new'),
  2: document.getElementById('slot2-new'),
  3: document.getElementById('slot3-new')
};

let focus = 1;              // 0..1 – Jafet’s mental resistance
let whisperTimer = 0;

// FPS-style head bobbing
let baseEyeHeight = camera.position.y || 1.6;
let bobTime = 0;
let bobOffset = 0;

// intro / title state
let gameStarted = false;
let loadingDone = false;

// tracking distance for steps / miles
const lastPos = new THREE.Vector3().copy(camera.position);
let totalDistanceMeters = 0;

// SAVE / LOAD HELPERS
const SAVE_KEY_PREFIX = 'endless_dream_slot_';
const LAST_SLOT_KEY = 'endless_dream_last_slot';
let currentSlot = null;
let autosaveTimer = 0;

function getSlotKey(slot) {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

function serializeState() {
  return {
    camera: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      rotX: camera.rotation.x,
      rotY: camera.rotation.y,
      rotZ: camera.rotation.z
    },
    flashlightOn,
    totalDistanceMeters,
    timestamp: Date.now()
  };
}

function applyState(state) {
  if (!state || !state.camera) return;
  camera.position.set(state.camera.x, state.camera.y, state.camera.z);
  camera.rotation.set(state.camera.rotX, state.camera.rotY, state.camera.rotZ);
  flashlightOn = !!state.flashlightOn;
  flashlight.visible = flashlightOn;
  totalDistanceMeters = state.totalDistanceMeters || 0;
  lastPos.set(camera.position.x, camera.position.y, camera.position.z);
  updateStatsDisplay();
}

function resetGameState() {
  // reset player to starting position/orientation and stats
  camera.position.set(0, 1.6, 0);
  camera.rotation.set(0, 0, 0);
  baseEyeHeight = 1.6;
  bobTime = 0;
  bobOffset = 0;
  focus = 1;
  focusFill.style.transform = 'scaleX(1)';
  totalDistanceMeters = 0;
  lastPos.set(camera.position.x, camera.position.y, camera.position.z);
  updateStatsDisplay();
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function updateSlotUI(slot) {
  const key = getSlotKey(slot);
  const raw = localStorage.getItem(key);
  const statusEl = slotStatusEls[slot];
  const metaEl = slotMetaEls[slot];
  const contBtn = slotContinueBtns[slot];

  if (!statusEl || !metaEl || !contBtn) return;

  if (!raw) {
    statusEl.textContent = 'empty';
    metaEl.textContent = 'no steps yet';
    contBtn.disabled = true;
    return;
  }
  try {
    const data = JSON.parse(raw);
    const dist = data.totalDistanceMeters || 0;
    const miles = dist * 0.000621371;
    const stepLengthMeters = 0.8;
    const steps = dist / stepLengthMeters;
    statusEl.textContent = `saved · ${formatTimestamp(data.timestamp)}`;
    metaEl.textContent = `${Math.floor(steps)} steps · ${miles.toFixed(2)} miles`;
    contBtn.disabled = false;
  } catch {
    statusEl.textContent = 'corrupt';
    metaEl.textContent = 'cannot load';
    contBtn.disabled = true;
  }
}

function refreshAllSlotsUI() {
  [1, 2, 3].forEach(updateSlotUI);
}

function saveToSlot(slot) {
  if (!slot) return;
  try {
    const key = getSlotKey(slot);
    const data = serializeState();
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(LAST_SLOT_KEY, String(slot));
    updateSlotUI(slot);
  } catch (err) {
    console.error('Failed to save slot', slot, err);
  }
}

function loadFromSlot(slot) {
  try {
    const key = getSlotKey(slot);
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const data = JSON.parse(raw);
    applyState(data);
    localStorage.setItem(LAST_SLOT_KEY, String(slot));
    return true;
  } catch (err) {
    console.error('Failed to load slot', slot, err);
    return false;
  }
}

function autoSelectAndLoadSlotIfPossible() {
  // try last used slot, then any non-empty slot, otherwise slot 1 as fresh
  let preferred = parseInt(localStorage.getItem(LAST_SLOT_KEY) || '1', 10);
  if (Number.isNaN(preferred) || preferred < 1 || preferred > 3) preferred = 1;

  let selected = preferred;
  if (!localStorage.getItem(getSlotKey(preferred))) {
    for (let s = 1; s <= 3; s++) {
      if (localStorage.getItem(getSlotKey(s))) {
        selected = s;
        break;
      }
    }
  }

  currentSlot = selected;
  const hasSave = !!localStorage.getItem(getSlotKey(selected));
  if (hasSave) {
    loadFromSlot(selected);
  } else {
    resetGameState();
  }
  localStorage.setItem(LAST_SLOT_KEY, String(selected));
}

// fake-progress loading bar for dreamy intro
let fakeLoadStart = performance.now();
let fakeLoadDuration = 2600;

function updateLoadingBar() {
  if (!loadingScreenEl || !loadingFillEl || loadingDone) return;
  const t = performance.now() - fakeLoadStart;
  const p = Math.max(0, Math.min(1, t / fakeLoadDuration));
  loadingFillEl.style.transform = `scaleX(${0.1 + p * 0.9})`;
  if (!loadingDone) {
    requestAnimationFrame(updateLoadingBar);
  }
}

// transition from loading -> title
setTimeout(() => {
  loadingDone = true;
  if (loadingScreenEl && titleScreenEl) {
    loadingScreenEl.style.display = 'none';
    titleScreenEl.style.display = 'flex';
  }
  refreshAllSlotsUI();
  // update quick-continue availability
  const lastSlot = parseInt(localStorage.getItem(LAST_SLOT_KEY) || '0', 10);
  let hasAnySave = false;
  for (let s = 1; s <= 3; s++) {
    if (localStorage.getItem(getSlotKey(s))) {
      hasAnySave = true;
      break;
    }
  }
  if (btnContinueEl) btnContinueEl.disabled = !hasAnySave;
}, fakeLoadDuration + 300);

// start initial loading bar animation
updateLoadingBar();

// handle starting the dream (entering gameplay)
function startGame() {
  if (gameStarted) return;

  // if no slot chosen yet, auto-select and load / start fresh
  if (!currentSlot) {
    autoSelectAndLoadSlotIfPossible();
  }

  gameStarted = true;
  autosaveTimer = 0;

  if (overlayEl) {
    overlayEl.classList.add('hidden');
    overlayEl.addEventListener('transitionend', () => {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.style.display = 'none';
      }
    }, { once: true });
  }
}

// TITLE BUTTON INTERACTIONS
if (btnContinueEl) {
  btnContinueEl.addEventListener('click', () => {
    // try last slot, then any
    autoSelectAndLoadSlotIfPossible();
    startGame();
  });
}

if (btnNewGameEl) {
  btnNewGameEl.addEventListener('click', () => {
    // new game in last-used slot or slot 1
    let slot = parseInt(localStorage.getItem(LAST_SLOT_KEY) || '1', 10);
    if (Number.isNaN(slot) || slot < 1 || slot > 3) slot = 1;
    currentSlot = slot;
    resetGameState();
    localStorage.setItem(LAST_SLOT_KEY, String(slot));
    startGame();
  });
}

// per-slot buttons
[1, 2, 3].forEach((slot) => {
  const contBtn = slotContinueBtns[slot];
  const newBtn = slotNewBtns[slot];

  if (contBtn) {
    contBtn.addEventListener('click', () => {
      currentSlot = slot;
      loadFromSlot(slot);
      startGame();
    });
  }
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      currentSlot = slot;
      resetGameState();
      localStorage.setItem(LAST_SLOT_KEY, String(slot));
      startGame();
    });
  }
});

// pointer / key to start from title with auto-load if user taps background
if (overlayEl) {
  overlayEl.addEventListener('pointerdown', (e) => {
    if (!loadingDone) return;
    const target = e.target;
    // if tap is on a button or inside slot panel, ignore (those have their own handlers)
    if (target.closest && target.closest('button')) return;
    if (target.closest && target.closest('#title-slots')) return;
    startGame();
  });
  window.addEventListener('keydown', (e) => {
    if (!loadingDone) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Return') {
      startGame();
    }
  });
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function updateFocus(dt, threat) {
  const drain = 0.003 + threat * 0.03;
  const regen = 0.008;
  if (threat > 0.1) {
    focus = Math.max(0, focus - drain * dt * 60);
  } else {
    focus = Math.min(1, focus + regen * dt * 60);
  }
  focusFill.style.transform = `scaleX(${focus.toFixed(3)})`;
  if (focus < 0.25) {
    focusFill.style.background = 'linear-gradient(90deg,#ff3b5b,#ffb36b)';
  } else {
    focusFill.style.background = 'linear-gradient(90deg,#38d996,#f6d86b)';
  }
}

function updateWhisper(dt, text) {
  whisperTimer -= dt;
  if (text) {
    whisperEl.textContent = text;
    whisperTimer = 2.2;
    whisperEl.style.opacity = '1';
  } else if (whisperTimer <= 0) {
    whisperEl.style.opacity = parseFloat(getComputedStyle(whisperEl).opacity || '1') > 0
      ? '0'
      : '0';
    if (whisperTimer < -2) whisperEl.textContent = '';
  }
}

function updateHeadBob(dt, moveInfo) {
  const intensity = moveInfo?.moveIntensity || 0;
  const sprinting = !!(moveInfo && moveInfo.isSprinting);

  if (intensity > 0.001) {
    const freq = sprinting ? 3.2 : 2.1;
    bobTime += dt * freq;
    const amp = sprinting ? 0.055 : 0.035;
    bobOffset = Math.sin(bobTime * Math.PI * 2) * amp * intensity;
  } else {
    // dampen bob when stopping
    bobOffset *= 0.88;
  }

  camera.position.y = baseEyeHeight + bobOffset;
}

function updateStatsDisplay() {
  const stepLengthMeters = 0.8; // average step length
  const steps = totalDistanceMeters / stepLengthMeters;
  const miles = totalDistanceMeters * 0.000621371;

  if (statsStepsEl) statsStepsEl.textContent = `steps: ${Math.floor(steps)}`;
  if (statsMilesEl) statsMilesEl.textContent = `miles: ${miles.toFixed(2)}`;
}

// ensure stats are consistent on first frame
updateStatsDisplay();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  const moveInfo = gameStarted ? controls.update(dt) : { moveIntensity: 0, isSprinting: false };
  if (gameStarted) {
    updateHeadBob(dt, moveInfo);

    // update distance walked (horizontal distance only)
    const dx = camera.position.x - lastPos.x;
    const dz = camera.position.z - lastPos.z;
    const frameDist = Math.hypot(dx, dz);
    if (frameDist > 0) {
      totalDistanceMeters += frameDist;
      lastPos.set(camera.position.x, camera.position.y, camera.position.z);

      updateStatsDisplay();
    }

    // autosave every 30 seconds into the active slot
    if (currentSlot) {
      autosaveTimer += dt;
      if (autosaveTimer >= 30) {
        autosaveTimer = 0;
        saveToSlot(currentSlot);
      }
    }
  }

  updateWorld(world, camera, dt);

  const { threatLevel, whisper } = updateEntities(entities, camera, dt, focus);
  updateFocus(dt, threatLevel);
  updateWhisper(dt, whisper);
  audio.update(threatLevel, focus);

  renderer.render(scene, camera);
}

animate();

