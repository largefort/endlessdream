import nipplejs from 'nipplejs';

export function createControls(camera, domElement) {
  const moveDir = { x: 0, y: 0 }; // x: right, y: forward
  let yaw = camera.rotation.y || 0;
  let pitch = camera.rotation.x || 0;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // keyboard
  const keys = { w: 0, a: 0, s: 0, d: 0, up: 0, left: 0, down: 0, right: 0, shift: 0 };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    switch (key) {
      case 'w':
      case 'arrowup':
        keys.w = 1;
        keys.up = 1;
        e.preventDefault();
        break;
      case 'a':
      case 'arrowleft':
        keys.a = 1;
        keys.left = 1;
        e.preventDefault();
        break;
      case 's':
      case 'arrowdown':
        keys.s = 1;
        keys.down = 1;
        e.preventDefault();
        break;
      case 'd':
      case 'arrowright':
        keys.d = 1;
        keys.right = 1;
        e.preventDefault();
        break;
      case 'shift':
        keys.shift = 1;
        e.preventDefault();
        break;
      case ' ':
        // prevent unwanted scroll / page moves when using space
        e.preventDefault();
        break;
    }
  });
  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    switch (key) {
      case 'w':
      case 'arrowup':
        keys.w = 0;
        keys.up = 0;
        break;
      case 'a':
      case 'arrowleft':
        keys.a = 0;
        keys.left = 0;
        break;
      case 's':
      case 'arrowdown':
        keys.s = 0;
        keys.down = 0;
        break;
      case 'd':
      case 'arrowright':
        keys.d = 0;
        keys.right = 0;
        break;
      case 'shift':
        keys.shift = 0;
        break;
    }
  });

  // mouse / touch look
  const lookArea = document.getElementById('touch-look-area');
  const joystickZone = document.getElementById('joystick-zone');
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // unify look sensitivity so touch behaves like desktop pointer-lock
  const lookSensitivity = 0.0022;

  function startDrag(x, y) {
    dragging = true;
    lastX = x;
    lastY = y;
  }
  function moveDrag(x, y) {
    if (!dragging) return;
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x;
    lastY = y;
    yaw -= dx * lookSensitivity;
    pitch -= dy * lookSensitivity;
    const maxPitch = Math.PI / 2.4;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  }
  function endDrag() {
    dragging = false;
  }

  // Pointer lock for desktop, drag-look for touch
  let pointerLocked = false;

  if (!isTouchDevice) {
    const lockTarget = domElement || lookArea || document.body;

    function requestLock() {
      if (document.pointerLockElement === lockTarget) return;
      if (lockTarget.requestPointerLock) {
        lockTarget.requestPointerLock();
      }
    }

    lockTarget.addEventListener('click', () => {
      requestLock();
    });

    document.addEventListener('pointerlockchange', () => {
      pointerLocked = document.pointerLockElement === lockTarget;
    });

    window.addEventListener('mousemove', (e) => {
      if (!pointerLocked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      yaw -= dx * lookSensitivity;
      pitch -= dy * lookSensitivity;
      const maxPitch = Math.PI / 2.4;
      pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    });
  } else {
    // touch devices: disable finger-based camera look so camera stays locked;
    // movement is handled purely via the virtual joystick below.
    // (No touch listeners modifying yaw/pitch here.)
  }

  // joystick for movement on mobile
  let joystick;
  if (joystickZone && isTouchDevice) {
    joystick = nipplejs.create({
      zone: joystickZone,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: '#f2f2f2',
      size: Math.min(joystickZone.clientWidth, joystickZone.clientHeight),
      restOpacity: 0.12
    });

    joystick.on('move', (evt, data) => {
      if (!data || !data.vector) return;
      moveDir.x = data.vector.x;
      moveDir.y = data.vector.y;
    });

    joystick.on('end', () => {
      moveDir.x = 0;
      moveDir.y = 0;
    });
  }

  function update(dt) {
    // compute moveDir from keyboard if no joystick input
    if (!isTouchDevice || !joystick) {
      const forward = (keys.w || keys.up) - (keys.s || keys.down);
      const right = (keys.d || keys.right) - (keys.a || keys.left);
      moveDir.x = right;
      moveDir.y = forward;
    }

    // normalize
    const len = Math.hypot(moveDir.x, moveDir.y);
    let mx = 0, my = 0;
    if (len > 0.01) {
      mx = moveDir.x / len;
      my = moveDir.y / len;
    }

    // horror-style: slower walk, faster sprint with Shift
    const walkSpeed = 1.6;  // m/s
    const sprintSpeed = 3.1;
    const speed = keys.shift ? sprintSpeed : walkSpeed;
    const moveStep = speed * dt;

    // apply rotation to movement
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    const dx = (mx * cos - my * sin) * moveStep;
    const dz = (mx * sin - my * cos) * moveStep;

    camera.position.x += dx;
    camera.position.z += dz;

    // apply first-person camera orientation directly from yaw/pitch
    const maxPitch = Math.PI / 2.4;
    if (pitch > maxPitch) pitch = maxPitch;
    if (pitch < -maxPitch) pitch = -maxPitch;
    camera.rotation.set(pitch, yaw, 0);

    const moveIntensity = len > 0.01 ? (keys.shift ? 1.0 : 0.6) * len : 0;

    return {
      moveIntensity,
      isSprinting: !!(keys.shift && len > 0.01)
    };
  }

  return { update };
}