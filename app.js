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

// 1️⃣ Populate camera list (with permission priming)
async function getCameras() {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(t => t.stop());
  } catch (err) {
    console.warn("Camera permission denied:", err);
    status.textContent = "Please allow camera access to select device.";
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  cameraSelect.innerHTML = '';

  videoDevices.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.text  = d.label || `Camera ${i + 1}`;
    cameraSelect.append(opt);
  });

  if (cameraSelect.options.length) {
    cameraSelect.selectedIndex = 0;
  }
}

// 2️⃣ Start video stream for given device (with fallback)
async function startCamera(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
  }

  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } } }
    : { video: true };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    currentStream = stream;

    // ✅ Wait for video to fully load
    await new Promise(resolve => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });

    console.log("🎥 Camera ready:", video.videoWidth, "x", video.videoHeight);

  } catch (err) {
    console.error("Camera error:", err);
    status.textContent = "Couldn't access that camera.";
    if (deviceId) {
      await startCamera(null); // fallback
    }
  }
}


// 3️⃣ Detection loop with speech
function detectLoop() {
  if (!isDetecting) return;

  model.detect(video).then(preds => {
    objectsList.innerHTML = '';
    let utteranceText;

    if (!preds.length) {
      objectsList.innerHTML = '<li>No objects detected</li>';
      utteranceText = 'No objects detected';
    } else {
      const first = preds[0];
      const cx    = first.bbox[0] + first.bbox[2] / 2;
      const zone  = cx < video.videoWidth/3
        ? 'left'
        : cx < 2*video.videoWidth/3
        ? 'center'
        : 'right';

      preds.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `I see a ${p.class} on the ${zone}`;
        objectsList.append(li);
      });

      utteranceText = `I see a ${first.class} on the ${zone}`;
    }

    if ('speechSynthesis' in window) {
  window.speechSynthesis.cancel();
  let delay = 0;
  preds.forEach(p => {
    const cx = p.bbox[0] + p.bbox[2] / 2;
    const zone = cx < video.videoWidth / 3 ? 'left' : cx < 2 * video.videoWidth / 3 ? 'center' : 'right';
    const msg = new SpeechSynthesisUtterance(`I see a ${p.class} on the ${zone}`);
    setTimeout(() => speechSynthesis.speak(msg), delay);
    delay += 1000; // 1-second gap between utterances
  });
}


    requestAnimationFrame(detectLoop);
  });
}

// 4️⃣ Button wiring
startBtn.addEventListener('click', () => {
  isDetecting = true;
  status.textContent = 'Detecting…';
  detectScreen.classList.add('detecting');
  detectLoop();
});

stopBtn.addEventListener('click', () => {
  isDetecting = false;
  status.textContent = 'Detection stopped.';
});

// 5️⃣ Load model ONCE and initialize
cocoSsd.load().then(m => {
  model = m;
  console.log("✅ Model loaded");
  status.textContent = 'Model loaded! Please select a camera.';

  // Warm up speech synthesis
  if ('speechSynthesis' in window) {
    const warmup = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(warmup);
  }

  getCameras();
});

// 6️⃣ Enter button switches to detection screen
enterBtn.addEventListener('click', async () => {
  if (!cameraSelect.value) {
    status.textContent = 'No camera available.';
    return;
  }

  homeScreen.classList.add('hidden');
  detectScreen.classList.remove('hidden');

  await startCamera(cameraSelect.value);

  if (model) {
    isDetecting = true;
    status.textContent = 'Detecting…';
    detectLoop();
  }
});
