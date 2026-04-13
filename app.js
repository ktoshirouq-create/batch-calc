document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    
    let recipeVault = {};
    let pendingNewSpec = []; 
    const BATCH_BOTTLE_SIZE_ML = 700; 

    let currentBatchMode = 'yield';
    let currentAnchorIndex = null;

    const triggerHaptic = (type = 'light') => {
        if (!navigator.vibrate) return;
        if (type === 'light') navigator.vibrate(30);
        if (type === 'heavy') navigator.vibrate([80, 40, 80]);
        if (type === 'error') navigator.vibrate([50, 50, 50, 50]);
    };

    const capitalizeText = (str) => {
        return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    };

    // --- BULLETPROOF SYNC ENGINE ---
    async function loadVault() {
        const loader = document.getElementById('loader');
        const status = document.getElementById('loader-status');
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        status.innerText = "SYNCING VAULT...";
        
        // Safety Valve: Fail-safe to hide loader after 8 seconds
        const safetyValve = setTimeout(() => {
            status.innerText = "SYNC TIMED OUT.";
            setTimeout(() => {
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 400);
            }, 1500);
        }, 8000);
        
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            
            recipeVault = {}; 
            
            // Scrub Data: Ignore blank/invalid rows
            if (Array.isArray(data)) {
                data.forEach(row => {
                    if(!row.cocktailName || row.cocktailName.trim() === "") return;
                    
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
            }

            const modalList = document.getElementById('modal-list');
            modalList.innerHTML = '';
            const specNames = Object.keys(recipeVault);

            if (specNames.length === 0) {
                modalList.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">Vault is empty. Add a spec in Edit Mode.</div>`;
            } else {
                specNames.forEach(cocktail => {
                    const item = document.createElement('div');
                    item.className = 'modal-item';
                    item.innerText = cocktail;
                    item.addEventListener('click', () => selectSpec(cocktail));
                    modalList.appendChild(item);
                });
            }

            clearTimeout(safetyValve);
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 400);

        } catch (error) {
            console.error("Vault Sync Error:", error);
            clearTimeout(safetyValve);
            status.innerText = "SYNC FAILED.";
            setTimeout(() => {
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 400);
            }, 2000);
        }
    }

    function selectSpec(cocktail) {
        document.getElementById('recipe-select').value = cocktail;
        document.getElementById('open-spec-modal').innerText = cocktail;
        document.getElementById('open-spec-modal').style.color = "var(--text-main)";
        document.getElementById('spec-modal').classList.add('hidden');
        triggerHaptic('light');

        const anchorContainer = document.getElementById('anchor-list');
        anchorContainer.innerHTML = '';
        currentAnchorIndex = null;
        
        if (recipeVault[cocktail]) {
            recipeVault[cocktail].forEach((ing, index) => {
                const btn = document.createElement('button');
                btn.className = 'anchor-pill';
                btn.innerText = ing.name;
                btn.addEventListener('click', () => {
                    triggerHaptic('light');
                    document.querySelectorAll('.anchor-pill').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentAnchorIndex = index;
                });
                anchorContainer.appendChild(btn);
            });
        }
    }

    loadVault();

    // MODE TOGGLES
    const modeYieldBtn = document.getElementById('mode-yield');
    const modeReverseBtn = document.getElementById('mode-reverse');
    const yieldControls = document.getElementById('yield-controls');
    const reverseControls = document.getElementById('reverse-controls');

    modeYieldBtn.addEventListener('click', () => {
        triggerHaptic('light');
        currentBatchMode = 'yield';
        modeYieldBtn.classList.add('active');
        modeReverseBtn.classList.remove('active');
        yieldControls.classList.remove('hidden');
        reverseControls.classList.add('hidden');
    });

    modeReverseBtn.addEventListener('click', () => {
        triggerHaptic('light');
        currentBatchMode = 'reverse';
        modeReverseBtn.classList.add('active');
        modeYieldBtn.classList.remove('active');
        reverseControls.classList.remove('hidden');
        yieldControls.classList.add('hidden');
    });

    // EDIT UI SHORTCUTS
    const speedSyrupBtns = document.querySelectorAll('.speed-syrup-btn');
    const newIngNameInput = document.getElementById('new-ing-name');
    speedSyrupBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            speedSyrupBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            newIngNameInput.value = e.target.getAttribute('data-name');
        });
    });
    newIngNameInput.addEventListener('input', () => speedSyrupBtns.forEach(b => b.classList.remove('active')));

    const speedPourBtns = document.querySelectorAll('.speed-pour-btn');
    const customMlInput = document.getElementById('new-ing-ml');
    speedPourBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            speedPourBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            customMlInput.value = e.target.getAttribute('data-ml');
        });
    });
    customMlInput.addEventListener('input', () => speedPourBtns.forEach(b => b.classList.remove('active')));

    // STEPPER
    const yieldInput = document.getElementById('target-yield');
    document.getElementById('yield-minus').addEventListener('click', () => { triggerHaptic('light'); let val = parseInt(yieldInput.value) || 1; if (val > 1) yieldInput.value = val - 1; });
    document.getElementById('yield-plus').addEventListener('click', () => { triggerHaptic('light'); let val = parseInt(yieldInput.value) || 0; yieldInput.value = val + 1; });

    document.getElementById('open-spec-modal').addEventListener('click', () => { triggerHaptic('light'); document.getElementById('spec-modal').classList.remove('hidden'); });
    document.getElementById('close-modal').addEventListener('click', () => { document.getElementById('spec-modal').classList.add('hidden'); });

    // CATEGORY SWITCHING
    const categoryBtns = document.querySelectorAll('.category-btn');
    const btlInput = document.getElementById('new-ing-btl');
    const quickSyrupsPanel = document.getElementById('quick-syrups-panel');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            categoryBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const color = e.target.getAttribute('data-val');
            document.getElementById('new-ing-color').value = color;
            if (color === 'magenta-glow') {
                quickSyrupsPanel.classList.remove('hidden');
                btlInput.classList.add('hidden');
            } else {
                quickSyrupsPanel.classList.add('hidden');
                btlInput.classList.remove('hidden');
            }
        });
    });

    // REFRESH & CLEAR
    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');
    let touchStartY = 0;
    scrollArea.addEventListener('touchstart', e => { if (scrollArea.scrollTop === 0) touchStartY = e.touches[0].clientY; }, {passive:true});
    scrollArea.addEventListener('touchmove', e => { if (scrollArea.scrollTop === 0 && touchStartY > 0) { let pull = e.touches[0].clientY - touchStartY; if (pull > 0 && pull < 120) { ptrIndicator.style.transform = `translateY(${pull*0.5}px)`; ptrIndicator.style.opacity = pull/100; } } }, {passive:true});
    scrollArea.addEventListener('touchend', async e => {
        if (scrollArea.scrollTop === 0 && touchStartY > 0) {
            let pull = e.changedTouches[0].clientY - touchStartY;
            if (pull > 70) {
                triggerHaptic('heavy');
                document.getElementById('batch-results').innerHTML = '';
                document.getElementById('syrup-results').innerHTML = '';
                document.getElementById('brix-results').innerHTML = '';
                document.getElementById('target-yield').value = '5';
                document.getElementById('recipe-select').value = '';
                document.getElementById('open-spec-modal').innerText = 'Select Spec...';
                modeYieldBtn.click();
                await loadVault();
            }
            ptrIndicator.style.transform = `translateY(-20px)`; ptrIndicator.style.opacity = 0;
        }
        touchStartY = 0;
    }, {passive:true});

    const tabs = document.querySelectorAll('.nav-tab');
    const modules = document.querySelectorAll('.module');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            triggerHaptic('light');
            tabs.forEach(t => t.classList.remove('active'));
            modules.forEach(m => m.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
            scrollArea.scrollTop = 0;
        });
    });

    const lockBtn = document.getElementById('edit-toggle');
    lockBtn.addEventListener('click', () => {
        triggerHaptic('light');
        if (lockBtn.innerText === 'LOCKED') {
            lockBtn.innerText = 'EDIT MODE'; lockBtn.style.color = 'var(--nodee-gold)';
            document.getElementById('service-ui').classList.add('hidden');
            document.getElementById('edit-ui').classList.remove('hidden');
        } else {
            lockBtn.innerText = 'LOCKED'; lockBtn.style.color = 'var(--text-muted)';
            document.getElementById('edit-ui').classList.add('hidden');
            document.getElementById('service-ui').classList.remove('hidden');
        }
    });

    // CALC BATCH (Standard + Reverse)
    document.getElementById('calc-batch-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const recipeName = document.getElementById('recipe-select').value;
        const results = document.getElementById('batch-results');
        if(!recipeName || !recipeVault[recipeName]) { triggerHaptic('error'); return; }

        const spec = recipeVault[recipeName];
        let mult = 0;
        let totalVol = 0;

        if (currentBatchMode === 'yield') {
            const yieldBtl = parseFloat(document.getElementById('target-yield').value) || 0;
            const singleVol = spec.reduce((sum, ing) => sum + ing.amount, 0);
            totalVol = yieldBtl * BATCH_BOTTLE_SIZE_ML;
            mult = totalVol / singleVol;
        } else {
            if (currentAnchorIndex === null) { alert("Select anchor!"); return; }
            const anchorAmt = parseFloat(document.getElementById('anchor-amount').value) || 0;
            if (anchorAmt <= 0) return;
            mult = anchorAmt / spec[currentAnchorIndex].amount;
            totalVol = spec.reduce((sum, ing) => sum + ing.amount, 0) * mult;
        }

        const btls = (totalVol / BATCH_BOTTLE_SIZE_ML).toFixed(1);
        let html = `<h3 class="zone-header">BATCH BUILD (${btls} BTL)</h3>`;
        
        spec.forEach(ing => {
            const total = Math.round(ing.amount * mult);
            let display = `${total}ml`;
            if (ing.color === 'amber-glow') {
                const full = Math.floor(total / ing.bottleSize);
                const rem = total % ing.bottleSize;
                display = (full > 0) ? `${full} Btl${full>1?'s':''} + ${rem}ml` : `${rem}ml`;
            }
            html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${display}</span></div>`;
        });
        results.innerHTML = html;
    });

    // PREP CALCS (Syrup + Brix)
    document.getElementById('calc-syrup-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const base = parseFloat(document.getElementById('syrup-base').value) || 0;
        const rat = parseFloat(document.getElementById('syrup-ratio').value) || 1;
        const type = document.getElementById('sweetener-type').value;
        let wat = (type === 'honey') ? (base / rat) - (base * 0.20) : base / rat;
        wat = Math.max(0, Math.round(wat));
        document.getElementById('syrup-results').innerHTML = `<div class="result-row cyan-glow"><span class="ing-name">Add Hot Water</span><span class="ing-amount">${wat}g</span></div><div class="result-row"><span class="ing-name">Total Yield</span><span class="ing-amount">${Math.round(base+wat)}g</span></div>`;
    });

    document.getElementById('calc-brix-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const w = parseFloat(document.getElementById('brix-weight').value), c = parseFloat(document.getElementById('brix-current').value), t = parseFloat(document.getElementById('brix-target').value);
        if(t <= c || t >= 100) return;
        const s = Math.round(w * ((t - c) / (100 - t)));
        document.getElementById('brix-results').innerHTML = `<div class="result-row magenta-glow"><span class="ing-name">Add White Sugar</span><span class="ing-amount">${s}g</span></div>`;
    });

    // VAULT SYNC
    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(pendingNewSpec.length === 0) return;
        triggerHaptic('heavy');
        const loader = document.getElementById('loader'), status = document.getElementById('loader-status');
        status.innerText = "PUSHING TO VAULT..."; loader.style.display = 'flex'; loader.style.opacity = '1';
        try {
            await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(pendingNewSpec) });
            pendingNewSpec = []; document.getElementById('new-spec-name').value = ''; renderNewSpecPreview(); await loadVault(); 
        } catch (e) { status.innerText = "SYNC FAILED."; setTimeout(() => { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); }, 2000); }
    });

    const renderNewSpecPreview = () => {
        const p = document.getElementById('new-spec-preview'); p.innerHTML = '';
        pendingNewSpec.forEach((ing, i) => {
            const r = document.createElement('div'); r.className = `result-row ${ing.categoryTag}`;
            r.innerHTML = `<span class="ing-name">${ing.ingredientName} (${ing.bottleSize}ml)</span><span class="ing-amount">${ing.amount}ml</span><div class="action-links"><button class="action-btn edit" onclick="editPending(${i})">EDIT</button><button class="action-btn delete" onclick="delPending(${i})">REMOVE</button></div>`;
            p.appendChild(r);
        });
    };

    window.editPending = (i) => {
        const item = pendingNewSpec[i];
        document.getElementById('new-ing-name').value = item.ingredientName;
        document.getElementById('new-ing-ml').value = item.amount;
        document.getElementById('new-ing-btl').value = item.bottleSize || '';
        pendingNewSpec.splice(i, 1); renderNewSpecPreview();
    };

    window.delPending = (i) => { pendingNewSpec.splice(i, 1); renderNewSpecPreview(); };

    document.getElementById('add-ing-btn').addEventListener('click', () => {
        const cN = capitalizeText(document.getElementById('new-spec-name').value), iN = capitalizeText(document.getElementById('new-ing-name').value), amt = parseFloat(document.getElementById('new-ing-ml').value), btl = parseFloat(document.getElementById('new-ing-btl').value) || 0, col = document.getElementById('new-ing-color').value;
        if(!cN || !iN || !amt) { triggerHaptic('error'); return; }
        triggerHaptic('light');
        pendingNewSpec.push({ cocktailName: cN, ingredientName: iN, amount: amt, bottleSize: btl, categoryTag: col });
        document.getElementById('new-ing-name').value = ''; document.getElementById('new-ing-ml').value = ''; document.querySelectorAll('.speed-pour-btn, .speed-syrup-btn').forEach(b => b.classList.remove('active')); renderNewSpecPreview();
    });

});
