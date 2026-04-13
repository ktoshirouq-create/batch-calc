document.addEventListener('DOMContentLoaded', () => {
    
    // --- THE INVISIBLE BRIDGE ---
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    
    let recipeVault = {};
    let pendingNewSpec = []; // Holds ingredients before syncing
    const BATCH_BOTTLE_SIZE_ML = 1000; // 1L Target Bottles

    // --- HAPTICS ---
    const triggerHaptic = (type = 'light') => {
        if (!navigator.vibrate) return;
        if (type === 'light') navigator.vibrate(50);
        if (type === 'heavy') navigator.vibrate([100, 50, 100]);
    };

    // --- INIT: LOAD VAULT FROM CLOUD ---
    async function loadVault() {
        const loader = document.getElementById('loader');
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            
            recipeVault = {}; // Reset
            
            // Group the flat sheet rows into cocktails
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

            // Populate Dropdown
            const select = document.getElementById('recipe-select');
            select.innerHTML = '<option value="" disabled selected>Select Spec...</option>';
            Object.keys(recipeVault).forEach(cocktail => {
                const opt = document.createElement('option');
                opt.value = cocktail;
                opt.innerText = cocktail;
                select.appendChild(opt);
            });

            // Fade out loader
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 400);

        } catch (error) {
            console.error("Vault Sync Error:", error);
            document.querySelector('.loader-text').innerText = "SYNC FAILED. CHECK SIGNAL.";
        }
    }

    loadVault(); // Run on startup

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
            lockBtn.style.color = 'var(--neon-green)';
            lockBtn.style.borderColor = 'var(--neon-green)';
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

        resultsContainer.innerHTML = ''; 

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

            const row = document.createElement('div');
            row.className = `result-row ${ing.color}`;
            row.innerHTML = `<span class="ing-name">${ing.name}</span><span class="ing-amount">${amountText}</span>`;
            resultsContainer.appendChild(row);
        });
    });

    // --- MODULE B: BRIX ENGINE ---
    document.getElementById('calc-brix-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const weight = parseFloat(document.getElementById('brix-weight').value) || 0;
        const current = parseFloat(document.getElementById('brix-current').value) || 0;
        const target = parseFloat(document.getElementById('brix-target').value) || 0;

        if(target <= current || target >= 100) return;

        // Formula: S = W * ((Target - Current) / (100 - Target))
        const sugarGrams = Math.round(weight * ((target - current) / (100 - target)));

        const resultsContainer = document.getElementById('brix-results');
        resultsContainer.innerHTML = `
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
        pendingNewSpec.forEach(ing => {
            const row = document.createElement('div');
            row.className = `result-row ${ing.categoryTag}`;
            row.innerHTML = `<span class="ing-name">${ing.ingredientName} (${ing.bottleSize}ml Btl)</span><span class="ing-amount" style="font-size:1.5rem">${ing.amount}ml</span>`;
            preview.appendChild(row);
        });
    };

    document.getElementById('add-ing-btn').addEventListener('click', () => {
        triggerHaptic('light');
        const cName = document.getElementById('new-spec-name').value.trim();
        const iName = document.getElementById('new-ing-name').value.trim();
        const amt = parseFloat(document.getElementById('new-ing-ml').value);
        const btl = parseFloat(document.getElementById('new-ing-btl').value);
        const col = document.getElementById('new-ing-color').value;

        if(!cName || !iName || !amt || !btl) return;

        pendingNewSpec.push({
            cocktailName: cName,
            ingredientName: iName,
            amount: amt,
            bottleSize: btl,
            categoryTag: col
        });

        // Clear ingredient inputs, keep cocktail name
        document.getElementById('new-ing-name').value = '';
        document.getElementById('new-ing-ml').value = '';
        document.getElementById('new-ing-btl').value = '';
        
        renderNewSpecPreview();
    });

    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(pendingNewSpec.length === 0) return;
        triggerHaptic('heavy');
        
        const loader = document.getElementById('loader');
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        document.querySelector('.loader-text').innerText = "PUSHING TO VAULT...";

        try {
            // Using text/plain to bypass CORS preflight, body is stringified JSON
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(pendingNewSpec)
            });

            pendingNewSpec = []; // Clear pending
            document.getElementById('new-spec-name').value = ''; // Clear title
            renderNewSpecPreview(); // Clear preview
            
            // Reload the vault to get the fresh data
            await loadVault(); 

        } catch (error) {
            console.error("Sync Error:", error);
            document.querySelector('.loader-text').innerText = "SYNC FAILED.";
            setTimeout(() => { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); }, 2000);
        }
    });

});
