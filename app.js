document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    
    let recipeVault = {};
    let pendingNewSpec = []; 
    const BATCH_BOTTLE_SIZE_ML = 700; 

    // Global App State
    let currentBatchMode = 'yield'; // 'yield' or 'reverse'
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

            const modalList = document.getElementById('modal-list');
            modalList.innerHTML = '';
            const specNames = Object.keys(recipeVault);

            if (specNames.length === 0) {
                modalList.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                        <p style="font-size: 1.2rem; margin-bottom: 10px;">Vault is empty.</p>
                        <p style="font-size: 0.9rem;">Unlock <span style="color: var(--nodee-gold); font-weight: bold;">EDIT MODE</span> to add your first spec.</p>
                    </div>
                `;
            } else {
                specNames.forEach(cocktail => {
                    const item = document.createElement('div');
                    item.className = 'modal-item';
                    item.innerText = cocktail;
                    item.addEventListener('click', () => {
                        selectSpec(cocktail);
                    });
                    modalList.appendChild(item);
                });
            }

            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 400);

        } catch (error) {
            console.error("Vault Sync Error:", error);
            document.querySelector('.loader-text').innerText = "SYNC FAILED.";
        }
    }

    function selectSpec(cocktail) {
        document.getElementById('recipe-select').value = cocktail;
        document.getElementById('open-spec-modal').innerText = cocktail;
        document.getElementById('open-spec-modal').style.color = "var(--text-main)";
        document.getElementById('spec-modal').classList.add('hidden');
        triggerHaptic('light');

        // Populate Reverse Anchors
        const anchorContainer = document.getElementById('anchor-list');
        anchorContainer.innerHTML = '';
        currentAnchorIndex = null;
        
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

    loadVault();

    // MODE TOGGLE LOGIC
    const yieldBtn = document.getElementById('mode-yield');
    const reverseBtn = document.getElementById('mode-reverse');
    const yieldControls = document.getElementById('yield-controls');
    const reverseControls = document.getElementById('reverse-controls');

    yieldBtn.addEventListener('click', () => {
        triggerHaptic('light');
        currentBatchMode = 'yield';
        yieldBtn.classList.add('active');
        reverseBtn.classList.remove('active');
        yieldControls.classList.remove('hidden');
        reverseControls.classList.add('hidden');
    });

    reverseBtn.addEventListener('click', () => {
        triggerHaptic('light');
        currentBatchMode = 'reverse';
        reverseBtn.classList.add('active');
        yieldBtn.classList.remove('active');
        reverseControls.classList.remove('hidden');
        yieldControls.classList.add('hidden');
    });

    // REVERSE MODE LOGIC: Clear anchor input if custom typing
    document.getElementById('anchor-amount').addEventListener('input', () => {
        // Just for consistency
    });

    // SPEED RAIL LOGIC: Syrups & Smart Highlight
    const speedSyrupBtns = document.querySelectorAll('.speed-syrup-btn');
    const newIngNameInput = document.getElementById('new-ing-name');

    speedSyrupBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            speedSyrupBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            newIngNameInput.value = e.target.getAttribute('data-name');
            newIngNameInput.classList.remove('input-error');
        });
    });

    newIngNameInput.addEventListener('input', () => {
        speedSyrupBtns.forEach(b => b.classList.remove('active'));
    });

    // SPEED RAIL LOGIC: Pour Matrix & Smart Highlight
    const speedPourBtns = document.querySelectorAll('.speed-pour-btn');
    const customMlInput = document.getElementById('new-ing-ml');

    speedPourBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            speedPourBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            customMlInput.value = e.target.getAttribute('data-ml');
            customMlInput.classList.remove('input-error');
        });
    });

    customMlInput.addEventListener('input', () => {
        speedPourBtns.forEach(b => b.classList.remove('active'));
    });

    const yieldInput = document.getElementById('target-yield');
    
    document.getElementById('yield-minus').addEventListener('click', () => {
        triggerHaptic('light');
        let val = parseInt(yieldInput.value) || 1;
        if (val > 1) yieldInput.value = val - 1;
    });

    document.getElementById('yield-plus').addEventListener('click', () => {
        triggerHaptic('light');
        let val = parseInt(yieldInput.value) || 0;
        yieldInput.value = val + 1;
    });

    document.getElementById('open-spec-modal').addEventListener('click', () => {
        triggerHaptic('light');
        document.getElementById('spec-modal').classList.remove('hidden');
    });
    
    document.getElementById('close-modal').addEventListener('click', () => {
        triggerHaptic('light');
        document.getElementById('spec-modal').classList.add('hidden');
    });

    document.getElementById('spec-modal').addEventListener('click', (e) => {
        if (e.target.id === 'spec-modal') {
            triggerHaptic('light');
            document.getElementById('spec-modal').classList.add('hidden');
        }
    });

    const ratioPills = document.querySelectorAll('.ratio-pill');
    ratioPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            triggerHaptic('light');
            ratioPills.forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('syrup-ratio').value = e.target.getAttribute('data-val');
        });
    });

    const sweetenerPills = document.querySelectorAll('.sweetener-pill');
    sweetenerPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            triggerHaptic('light');
            sweetenerPills.forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('sweetener-type').value = e.target.getAttribute('data-val');
        });
    });

    const categoryBtns = document.querySelectorAll('.category-btn');
    const btlInput = document.getElementById('new-ing-btl');
    const quickSyrupsPanel = document.getElementById('quick-syrups-panel');
    
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            categoryBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const selectedColor = e.target.getAttribute('data-val');
            document.getElementById('new-ing-color').value = selectedColor;

            if (selectedColor === 'magenta-glow') { // SYRUP
                quickSyrupsPanel.classList.remove('hidden');
                btlInput.classList.add('hidden');
                btlInput.value = ''; 
            } else { // SPIRIT
                quickSyrupsPanel.classList.add('hidden');
                btlInput.classList.remove('hidden');
                speedSyrupBtns.forEach(b => b.classList.remove('active'));
            }
        });
    });

    let touchStartY = 0;
    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');

    scrollArea.addEventListener('touchstart', e => {
        if (scrollArea.scrollTop === 0) touchStartY = e.touches[0].clientY;
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
                ptrIndicator.innerText = "SYNCING & CLEARING...";
                triggerHaptic('heavy');
                
                document.getElementById('batch-results').innerHTML = '';
                document.getElementById('syrup-results').innerHTML = '';
                document.getElementById('brix-results').innerHTML = '';
                
                document.getElementById('target-yield').value = '5';
                document.getElementById('anchor-amount').value = '';
                document.getElementById('syrup-base').value = '500';
                document.getElementById('brix-weight').value = '500';
                document.getElementById('brix-current').value = '9';
                document.getElementById('brix-target').value = '50';
                
                document.getElementById('recipe-select').value = '';
                const specBtn = document.getElementById('open-spec-modal');
                specBtn.innerText = 'Select Spec...';
                specBtn.style.color = 'var(--text-muted)';

                // Mode Reset
                yieldBtn.click();
                
                await loadVault();
            }
            ptrIndicator.style.transform = `translateY(-20px)`;
            ptrIndicator.style.opacity = 0;
            setTimeout(() => ptrIndicator.innerText = "↓ PULL TO REFRESH ↓", 300);
        }
        touchStartY = 0;
    }, {passive: true});

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
            scrollArea.scrollTop = 0;
        });
    });

    const lockBtn = document.getElementById('edit-toggle');
    const serviceUI = document.getElementById('service-ui');
    const editUI = document.getElementById('edit-ui');

    lockBtn.addEventListener('click', () => {
        triggerHaptic('light');
        scrollArea.scrollTop = 0;
        if (lockBtn.innerText === 'LOCKED') {
            lockBtn.innerText = 'EDIT MODE';
            lockBtn.style.color = 'var(--nodee-gold)';
            lockBtn.style.borderColor = 'var(--nodee-gold)';
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

    document.getElementById('calc-batch-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const recipeName = document.getElementById('recipe-select').value;
        const resultsContainer = document.getElementById('batch-results');
        
        if(!recipeName || !recipeVault[recipeName]) {
            document.getElementById('open-spec-modal').classList.add('input-error');
            setTimeout(() => document.getElementById('open-spec-modal').classList.remove('input-error'), 400);
            triggerHaptic('error');
            return;
        }

        const spec = recipeVault[recipeName];
        let multiplier = 0;
        let totalBatchVol = 0;

        if (currentBatchMode === 'yield') {
            const targetYieldBottles = parseFloat(document.getElementById('target-yield').value) || 0;
            const singleCocktailVolume = spec.reduce((sum, ing) => sum + ing.amount, 0);
            totalBatchVol = targetYieldBottles * BATCH_BOTTLE_SIZE_ML;
            multiplier = totalBatchVol / singleCocktailVolume;
        } else {
            // REVERSE MODE
            if (currentAnchorIndex === null) {
                triggerHaptic('error');
                alert("Select an anchor ingredient first!");
                return;
            }
            const inputAnchorAmount = parseFloat(document.getElementById('anchor-amount').value) || 0;
            if (inputAnchorAmount <= 0) {
                document.getElementById('anchor-amount').classList.add('input-error');
                setTimeout(() => document.getElementById('anchor-amount').classList.remove('input-error'), 400);
                triggerHaptic('error');
                return;
            }
            const specAnchorAmount = spec[currentAnchorIndex].amount;
            multiplier = inputAnchorAmount / specAnchorAmount;
            const singleCocktailVolume = spec.reduce((sum, ing) => sum + ing.amount, 0);
            totalBatchVol = singleCocktailVolume * multiplier;
        }

        const bottlesFilled = (totalBatchVol / BATCH_BOTTLE_SIZE_ML).toFixed(1);
        let htmlOutput = `<h3 class="zone-header">K3 LIQUOR PULL (${bottlesFilled} BTL)</h3>`;
        let hasLiquor = false;

        spec.forEach(ing => {
            if (ing.color !== 'amber-glow') return; 

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

            htmlOutput += `
                <div class="result-row ${ing.color}">
                    <span class="ing-name">${ing.name}</span>
                    <span class="ing-amount">${amountText}</span>
                </div>`;
            hasLiquor = true;
        });

        // Add non-liquor summary for complete batch build
        htmlOutput += `<h3 class="zone-header">NON-LIQUOR ADDITIONS</h3>`;
        spec.forEach(ing => {
            if (ing.color === 'amber-glow') return;
            const totalRequiredMl = Math.round(ing.amount * multiplier);
            htmlOutput += `
                <div class="result-row ${ing.color}">
                    <span class="ing-name">${ing.name}</span>
                    <span class="ing-amount">${totalRequiredMl}ml</span>
                </div>`;
        });

        resultsContainer.innerHTML = htmlOutput;
    });

    document.getElementById('calc-syrup-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const base = parseFloat(document.getElementById('syrup-base').value) || 0;
        const ratio = parseFloat(document.getElementById('syrup-ratio').value) || 1;
        const sweetenerType = document.getElementById('sweetener-type').value;
        if(!base) return;
        let waterWeight = (sweetenerType === 'honey') ? (base / ratio) - (base * 0.20) : base / ratio;
        waterWeight = Math.max(0, Math.round(waterWeight));
        const totalYield = Math.round(base + waterWeight);
        document.getElementById('syrup-results').innerHTML = `
            <div class="result-row cyan-glow"><span class="ing-name">Add Hot Water</span><span class="ing-amount">${waterWeight}g</span></div>
            <div class="result-row"><span class="ing-name">Total Yield Container</span><span class="ing-amount" style="color:var(--text-main);">${totalYield}g</span></div>`;
    });

    document.getElementById('calc-brix-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const weight = parseFloat(document.getElementById('brix-weight').value) || 0;
        const current = parseFloat(document.getElementById('brix-current').value) || 0;
        const target = parseFloat(document.getElementById('brix-target').value) || 0;
        if(target <= current || target >= 100) return;
        const sugarGrams = Math.round(weight * ((target - current) / (100 - target)));
        document.getElementById('brix-results').innerHTML = `<div class="result-row magenta-glow"><span class="ing-name">Add White Sugar</span><span class="ing-amount">${sugarGrams}g</span></div>`;
    });

    const renderNewSpecPreview = () => {
        const preview = document.getElementById('new-spec-preview');
        preview.innerHTML = '';
        pendingNewSpec.forEach((ing, index) => {
            const row = document.createElement('div');
            row.className = `result-row ${ing.categoryTag}`;
            const btlText = ing.bottleSize > 0 ? ` (${ing.bottleSize}ml)` : '';
            row.innerHTML = `<span class="ing-name">${ing.ingredientName}${btlText}</span><span class="ing-amount" style="font-size:1.5rem">${ing.amount}ml</span>
                <div class="action-links"><button class="action-btn edit" onclick="editPendingIng(${index})">EDIT</button><button class="action-btn delete" onclick="deletePendingIng(${index})">REMOVE</button></div>`;
            preview.appendChild(row);
        });
    };

    window.editPendingIng = (index) => {
        triggerHaptic('light');
        const item = pendingNewSpec[index];
        document.getElementById('new-ing-name').value = item.ingredientName;
        document.getElementById('new-ing-ml').value = item.amount;
        const btlInputEl = document.getElementById('new-ing-btl');
        btlInputEl.value = item.bottleSize > 0 ? item.bottleSize : '';
        document.getElementById('new-ing-color').value = item.categoryTag;
        const catBtns = document.querySelectorAll('.category-btn');
        catBtns.forEach(b => { b.classList.remove('active'); if(b.getAttribute('data-val') === item.categoryTag) b.classList.add('active'); });
        if (item.categoryTag === 'magenta-glow') {
            document.getElementById('quick-syrups-panel').classList.remove('hidden');
            btlInputEl.classList.add('hidden');
        } else {
            document.getElementById('quick-syrups-panel').classList.add('hidden');
            btlInputEl.classList.remove('hidden');
        }
        document.querySelectorAll('.speed-pour-btn, .speed-syrup-btn').forEach(b => b.classList.remove('active'));
        pendingNewSpec.splice(index, 1);
        renderNewSpecPreview();
    };

    window.deletePendingIng = (index) => { triggerHaptic('light'); pendingNewSpec.splice(index, 1); renderNewSpecPreview(); };

    document.getElementById('add-ing-btn').addEventListener('click', () => {
        const cNameEl = document.getElementById('new-spec-name'), iNameEl = document.getElementById('new-ing-name'), amtEl = document.getElementById('new-ing-ml'), btlEl = document.getElementById('new-ing-btl');
        [cNameEl, iNameEl, amtEl, btlEl].forEach(el => el.classList.remove('input-error'));
        const cName = capitalizeText(cNameEl.value.trim()), iName = capitalizeText(iNameEl.value.trim()), amt = parseFloat(amtEl.value), col = document.getElementById('new-ing-color').value;
        let btl = 0, hasError = false;
        if (col === 'amber-glow') { btl = parseFloat(btlEl.value); if (!btl) { btlEl.classList.add('input-error'); hasError = true; } }
        if(!cName) { cNameEl.classList.add('input-error'); hasError = true; }
        if(!iName) { iNameEl.classList.add('input-error'); hasError = true; }
        if(!amt) { amtEl.classList.add('input-error'); hasError = true; }
        if(hasError) { triggerHaptic('error'); return; }
        triggerHaptic('light');
        pendingNewSpec.push({ cocktailName: cName, ingredientName: iName, amount: amt, bottleSize: btl, categoryTag: col });
        iNameEl.value = ''; amtEl.value = ''; if (col === 'amber-glow') btlEl.value = '';
        document.querySelectorAll('.speed-pour-btn, .speed-syrup-btn').forEach(b => b.classList.remove('active'));
        iNameEl.focus(); renderNewSpecPreview();
    });

    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(pendingNewSpec.length === 0) return;
        triggerHaptic('heavy');
        const loader = document.getElementById('loader');
        document.querySelector('.loader-text').innerText = "PUSHING TO VAULT...";
        loader.style.display = 'flex'; loader.style.opacity = '1';
        try {
            await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(pendingNewSpec) });
            pendingNewSpec = []; document.getElementById('new-spec-name').value = ''; renderNewSpecPreview(); await loadVault(); 
        } catch (error) {
            console.error("Sync Error:", error);
            document.querySelector('.loader-text').innerText = "SYNC FAILED.";
            setTimeout(() => { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); }, 2000);
        }
    });

});
