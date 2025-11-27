import * as THREE from 'three';

export function createEntitySystem(scene, camera) {
  const group = new THREE.Group();
  scene.add(group);

  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1b2b });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);

  const holder = new THREE.Group();
  holder.add(leftEye);
  holder.add(rightEye);
  leftEye.position.set(-0.08, 0, 0);
  rightEye.position.set(0.08, 0, 0);

  group.add(holder);

  let active = false;
  let timer = 0;
  let cooldown = 0;
  let lastWhisper = '';

  function hide() {
    group.visible = false;
    active = false;
    timer = 0;
  }

  hide();

  return { group, holder, leftEye, rightEye, camera, active, timer, cooldown, lastWhisper };
}

export function updateEntities(state, camera, dt, focus) {
  let { group } = state;
  state.cooldown -= dt;
  state.timer -= dt;

  let threatLevel = 0;
  let whisper = '';

  if (!state.active && state.cooldown <= 0) {
    const chance = 0.02 + (1 - focus) * 0.12;
    if (Math.random() < chance * dt * 60) {
      state.active = true;
      state.timer = 3 + Math.random() * 3;
      state.cooldown = 10 + Math.random() * 15;

      const radius = 5 + Math.random() * 10;
      const side = Math.random() < 0.5 ? -1 : 1;
      const angleOffset = side * (0.9 + Math.random() * 0.4);
      const yaw = camera.rotation.y + angleOffset;

      group.position.set(
        camera.position.x + Math.sin(yaw) * radius,
        camera.position.y + (Math.random() * 0.5 - 0.2),
        camera.position.z + Math.cos(yaw) * radius
      );

      group.visible = true;
      state.lastWhisper = pickWhisper();
      whisper = state.lastWhisper;
    }
  }

  if (state.active) {
    // look at camera
    group.lookAt(camera.position.x, camera.position.y, camera.position.z);

    const dist = group.position.distanceTo(camera.position);
    threatLevel = THREE.MathUtils.clamp(1 - dist / 16, 0, 1);

    if (state.timer <= 0 || dist < 1.2) {
      hideEntity(state);
    }
  }

  return { threatLevel, whisper };
}

function hideEntity(state) {
  state.group.visible = false;
  state.active = false;
  state.timer = 0;
}

function pickWhisper() {
  const lines = [
    'he left you here',
    'wake up if you can',
    'the trees remember you',
    'he likes it when you run',
    'this is the third night',
    'you have never left'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}