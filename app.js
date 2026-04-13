document.addEventListener('DOMContentLoaded', () => {
    
    // Master Config
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    const BATCH_BOTTLE_SIZE_ML = 700; 
    
    let recipeVault = {};
    let pendingNewSpec = []; 

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

            // Populate Modal
            const modalList = document.getElementById('modal-list');
            modalList.innerHTML = '';
            
            // Populate Managed Vault UI
            const managedList = document.getElementById('managed-vault-list');
            managedList.innerHTML = '';
            
            const specNames = Object.keys(recipeVault);

            if (specNames.length === 0) {
                modalList.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                        <p style="font-size: 1.2rem; margin-bottom: 10px;">Vault is empty.</p>
                        <p style="font-size: 0.9rem;">Unlock <span style="color: var(--nodee-gold); font-weight: bold;">EDIT MODE</span> to add your first cocktail.</p>
                    </div>
                `;
                document.getElementById('open-spec-modal').innerText = "Vault Empty...";
                managedList.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; padding: 10px 0;">No cocktails saved yet.</p>';
            } else {
                specNames.forEach(cocktail => {
                    // Inject Modal Item
                    const item = document.createElement('div');
                    item.className = 'modal-item';
                    item.innerText = cocktail;
                    item.addEventListener('click', () => {
                        document.getElementById('recipe-select').value = cocktail;
                        document.getElementById('open-spec-modal').innerText = cocktail;
                        document.getElementById('open-spec-modal').style.color = "var(--text-main)";
                        document.getElementById('spec-modal').classList.add('hidden');
                        triggerHaptic('light');
                    });
                    modalList.appendChild(item);

                    // Inject Managed Vault Item
                    const mItem = document.createElement('div');
                    mItem.className = 'managed-item';
                    mItem.innerHTML = `
                        <span class="cocktail-title">${cocktail}</span>
                        <div class="action-links" style="margin:0;">
                            <button class="action-btn edit" onclick="loadSpecToEdit('${cocktail}')">EDIT</button>
                            <button class="action-btn delete" onclick="alertDeleteLimitation()">DEL</button>
                        </div>
                    `;
                    managedList.appendChild(mItem);
                });
            }

            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 400);

        } catch (error) {
            console.error("Vault Sync Error:", error);
            document.querySelector('.loader-text').innerText = "SYNC FAILED.";
        }
    }

    loadVault();

    // Global Functions for Managed Vault
    window.loadSpecToEdit = (cocktailName) => {
        triggerHaptic('heavy');
        pendingNewSpec = [];
        document.getElementById('new-spec-name').value = cocktailName;
        
        recipeVault[cocktailName].forEach(ing => {
            pendingNewSpec.push({
                cocktailName: cocktailName,
                ingredientName: ing.name,
                amount: ing.amount,
                bottleSize: ing.bottleSize,
                categoryTag: ing.color
            });
        });
        
        renderNewSpecPreview();
        document.getElementById('scroll-area').scrollTop = 0;
        
        // Let them know this creates a duplicate unless they clear the sheet
        alert("Cocktail loaded into builder. \n\nNote: Saving this will add new rows to your Google Sheet. You must manually clear the old rows to prevent duplicates.");
    };

    window.alertDeleteLimitation = () => {
        triggerHaptic('error');
        alert("Database Protected. \n\nPlease open your Google Sheet manually and delete the rows for this cocktail. (A future Apps Script update will automate this).");
    };

    // UI: Target Yield Stepper & Smart Labels
    const yieldInput = document.getElementById('target-yield');
    const yieldLabel = document.getElementById('yield-label');

    const updateYieldLabel = () => {
        let val = parseInt(yieldInput.value) || 1;
        if (val === 1) {
            yieldLabel.innerText = 'Target Yield (700ml BOTTLE)';
        } else {
            yieldLabel.innerText = 'Target Yield (700ml BOTTLES)';
        }
    };

    document.getElementById('yield-minus').addEventListener('click', () => {
        triggerHaptic('light');
        let val = parseInt(yieldInput.value) || 1;
        if (val > 1) {
            yieldInput.value = val - 1;
            updateYieldLabel();
        }
    });

    document.getElementById('yield-plus').addEventListener('click', () => {
        triggerHaptic('light');
        let val = parseInt(yieldInput.value) || 0;
        yieldInput.value = val + 1;
        updateYieldLabel();
    });

    // UI: Quick Pills for Bottle Size
    document.querySelectorAll('.quick-pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            triggerHaptic('light');
            document.getElementById('new-ing-btl').value = e.target.getAttribute('data-val');
        });
    });

    // UI: Modal Controls
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

    // UI: Syrup Ratio Controls (Prep Module)
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
    const ratioGroupContainer = document.getElementById('ratio-group-container');
    const honeyFeedback = document.getElementById('honey-feedback');

    sweetenerPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            triggerHaptic('light');
            sweetenerPills.forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            
            const type = e.target.getAttribute('data-val');
            document.getElementById('sweetener-type').value = type;

            // Smart Brix Default Logic
            if (type === 'honey') {
                ratioGroupContainer.classList.add('hidden');
                honeyFeedback.classList.remove('hidden');
            } else {
                ratioGroupContainer.classList.remove('hidden');
                honeyFeedback.classList.add('hidden');
            }
        });
    });

    // UI: Category Select (Edit Module)
    const categoryBtns = document.querySelectorAll('.category-btn');
    const btlInputContainer = document.getElementById('btl-size-container');
    
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            categoryBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const selectedColor = e.target.getAttribute('data-val');
            document.getElementById('new-ing-color').value = selectedColor;

            // Hide the entire bottle size block (including quick pills) if not Spirit
            if (selectedColor === 'amber-glow') {
                btlInputContainer.classList.remove('hidden');
            } else {
                btlInputContainer.classList.add('hidden');
                document.getElementById('new-ing-btl').value = ''; 
            }
        });
    });

    // Core Interaction: Pull To Sync
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
                ptrIndicator.innerText = "SYNCING VAULT...";
                triggerHaptic('heavy');
                await loadVault();
            }
            ptrIndicator.style.transform = `translateY(-20px)`;
            ptrIndicator.style.opacity = 0;
            setTimeout(() => ptrIndicator.innerText = "↓ PULL TO SYNC ↓", 300);
        }
        touchStartY = 0;
    }, {passive: true});

    // Core Interaction: Tab Navigation
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

    // Core Interaction: Edit Mode Toggle
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

    // MATH: Calculate Batch
    document.getElementById('calc-batch-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const recipeName = document.getElementById('recipe-select').value;
        const targetYieldBottles = parseFloat(document.getElementById('target-yield').value) || 0;
        const resultsContainer = document.getElementById('batch-results');
        
        if(!recipeName || !recipeVault[recipeName]) {
            document.getElementById('open-spec-modal').classList.add('input-error');
            setTimeout(() => document.getElementById('open-spec-modal').classList.remove('input-error'), 400);
            triggerHaptic('error');
            return;
        }

        const spec = recipeVault[recipeName];
        const singleCocktailVolume = spec.reduce((sum, ing) => sum + ing.amount, 0);
        
        const totalBatchVolume = targetYieldBottles * BATCH_BOTTLE_SIZE_ML;
        const multiplier = totalBatchVolume / singleCocktailVolume;

        let htmlOutput = '<h3 class="zone-header">BATCH BUILD</h3>';
        let hasSpirits = false;

        spec.forEach(ing => {
            // THE SYRUP BAN: Ignore magenta-glow entirely for the build.
            if (ing.color === 'magenta-glow') return; 

            const totalRequiredMl = Math.round(ing.amount * multiplier);
            
            let amountText = '';
            
            // Format strictly for Amber-Glow (Spirits with Bottle Sizes)
            if (ing.color === 'amber-glow' && ing.bottleSize > 0) {
                const bottlesToGrab = Math.floor(totalRequiredMl / ing.bottleSize);
                const remainderMl = totalRequiredMl % ing.bottleSize;

                if (bottlesToGrab > 0) amountText += `${bottlesToGrab} Btl`; // Simplified
                if (remainderMl > 0) {
                    if (amountText !== '') amountText += ' + ';
                    amountText += `${remainderMl}ml`;
                }
            } else {
                // Format for Juices or missing bottle sizes
                amountText = `${totalRequiredMl}ml`;
            }

            if (totalRequiredMl === 0) amountText = '0ml';

            htmlOutput += `
                <div class="result-row ${ing.color}">
                    <span class="ing-name">${ing.name}</span>
                    <span class="ing-amount">${amountText}</span>
                </div>`;
            
            hasSpirits = true;
        });

        if (!hasSpirits) {
            htmlOutput += `<div class="result-row"><span class="ing-name" style="margin-top:10px;">No build ingredients required.</span></div>`;
        }

        resultsContainer.innerHTML = htmlOutput;
    });

    // MATH: Calculate Syrup
    document.getElementById('calc-syrup-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const base = parseFloat(document.getElementById('syrup-base').value) || 0;
        const sweetenerType = document.getElementById('sweetener-type').value;

        if(!base) return;

        let waterWeight = 0;

        // 66 BRIX MATH: 80 Brix Honey reduced to 66 Brix mathematically.
        if (sweetenerType === 'honey') {
            waterWeight = base * 0.212; 
        } else {
            const ratio = parseFloat(document.getElementById('syrup-ratio').value) || 1;
            waterWeight = base / ratio;
        }

        waterWeight = Math.max(0, Math.round(waterWeight));
        const totalYield = Math.round(base + waterWeight);

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

    // MATH: Calculate Brix Adjustment
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

    // UI: Edit Mode Preview Renderer
    const renderNewSpecPreview = () => {
        const preview = document.getElementById('new-spec-preview');
        preview.innerHTML = '';
        pendingNewSpec.forEach((ing, index) => {
            const row = document.createElement('div');
            row.className = `result-row ${ing.categoryTag}`;
            
            const btlText = ing.bottleSize > 0 ? ` (${ing.bottleSize}ml)` : '';
            
            row.innerHTML = `
                <span class="ing-name">${ing.ingredientName}${btlText}</span>
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
        
        const btlInputEl = document.getElementById('new-ing-btl');
        const btlInputContainerEl = document.getElementById('btl-size-container');

        if (item.bottleSize > 0) {
            btlInputEl.value = item.bottleSize;
        } else {
            btlInputEl.value = '';
        }
        
        document.getElementById('new-ing-color').value = item.categoryTag;
        
        if (item.categoryTag === 'amber-glow') {
            btlInputContainerEl.classList.remove('hidden');
        } else {
            btlInputContainerEl.classList.add('hidden');
        }

        const catBtns = document.querySelectorAll('.category-btn');
        catBtns.forEach(b => {
            b.classList.remove('active');
            if(b.getAttribute('data-val') === item.categoryTag) b.classList.add('active');
        });
        
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
        
        [cNameEl, iNameEl, amtEl, btlEl].forEach(el => el.classList.remove('input-error'));

        const cName = capitalizeText(cNameEl.value.trim());
        const iName = capitalizeText(iNameEl.value.trim());
        const amt = parseFloat(amtEl.value);
        const col = document.getElementById('new-ing-color').value;

        let btl = 0; 
        let hasError = false;

        if (col === 'amber-glow') {
            btl = parseFloat(btlEl.value);
            if (!btl) { btlEl.classList.add('input-error'); hasError = true; }
        }

        if(!cName) { cNameEl.classList.add('input-error'); hasError = true; }
        if(!iName) { iNameEl.classList.add('input-error'); hasError = true; }
        if(!amt) { amtEl.classList.add('input-error'); hasError = true; }

        if(hasError) {
            triggerHaptic('error');
            return;
        }

        triggerHaptic('light');
        pendingNewSpec.push({ cocktailName: cName, ingredientName: iName, amount: amt, bottleSize: btl, categoryTag: col });

        iNameEl.value = '';
        amtEl.value = '';
        if (col === 'amber-glow') btlEl.value = '';
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
