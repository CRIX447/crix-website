/**
 * fanart.js - CRIXGAMING VR Fanart Module
 * Handles fanart display on the main page
 * Images should be stored in /fanart/ folder
 */

// ============================================================
// CONFIGURATION
// ============================================================
const FANART_CONFIG = {
    // How many images to show at once (auto-calculated based on screen size)
    // Image folder path
    imagePath: 'fanart/',
    // File extension
    imageExt: 'png',
    // Total number of fanart images
    totalImages: 100,
    // Image naming pattern: fanart1.png, fanart2.png, etc.
    imagePattern: 'fanart'
};

// ============================================================
// FANART GALLERY CLASS
// ============================================================
class FanartGallery {
    constructor() {
        this.track = document.getElementById('fanartTrack');
        this.counter = document.getElementById('fanartCounter');
        this.scrollLeftBtn = document.getElementById('scrollLeft');
        this.scrollRightBtn = document.getElementById('scrollRight');
        this.currentIndex = 0;
        this.cardsPerView = this.getCardsPerView();
        this.totalCards = FANART_CONFIG.totalImages;
        this.isAnimating = false;
        this.touchStartX = 0;
        this.touchEndX = 0;
        this.images = [];
        this.imageErrors = [];
        
        this.init();
    }
    
    getCardsPerView() {
        const width = window.innerWidth;
        if (width < 480) return 2;
        if (width < 768) return 3;
        if (width < 1024) return 4;
        return 5;
    }
    
