document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    
    let recipeVault = {};
    let pendingNewSpec = []; 
    const BATCH_BOTTLE_SIZE_ML = 1000; 

    // --- HAPTICS ---
    const triggerHaptic = (type = 'light') => {
        if (!navigator.vibrate) return;
        if (type === 'light') navigator.vibrate(30);
        if (type === 'heavy') navigator.vibrate([80, 40, 80]);
        if (type === 'error') navigator.vibrate([50, 50, 50, 50]);
    };

    // --- INIT: LOAD VAULT FROM CLOUD ---
    async function loadVault() {
        const loader = document.getElementById('loader');
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            
            recipeVault = {}; 
            
            data.forEach(row => {
                if(!recipeVault[row.cocktailName]) {
                    recipeVault[row.cocktailName] = [];
                }
                recipeVault[row.cocktailName].push({
                    name: row.ingredientName,
                    amount: row.amount,
                    bottleSize: row.bottleSize,
                    color: row.categoryTag
                });
            });

            const select = document.getElementById('recipe-select');
            select.innerHTML = '<option value="" disabled selected>Select Spec...</option>';
            Object.keys(recipeVault).forEach(cocktail => {
                const opt = document.createElement('option');
                opt.value = cocktail;
                opt.innerText = cocktail;
                select.appendChild(opt);
            });

            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 400);

        } catch (error) {
            console.error("Vault Sync Error:", error);
            document.querySelector('.loader-text').innerText = "SYNC FAILED.";
        }
    }

    loadVault();

    // --- PULL TO REFRESH LOGIC ---
    let touchStartY = 0;
    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');

    scrollArea.addEventListener('touchstart', e => {
        if (scrollArea.scrollTop === 0) {
            touchStartY = e.touches[0].clientY;
        }
    }, {passive: true});

    scrollArea.addEventListener('touchmove', e => {
        if (scrollArea.scrollTop === 0 && touchStartY > 0) {
            const pullDistance = e.touches[0].clientY - touchStartY;
            if (pullDistance > 0 && pullDistance < 120) {
                ptrIndicator.style.transform = `translateY(${pullDistance * 0.5}px)`;
                ptrIndicator.style.opacity = pullDistance / 100;
            }
        }
    }, {passive: true});

    scrollArea.addEventListener('touchend', async e => {
        if (scrollArea.scrollTop === 0 && touchStartY > 0) {
            const pullDistance = e.changedTouches[0].clientY - touchStartY;
            if (pullDistance > 70) {
                ptrIndicator.innerText = "SYNCING VAULT...";
                triggerHaptic('heavy');
                await loadVault();
            }
            // Reset visually
            ptrIndicator.style.transform = `translateY(-20px)`;
            ptrIndicator.style.opacity = 0;
            setTimeout(() => ptrIndicator.innerText = "↓ PULL TO SYNC ↓", 300);
        }
        touchStartY = 0;
    }, {passive: true});


    // --- UI NAVIGATION ---
    const tabs = document.querySelectorAll('.nav-tab');
    const modules = document.querySelectorAll('.module');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            triggerHaptic('light');
            tabs.forEach(t => t.classList.remove('active'));
            modules.forEach(m => m.classList.remove('active'));
            const targetId = e.target.getAttribute('data-target');
            e.target.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- EDIT MODE TOGGLE ---
    const lockBtn = document.getElementById('edit-toggle');
    const serviceUI = document.getElementById('service-ui');
    const editUI = document.getElementById('edit-ui');

    lockBtn.addEventListener('click', () => {
        triggerHaptic('light');
        if (lockBtn.innerText === 'LOCKED') {
            lockBtn.innerText = 'EDIT MODE';
            lockBtn.style.color = 'var(--nodee-burgundy)';
            lockBtn.style.borderColor = 'var(--nodee-burgundy)';
            serviceUI.classList.add('hidden');
            editUI.classList.remove('hidden');
        } else {
            lockBtn.innerText = 'LOCKED';
            lockBtn.style.color = 'var(--text-muted)';
            lockBtn.style.borderColor = 'var(--text-muted)';
            editUI.classList.add('hidden');
            serviceUI.classList.remove('hidden');
        }
    });

    // --- MODULE A: BATCH ENGINE ---
    document.getElementById('calc-batch-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const recipeName = document.getElementById('recipe-select').value;
        const targetYieldBottles = parseFloat(document.getElementById('target-yield').value) || 0;
        const resultsContainer = document.getElementById('batch-results');
        
        if(!recipeName || !recipeVault[recipeName]) return;

        const spec = recipeVault[recipeName];
        const singleCocktailVolume = spec.reduce((sum, ing) => sum + ing.amount, 0);
        const totalBatchVolume = targetYieldBottles * BATCH_BOTTLE_SIZE_ML;
        const multiplier = totalBatchVolume / singleCocktailVolume;

        let k3Html = '<h3 class="zone-header">K3 (Liquor & Dry Storage)</h3>';
        let k2Html = '<h3 class="zone-header">K2 (Fridge Storage)</h3>';
        let hasK3 = false, hasK2 = false;

        spec.forEach(ing => {
            const totalRequiredMl = Math.round(ing.amount * multiplier);
            const bottlesToGrab = Math.floor(totalRequiredMl / ing.bottleSize);
            const remainderMl = totalRequiredMl % ing.bottleSize;

            let amountText = '';
            if (bottlesToGrab > 0) amountText += `${bottlesToGrab} Bottle${bottlesToGrab > 1 ? 's' : ''}`;
            if (remainderMl > 0) {
                if (amountText !== '') amountText += ' + ';
                amountText += `${remainderMl}ml`;
            }
            if (totalRequiredMl === 0) amountText = '0ml';

            const rowStr = `
                <div class="result-row ${ing.color}">
                    <span class="ing-name">${ing.name}</span>
                    <span class="ing-amount">${amountText}</span>
                </div>`;

            if (ing.color === 'neon-green') {
                k2Html += rowStr;
                hasK2 = true;
            } else {
                k3Html += rowStr;
                hasK3 = true;
            }
        });

        resultsContainer.innerHTML = (hasK3 ? k3Html : '') + (hasK2 ? k2Html : '');
    });

    // --- MODULE B: PREP ENGINES ---
    document.getElementById('calc-syrup-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const base = parseFloat(document.getElementById('syrup-base').value) || 0;
        const ratio = parseFloat(document.getElementById('syrup-ratio').value) || 1;
        if(!base) return;
        const waterWeight = Math.round(base / ratio);
        const totalYield = base + waterWeight;

        document.getElementById('syrup-results').innerHTML = `
            <div class="result-row cyan-glow">
                <span class="ing-name">Add Hot Water</span>
                <span class="ing-amount">${waterWeight}g</span>
            </div>
            <div class="result-row">
                <span class="ing-name">Total Yield Container</span>
                <span class="ing-amount" style="color:var(--text-main);">${totalYield}g</span>
            </div>
        `;
    });

    document.getElementById('calc-brix-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const weight = parseFloat(document.getElementById('brix-weight').value) || 0;
        const current = parseFloat(document.getElementById('brix-current').value) || 0;
        const target = parseFloat(document.getElementById('brix-target').value) || 0;
        if(target <= current || target >= 100) return;

        const sugarGrams = Math.round(weight * ((target - current) / (100 - target)));

        document.getElementById('brix-results').innerHTML = `
            <div class="result-row magenta-glow">
                <span class="ing-name">Add White Sugar</span>
                <span class="ing-amount">${sugarGrams}g</span>
            </div>
        `;
    });

    // --- RECIPE BUILDER (EDIT MODE) ---
    const renderNewSpecPreview = () => {
        const preview = document.getElementById('new-spec-preview');
        preview.innerHTML = '';
        pendingNewSpec.forEach((ing, index) => {
            const row = document.createElement('div');
            row.className = `result-row ${ing.categoryTag}`;
            row.innerHTML = `
                <span class="ing-name">${ing.ingredientName} (${ing.bottleSize}ml)</span>
                <span class="ing-amount" style="font-size:1.5rem">${ing.amount}ml</span>
                <div class="action-links">
                    <button class="action-btn edit" onclick="editPendingIng(${index})">EDIT</button>
                    <button class="action-btn delete" onclick="deletePendingIng(${index})">REMOVE</button>
                </div>
            `;
            preview.appendChild(row);
        });
    };

    window.editPendingIng = (index) => {
        triggerHaptic('light');
        const item = pendingNewSpec[index];
        document.getElementById('new-ing-name').value = item.ingredientName;
        document.getElementById('new-ing-ml').value = item.amount;
        document.getElementById('new-ing-btl').value = item.bottleSize;
        document.getElementById('new-ing-color').value = item.categoryTag;
        
        pendingNewSpec.splice(index, 1);
        renderNewSpecPreview();
    };

    window.deletePendingIng = (index) => {
        triggerHaptic('light');
        pendingNewSpec.splice(index, 1);
        renderNewSpecPreview();
    };

    document.getElementById('add-ing-btn').addEventListener('click', () => {
        const cNameEl = document.getElementById('new-spec-name');
        const iNameEl = document.getElementById('new-ing-name');
        const amtEl = document.getElementById('new-ing-ml');
        const btlEl = document.getElementById('new-ing-btl');
        
        // Validation styling reset
        [cNameEl, iNameEl, amtEl, btlEl].forEach(el => el.classList.remove('input-error'));

        const cName = cNameEl.value.trim();
        const iName = iNameEl.value.trim();
        const amt = parseFloat(amtEl.value);
        const btl = parseFloat(btlEl.value);
        const col = document.getElementById('new-ing-color').value;

        // Visual Validation Failure
        let hasError = false;
        if(!cName) { cNameEl.classList.add('input-error'); hasError = true; }
        if(!iName) { iNameEl.classList.add('input-error'); hasError = true; }
        if(!amt) { amtEl.classList.add('input-error'); hasError = true; }
        if(!btl) { btlEl.classList.add('input-error'); hasError = true; }

        if(hasError) {
            triggerHaptic('error');
            return;
        }

        triggerHaptic('light');
        pendingNewSpec.push({ cocktailName: cName, ingredientName: iName, amount: amt, bottleSize: btl, categoryTag: col });

        iNameEl.value = '';
        amtEl.value = '';
        btlEl.value = '';
        iNameEl.focus(); 
        
        renderNewSpecPreview();
    });

    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(pendingNewSpec.length === 0) return;
        triggerHaptic('heavy');
        
        const loader = document.getElementById('loader');
        document.querySelector('.loader-text').innerText = "PUSHING TO VAULT...";
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(pendingNewSpec)
            });

            pendingNewSpec = []; 
            document.getElementById('new-spec-name').value = ''; 
            renderNewSpecPreview(); 
            
            await loadVault(); 

        } catch (error) {
            console.error("Sync Error:", error);
            document.querySelector('.loader-text').innerText = "SYNC FAILED.";
            setTimeout(() => { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); }, 2000);
        }
    });

});
