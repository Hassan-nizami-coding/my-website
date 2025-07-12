const video        = document.getElementById('video');
const startBtn     = document.getElementById('startBtn');
const stopBtn      = document.getElementById('stopBtn');
const enterBtn     = document.getElementById('enterBtn');
const cameraSelect = document.getElementById('cameraSelect');
const status       = document.getElementById('status');
const objectsList  = document.getElementById('objects');
const homeScreen   = document.getElementById('homeScreen');
const detectScreen = document.getElementById('detectionScreen');

let model, currentStream, isDetecting = false;

// 1️⃣ Populate camera list
async function getCameras() {
  // 1) Prompt for any camera to get permissions & labels
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(t => t.stop());
  } catch (err) {
    console.warn("Camera permission was denied or not available:", err);
    status.textContent = "Please allow camera access to select device.";
    return;
  }

  // 2) Now enumerate all video inputs
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');

  // 3) Populate the dropdown
  cameraSelect.innerHTML = '';
  videoDevices.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.text  = d.label || `Camera ${i + 1}`;
    cameraSelect.append(opt);
  });

  // 4) Auto‑select the first camera
  if (cameraSelect.options.length) {
    cameraSelect.selectedIndex = 0;
  }
}


// 2️⃣ Start video stream for given device
async function startCamera(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined }
    });
    video.srcObject    = stream;
    currentStream      = stream;
  } catch (e) {
    console.error('Camera error:', e);
    status.textContent = 'Camera access denied';
  }
}

// 3️⃣ Detection loop
function detectLoop() {
  if (!isDetecting) return;
  model.detect(video).then(preds => {
    objectsList.innerHTML = '';
    if (!preds.length) {
      objectsList.innerHTML = '<li>No objects detected</li>';
    } else {
      preds.forEach(p => {
        const [x,w] = [p.bbox[0], p.bbox[2]];
        const cx     = x + w/2;
        const zone   = cx < video.videoWidth/3 ? 'left'
                     : cx < 2*video.videoWidth/3 ? 'center'
                     : 'right';
        const li     = document.createElement('li');
        li.textContent = `I see a ${p.class} on the ${zone}`;
        objectsList.append(li);
      });
    }
    requestAnimationFrame(detectLoop);
  });
}

// 4️⃣ Wire up buttons
enterBtn.addEventListener('click', () => {
  homeScreen.classList.add('hidden');
  detectScreen.classList.remove('hidden');
  startCamera(cameraSelect.value);
  // if model is already loaded, kick off detection
  if (model) {
    isDetecting = true;
    status.textContent = 'Detecting…';
    detectLoop();
  }
});

startBtn.addEventListener('click', () => {
  isDetecting = true;
  status.textContent = 'Detecting…';
  detectLoop();
});

stopBtn.addEventListener('click', () => {
  isDetecting = false;
  status.textContent = 'Detection stopped.';
});

// 5️⃣ Load the model
cocoSsd.load().then(m => {
  model = m;
  status.textContent = 'Model loaded! Select camera and enter.';
});

// ─── Initialization (REPLACED) ───────────────────────
cocoSsd.load().then(m => {
  model = m;
  status.textContent = 'Model loaded! Please select a camera.';
});

getCameras();

enterBtn.addEventListener('click', async () => {
  if (!cameraSelect.value) {
    status.textContent = 'No camera available.';
    return;
  }
  homeScreen.classList.add('hidden');
  detectScreen.classList.remove('hidden');

  await startCamera(cameraSelect.value);
  if (model) {
    isDetecting    = true;
    status.textContent = 'Detecting…';
    detectLoop();
  }
});
