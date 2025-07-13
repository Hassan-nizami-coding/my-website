// Get DOM elements
const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const cameraSelect = document.getElementById('cameraSelect');
const statusDiv = document.getElementById('status'); // Renamed to avoid conflict with global status
const objectsList = document.getElementById('objects');
const homeScreen = document.getElementById('homeScreen');
const detectionScreen = document.getElementById('detectionScreen');
const enterBtn = document.getElementById('enterBtn');

let model; // Stores the loaded COCO-SSD model
let currentStream; // Stores the current camera stream
let isDetecting = false; // Flag to control detection loop
let speechSynthesisAvailable = false; // Flag for Web Speech API availability
let currentSpokenDescription = ""; // Store the last spoken description for replay

// --- Initialization on DOM Content Loaded ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check if Speech Synthesis API is available
    if ('speechSynthesis' in window) {
        speechSynthesisAvailable = true;
        // Optionally load voices, though not strictly necessary for basic usage
        window.speechSynthesis.getVoices();
    } else {
        statusDiv.textContent = "Text-to-speech is not supported in your browser. Object descriptions will only be displayed.";
    }

    // Register Service Worker for offline capabilities
    if ('serviceWorker' in navigator) {
        try {
            // Adjust scope if your app is not in a /blindAid/ subdirectory
            await navigator.serviceWorker.register('service-worker.js', { scope: '/' });
            console.log('Service Worker Registered');
        } catch (error) {
            console.error('Service Worker Registration Failed:', error);
        }
    }

    // Load the COCO-SSD model
    statusDiv.textContent = "Loading AI model...";
    try {
        model = await cocoSsd.load();
        statusDiv.textContent = "Model loaded. Please select a camera.";
        await getCameras(); // Populate camera options
        if (cameraSelect.options.length > 0) {
            // Automatically select the first camera if available
            cameraSelect.value = cameraSelect.options[0].value;
        }
    } catch (err) {
        console.error("Failed to load model:", err);
        statusDiv.textContent = "Error loading AI model. Please refresh the page.";
    }

    // Add event listeners once DOM is ready
    addEventListeners();
});

// --- Event Listeners ---
function addEventListeners() {
    enterBtn.addEventListener('click', () => {
        homeScreen.style.display = 'none';
        detectionScreen.style.display = 'block';
        startCamera(cameraSelect.value); // Start camera with selected device
        if (model) { // Only start detecting if model is loaded
            isDetecting = true;
            statusDiv.textContent = "Detecting...";
            detectLoop(); // Start the detection loop
        } else {
            statusDiv.textContent = "Model not loaded. Please wait or refresh.";
        }
    });

    cameraSelect.addEventListener('change', () => {
        // When camera selection changes, restart the camera with the new device
        startCamera(cameraSelect.value);
    });

    startBtn.addEventListener('click', () => {
        if (model && currentStream) { // Only start if model and camera are ready
            isDetecting = true;
            statusDiv.textContent = "Detecting...";
            detectLoop(); // Start the detection loop
        } else {
            statusDiv.textContent = "Camera or model not ready. Please ensure camera is selected and model is loaded.";
        }
    });

    stopBtn.addEventListener('click', () => {
        isDetecting = false;
        statusDiv.textContent = "Stopped detecting.";
        stopSpeaking(); // Stop any ongoing speech
    });
}

// --- Camera Functions ---
async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        cameraSelect.innerHTML = ''; // Clear existing options

        if (videoDevices.length === 0) {
            const option = document.createElement('option');
            option.text = "No camera found";
            cameraSelect.appendChild(option);
            cameraSelect.disabled = true;
            enterBtn.disabled = true;
            statusDiv.textContent = "No cameras detected.";
            return;
        }

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });
        cameraSelect.disabled = false;
        enterBtn.disabled = false;
    } catch (err) {
        console.error("Error enumerating cameras:", err);
        statusDiv.textContent = "Error accessing camera devices.";
        cameraSelect.disabled = true;
        enterBtn.disabled = true;
    }
}

