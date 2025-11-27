import * as THREE from 'three';

export function createWorld(scene, camera) {
  // slightly brighter night sky
  scene.background = new THREE.Color(0x070a12);
  scene.fog = new THREE.FogExp2(0x070a12, 0.035);

  // dim sky glow, a bit stronger for visibility
  const hemi = new THREE.HemisphereLight(0x7c8498, 0x040308, 0.6);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xcfd4ff, 0.35);
  moon.position.set(-8, 18, -6);
  scene.add(moon);

  // load night-sky cube map for skybox
  const cubeLoader = new THREE.CubeTextureLoader();
  cubeLoader.setPath('https://threejs.org/examples/textures/cube/MilkyWay/');
  cubeLoader.load(
    ['dark-s_px.jpg', 'dark-s_nx.jpg', 'dark-s_py.jpg', 'dark-s_ny.jpg', 'dark-s_pz.jpg', 'dark-s_nz.jpg'],
    (texture) => {
      texture.encoding = THREE.sRGBEncoding;
      scene.background = texture;
    }
  );

  // ground: infinite-style tiling grid that follows the camera
  const tileSize = 80;
  const gridSize = 3; // 3x3 tiles around the player
  const halfGrid = Math.floor(gridSize / 2);

  const groundGeo = new THREE.PlaneGeometry(tileSize, tileSize, 1, 1);

  // NEW: grass texture for ground tiles
  const textureLoader = new THREE.TextureLoader();
  const groundTexture = textureLoader.load(
    'https://threejs.org/examples/textures/terrain/grasslight-big.jpg'
  );
  groundTexture.wrapS = THREE.RepeatWrapping;
  groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(6, 6);
  groundTexture.anisotropy = 8;
  groundTexture.encoding = THREE.sRGBEncoding;

  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0
  });

  const grounds = [];
  for (let gx = -halfGrid; gx <= halfGrid; gx++) {
    for (let gz = -halfGrid; gz <= halfGrid; gz++) {
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = false;
      ground.position.set(gx * tileSize, 0, gz * tileSize);
      scene.add(ground);
      grounds.push(ground);
    }
  }

  // trees in an infinite-ish ring around the player
  const treeCount = 260;
  const trees = [];

  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.21, 3.2, 7);
  const crownGeo = new THREE.ConeGeometry(0.9, 3.7, 7);

  // NEW: textured materials for tree trunk (bark) and crown (leafy/grass-like)
  const trunkTexture = textureLoader.load(
    'https://threejs.org/examples/textures/tree/bark.jpg'
  );
  trunkTexture.wrapS = THREE.RepeatWrapping;
  trunkTexture.wrapT = THREE.RepeatWrapping;
  trunkTexture.repeat.set(1.5, 1.5);
  trunkTexture.anisotropy = 8;
  trunkTexture.encoding = THREE.sRGBEncoding;

  const trunkMat = new THREE.MeshStandardMaterial({
    map: trunkTexture,
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.05
  });

  // FIX: use a solid grass-like material for the tree crowns instead of the broken leaf texture
  const crownMat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    color: 0x9bbf7a,
    roughness: 0.98,
    metalness: 0.0,
    flatShading: true
  });

  for (let i = 0; i < treeCount; i++) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    const crown = new THREE.Mesh(crownGeo, crownMat);

    crown.position.y = 3.2 / 2 + 3.7 / 2 - 0.2;
    const tree = new THREE.Group();
    tree.add(trunk);
    tree.add(crown);

    // base vertical position for animation
    tree.userData.baseY = 1.6;
    tree.position.y = tree.userData.baseY;

    randomizeTreePosition(tree, camera.position.x, camera.position.z, i);
    // initial trees start fully grown; recycled ones will animate in
    tree.userData.spawnTime = -1000;
    tree.scale.set(1, 1, 1);

    trees.push(tree);
    scene.add(tree);
  }

  // replace volumetric-style clouds with a star field
  const stars = new THREE.Points(
    createStarGeometry(),
    new THREE.PointsMaterial({
      color: 0xf5f7ff,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    })
  );
  stars.position.set(0, 0, 0);
  scene.add(stars);

  camera.position.set(0, 1.6, 0);

  return {
    grounds,
    trees,
    fog: scene.fog,
    background: scene.background,
    stars,
    tileSize,
    gridSize,
    noiseOffset: new THREE.Vector2(Math.random() * 1000, Math.random() * 1000),
    internalTime: 0 // used for dreamy tree animations
  };
}

function randomizeTreePosition(tree, cx, cz, seed = Math.random() * 1000) {
  const minRadius = 6;
  const maxRadius = 36;

  // use a slightly more even angular spread
  const angle = Math.random() * Math.PI * 2;
  const r = minRadius + (maxRadius - minRadius) * (0.4 + 0.6 * Math.random());

  tree.position.x = cx + Math.cos(angle) * r;
  tree.position.z = cz + Math.sin(angle) * r;

  const sway = (Math.sin(seed) - 0.5) * 0.3;
  tree.rotation.y = angle + sway;
}

