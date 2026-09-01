// 1. Internet Research / Search
function searchWeb() {
    let query = document.getElementById("searchQuery")?.value;
    if (query) {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
    }
}

// 2. Voice Input
function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Aapka browser Voice Input support nahi karta.");
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN';
    recognition.start();
    
    const outputEl = document.getElementById("voiceText");
    if(outputEl) outputEl.innerText = "Suniye raha hoon...";
    
    recognition.onresult = function(event) {
        if(outputEl) outputEl.innerText = event.results[0][0].transcript;
    };
}

// 3. Camera Access & Photo Capture
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = document.getElementById('webcam');
        if (video) video.srcObject = stream;
    } catch (err) {
        alert("Camera access denied ya available nahi hai.");
    }
}

function takePhoto() {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('canvas');
    if (video && canvas) {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    }
}

// 4. Live Location & Map
function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition, () => alert("Location access allow karein."));
    } else {
        alert("Geolocation support nahi hai.");
    }
}

function showPosition(position) {
    let lat = position.coords.latitude;
    let lon = position.coords.longitude;
    let mapContainer = document.getElementById("mapContainer");
    if (mapContainer) {
        mapContainer.innerHTML = `<iframe src="https://maps.google.com/maps?q=${lat},${lon}&z=15&output=embed" style="width:100%; height:250px; border:0; border-radius:8px; margin-top:10px;"></iframe>`;
    }
}

// 5. Navigation / Directions
function getDirections() {
    let dest = document.getElementById("destination")?.value;
    if (dest) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
    }
}