    async init() {
        // Show loading state
        this.showLoading();
        
        // Generate image paths
        this.images = this.generateImagePaths();
        
        // Render the gallery
        await this.render();
        
        // Setup controls
        this.setupControls();
        this.setupTouchEvents();
        this.updateCounter();
        
        // Handle resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.cardsPerView = this.getCardsPerView();
                this.currentIndex = Math.min(this.currentIndex, this.totalCards - this.cardsPerView);
                this.updateCounter();
                this.scrollTo(this.currentIndex, false);
            }, 250);
        });
    }
    
    generateImagePaths() {
        const paths = [];
        for (let i = 1; i <= this.totalCards; i++) {
            paths.push(`${FANART_CONFIG.imagePath}${FANART_CONFIG.imagePattern}${i}.${FANART_CONFIG.imageExt}`);
        }
        return paths;
    }
    
    showLoading() {
        this.track.innerHTML = `
            <div style="
                display: flex;
                justify-content: center;
                align-items: center;
                width: 100%;
                min-height: 200px;
                color: var(--matrix-green);
                font-size: 18px;
                letter-spacing: 2px;
                grid-column: 1 / -1;
            ">
                <span style="animation: pulse 1.5s ease-in-out infinite;">🔄 loading fanart...</span>
            </div>
        `;
    }
    
    async render() {
        this.track.innerHTML = '';
        let loadedCount = 0;
        
        for (let i = 0; i < this.images.length; i++) {
            const card = document.createElement('div');
            card.className = 'fanart-card';
            
            const img = document.createElement('img');
            img.src = this.images[i];
            img.alt = `Fanart #${i + 1}`;
            img.loading = 'lazy';
            
            // Add error handling for missing images
            img.onerror = () => {
                // If image fails to load, show a styled placeholder
                img.style.display = 'none';
                const placeholder = document.createElement('div');
                placeholder.style.cssText = `
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    background: linear-gradient(135deg, #1a1a2e, #16213e);
                    color: var(--neon-orange);
                    font-size: 14px;
                    text-align: center;
                    padding: 20px;
                `;
                placeholder.innerHTML = `
                    <span style="font-size: 40px;">🎨</span>
                    <br>
                    <span style="font-size: 12px; color: #888;">Fanart #${i + 1}</span>
                    <br>
                    <span style="font-size: 10px; color: #666;">coming soon</span>
                `;
                card.appendChild(placeholder);
                this.imageErrors.push(i);
            };
            
            img.onload = () => {
                loadedCount++;
                if (loadedCount === this.images.length - this.imageErrors.length) {
                    console.log(`✅ Loaded ${loadedCount} fanart images`);
                }
            };
            
            const number = document.createElement('div');
            number.className = 'card-number';
            number.textContent = `#${i + 1}`;
            
            card.appendChild(img);
            card.appendChild(number);
            this.track.appendChild(card);
        }
        
        // Update total count in counter
        const totalDisplay = document.querySelector('.fanart-total');
        if (totalDisplay) {
            totalDisplay.textContent = this.totalCards;
        }
    }
    
    setupControls() {
        this.scrollLeftBtn.addEventListener('click', () => {
            this.scrollTo(this.currentIndex - this.cardsPerView);
            this.playSound('click');
        });
        
        this.scrollRightBtn.addEventListener('click', () => {
            this.scrollTo(this.currentIndex + this.cardsPerView);
            this.playSound('click');
        });
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.scrollTo(this.currentIndex - this.cardsPerView);
                this.playSound('click');
            } else if (e.key === 'ArrowRight') {
                this.scrollTo(this.currentIndex + this.cardsPerView);
                this.playSound('click');
            }
        });
    }
    
    setupTouchEvents() {
        const container = document.querySelector('.fanart-scroll-wrapper');
        
        container.addEventListener('touchstart', (e) => {
            this.touchStartX = e.changedTouches[0].screenX;
        });
        
        container.addEventListener('touchend', (e) => {
            this.touchEndX = e.changedTouches[0].screenX;
            const diff = this.touchStartX - this.touchEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    this.scrollTo(this.currentIndex + this.cardsPerView);
                } else {
                    this.scrollTo(this.currentIndex - this.cardsPerView);
                }
                this.playSound('click');
            }
        });
        
        // Mouse wheel support
        let wheelTimeout;
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            clearTimeout(wheelTimeout);
            wheelTimeout = setTimeout(() => {
                if (e.deltaX > 0) {
                    this.scrollTo(this.currentIndex + this.cardsPerView);
                } else if (e.deltaX < 0) {
                    this.scrollTo(this.currentIndex - this.cardsPerView);
                }
                this.playSound('click');
            }, 50);
        }, { passive: false });
    }
    
    scrollTo(index, animate = true) {
        if (this.isAnimating) return;
        
        const maxIndex = this.totalCards - this.cardsPerView;
        this.currentIndex = Math.max(0, Math.min(index, maxIndex));
        
        const cardWidth = this.getCardWidth();
        const gap = 20;
        const offset = this.currentIndex * (cardWidth + gap);
        
        this.track.style.transition = animate ? 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none';
        this.track.style.transform = `translateX(-${offset}px)`;
        
        this.updateCounter();
        
        // Update button states
        this.scrollLeftBtn.style.opacity = this.currentIndex === 0 ? '0.3' : '1';
        this.scrollRightBtn.style.opacity = this.currentIndex >= maxIndex ? '0.3' : '1';
    }
    
    getCardWidth() {
        const container = document.querySelector('.fanart-scroll-wrapper');
        const containerWidth = container.clientWidth;
        const gap = 20;
        const cardWidth = (containerWidth - (this.cardsPerView - 1) * gap) / this.cardsPerView;
        return Math.min(cardWidth, 250);
    }
    
    updateCounter() {
        const start = this.currentIndex + 1;
        const end = Math.min(this.currentIndex + this.cardsPerView, this.totalCards);
        this.counter.textContent = `${start} - ${end} / ${this.totalCards}`;
    }
    
    playSound(type) {
        try {
            const sound = type === 'click' ? 
                document.getElementById('clickSound') : 
                document.getElementById('hoverSound');
            if (sound) sound.play().catch(() => {});
        } catch (e) {}
    }
}

// ============================================================
// INITIALIZE FANART
// ============================================================
let fanartGallery = null;

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('fanartTrack')) {
        fanartGallery = new FanartGallery();
        console.log('🎨 Fanart gallery initialized');
    }
});

// ============================================================
// EXPOSE FOR DEBUGGING
// ============================================================
window.__fanart = {
    FanartGallery,
    getGallery: () => fanartGallery,
    config: FANART_CONFIG
};