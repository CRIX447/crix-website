
        const channels = [
            { name: "CRIXGAMING VR", icon: "crixgamingvr.png", url: "https://www.youtube.com/@CRIXGAMINGVR" },
            { name: "CRIX PLAYZ MC", icon: "crixsmp.png", url: "https://www.youtube.com/@CRIXPLAYZMC" },
            { name: "CRIX REACTS", icon: "crixreacts.png", url: "https://www.youtube.com/@CRIXREACTS123" },
            { name: "CRIX YAPS", icon: "crixpodcasts.png", url: "https://www.youtube.com/@CRIXYAPS" },
            { name: "CRIXGAMING VR 2", icon: "crixblox.png", url: "https://www.youtube.com/@CRIXGAMINGVR2" }
        ];
        
        const socials = [
            { name: "TikTok", icon: "tiktok.png", url: "https://tiktok.com/@crixgamingvr" },
            { name: "Twitter", icon: "twitter.png", url: "https://x.com/CRIXGAMINGVR" },
            { name: "Instagram", icon: "instagram.png", url: "https://instagram.com/crixgaming_vr" },
            { name: "Twitch", icon: "twitch.png", url: "https://twitch.tv/crix_gaming_vr" },
            { name: "Discord", icon: "discord.png", url: "https://discord.gg/MbQvJGDAst" },
            { name: "Xbox", icon: "xbox.png", url: "https://xbox.com/en-AU/play/user/NVR CRIX447" }
        ];
        
        const products = [
            { name: "BUCKET HAT", desc: "Official bucket hat", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-bucket-hat", image: "bucket-hat.avif", price: 20.00 },
            { name: "TANK TOP", desc: "Military-style tank top", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crix-army-tank-top", image: "tank-top.avif", price: 16.99 },
            { name: "PHONE CASE", desc: "Protective phone case", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-phone-case", image: "phone-case.avif", price: 16.00 },
            { name: "DESK MAT", desc: "Large desk mat", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-desk-mat", image: "desk-mat.avif", price: 14.00 },
            { name: "STICKERS", desc: "Vinyl sticker set", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crix-stickers", image: "stickers.avif", price: 5.00 },
            { name: "MUG", desc: "Ceramic mug", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-mug", image: "new-mug.png", price: 11.00 },
            { name: "POSTER", desc: "High-quality poster", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crix-poster", image: "poster.avif", price: 15.00 },
            { name: "FACE MASK", desc: "Comfortable face mask", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-face-mask", image: "new-face-mask.png", price: 12.00 },
            { name: "HOODIE", desc: "Premium hoodie", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-mens-hoodie", image: "new-hoodie.png", price: 59.00 },
            { name: "T-SHIRT", desc: "Classic t-shirt", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-t-shirt", image: "new-t-shirt.png", price: 26.00 },
            { name: "BACKPACK", desc: "Durable backpack", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-backpack", image: "backpack.png", price: 35.00 },
            { name: "CAP", desc: "Baseball cap", link: "https://crixgamingvr-store-shop.fourthwall.com/en-aud/products/crixgaming-vr-baseball-cap", image: "cap.png", price: 15.00 },
            { name: "CRIXALISA", desc: "Leonardo da Vinci style art", link: "https://crixgamingvr-store-shop.fourthwall.com/products/crixalisa", image: "crixalisa.png", price: 26.41 }
        ];
        
        const currencies = {
            US: { code: "USD", symbol: "$", rate: 1.0 }, AU: { code: "AUD", symbol: "A$", rate: 1.52 },
            GB: { code: "GBP", symbol: "£", rate: 0.79 }, EU: { code: "EUR", symbol: "€", rate: 0.92 }
        };
        
        let currentCurrency = 'USD';
        let currencySymbol = '$';
        let currencyRate = 1.0;
        let musicMuted = false;
        
        let longFormVideos = [];
        let shortsVideos = [];
        let liveVideos = [];
        let currentTab = 'long';
        
        const channelsGrid = document.getElementById('channelsGrid');
        const socialsGrid = document.getElementById('socialsGrid');
        const productsGrid = document.getElementById('productsGrid');
        const videoGrid = document.getElementById('videoGrid');
        const bgMusic = document.getElementById('bgMusic');
        const hoverSound = document.getElementById('hoverSound');
        const clickSound = document.getElementById('clickSound');
        const musicToggle = document.getElementById('musicToggleBtn');
        const merchFavicon = document.getElementById('merchFavicon');
        const merchFavicon2 = document.getElementById('merchFavicon2');
        
        function playHoverSound() { hoverSound.currentTime = 0; hoverSound.play().catch(e => console.log('Hover sound blocked')); }
        function playClickSound() { clickSound.currentTime = 0; clickSound.play().catch(e => console.log('Click sound blocked')); }
        
        function setupMusic() {
            bgMusic.volume = 0.3;
            const playPromise = bgMusic.play();
            if (playPromise !== undefined) {
                playPromise.then(() => { musicMuted = false; musicToggle.innerHTML = '🔊'; })
                    .catch(() => { musicMuted = true; musicToggle.innerHTML = '🔇'; musicToggle.classList.add('muted'); });
            }
            musicToggle.addEventListener('click', () => {
                if (musicMuted) { bgMusic.play(); musicToggle.innerHTML = '🔊'; musicToggle.classList.remove('muted'); musicMuted = false; }
                else { bgMusic.pause(); musicToggle.innerHTML = '🔇'; musicToggle.classList.add('muted'); musicMuted = true; }
                playClickSound();
            });
            musicToggle.addEventListener('mouseenter', playHoverSound);
        }
        
        async function detectCurrency() {
            try {
                const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                let countryCode = 'US';
                if (timezone.includes('Australia/')) countryCode = 'AU';
                else if (timezone.includes('Europe/London')) countryCode = 'GB';
                else if (timezone.includes('Europe/')) countryCode = 'EU';
                if (currencies[countryCode]) {
                    currentCurrency = currencies[countryCode].code;
                    currencySymbol = currencies[countryCode].symbol;
                    currencyRate = currencies[countryCode].rate;
                }
            } catch(e) { currentCurrency = 'USD'; currencySymbol = '$'; currencyRate = 1.0; }
            renderProducts();
        }
        
        function renderProducts() {
            productsGrid.innerHTML = '';
            products.forEach(product => {
                const price = (product.price * currencyRate).toFixed(2);
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <img class="product-image" src="https://raw.githubusercontent.com/CRIX447/crix-website/main/img/${product.image}" alt="${product.name}" loading="lazy">
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-price">${currencySymbol}${price}</div>
                        <a href="${product.link}" target="_blank" class="product-buy">🛒 BUY</a>
                    </div>
                `;
                const buyBtn = card.querySelector('.product-buy');
                buyBtn.addEventListener('mouseenter', playHoverSound);
                buyBtn.addEventListener('click', playClickSound);
                productsGrid.appendChild(card);
            });
        }
        
        function renderChannels() {
            channelsGrid.innerHTML = '';
            channels.forEach(channel => {
                const card = document.createElement('div');
                card.className = 'channel-card';
                card.onclick = () => window.open(channel.url, '_blank');
                card.innerHTML = `
                    <img class="channel-icon" src="https://raw.githubusercontent.com/CRIX447/crix-website/main/img/${channel.icon}" alt="${channel.name}" onerror="this.style.display='none'">
                    <span class="channel-name">${channel.name}</span>
                `;
                card.addEventListener('mouseenter', playHoverSound);
                card.addEventListener('click', playClickSound);
                channelsGrid.appendChild(card);
            });
        }
        
        function renderSocials() {
            socialsGrid.innerHTML = '';
            socials.forEach(social => {
                const card = document.createElement('a');
                card.className = 'social-card';
                card.href = social.url;
                card.target = '_blank';
                card.innerHTML = `
                    <img class="social-icon" src="https://raw.githubusercontent.com/CRIX447/crix-website/main/img/${social.icon}" alt="${social.name}" onerror="this.style.display='none'">
                    <span class="social-name">${social.name}</span>
                `;
                card.addEventListener('mouseenter', playHoverSound);
                card.addEventListener('click', playClickSound);
                socialsGrid.appendChild(card);
            });
        }
        
        const CHANNEL_ID = 'UCjiqZo0vfIZsn8E50TrOV_g';
        const API_KEY = 'AIzaSyBxTW3qvDHSMfJQ5d4WsF1SEcn4t17Sbxk';
        
        async function fetchYouTubeData() {
            try {
                const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${CHANNEL_ID}&key=${API_KEY}`;
                const statsRes = await fetch(statsUrl);
                const statsData = await statsRes.json();
                if (statsData.items && statsData.items[0]) {
                    const stats = statsData.items[0].statistics;
                    document.getElementById('subCount').textContent = formatNumber(parseInt(stats.subscriberCount));
                    document.getElementById('videoCount').textContent = formatNumber(parseInt(stats.videoCount));
                    document.getElementById('viewCount').textContent = formatNumber(parseInt(stats.viewCount));
                }
                
                const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
                const channelRes = await fetch(channelUrl);
                const channelData = await channelRes.json();
                if (channelData.items && channelData.items[0]) {
                    const uploadsId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
                    const videosUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${uploadsId}&key=${API_KEY}`;
                    const videosRes = await fetch(videosUrl);
                    const videosData = await videosRes.json();
                    
                    if (videosData.items) {
                        categorizeVideos(videosData.items);
                    }
                }
            } catch (error) {
                console.log('API error, using fallback');
                document.getElementById('subCount').textContent = '1.15K';
                document.getElementById('videoCount').textContent = '154';
                document.getElementById('viewCount').textContent = '52.78K';
                useFallbackVideos();
            }
        }
        
        function categorizeVideos(items) {
            longFormVideos = [];
            shortsVideos = [];
            liveVideos = [];
            
            items.forEach(item => {
                const snippet = item.snippet;
                const title = snippet.title;
                const isShort = title.toLowerCase().includes('#shorts') || 
                               (snippet.description && snippet.description.toLowerCase().includes('#shorts'));
                const isLive = title.toLowerCase().includes('live') || 
                              title.toLowerCase().includes('stream') ||
                              title.includes('🔴');
                
                const videoData = {
                    id: snippet.resourceId.videoId,
                    title: title,
                    thumbnail: snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url,
                    date: new Date(snippet.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                };
                
                if (isShort) shortsVideos.push(videoData);
                else if (isLive) liveVideos.push(videoData);
                else longFormVideos.push(videoData);
            });
            
            renderCurrentTab();
        }
        
        function useFallbackVideos() {
            longFormVideos = [
                { id: 'dQw4w9WgXcQ', title: '[UPDATED] How to get the bark mod menu [100% LEGAL]', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg', date: 'Mar 16, 2026' },
                { id: 'dQw4w9WgXcQ', title: 'Gorilla Tag Gameplay', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg', date: 'Mar 15, 2026' },
                { id: 'dQw4w9WgXcQ', title: 'Minecraft Live Stream', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg', date: 'Mar 15, 2026' }
            ];
            shortsVideos = [
                { id: 'TNRli7rkreg', title: 'Gorilla Tag Short', thumbnail: 'https://img.youtube.com/vi/TNRli7rkreg/mqdefault.jpg', date: 'Recent' }
            ];
            liveVideos = longFormVideos.filter(v => v.title.includes('Live'));
            renderCurrentTab();
        }
        
        function renderCurrentTab() {
            let videos = [];
            if (currentTab === 'long') videos = longFormVideos.slice(0, 6);
            else if (currentTab === 'shorts') videos = shortsVideos.slice(0, 6);
            else videos = liveVideos.slice(0, 6);
            
            videoGrid.innerHTML = '';
            if (videos.length === 0) {
                videoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px;">No videos found in this category</div>';
                return;
            }
            
            videos.forEach(video => {
                const card = document.createElement('div');
                card.className = 'video-card';
                card.onclick = () => window.open(`https://youtube.com/watch?v=${video.id}`, '_blank');
                card.innerHTML = `
                    <div class="video-thumbnail-container">
                        <img class="video-thumbnail" src="${video.thumbnail}" alt="${video.title}" loading="lazy" onerror="this.src='https://img.youtube.com/vi/${video.id}/mqdefault.jpg'">
                    </div>
                    <div class="video-info">
                        <div class="video-date">${video.date}</div>
                        <div class="video-title">${video.title}</div>
                    </div>
                `;
                videoGrid.appendChild(card);
            });
        }
        
        function formatNumber(num) {
            if (num >= 1000000) return (num/1000000).toFixed(2) + 'M';
            if (num >= 1000) return (num/1000).toFixed(2) + 'K';
            return num.toString();
        }
        
        function setupTabs() {
            const tabs = document.querySelectorAll('.video-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentTab = tab.dataset.tab;
                    renderCurrentTab();
                    playClickSound();
                });
            });
        }
        
        function setupMerchClicks() {
            if (merchFavicon) {
                merchFavicon.addEventListener('mouseenter', playHoverSound);
                merchFavicon.addEventListener('click', () => {
                    playClickSound();
                    window.open('https://crixgamingvr-store-shop.fourthwall.com/en-aud/collections/all', '_blank');
                });
            }
            if (merchFavicon2) {
                merchFavicon2.addEventListener('mouseenter', playHoverSound);
                merchFavicon2.addEventListener('click', () => {
                    playClickSound();
                    window.open('https://crixgamingvr-store-shop.fourthwall.com/en-aud/collections/all', '_blank');
                });
            }
        }
        
        async function init() {
            renderChannels();
            renderSocials();
            setupMusic();
            await detectCurrency();
            setupMerchClicks();
            setupTabs();
            await fetchYouTubeData();
            setInterval(fetchYouTubeData, 60000);
        }
        
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