async function startCamera(deviceId) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop()); // Stop existing stream
    }

    const constraints = {
        video: { deviceId: deviceId ? { exact: deviceId } : undefined }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
        // Ensure video plays before detection starts
        await video.play();
        statusDiv.textContent = "Camera started. Ready for detection.";
    } catch (err) {
        console.error("Camera error:", err);
        statusDiv.textContent = "Camera access denied or error starting camera.";
        isDetecting = false; // Stop detection if camera fails
        stopSpeaking();
    }
}

// --- Object Detection Loop ---
async function detectLoop() {
    if (!isDetecting || !model || !video.srcObject) {
        return; // Stop if not detecting, model not loaded, or no video stream
    }

    try {
        const predictions = await model.detect(video);
        objectsList.innerHTML = ''; // Clear previous detections
        let objectDescriptions = [];

        if (predictions.length === 0) {
            const item = document.createElement('li');
            item.textContent = "No objects detected";
            objectsList.appendChild(item);
            currentSpokenDescription = "No objects detected.";
            if (speechSynthesisAvailable) {
                speakText(currentSpokenDescription);
            }
        } else {
            predictions.forEach(pred => {
                const [x, y, width, height] = pred.bbox;
                const centerX = x + width / 2;
                const videoWidth = video.videoWidth || video.offsetWidth;
                const position = centerX < videoWidth / 3
                    ? 'left'
                    : centerX < 2 * videoWidth / 3
                        ? 'center'
                        : 'right';

                objectDescriptions.push(`a ${pred.class} on the ${position}`);
            });

            // Use Gemini API to get a more elaborate description
            statusDiv.textContent = "Generating detailed description with AI ✨...";
            const llmDescription = await getLlmDescription(objectDescriptions);

            // Display the LLM's description
            if (llmDescription) {
                const item = document.createElement('li');
                item.textContent = llmDescription;
                objectsList.appendChild(item);
                currentSpokenDescription = llmDescription;
                if (speechSynthesisAvailable) {
                    speakText(currentSpokenDescription);
                }
            } else {
                // Fallback to simple description if LLM fails
                const fallbackText = "Detected: " + objectDescriptions.join(', ') + ".";
                const item = document.createElement('li');
                item.textContent = fallbackText;
                objectsList.appendChild(item);
                currentSpokenDescription = fallbackText;
                if (speechSynthesisAvailable) {
                    speakText(currentSpokenDescription);
                }
            }
            statusDiv.textContent = "Detecting..."; // Reset status
        }

        // Continue the loop if still detecting
        requestAnimationFrame(detectLoop);
    } catch (err) {
        console.error("Error during detection or LLM call:", err);
        statusDiv.textContent = "Error during object detection or description generation.";
        isDetecting = false; // Stop detection on error
        stopSpeaking();
    }
}

// --- Gemini API Call for Elaborate Description ---
async function getLlmDescription(objectDescriptions) {
    if (objectDescriptions.length === 0) {
        return "No objects detected.";
    }

    const objectListString = objectDescriptions.join(', ');
    const prompt = `Based on these detected objects: ${objectListString}. Provide a concise, helpful, and natural language description for a visually impaired person. Focus on what these objects are and their relative positions. Do not invent objects not listed. Start directly with the description.`;

    try {
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = ""; // API key is provided by the Canvas environment
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API error:", errorData);
            throw new Error(errorData.error?.message || `Gemini API error: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.warn("Gemini API returned no valid content.");
            return null; // Indicate no valid description was generated
        }
    } catch (err) {
        console.error("Error calling Gemini API:", err);
        return null; // Indicate an error occurred
    }
}

// --- Text-to-Speech Functions ---
function speakText(text) {
    if (!speechSynthesisAvailable || !text) {
        return;
    }
    stopSpeaking(); // Stop any previous speech before starting new one

    const utterance = new SpeechSynthesisUtterance(text);
    // You can customize voice, pitch, rate here if needed
    // utterance.voice = window.speechSynthesis.getVoices().find(voice => voice.lang === 'en-US');
    // utterance.pitch = 1; // 0 to 2
    // utterance.rate = 1; // 0.1 to 10

    utterance.onstart = () => console.log('Speech started');
    utterance.onend = () => console.log('Speech ended');
    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        statusDiv.textContent = 'Error during speech synthesis.';
    };
    window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
}
