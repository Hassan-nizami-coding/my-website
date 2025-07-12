const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const cameraSelect = document.getElementById('cameraSelect');
const status = document.getElementById('status');
const objectsList = document.getElementById('objects');
let model;
let currentStream;

async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  cameraSelect.innerHTML = '';
  videoDevices.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || `Camera ${index + 1}`;
    cameraSelect.appendChild(option);
  });
}

async function startCamera(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    video: { deviceId: deviceId ? { exact: deviceId } : undefined }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    currentStream = stream;
  } catch (err) {
    console.error("Camera error:", err);
    status.textContent = "Camera access denied";
  }
}

cameraSelect.addEventListener('change', () => {
  startCamera(cameraSelect.value);
});

cocoSsd.load().then(loadedModel => {
  model = loadedModel;
  status.textContent = "Model loaded. Detecting...";
  detectLoop();
});
function detectLoop() {
  model.detect(video).then(predictions => {
    objectsList.innerHTML = '';

    if (predictions.length === 0) {
      const item = document.createElement('li');
      item.textContent = "No objects detected";
      objectsList.appendChild(item);
    } else {
      predictions.forEach(pred => {
        const [x, y, width, height] = pred.bbox;
        const centerX = x + width / 2;
        const position = centerX < video.videoWidth / 3
          ? 'left' : centerX < 2 * video.videoWidth / 3
          ? 'center' : 'right';

        const item = document.createElement('li');
        item.textContent = `I see a ${pred.class} on the ${position}`;
        objectsList.appendChild(item);
      });
    }

    requestAnimationFrame(detectLoop);
  });
}


getCameras().then(() => {
  if (cameraSelect.options.length > 0) {
    startCamera(cameraSelect.options[0].value);
  }
});
