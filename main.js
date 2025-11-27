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

// SAVE / LOAD UI ELEMENTS
const saveLoadToggleEl = document.getElementById('save-load-toggle');
const saveLoadPanelEl = document.getElementById('save-load-panel');
const saveLoadCloseEl = document.getElementById('save-load-panel-close');
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
const slotSaveBtns = {
  1: document.getElementById('slot1-save'),
  2: document.getElementById('slot2-save'),
  3: document.getElementById('slot3-save')
};
const slotLoadBtns = {
  1: document.getElementById('slot1-load'),
  2: document.getElementById('slot2-load'),
  3: document.getElementById('slot3-load')
};

// INTRO / TITLE OVERLAY ELEMENTS
const overlayEl = document.getElementById('overlay');
const loadingScreenEl = document.getElementById('loading-screen');
const titleScreenEl = document.getElementById('title-screen');
const loadingFillEl = document.getElementById('loading-fill');

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
  const loadBtn = slotLoadBtns[slot];

  if (!statusEl || !metaEl || !loadBtn) return;

  if (!raw) {
    statusEl.textContent = 'empty';
    metaEl.textContent = 'no steps yet';
    loadBtn.disabled = true;
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
    loadBtn.disabled = false;
  } catch {
    statusEl.textContent = 'corrupt';
    metaEl.textContent = 'cannot load';
    loadBtn.disabled = true;
  }
}

function refreshAllSlotsUI() {
  [1, 2, 3].forEach(updateSlotUI);
}

function saveToSlot(slot) {
  try {
    const key = getSlotKey(slot);
    const data = serializeState();
    localStorage.setItem(key, JSON.stringify(data));
    updateSlotUI(slot);
  } catch (err) {
    console.error('Failed to save slot', slot, err);
  }
}

function loadFromSlot(slot) {
  try {
    const key = getSlotKey(slot);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    applyState(data);
  } catch (err) {
    console.error('Failed to load slot', slot, err);
  }
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
    // ensure title screen animation can play by forcing reflow then removing opacity override if any
    // (animation is defined in CSS)
  }
}, fakeLoadDuration + 300);

// start initial loading bar animation
updateLoadingBar();

// handle starting the dream (entering gameplay)
function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  if (overlayEl) {
    overlayEl.classList.add('hidden');
    overlayEl.addEventListener('transitionend', () => {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.style.display = 'none';
      }
    }, { once: true });
  }
}

// pointer / key to start from title
if (overlayEl) {
  overlayEl.addEventListener('pointerdown', (e) => {
    // ignore taps while still on loading screen
    if (!loadingDone) return;
    startGame();
  });
  window.addEventListener('keydown', (e) => {
    if (!loadingDone) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Return') {
      startGame();
    }
  });
}

// SAVE / LOAD UI INTERACTION
if (saveLoadToggleEl && saveLoadPanelEl) {
  saveLoadToggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = saveLoadPanelEl.classList.contains('visible');
    if (isVisible) {
      saveLoadPanelEl.classList.remove('visible');
    } else {
      refreshAllSlotsUI();
      saveLoadPanelEl.classList.add('visible');
    }
  });

  if (saveLoadCloseEl) {
    saveLoadCloseEl.addEventListener('click', (e) => {
      e.stopPropagation();
      saveLoadPanelEl.classList.remove('visible');
    });
  }

  // close panel when tapping outside it
  document.addEventListener('pointerdown', (e) => {
    if (!saveLoadPanelEl.classList.contains('visible')) return;
    if (
      e.target === saveLoadPanelEl ||
      saveLoadPanelEl.contains(e.target) ||
      e.target === saveLoadToggleEl
    ) {
      return;
    }
    saveLoadPanelEl.classList.remove('visible');
  });

  [1, 2, 3].forEach((slot) => {
    const saveBtn = slotSaveBtns[slot];
    const loadBtn = slotLoadBtns[slot];
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveToSlot(slot);
      });
    }
    if (loadBtn) {
      loadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadFromSlot(slot);
        // keep panel open so user can see they're loaded
      });
    }
  });

  // init slot UI from existing localStorage
  refreshAllSlotsUI();
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
  }

  updateWorld(world, camera, dt);

  const { threatLevel, whisper } = updateEntities(entities, camera, dt, focus);
  updateFocus(dt, threatLevel);
  updateWhisper(dt, whisper);
  audio.update(threatLevel, focus);

  renderer.render(scene, camera);
}

animate();

