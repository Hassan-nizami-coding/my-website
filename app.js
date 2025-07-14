// Get DOM elements
const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const cameraSelect = document.getElementById('cameraSelect');
const statusDiv = document.getElementById('status');
const objectsList = document.getElementById('objects');
const homeScreen = document.getElementById('homeScreen');
const detectionScreen = document.getElementById('detectionScreen');
const enterBtn = document.getElementById('enterBtn');

let model; // Stores the loaded COCO-SSD model
let currentStream; // Stores the current camera stream
let isDetecting = false; // Flag to control detection loop
let speechSynthesisAvailable = false; // Flag for Web Speech API availability
let lastSpokenDescription = ""; // Store the last spoken description to prevent repetition
let llmCallTimeoutId = null; // New variable for debouncing LLM calls
const LLM_DEBOUNCE_TIME = 2000; // 2 seconds debounce time for LLM call
let lastDetectedObjectsString = ""; // To store a string representation of the last detected objects for comparison
let isLlmProcessing = false; // Flag to indicate if an LLM call is currently in progress

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
            await navigator.serviceWorker.register('service-worker.js', { scope: '/my-website/' }); // Corrected scope for GitHub Pages
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
        detectionScreen.style.display = 'flex'; // Use flex to maintain centering
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
        // Clear any pending LLM calls when stopping detection
        if (llmCallTimeoutId) {
            clearTimeout(llmCallTimeoutId);
            llmCallTimeoutId = null;
        }
        isLlmProcessing = false; // Reset LLM processing flag
        lastDetectedObjectsString = ""; // Reset state
        lastSpokenDescription = ""; // Reset state
        objectsList.innerHTML = ''; // Clear displayed objects
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
        let currentObjectDescriptions = [];

        // Prepare a consistent string representation of current objects for comparison
        // Sort by class and then position to ensure consistent string for comparison
        const sortedPredictions = predictions.map(pred => ({
            class: pred.class,
            position: (() => {
                const [x, y, width, height] = pred.bbox;
                const centerX = x + width / 2;
                const videoWidth = video.videoWidth || video.offsetWidth;
                return centerX < videoWidth / 3 ? 'left' : centerX < 2 * videoWidth / 3 ? 'center' : 'right';
            })()
        })).sort((a, b) => a.class.localeCompare(b.class) || a.position.localeCompare(b.position));

        const currentDetectedObjectsString = JSON.stringify(sortedPredictions);

        if (predictions.length === 0) {
            const newDescription = "No objects detected.";
            if (newDescription !== lastSpokenDescription) {
                lastSpokenDescription = newDescription;
                objectsList.innerHTML = `<li>${newDescription}</li>`;
                if (speechSynthesisAvailable) {
                    speakText(newDescription);
                }
            } else {
                objectsList.innerHTML = `<li>${newDescription}</li>`; // Ensure it's always displayed if no objects
            }
            // Clear any pending LLM calls if no objects are detected
            if (llmCallTimeoutId) {
                clearTimeout(llmCallTimeoutId);
                llmCallTimeoutId = null;
            }
            isLlmProcessing = false; // Reset LLM processing flag
            lastDetectedObjectsString = ""; // Reset if no objects
        } else {
            // Populate currentObjectDescriptions for display and LLM call
            currentObjectDescriptions = sortedPredictions.map(pred => `a ${pred.class} on the ${pred.position}`);

            // Always display the raw detection immediately for visual feedback
            objectsList.innerHTML = `<li>Detected: ${currentObjectDescriptions.join(', ')}</li>`;

            // Only trigger LLM call if the set of detected objects has changed AND no LLM call is currently processing
            if (currentDetectedObjectsString !== lastDetectedObjectsString && !isLlmProcessing) {
                lastDetectedObjectsString = currentDetectedObjectsString; // Update the last detected state

                // Clear any existing debounce timeout
                if (llmCallTimeoutId) {
                    clearTimeout(llmCallTimeoutId);
                }

                // Set a new debounce timeout for the LLM call
                llmCallTimeoutId = setTimeout(async () => {
                    isLlmProcessing = true; // Set flag to indicate LLM processing
                    statusDiv.textContent = "Generating detailed description with AI ✨...";

                    // It's crucial to use the objects from the *current* detection cycle
                    // or re-detect if you want the absolute latest. For simplicity, we'll
                    // use currentObjectDescriptions as it was just derived.
                    const llmDescription = await getLlmDescription(currentObjectDescriptions);

                    let newDescription;
                    if (llmDescription) {
                        newDescription = llmDescription;
                    } else {
                        // Fallback to simple description if LLM fails
                        newDescription = "Detected: " + currentObjectDescriptions.join(', ') + ".";
                    }

                    // Only speak if the LLM-generated description is different from the last spoken one
                    if (newDescription !== lastSpokenDescription) {
                        lastSpokenDescription = newDescription;
                        objectsList.innerHTML = `<li>${newDescription}</li>`; // Update with LLM description
                        if (speechSynthesisAvailable) {
                            speakText(newDescription);
                        }
                    }
                    statusDiv.textContent = "Detecting..."; // Reset status
                    isLlmProcessing = false; // Reset LLM processing flag
                    llmCallTimeoutId = null; // Reset timeout ID
                }, LLM_DEBOUNCE_TIME);
            }
        }

        // Continue the loop if still detecting
        requestAnimationFrame(detectLoop);
    } catch (err) {
        console.error("Error during detection or LLM call:", err);
        statusDiv.textContent = "Error during object detection or description generation.";
        isDetecting = false; // Stop detection on error
        stopSpeaking();
        // Ensure LLM processing flag is reset on error
        isLlmProcessing = false;
        if (llmCallTimeoutId) {
            clearTimeout(llmCallTimeoutId);
            llmCallTimeoutId = null;
        }
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
    // Stop any previous speech immediately
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

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
    // Also clear any pending LLM calls if speech is stopped manually
    if (llmCallTimeoutId) {
        clearTimeout(llmCallTimeoutId);
        llmCallTimeoutId = null;
    }
    isLlmProcessing = false; // Ensure this is reset if speech is stopped
}
