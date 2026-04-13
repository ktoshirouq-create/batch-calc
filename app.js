document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    
    let recipeVault = {};
    let pendingNewSpec = []; 
    
    // Explicit 700ml constraint for perfect direct scaling
    const BATCH_BOTTLE_SIZE_ML = 700; 

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
                document.getElementById('open-spec-modal').innerText = "Vault Empty...";
            } else {
                specNames.forEach(cocktail => {
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
    
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            categoryBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const selectedColor = e.target.getAttribute('data-val');
            document.getElementById('new-ing-color').value = selectedColor;

            if (selectedColor === 'amber-glow') {
                btlInput.classList.remove('hidden');
            } else {
                btlInput.classList.add('hidden');
                btlInput.value = ''; 
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

        let htmlOutput = '<h3 class="zone-header">K3 LIQUOR PULL</h3>';
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

        if (!hasLiquor) {
            htmlOutput += `<div class="result-row"><span class="ing-name" style="margin-top:10px;">No K3 ingredients in this spec.</span></div>`;
        }

        resultsContainer.innerHTML = htmlOutput;
    });

    document.getElementById('calc-syrup-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const base = parseFloat(document.getElementById('syrup-base').value) || 0;
        const ratio = parseFloat(document.getElementById('syrup-ratio').value) || 1;
        const sweetenerType = document.getElementById('sweetener-type').value;

        if(!base) return;

        let waterWeight = 0;

        if (sweetenerType === 'honey') {
            waterWeight = (base / ratio) - (base * 0.20);
        } else {
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
        if (item.bottleSize > 0) {
            btlInputEl.value = item.bottleSize;
        } else {
            btlInputEl.value = '';
        }
        
        document.getElementById('new-ing-color').value = item.categoryTag;
        
        if (item.categoryTag === 'amber-glow') {
            btlInputEl.classList.remove('hidden');
        } else {
            btlInputEl.classList.add('hidden');
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
