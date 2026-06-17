/**
 * CRIXGAMING VR - Admin Panel
 * IP whitelisting & fanart management
 */

// ============================================================
// 1. IP WHITELIST CONFIGURATION (edit this array)
// ============================================================
const ALLOWED_IPS = [
    '127.0.0.1',
    '::1',
    '192.168.1.100',
    '203.0.113.5',
    '10.0.0.1',
    '172.16.0.1'
];

// Local development hosts (always allowed)
const LOCAL_DEV = ['localhost', '127.0.0.1', ''];

// ============================================================
// 2. DOM REFERENCES
// ============================================================
const statusEl = document.getElementById('statusMessage');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const uploadBtn = document.getElementById('uploadBtn');
const refreshBtn = document.getElementById('refreshBtn');
const previewGrid = document.getElementById('previewGrid');
const ipDisplay = document.getElementById('ipDisplay');

// ============================================================
// 3. FANART STORAGE (localStorage - shared with main page)
// ============================================================
const STORAGE_KEY = 'crix_fanart';

function getFanartImages() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveFanartImages(images) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
}

// ============================================================
// 4. RENDER PREVIEW THUMBNAILS
// ============================================================
function renderPreview() {
    const images = getFanartImages();
    previewGrid.innerHTML = '';
    
    if (images.length === 0) {
        previewGrid.innerHTML = '<div class="preview-empty">✨ no fanart yet</div>';
        return;
    }
    
    images.forEach((dataUrl, index) => {
        const div = document.createElement('div');
        div.className = 'thumb';
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = `Fanart ${index + 1}`;
        img.loading = 'lazy';
        div.appendChild(img);
        previewGrid.appendChild(div);
    });
}

// ============================================================
// 5. UPLOAD FUNCTION
// ============================================================
function uploadFile() {
    const file = fileInput.files[0];
    
    if (!file) {
        statusEl.textContent = '⚠️ select an image first.';
        statusEl.className = 'admin-status error';
        return;
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        statusEl.textContent = '❌ please select an image file.';
        statusEl.className = 'admin-status error';
        return;
    }
    
    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
        statusEl.textContent = '❌ file too large (max 5MB).';
        statusEl.className = 'admin-status error';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const dataUrl = e.target.result;
        const images = getFanartImages();
        images.push(dataUrl);
        saveFanartImages(images);
        renderPreview();
        
        statusEl.textContent = '✅ fanart uploaded successfully!';
        statusEl.className = 'admin-status success';
        
        // Reset file input
        fileInput.value = '';
        fileName.textContent = 'no file selected';
        
        // Play click sound if available
        const click = document.getElementById('clickSound');
        if (click) click.play().catch(() => {});
    };
    
    reader.onerror = function() {
        statusEl.textContent = '❌ failed to read file.';
        statusEl.className = 'admin-status error';
    };
    
    reader.readAsDataURL(file);
}

// ============================================================
// 6. IP CHECK & ACCESS CONTROL
// ============================================================
function isLocalDev() {
    const host = window.location.hostname;
    return LOCAL_DEV.includes(host) || window.location.protocol === 'file:';
}

function checkIpAndInit() {
    // Check if local development
    if (isLocalDev()) {
        statusEl.textContent = '✅ admin access granted (local/dev).';
        statusEl.className = 'admin-status success';
        ipDisplay.textContent = 'IP: local';
        enableAdmin();
        renderPreview();
        return;
    }
    
    // Fetch public IP
    fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => {
            const ip = data.ip || '';
            ipDisplay.textContent = `IP: ${ip}`;
            
            if (ALLOWED_IPS.includes(ip)) {
                statusEl.textContent = '✅ IP whitelisted · admin access granted.';
                statusEl.className = 'admin-status success';
                enableAdmin();
                renderPreview();
            } else {
                statusEl.textContent = `⛔ IP not whitelisted (${ip}). access denied.`;
                statusEl.className = 'admin-status error';
                disableAdmin();
            }
        })
        .catch(() => {
            // Fallback: check if localhost
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                statusEl.textContent = '✅ localhost · admin access granted.';
                statusEl.className = 'admin-status success';
                ipDisplay.textContent = 'IP: local';
                enableAdmin();
                renderPreview();
            } else {
                statusEl.textContent = '❌ could not verify IP · access denied.';
                statusEl.className = 'admin-status error';
                disableAdmin();
            }
        });
}

// ============================================================
// 7. ENABLE / DISABLE ADMIN CONTROLS
// ============================================================
function enableAdmin() {
    uploadBtn.disabled = false;
    fileInput.disabled = false;
    uploadBtn.style.opacity = '1';
    fileInput.style.opacity = '1';
    uploadBtn.style.cursor = 'pointer';
}

function disableAdmin() {
    uploadBtn.disabled = true;
    fileInput.disabled = true;
    uploadBtn.style.opacity = '0.5';
    fileInput.style.opacity = '0.5';
    uploadBtn.style.cursor = 'not-allowed';
    previewGrid.innerHTML = '<div class="preview-empty">🔒 access restricted</div>';
}

// ============================================================
// 8. EVENT BINDINGS
// ============================================================
// File input - show filename
fileInput.addEventListener('change', function() {
    if (this.files && this.files[0]) {
        fileName.textContent = this.files[0].name;
    } else {
        fileName.textContent = 'no file selected';
    }
});

// Upload button
uploadBtn.addEventListener('click', uploadFile);

// Refresh button
refreshBtn.addEventListener('click', function() {
    renderPreview();
    statusEl.textContent = '🔄 preview refreshed.';
    statusEl.className = 'admin-status';
});

// ============================================================
// 9. KEYBOARD SHORTCUTS (Ctrl+U for upload)
// ============================================================
document.addEventListener('keydown', function(e) {
    // Ctrl+U to trigger upload
    if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        if (!uploadBtn.disabled) {
            uploadBtn.click();
        }
    }
});

// ============================================================
// 10. EXPOSE FOR CONSOLE DEBUGGING
// ============================================================
window.__admin = {
    getFanartImages,
    saveFanartImages,
    renderPreview,
    uploadFile,
    ALLOWED_IPS,
    isLocalDev
};

// ============================================================
// 11. INIT
// ============================================================
checkIpAndInit();

console.log('🔐 CRIX Admin Panel loaded');
console.log(`📸 ${getFanartImages().length} fanart images in storage`);
console.log('ℹ️  Use Ctrl+U to upload');