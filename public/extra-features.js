<!-- Chatbox Wrapper -->
<div style="max-width: 500px; margin: 20px auto; border: 1px solid #ccc; border-radius: 12px; overflow: hidden; font-family: sans-serif; box-shadow: 0 4px 10px rgba(0,0,0,0.1); background: #fff;">
    
    <!-- Chat Output Area -->
    <div id="chat-box" style="height: 300px; padding: 15px; overflow-y: auto; background: #f9f9f9;">
        <p style="color: #666; margin: 0;"><strong>System:</strong> Aap yahan type kar sakte hain ya niche diye gaye quick tools use kar sakte hain.</p>
        <div id="voiceText" style="margin-top: 10px; color: #007bff;"></div>
        <div id="mapContainer" style="margin-top: 10px;"></div>
        <video id="webcam" autoplay playsinline style="width: 100%; max-height: 200px; display: none; margin-top: 10px; border-radius: 8px;"></video>
    </div>

    <!-- Chat Input Area with Icons -->
    <div style="display: flex; align-items: center; padding: 10px; border-top: 1px solid #eee; background: #fff; gap: 6px;">
        
        <!-- Quick Action Buttons (AI Chatbox Style) -->
        <button onclick="startVoice()" title="Voice Input" style="background: #f0f2f5; border: none; padding: 8px 12px; border-radius: 50%; cursor: pointer;">🎤</button>
        <button onclick="startCamera()" title="Camera" style="background: #f0f2f5; border: none; padding: 8px 12px; border-radius: 50%; cursor: pointer;">📷</button>
        <button onclick="getLocation()" title="Location" style="background: #f0f2f5; border: none; padding: 8px 12px; border-radius: 50%; cursor: pointer;">📍</button>
        <button onclick="getDirections()" title="Navigation" style="background: #f0f2f5; border: none; padding: 8px 12px; border-radius: 50%; cursor: pointer;">🚗</button>

        <!-- Main Input Field -->
        <input type="text" id="searchQuery" placeholder="Message ya Search karein..." style="flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 20px; outline: none;">
        
        <!-- Send / Search Button -->
        <button onclick="searchWeb()" style="background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 20px; cursor: pointer;">Send 🔎</button>
    </div>

</div>

<!-- JS File Connection -->
<script src="extra-features.js"></script>