// new helper to create a spherical shell of stars overhead
function createStarGeometry() {
  const starCount = 900;
  const innerRadius = 40;
  const outerRadius = 120;
  const positions = new Float32Array(starCount * 3);

  let i = 0;
  while (i < starCount) {
    const u = Math.random();
    const v = Math.random();

    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);

    const r = innerRadius + (outerRadius - innerRadius) * Math.pow(Math.random(), 0.5);

    const sinPhi = Math.sin(phi);
    const x = r * sinPhi * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * sinPhi * Math.sin(theta);

    // discard stars far below horizon to keep focus on sky
    if (y < 5) continue;

    const idx = i * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    i++;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function updateWorld(world, camera, dt) {
  const { trees } = world;
  const cx = camera.position.x;
  const cz = camera.position.z;
  const maxDist = 42;

  // advance internal time for animations
  world.internalTime = (world.internalTime || 0) + dt;

  // recycle trees around the player
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const dx = t.position.x - cx;
    const dz = t.position.z - cz;
    if (dx * dx + dz * dz > maxDist * maxDist) {
      randomizeTreePosition(t, cx, cz, i * 13.37);
      // when tree is "reloaded" into the endless ring, animate it in
      t.userData.spawnTime = world.internalTime;
      // start tiny and below ground so they pop up from the distance
      const baseY = t.userData.baseY ?? 1.6;
      t.position.y = baseY - 2.0;
      t.scale.set(0.05, 0.05, 0.05);
    }
  }

  // dreamy / horror-themed motion as you walk toward trees
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const dx = t.position.x - cx;
    const dz = t.position.z - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const baseY = t.userData.baseY ?? 1.6;

    // spawn pop-up (0–3 seconds) for trees that just appeared from far away
    const spawnTime = t.userData.spawnTime ?? 0;
    const age = Math.max(0, (world.internalTime - spawnTime));
    const growDuration = 3.0;
    let growFactor = 1.0;
    let riseOffset = 0.0;

    if (age < growDuration) {
      const u = age / growDuration;
      // stronger ease-out-back for a dreamy pop + slight overshoot
      const overshoot = 1.9;
      const eased = 1 + overshoot * Math.pow(u - 1, 3) + overshoot * Math.pow(u - 1, 2);

      // scale from almost nothing to slightly oversized, then settle
      growFactor = THREE.MathUtils.lerp(0.05, 1.15, eased);

      // rise up from below the ground and overshoot a bit, more visible at distance
      const distFactor = THREE.MathUtils.clamp((dist - 10) / 25, 0, 1);
      const baseRise = THREE.MathUtils.lerp(0.3, 1.4, distFactor);
      riseOffset = THREE.MathUtils.lerp(-2.0, baseRise, eased);
    } else {
      growFactor = 1.0;
      riseOffset = 0.0;
    }

    // subtle breathing / leaning when near the player
    const nearRadius = 18;
    let lean = 0;
    let verticalPulse = 0;
    if (dist < nearRadius) {
      const proximity = 1 - dist / nearRadius;
      const tTime = world.internalTime * 1.8 + i * 0.37;
      verticalPulse = Math.sin(tTime * 2.0) * 0.15 * proximity;
      lean = Math.sin(tTime * 1.3) * 0.12 * proximity;
    }

    // apply animation
    t.scale.setScalar(growFactor);
    t.position.y = baseY + verticalPulse + riseOffset;
    t.rotation.z = lean;
  }

  // reposition ground tiles so they endlessly follow the camera
  if (world.grounds && world.tileSize && world.gridSize) {
    const tileSize = world.tileSize;
    const gridSize = world.gridSize;
    const halfGrid = Math.floor(gridSize / 2);

    const baseX = Math.floor(cx / tileSize) * tileSize;
    const baseZ = Math.floor(cz / tileSize) * tileSize;

    let idx = 0;
    for (let gx = -halfGrid; gx <= halfGrid; gx++) {
      for (let gz = -halfGrid; gz <= halfGrid; gz++) {
        const ground = world.grounds[idx++];
        ground.position.x = baseX + gx * tileSize;
        ground.position.z = baseZ + gz * tileSize;
      }
    }
  }

  // subtle star drift/rotation for a living sky
  if (world.stars) {
    world.stars.rotation.y += 0.004 * dt;
  }

  // subtle breathing of fog and background color
  const t = performance.now() * 0.00005;
  const pulse = (Math.sin(t * 6) + 1) * 0.5 * 0.08;

  if (world.fog && world.fog.color && world.background) {
    const baseFog = new THREE.Color(0x070a12);
    const fogColor = baseFog.clone();
    fogColor.offsetHSL(0, 0, pulse);
    world.fog.color.copy(fogColor);

    const bgColor = new THREE.Color(0x070a12);
    bgColor.offsetHSL(0, 0, pulse * 0.6);
    if (world.background && world.background.isColor) {
      world.background.copy(bgColor);
    }
  }
}