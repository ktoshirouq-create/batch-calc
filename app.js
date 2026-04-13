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

    const hideLoader = () => {
        const loader = document.getElementById('loader');
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 400);
    };

    // --- NUCLEAR SYNC ENGINE (v21) ---
    async function loadVault() {
        const status = document.getElementById('loader-status');
        const loader = document.getElementById('loader');
        const emergencyExit = document.getElementById('emergency-exit');
        
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        status.innerText = "SYNCING VAULT...";
        emergencyExit.classList.add('hidden');

        // Nuclear Timer: Force exit after 6 seconds if hang persists
        const safetyExit = setTimeout(() => {
            status.innerText = "TIMEOUT. ENTERING...";
            emergencyExit.classList.remove('hidden');
            setTimeout(hideLoader, 1500);
        }, 6000);
        
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error("Network Response Fail");
            const data = await res.json();
            
            recipeVault = {}; 
            
            // Scrub data carefully
            if (Array.isArray(data)) {
                data.forEach(row => {
                    if(!row.cocktailName || row.cocktailName.trim() === "") return;
                    if(!recipeVault[row.cocktailName]) recipeVault[row.cocktailName] = [];
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
            clearTimeout(safetyExit);
        } catch (error) {
            console.error("Sync Error:", error);
            status.innerText = "SYNC FAILED.";
        } finally {
            // Absolute command to hide the loader regardless of status
            setTimeout(hideLoader, 1000);
        }
    }

    document.getElementById('emergency-exit').addEventListener('click', hideLoader);

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

    // UI LOGIC (Modes, Rails, Steppers)
    const yieldBtn = document.getElementById('mode-yield');
    const reverseBtn = document.getElementById('mode-reverse');
    yieldBtn.addEventListener('click', () => { triggerHaptic('light'); currentBatchMode = 'yield'; yieldBtn.classList.add('active'); reverseBtn.classList.remove('active'); document.getElementById('yield-controls').classList.remove('hidden'); document.getElementById('reverse-controls').classList.add('hidden'); });
    reverseBtn.addEventListener('click', () => { triggerHaptic('light'); currentBatchMode = 'reverse'; reverseBtn.classList.add('active'); yieldBtn.classList.remove('active'); document.getElementById('reverse-controls').classList.remove('hidden'); document.getElementById('yield-controls').classList.add('hidden'); });

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

    const yieldInput = document.getElementById('target-yield');
    document.getElementById('yield-minus').addEventListener('click', () => { triggerHaptic('light'); let val = parseInt(yieldInput.value) || 1; if (val > 1) yieldInput.value = val - 1; });
    document.getElementById('yield-plus').addEventListener('click', () => { triggerHaptic('light'); let val = parseInt(yieldInput.value) || 0; yieldInput.value = val + 1; });

    document.getElementById('open-spec-modal').addEventListener('click', () => { triggerHaptic('light'); document.getElementById('spec-modal').classList.remove('hidden'); });
    document.getElementById('close-modal').addEventListener('click', () => document.getElementById('spec-modal').classList.add('hidden'));

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
            if (color === 'magenta-glow') { quickSyrupsPanel.classList.remove('hidden'); btlInput.classList.add('hidden'); }
            else { quickSyrupsPanel.classList.add('hidden'); btlInput.classList.remove('hidden'); speedSyrupBtns.forEach(b => b.classList.remove('active')); }
        });
    });

    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');
    let touchStartY = 0;
    scrollArea.addEventListener('touchstart', e => { if (scrollArea.scrollTop === 0) touchStartY = e.touches[0].clientY; }, {passive:true});
    scrollArea.addEventListener('touchmove', e => { if (scrollArea.scrollTop === 0 && touchStartY > 0) { let pull = e.touches[0].clientY - touchStartY; if (pull > 0 && pull < 120) { ptrIndicator.style.transform = `translateY(${pull*0.5}px)`; ptrIndicator.style.opacity = pull/100; } } }, {passive:true});
    scrollArea.addEventListener('touchend', async e => {
        if (scrollArea.scrollTop === 0 && touchStartY > 0) {
            if (e.changedTouches[0].clientY - touchStartY > 70) {
                triggerHaptic('heavy');
                document.getElementById('batch-results').innerHTML = '';
                document.getElementById('target-yield').value = '5';
                document.getElementById('recipe-select').value = '';
                document.getElementById('open-spec-modal').innerText = 'Select Spec...';
                yieldBtn.click();
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

    document.getElementById('calc-syrup-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const base = parseFloat(document.getElementById('syrup-base').value) || 0;
        const rat = parseFloat(document.querySelector('.ratio-pill.active').getAttribute('data-val')) || 1;
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

    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(pendingNewSpec.length === 0) return;
        triggerHaptic('heavy');
        const loader = document.getElementById('loader');
        const status = document.getElementById('loader-status');
        status.innerText = "PUSHING TO VAULT..."; 
        loader.style.display = 'flex'; loader.style.opacity = '1';
        try {
            await fetch(API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(pendingNewSpec) });
            pendingNewSpec = []; document.getElementById('new-spec-name').value = ''; renderNewSpecPreview(); 
            setTimeout(loadVault, 1000); 
        } catch (e) { 
            status.innerText = "SYNC FAILED."; 
            setTimeout(hideLoader, 2000); 
        }
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
        const cN = document.getElementById('new-spec-name').value, iN = document.getElementById('new-ing-name').value, amt = parseFloat(document.getElementById('new-ing-ml').value), btl = parseFloat(document.getElementById('new-ing-btl').value) || 0, col = document.getElementById('new-ing-color').value;
        if(!cN || !iN || !amt) { triggerHaptic('error'); return; }
        triggerHaptic('light');
        pendingNewSpec.push({ cocktailName: cN, ingredientName: iN, amount: amt, bottleSize: btl, categoryTag: col });
        document.getElementById('new-ing-name').value = ''; document.getElementById('new-ing-ml').value = ''; document.querySelectorAll('.speed-pour-btn, .speed-syrup-btn').forEach(b => b.classList.remove('active')); renderNewSpecPreview();
    });

    // Ratio Pills listener
    document.querySelectorAll('.ratio-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            triggerHaptic('light');
            document.querySelectorAll('.ratio-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Sweetener Pills listener
    document.querySelectorAll('.sweetener-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            triggerHaptic('light');
            document.querySelectorAll('.sweetener-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('sweetener-type').value = e.target.getAttribute('data-val');
        });
    });

});
