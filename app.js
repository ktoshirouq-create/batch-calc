document.addEventListener('DOMContentLoaded', () => {
    
    // --- BATCHING ENGINE RULES (THE BOUNCER) ---
    const BATCH_CONFIG = {
        'Spirit Batch': { allowedCategories: ['amber-glow', 'neon-cyan', 'magenta-glow'] }, 
        'Juice Batch': { allowedCategories: ['juice-glow', 'puree-mango', 'magenta-glow'] }, 
        'Espresso Batch': { allowedCategories: ['coffee-dark'] }
    };

    function canAddToBatch(catClass, batchType) {
        if (batchType === 'Mocktail' || batchType === 'Custom') return true; 
        const config = BATCH_CONFIG[batchType];
        if (!config) return true;
        return config.allowedCategories.includes(catClass);
    }

    // --- STATE & CONFIG ---
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    let recipeVault = {};
    let parsedStagingData = []; 
    let editingCocktailName = null;

    window.lastUsedRound = 1;
    let abvDilution = 20;
    let activeAbvSpec = null;

   // --- HELPERS ---
    const capitalize = (str) => str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const triggerHaptic = (t = 'light') => {
        if (!navigator.vibrate) return;
        t === 'heavy' ? navigator.vibrate([80, 40, 80]) : navigator.vibrate(30);
    };

    // --- INGREDIENT CATEGORIZATION (shared by parser + builder name fallback) ---
    const SYRUP_KEYS = ['syrup', 'sugar', 'agave', 'honey', 'gomme', 'orgeat', 'falernum', 'grenadine', 'cordial'];
    const LIQUEUR_KEYS = ['liqueur', 'licor', 'amaro', 'campari', 'aperol', 'vermouth', 'cointreau', 'triple sec', 'chartreuse', 'bénédictine', 'benedictine', 'maraschino', 'amaretto', 'disaronno', 'dissarono', 'kahlua', 'tia maria', 'baileys', 'crème de', 'creme de', 'sambuca', 'absinthe', 'pastis', 'sherry', 'port', 'madeira', 'lillet', 'suze', 'fernet', 'jägermeister', 'jagermeister', 'drambuie', 'galliano', 'frangelico', 'midori', 'curaçao', 'curacao', 'st-germain', 'st. germain', 'bitters', 'angostura', 'peychaud', 'wine', 'champagne', 'prosecco', 'cava'];
    const JUICE_KEYS = ['juice', 'lemon', 'lime', 'orange', 'grapefruit', 'pineapple', 'cranberry', 'apple', 'tomato', 'water', 'soda', 'tonic', 'cola', 'ginger beer', 'coconut', 'milk', 'cream', 'egg', 'yuzu', 'passion', 'mango', 'raspberry', 'strawberry', 'blackberry', 'blueberry', 'watermelon', 'cucumber', 'kiwi', 'lychee', 'guava', 'peach', 'pear', 'rhubarb', 'beetroot', 'carrot', 'fig'];

    function categorizeIngredient(name) {
        const low = (name || '').toLowerCase().trim();
        if (!low) return 'amber-glow';
        if (/spirit\s*batch/.test(low)) return 'amber-glow';
        if (/juice\s*batch/.test(low)) return 'juice-glow';
        if (/mocktail/.test(low)) return 'juice-glow';
        if (/cream.*batch/.test(low)) return 'magenta-glow';
        if (/espresso\s*batch/.test(low)) return 'coffee-dark';
        if (/espresso|cold\s*brew|coffee/.test(low)) return 'coffee-dark';
        if (/puree/.test(low)) return 'puree-mango';
        if (/bitters|angostura|ango|peychaud|egg white|^egg$|tincture|saline|absinthe rinse/.test(low)) return 'static-ruby';
        if (SYRUP_KEYS.some(k => low.includes(k))) return 'magenta-glow';
        if (LIQUEUR_KEYS.some(k => low.includes(k))) return 'neon-cyan';
        if (JUICE_KEYS.some(k => low.includes(k))) return 'juice-glow';
        return 'amber-glow';
    }

    const showLoader = (m) => {
        const lText = document.querySelector('.loader-text');
        if (lText) lText.innerText = m;
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }
    };

    const hideLoader = () => {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.opacity = '0'; 
            setTimeout(() => loader.style.display = 'none', 300);
        }
    };

    // --- BOUNCER QUICK CHECK ---
    const updateBouncer = () => {
        const today = new Date();
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        
        const date18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        const date20 = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate());
        
        const d18El = document.getElementById('date-18');
        const d20El = document.getElementById('date-20');
        
        if (d18El) d18El.innerText = date18.toLocaleDateString('en-US', options).toUpperCase();
        if (d20El) d20El.innerText = date20.toLocaleDateString('en-US', options).toUpperCase();
    };
    updateBouncer();

    // --- PULL TO REFRESH ---
    let touchStartY = 0;
    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');

    if (scrollArea && ptrIndicator) {
        scrollArea.addEventListener('touchstart', e => { if (scrollArea.scrollTop === 0) touchStartY = e.touches[0].clientY; }, {passive: true});
        scrollArea.addEventListener('touchmove', e => {
            if (scrollArea.scrollTop === 0 && touchStartY > 0) {
                const pullDistance = e.touches[0].clientY - touchStartY;
                if (pullDistance > 0 && pullDistance < 120) {
                    ptrIndicator.style.transform = `translateY(${pullDistance * 0.5}px)`;
                    ptrIndicator.style.opacity = pullDistance / 100;
                }
            }
        }, {passive: true});
        scrollArea.addEventListener('touchend', e => {
            if (scrollArea.scrollTop === 0 && touchStartY > 0) {
                const pullDistance = e.changedTouches[0].clientY - touchStartY;
                if (pullDistance > 70) {
                    ptrIndicator.innerText = "REFRESHING...";
                    triggerHaptic('heavy');
                    setTimeout(() => window.location.reload(true), 150); 
                } else {
                    ptrIndicator.style.transform = `translateY(-20px)`;
                    ptrIndicator.style.opacity = 0;
                }
            }
            touchStartY = 0;
        }, {passive: true});
    }

    // --- CUSTOM MODAL & PHYSICS ---
    const modal = document.getElementById('selection-modal');
    const modalContent = document.getElementById('modal-content-area');
    const dragZone = document.getElementById('modal-drag-zone');
    const dragHandle = document.querySelector('.drag-handle');
    let dragStartY = 0; let dragCurrentY = 0; let isDragging = false;

    function openSelectModal(title, options, onSelect, customInput = null) {
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        
        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'modal-item';
            item.innerText = opt.label;
            item.onclick = () => { triggerHaptic(); onSelect(opt.value, opt.label, opt.data); closeSelectModal(); };
            list.appendChild(item);
        });
        
        if (customInput) {
            const wrap = document.createElement('div');
            wrap.className = 'modal-custom-input';
            const prefillVal = (customInput.prefill || '').replace(/"/g, '&quot;');
            wrap.innerHTML = `
                <input type="text" class="premium-text-input" placeholder="${customInput.placeholder || 'Custom...'}" value="${prefillVal}" style="margin-bottom: 0;">
                <button class="btn-primary" style="margin-top: 12px;">${customInput.btnLabel || 'ADD'}</button>
            `;
            const input = wrap.querySelector('input');
            const btn = wrap.querySelector('button');
            btn.addEventListener('click', () => {
                const val = input.value.trim();
                if (!val) return;
                triggerHaptic('heavy');
                customInput.onSubmit(val);
                closeSelectModal();
            });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
            list.appendChild(wrap);
            setTimeout(() => input.focus(), 350);
        }
        
        modal.classList.remove('hidden');
    }

    function closeSelectModal() {
        if (!modalContent || !modal) return;
        triggerHaptic('light');
        modalContent.style.transform = `translateY(100%)`;
        setTimeout(() => {
            modal.classList.add('hidden');
            modalContent.style.transform = ''; 
            modalContent.style.transition = '';
        }, 300);
    }

    if (modal) {
        modal.onclick = (e) => { if(e.target === modal) closeSelectModal(); };
        document.getElementById('close-selection-modal').onclick = closeSelectModal;
    }

    function openConfirmModal({ title = 'CONFIRM', message, confirmLabel = 'CONFIRM', cancelLabel = 'CANCEL', danger = false, onConfirm }) {
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        const messageEl = document.createElement('div');
        messageEl.className = 'modal-message';
        messageEl.innerText = message;
        list.appendChild(messageEl);
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        actions.innerHTML = `
            <button class="btn-secondary">${cancelLabel}</button>
            <button class="btn-primary ${danger ? 'burgundy-btn' : ''}">${confirmLabel}</button>
        `;
        actions.children[0].addEventListener('click', () => { triggerHaptic('light'); closeSelectModal(); });
        actions.children[1].addEventListener('click', () => { triggerHaptic('heavy'); closeSelectModal(); if (onConfirm) onConfirm(); });
        list.appendChild(actions);
        modal.classList.remove('hidden');
    }

    function openAlertModal({ title = 'NOTICE', message, onClose }) {
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        const messageEl = document.createElement('div');
        messageEl.className = 'modal-message';
        messageEl.innerText = message;
        list.appendChild(messageEl);
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        actions.innerHTML = `<button class="btn-primary">OK</button>`;
        actions.children[0].addEventListener('click', () => { triggerHaptic('light'); closeSelectModal(); if (onClose) onClose(); });
        list.appendChild(actions);
        modal.classList.remove('hidden');
    }

    if (dragZone && dragHandle && modalContent) {
        const startDrag = (e) => { dragStartY = e.touches[0].clientY; isDragging = true; modalContent.style.transition = 'none'; };
        const moveDrag = (e) => {
            if(!isDragging) return;
            const deltaY = e.touches[0].clientY - dragStartY;
            if (deltaY > 0) { dragCurrentY = deltaY; modalContent.style.transform = `translateY(${dragCurrentY}px)`; }
        };
        const endDrag = () => {
            if(!isDragging) return;
            isDragging = false;
            modalContent.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            if (dragCurrentY > 100) closeSelectModal();
            else modalContent.style.transform = 'translateY(0)';
            dragCurrentY = 0;
        };

        dragZone.addEventListener('touchstart', startDrag, {passive: true});
        dragZone.addEventListener('touchmove', moveDrag, {passive: true});
        dragZone.addEventListener('touchend', endDrag);
        dragHandle.addEventListener('touchstart', startDrag, {passive: true});
        dragHandle.addEventListener('touchmove', moveDrag, {passive: true});
        dragHandle.addEventListener('touchend', endDrag);
    }

    // --- DB & VAULT (resilient: retry + localStorage cache fallback) ---
    const VAULT_CACHE_KEY = 'codex_vault_cache_v1';
    let vaultLive = false;  // true only when recipeVault reflects a successful live fetch

    async function loadVault() {
        showLoader("SYNCING CODEX...");
        const attempt = async () => {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error("Network error");
            return res.json();
        };
        const backoffs = [0, 600, 1500];  // 3 attempts total — catches Apps Script cold starts
        for (let i = 0; i < backoffs.length; i++) {
            try {
                if (backoffs[i]) await new Promise(r => setTimeout(r, backoffs[i]));
                const data = await attempt();
                recipeVault = {};
                data.forEach(row => {
                    if(!recipeVault[row.cocktailName]) recipeVault[row.cocktailName] = [];
                    recipeVault[row.cocktailName].push({ name: row.ingredientName, amount: row.amount, color: row.categoryTag, unit: row.unit });
                });
                vaultLive = true;
                try { localStorage.setItem(VAULT_CACHE_KEY, JSON.stringify(recipeVault)); } catch {}
                renderVault();
                hideLoader();
                return;
            } catch (e) {
                console.error(`Sync attempt ${i + 1} failed:`, e);
            }
        }
        // All attempts failed — fall back to cached copy if we have one
        vaultLive = false;
        const lText = document.querySelector('.loader-text');
        try {
            const cached = localStorage.getItem(VAULT_CACHE_KEY);
            if (cached) {
                recipeVault = JSON.parse(cached);
                if (lText) lText.innerText = "OFFLINE — CACHED COPY";
                renderVault();
                setTimeout(hideLoader, 1200);
                return;
            }
        } catch {}
        if (lText) lText.innerText = "OFFLINE MODE";
        setTimeout(hideLoader, 1500);
    }
    loadVault();

    function formatAmount(n) {
        return n.toFixed(1).replace(/\.0$/, '');
    }

    function renderVaultContent(container, cocktail, subBatches, round) {
        container.innerHTML = '';
        const mainIngs = recipeVault[cocktail] || [];

        if (mainIngs.length > 0) {
            const mainSection = document.createElement('div');
            mainSection.className = 'vault-main-section';
            let html = '';
            mainIngs.forEach(ing => {
                html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span>`;
                if (ing.color === 'static-ruby') {
                    // top = no amount ever; other units scale their whole-number count with the round
                    if ((ing.unit || 'dash') === 'top') {
                        html += `<span class="ing-amount">top</span></div>`;
                    } else {
                        html += `<span class="ing-amount">${Math.round((ing.amount || 0) * round)} ${ing.unit || 'dash'}</span></div>`;
                    }
                } else {
                    html += `<span class="ing-amount">${formatAmount(ing.amount * round)}ml</span></div>`;
                }
            });
            mainSection.innerHTML = html;
            container.appendChild(mainSection);
        }

        if (subBatches.length > 0) {
            if (mainIngs.length > 0) {
                const divider = document.createElement('div');
                divider.className = 'vault-divider';
                container.appendChild(divider);
            }

            subBatches.forEach(sbName => {
                const sbIngs = recipeVault[sbName] || [];
                if (sbIngs.length === 0) return;
                const label = sbName.replace(cocktail + ' — ', '');
                
                // MULTIPLIER MATH: Scale the total yield bypassing static elements
                const baseBatchYield = sbIngs.filter(i => i.color !== 'static-ruby').reduce((s, i) => s + (i.amount || 0), 0);
                const batchYield = baseBatchYield * round;
                const mainRef = mainIngs.find(i => i.name === label);
                let yieldLabel = `${formatAmount(batchYield)}ml`;
                
                if (mainRef && mainRef.amount > 0) {
                    const drinks = Math.floor(batchYield / mainRef.amount);
                    yieldLabel += ` · ${drinks} drinks`;
                }
                const section = document.createElement('div');
                section.className = 'vault-subbatch';
                let html = `<h4 class="vault-subbatch-title">${label.toUpperCase()}<span class="vault-yield-label">${yieldLabel}</span></h4>`;
                sbIngs.forEach(ing => {
                    let amtHtml;
                    if (ing.color === 'static-ruby') {
                        amtHtml = (ing.unit || 'dash') === 'top' ? 'top' : `${Math.round((ing.amount || 0) * round)} ${ing.unit || 'dash'}`;
                    } else {
                        amtHtml = `${formatAmount(ing.amount * round)}ml`;
                    }
                    html += `<div class="subbatch-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${amtHtml}</span></div>`;
                });
                section.innerHTML = html;
                container.appendChild(section);
            });
        }
    }

    function renderVault() {
        const list = document.getElementById('managed-vault-list');
        if (!list) return;
        list.innerHTML = '';
        const specs = Object.keys(recipeVault);
        if (specs.length === 0) { list.innerHTML = '<p class="text-muted text-sm">Database empty.</p>'; return; }

        const catOrder = { 'amber-glow': 1, 'neon-cyan': 2, 'juice-glow': 3, 'magenta-glow': 4, 'coffee-dark': 5, 'puree-mango': 6, 'static-ruby': 7 };
        const mains = specs.filter(s => !s.includes(' — '));
        const orphans = specs.filter(s => s.includes(' — ') && !mains.some(m => s.startsWith(m + ' — ')));
        const toRender = [...mains, ...orphans];

        toRender.forEach(cocktail => {
            recipeVault[cocktail].sort((a, b) => (catOrder[a.color] || 10) - (catOrder[b.color] || 10));
            const subBatches = specs.filter(s => s.startsWith(cocktail + ' — '));
            subBatches.forEach(sb => recipeVault[sb].sort((a, b) => (catOrder[a.color] || 10) - (catOrder[b.color] || 10)));

            const id = cocktail.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

            const vItem = document.createElement('div');
            vItem.className = 'vault-item';

            const header = document.createElement('div');
            header.className = 'vault-header';
            header.innerHTML = `<span class="cocktail-title">${cocktail}</span>`;
            vItem.appendChild(header);

            const details = document.createElement('div');
            details.className = 'vault-details';
            details.id = `details-${id}`;

            const content = document.createElement('div');
            content.className = 'vault-content';

            const mult = document.createElement('div');
            mult.className = 'service-multiplier';
            mult.onclick = (e) => e.stopPropagation();
            mult.innerHTML = `
                <span class="text-sm fw-bold text-muted">ROUND MULTIPLIER:</span>
                <div class="stepper-control mini-stepper" style="width: auto;">
                    <button class="stepper-btn" data-action="round-minus">−</button>
                    <span class="stepper-value">1</span>
                    <button class="stepper-btn" data-action="round-plus">+</button>
                </div>
            `;
            details.appendChild(mult);

            details.appendChild(content);
            vItem.appendChild(details);

            renderVaultContent(content, cocktail, subBatches, 1);

            const getRound = () => parseInt(mult.querySelector('.stepper-value').innerText) || 1;

            mult.querySelector('[data-action="round-minus"]').addEventListener('click', (e) => {
                e.stopPropagation();
                triggerHaptic('light');
                const valEl = mult.querySelector('.stepper-value');
                const current = getRound();
                if (current > 1) {
                    valEl.innerText = current - 1;
                    renderVaultContent(content, cocktail, subBatches, current - 1);
                }
            });
            mult.querySelector('[data-action="round-plus"]').addEventListener('click', (e) => {
                e.stopPropagation();
                triggerHaptic('light');
                const valEl = mult.querySelector('.stepper-value');
                const next = getRound() + 1;
                valEl.innerText = next;
                renderVaultContent(content, cocktail, subBatches, next);
            });

            // Quick tap → toggle expand. Long-press → action sheet (edit/delete).
            let pressTimer = null;
            let pressStart = null;
            vItem.addEventListener('pointerdown', (e) => {
                if (e.target.closest('button') || e.target.closest('input')) return;
                pressStart = { x: e.clientX, y: e.clientY };
                pressTimer = setTimeout(() => {
                    pressTimer = null;
                    triggerHaptic('medium');
                    if (typeof window.openActionSheet === 'function') window.openActionSheet(cocktail);
                }, 500);
            });
            vItem.addEventListener('pointermove', (e) => {
                if (!pressTimer || !pressStart) return;
                const dx = Math.abs(e.clientX - pressStart.x);
                const dy = Math.abs(e.clientY - pressStart.y);
                if (dx > 10 || dy > 10) { clearTimeout(pressTimer); pressTimer = null; }
            });
            vItem.addEventListener('pointerup', () => {
                if (!pressTimer) return;
                clearTimeout(pressTimer);
                pressTimer = null;
                triggerHaptic('light');
                vItem.classList.toggle('expanded');
            });
           vItem.addEventListener('pointercancel', () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            });
            list.appendChild(vItem);
        });
        // Auto-seed the shelf data layer (UI removed; data powers autocomplete + category overrides)
        if (typeof autoSeedShelf === 'function') autoSeedShelf();
    }

    // --- SPEC BUILDER ---
    let builderState = { name: '', sections: [{ name: 'MAIN', ingredients: [] }] };
    const catLabels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'juice-glow': 'JUICE', 'magenta-glow': 'SYRUP', 'coffee-dark': 'ESPRESSO', 'puree-mango': 'PUREE', 'static-ruby': 'OTHER' };
    const STATIC_UNITS = ['dash', 'squeeze', 'top'];;

    function renderBuilder() {
        const container = document.getElementById('builder-sections');
        if (!container) return;
        container.innerHTML = '';
        builderState.sections.forEach((sec, secIdx) => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'builder-section';
            sectionEl.innerHTML = `
                <div class="builder-section-header">
                    <span class="builder-section-title">${sec.name}</span>
                    ${secIdx > 0 ? '<button class="builder-section-remove">×</button>' : ''}
                </div>
                <div class="builder-rows"></div>
                <button class="builder-add-ing">＋ INGREDIENT</button>
            `;
            const rowsEl = sectionEl.querySelector('.builder-rows');
            sec.ingredients.forEach((ing, ingIdx) => {
                const row = document.createElement('div');
                row.className = 'builder-row';
                
                let amountHtml = '';
                if (ing.cat === 'static-ruby') {
                    const u = ing.unit || 'dash';
                    // 'top' has no meaningful count — hide the number input entirely
                    const countInput = u === 'top' ? '' : `<input type="number" class="builder-static-input" value="${ing.amount || ''}" placeholder="0" style="width:30px;">`;
                    amountHtml = `
                        <div style="display:flex; width: 95px; align-items:center; gap:4px; margin-right:4px;">
                           ${countInput}
                           <button class="unit-pill" data-unit="${u}">${u}</button>
                        </div>
                    `;
                } else {
                    amountHtml = `<input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">`;
                }
                
                row.innerHTML = `
                    ${amountHtml}
                    <input type="text" class="builder-row-name" list="shelf-suggestions" autocomplete="off" value="${(ing.name || '').replace(/"/g, '&quot;')}" placeholder="Ingredient">
                    <button class="builder-row-cat ${ing.cat}">${catLabels[ing.cat] || 'SPIRIT'}</button>
                    <button class="builder-row-remove">×</button>
                `;
                
                if (ing.cat === 'static-ruby') {
                    const staticInput = row.querySelector('.builder-static-input');  // absent for 'top' rows
                    if (staticInput) {
                        staticInput.addEventListener('input', (e) => {
                            builderState.sections[secIdx].ingredients[ingIdx].amount = parseFloat(e.target.value) || 0;
                        });
                    }
                    const unitPill = row.querySelector('.unit-pill');
                    if (unitPill) {
                        unitPill.addEventListener('click', (e) => {
                            triggerHaptic('light');
                            let currIdx = STATIC_UNITS.indexOf(e.target.dataset.unit || 'dash');
                            const nextUnit = STATIC_UNITS[(currIdx + 1) % STATIC_UNITS.length];
                            builderState.sections[secIdx].ingredients[ingIdx].unit = nextUnit;
                            // 'top' stores amount:1 internally so the save filter keeps it; display never shows the number
                            if (nextUnit === 'top') builderState.sections[secIdx].ingredients[ingIdx].amount = 1;
                            renderBuilder();
                        });
                    }
                } else {
                    row.querySelector('.builder-row-amount').addEventListener('input', e => {
                        builderState.sections[secIdx].ingredients[ingIdx].amount = parseFloat(e.target.value) || 0;
                    });
                }
                
                row.querySelector('.builder-row-name').addEventListener('input', e => {
                    const val = e.target.value;
                    builderState.sections[secIdx].ingredients[ingIdx].name = val;
                    if (!val.trim()) return;
                    const currentCat = builderState.sections[secIdx].ingredients[ingIdx].cat;
                    // Shelf hit wins (preserves overrides like Yuzu = LIQUEUR). Else fall back to keyword detection.
                    let detectedCat = null;
                    let shelfHit = false;
                    if (typeof shelfData !== 'undefined') {
                        const shelfMatch = Object.keys(shelfData).find(k => k.toLowerCase() === val.toLowerCase().trim());
                        if (shelfMatch) { detectedCat = shelfData[shelfMatch].category; shelfHit = true; }
                    }
                    if (!shelfHit) detectedCat = categorizeIngredient(val);
                    // Shelf hits always apply. Keyword fallback only when row is still at default amber-glow (don't override manual cycling).
                    const shouldUpdate = detectedCat && detectedCat !== currentCat && (shelfHit || currentCat === 'amber-glow');
                    if (shouldUpdate) {
                        builderState.sections[secIdx].ingredients[ingIdx].cat = detectedCat;
                        if (detectedCat === 'static-ruby' || currentCat === 'static-ruby') {
                            renderBuilder();
                        } else {
                            const catBtn = row.querySelector('.builder-row-cat');
                            catBtn.className = `builder-row-cat ${detectedCat}`;
                            catBtn.innerText = catLabels[detectedCat] || 'SPIRIT';
                        }
                    }
                });
                row.querySelector('.builder-row-cat').addEventListener('click', () => {
                triggerHaptic('light');
                const cats = ['amber-glow', 'neon-cyan', 'juice-glow', 'puree-mango', 'magenta-glow', 'coffee-dark', 'static-ruby'];
                const current = builderState.sections[secIdx].ingredients[ingIdx].cat;
                    const next = cats[(cats.indexOf(current) + 1) % cats.length];
                    builderState.sections[secIdx].ingredients[ingIdx].cat = next;
                    if (next === 'static-ruby' || current === 'static-ruby') {
                        renderBuilder(); // Re-render to toggle the static input UI
                    } else {
                        const btn = row.querySelector('.builder-row-cat');
                        btn.className = `builder-row-cat ${next}`;
                        btn.innerText = catLabels[next];
                    }
                });
                row.querySelector('.builder-row-remove').addEventListener('click', () => {
                    triggerHaptic('light');
                    builderState.sections[secIdx].ingredients.splice(ingIdx, 1);
                    renderBuilder();
                });
                rowsEl.appendChild(row);
            });
            sectionEl.querySelector('.builder-add-ing').addEventListener('click', () => {
                triggerHaptic('light');
                builderState.sections[secIdx].ingredients.push({ amount: 0, name: '', cat: 'amber-glow' });
                renderBuilder();
            });
            if (secIdx > 0) {
                sectionEl.querySelector('.builder-section-remove').addEventListener('click', () => {
                    openConfirmModal({
                        title: 'REMOVE SECTION',
                        message: `Remove "${sec.name}"? Ingredients in it will be lost.`,
                        confirmLabel: 'REMOVE',
                        danger: true,
                        onConfirm: () => {
                            builderState.sections.splice(secIdx, 1);
                            renderBuilder();
                        }
                    });
                });
            }
            container.appendChild(sectionEl);
        });
    }

    function resetBuilder() {
        builderState = { name: '', sections: [{ name: 'MAIN', ingredients: [] }] };
        const nameInput = document.getElementById('builder-name');
        if (nameInput) nameInput.value = '';
        editingCocktailName = null;
        if (typeof closeBatchBuilder === 'function') closeBatchBuilder();
        renderBuilder();
        if (typeof collapseSpecBuilder === 'function') collapseSpecBuilder();
    }

    // Section category rules for auto-sweep pre-ticking (Cream is fuzzy — name-matched)
    const SECTION_SWEEP_RULES = {
        'Spirit Batch': (ing) => ['amber-glow', 'neon-cyan', 'magenta-glow'].includes(ing.cat),
        'Juice Batch':  (ing) => ['juice-glow', 'puree-mango', 'magenta-glow'].includes(ing.cat),
        'Mocktail':     (ing) => ['juice-glow', 'puree-mango', 'magenta-glow'].includes(ing.cat),
        'Cream':        (ing) => /cream|milk|coconut|dairy/i.test(ing.name || '') || ing.cat === 'magenta-glow'
    };

    // Checklist modal: pick MAIN ingredients to move into a new section.
    // preTicked = indices into MAIN suggested by the sweep rule.
    function openSectionPicker(sectionName, preTicked) {
        const mainSec = builderState.sections.find(s => s.name === 'MAIN');
        const pool = mainSec ? mainSec.ingredients.filter(i => i.name && i.name.trim()) : [];
        if (pool.length === 0) {
            // nothing to pick from — just create the empty section
            builderState.sections.push({ name: sectionName, ingredients: [] });
            renderBuilder();
            return;
        }
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = `MOVE INTO ${sectionName.toUpperCase()}`;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        const ticked = new Set(preTicked);
        pool.forEach((ing, i) => {
            const item = document.createElement('div');
            item.className = 'modal-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            const check = () => `<span style="color: var(--nodee-gold); font-weight: 900;">${ticked.has(i) ? '✓' : ''}</span>`;
            item.innerHTML = `<span>${ing.name}</span>${check()}`;
            if (ticked.has(i)) item.style.borderColor = 'rgba(200, 169, 126, 0.5)';
            item.onclick = () => {
                triggerHaptic('light');
                if (ticked.has(i)) ticked.delete(i); else ticked.add(i);
                item.innerHTML = `<span>${ing.name}</span>${check()}`;
                item.style.borderColor = ticked.has(i) ? 'rgba(200, 169, 126, 0.5)' : '';
            };
            list.appendChild(item);
        });
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        actions.innerHTML = `<button class="btn-secondary">SKIP</button><button class="btn-primary">MOVE SELECTED</button>`;
        actions.children[0].addEventListener('click', () => {
            triggerHaptic('light');
            builderState.sections.push({ name: sectionName, ingredients: [] });
            closeSelectModal();
            renderBuilder();
        });
        actions.children[1].addEventListener('click', () => {
            triggerHaptic('heavy');
            const sec = { name: sectionName, ingredients: [] };
            // splice from MAIN highest-index-first so indices stay valid
            const chosen = [...ticked].sort((a, b) => b - a);
            const mainIngs = mainSec.ingredients;
            // map pool indices back to actual MAIN indices (pool filtered empties)
            const poolToMain = [];
            let pi = 0;
            mainIngs.forEach((ing, mi) => { if (ing.name && ing.name.trim()) { poolToMain[pi] = mi; pi++; } });
            chosen.forEach(poolIdx => {
                const mainIdx = poolToMain[poolIdx];
                sec.ingredients.unshift(mainIngs.splice(mainIdx, 1)[0]);
            });
            builderState.sections.push(sec);
            closeSelectModal();
            renderBuilder();
        });
        list.appendChild(actions);
        modal.classList.remove('hidden');
    }

    const addSectionBtn = document.getElementById('add-section-btn');
    if (addSectionBtn) {
        addSectionBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const presets = [
                { label: 'Spirit Batch', value: 'Spirit Batch' },
                { label: 'Juice Batch', value: 'Juice Batch' },
                { label: 'Cream', value: 'Cream' },
                { label: 'Mocktail', value: 'Mocktail' }
            ];
            openSelectModal('ADD SECTION', presets,
                (val) => {
                    // Known type: auto-sweep suggests ticks, checklist confirms
                    const mainSec = builderState.sections.find(s => s.name === 'MAIN');
                    const rule = SECTION_SWEEP_RULES[val];
                    const pre = [];
                    if (mainSec && rule) {
                        let pi = 0;
                        mainSec.ingredients.forEach(ing => {
                            if (ing.name && ing.name.trim()) {
                                if (rule(ing)) pre.push(pi);
                                pi++;
                            }
                        });
                    }
                    setTimeout(() => openSectionPicker(val, pre), 350);
                },
                {
                    placeholder: 'Or type custom section name...',
                    btnLabel: 'ADD CUSTOM',
                    onSubmit: (val) => {
                        // Custom: no rule — checklist opens unticked
                        setTimeout(() => openSectionPicker(capitalize(val), []), 350);
                    }
                }
            );
        });
    }

    const saveSpecBtn = document.getElementById('save-spec-btn');
    if (saveSpecBtn) {
        saveSpecBtn.addEventListener('click', async () => {
            triggerHaptic('heavy');
            const name = capitalize(document.getElementById('builder-name').value.trim());
            if (!name) {
                openAlertModal({ title: 'NAME REQUIRED', message: 'Add a cocktail name before saving.' });
                return;
            }
            const payload = [];
            builderState.sections.forEach(sec => {
                const sectionName = sec.name === 'MAIN' ? name : `${name} — ${sec.name}`;
                sec.ingredients.forEach(ing => {
                    if (!ing.name.trim() || !ing.amount) return;
                    payload.push({
                        cocktailName: sectionName,
                        ingredientName: capitalize(ing.name.trim()),
                        amount: parseFloat(ing.amount),
                        bottleSize: 0,
                        categoryTag: ing.cat,
                        unit: ing.cat === 'static-ruby' ? (ing.unit || 'dash') : ''
                    });
                });
            });
            if (payload.length === 0) {
                openAlertModal({ title: 'NO INGREDIENTS', message: 'Add at least one ingredient with name and amount.' });
                return;
            }
            showLoader("SAVING SPEC...");
            try {
                if (editingCocktailName) {
                    const toDelete = [editingCocktailName, ...Object.keys(recipeVault).filter(n => n.startsWith(editingCocktailName + ' — '))];
                    for (const n of toDelete) {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: n }) });
                    }
                }
                await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
                resetBuilder();
                await loadVault();
            } catch (e) {
                hideLoader();
                openAlertModal({ title: 'SAVE FAILED', message: 'Something went wrong. Please try again.' });
            }
        });
    }

    const toggleBulkBtn = document.getElementById('toggle-bulk-import');
    if (toggleBulkBtn) {
        toggleBulkBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const ui = document.getElementById('bulk-import-ui');
            if (ui) ui.classList.toggle('hidden');
        });
    }

    // --- BATCH BUILDER ---
    let batchBuilderState = null;

    function openBatchBuilder() {
        // Smart default: open to the first unused batch type (Spirit → Juice → Espresso → Mocktail)
        const typeOrder = ['Spirit Batch', 'Juice Batch', 'Espresso Batch', 'Mocktail'];
        const defaultType = typeOrder.find(t => !builderState.sections.find(s => s.name === t)) || 'Spirit Batch';
        batchBuilderState = { type: defaultType, customType: '', ingredients: [], perDrink: 0 };
        
        const addBtn = document.getElementById('add-batch-btn');
        if (addBtn) addBtn.classList.add('hidden');
        
        sweepIntoBatch(defaultType);
        renderBuilder();
        renderBatchForm();
    }

    // Shared sweep — sweeps MAIN into the batch, merges existing sub-section, fills placeholders if empty
    function sweepIntoBatch(targetType) {
        const mainSec = builderState.sections.find(s => s.name === 'MAIN');
        
        let allowed = ['amber-glow', 'neon-cyan', 'juice-glow', 'puree-mango', 'magenta-glow', 'coffee-dark'];
        if (BATCH_CONFIG[targetType]) allowed = BATCH_CONFIG[targetType].allowedCategories;
        else if (targetType === 'Mocktail') allowed = ['juice-glow', 'puree-mango', 'magenta-glow'];
        
        // Build exclusion sets: names already in OTHER sub-batches, plus all sub-batch names (so refs don't pull in as constituents)
        const inOtherBatch = new Set();
        const subSectionNames = new Set();
        builderState.sections.forEach(s => {
            if (s.name === 'MAIN') return;
            subSectionNames.add(s.name.toLowerCase());
            if (s.name === targetType) return;
            s.ingredients.forEach(i => { if (i.name) inOtherBatch.add(i.name.toLowerCase().trim()); });
        });
        
        // Sweep MAIN — no amount filter; pull anything with right cat, skip batch refs and cross-batch dupes
        if (mainSec) {
            for (let i = mainSec.ingredients.length - 1; i >= 0; i--) {
                const ing = mainSec.ingredients[i];
                if (!ing.name || !ing.name.trim()) continue;
                if (!allowed.includes(ing.cat)) continue;
                const lowName = ing.name.toLowerCase().trim();
                if (subSectionNames.has(lowName)) continue;
                if (inOtherBatch.has(lowName)) continue;
                batchBuilderState.ingredients.unshift(mainSec.ingredients.splice(i, 1)[0]);
            }
        }
        
        // Merge existing sub-section ingredients (handles re-opening / editing an already-created batch)
        const existingSub = builderState.sections.find(s => s.name === targetType);
        if (existingSub && existingSub.ingredients.length > 0) {
            const haveNames = new Set(batchBuilderState.ingredients.map(i => (i.name || '').toLowerCase().trim()));
            existingSub.ingredients.forEach(i => {
                const lowName = (i.name || '').toLowerCase().trim();
                if (lowName && !haveNames.has(lowName)) {
                    batchBuilderState.ingredients.push({ amount: i.amount, name: i.name, cat: i.cat, unit: i.unit });
                }
            });
        }
        
        // Placeholder fallback if still empty — skip placeholders whose category is already in another sub-batch
        if (batchBuilderState.ingredients.length === 0) {
            const catsInOtherBatch = new Set();
            builderState.sections.forEach(s => {
                if (s.name === 'MAIN' || s.name === targetType) return;
                s.ingredients.forEach(i => catsInOtherBatch.add(i.cat));
            });
            if (targetType === 'Juice Batch' || targetType === 'Mocktail') {
                batchBuilderState.ingredients.push({ amount: 0, name: 'Juice', cat: 'juice-glow' });
                if (!catsInOtherBatch.has('puree-mango')) batchBuilderState.ingredients.push({ amount: 0, name: 'Puree', cat: 'puree-mango' });
                if (!catsInOtherBatch.has('magenta-glow')) batchBuilderState.ingredients.push({ amount: 0, name: 'Syrup', cat: 'magenta-glow' });
            } else {
                const defCat = allowed[0] || 'amber-glow';
                const batchNameMap = { 'coffee-dark': 'Espresso', 'juice-glow': 'Juice', 'magenta-glow': 'Syrup', 'puree-mango': 'Puree' };
                batchBuilderState.ingredients.push({ amount: 0, name: batchNameMap[defCat] || '', cat: defCat });
            }
            batchBuilderState.perDrink = 0;
        } else {
            // Prefer existing MAIN ref's amount (preserves pour size on edit); else sum constituents
            const mainRef = mainSec && mainSec.ingredients.find(i => i.name && i.name.toLowerCase().trim() === targetType.toLowerCase());
            if (mainRef && mainRef.amount > 0) {
                batchBuilderState.perDrink = mainRef.amount;
            } else {
                batchBuilderState.perDrink = batchBuilderState.ingredients.filter(i => i.cat !== 'static-ruby').reduce((sum, ing) => sum + (ing.amount || 0), 0);
            }
        }
    }

    function closeBatchBuilder() {
        if (batchBuilderState) {
            const mainSec = builderState.sections.find(s => s.name === 'MAIN');
            if (mainSec) {
                batchBuilderState.ingredients.forEach(ing => {
                    if (ing.name.trim()) mainSec.ingredients.push(ing);
                });
                renderBuilder();
            }
        }
        batchBuilderState = null;
        const c = document.getElementById('batch-form-container');
        if (c) c.innerHTML = '';
        
        const addBtn = document.getElementById('add-batch-btn');
        if (addBtn) addBtn.classList.remove('hidden');
    }

    function confirmBatchBuilder() {
        if (!batchBuilderState) return;
        const validIngs = batchBuilderState.ingredients.filter(i => i.name.trim() && i.amount > 0);
        if (validIngs.length === 0) return openAlertModal("Add at least one constituent ingredient with name and amount.");
        
        const perDrink = batchBuilderState.perDrink;
        if (!perDrink || perDrink <= 0) return openAlertModal("Set a service pour amount greater than 0.");
        
        const batchName = batchBuilderState.type === 'Custom'
            ? capitalize(batchBuilderState.customType.trim())
            : batchBuilderState.type;
        if (!batchName) return openAlertModal("Pick a batch type or enter a custom name.");
        const categoryMap = { 'Spirit Batch': 'amber-glow', 'Juice Batch': 'juice-glow', 'Espresso Batch': 'coffee-dark', 'Mocktail': 'juice-glow' };
        const mainCat = categoryMap[batchName] || 'amber-glow';
        let subSection = builderState.sections.find(s => s.name === batchName);
        if (!subSection) {
            subSection = { name: batchName, ingredients: [] };
            builderState.sections.push(subSection);
        }
        
        // Clear existing ingredients to prevent duplication on edit
        subSection.ingredients = []; 
        
        validIngs.forEach(i => {
            subSection.ingredients.push({ amount: i.amount, name: capitalize(i.name.trim()), cat: i.cat, unit: i.unit });
        });
        const mainSection = builderState.sections.find(s => s.name === 'MAIN');
        if (mainSection) {
            const existing = mainSection.ingredients.find(i => i.name && i.name.toLowerCase() === batchName.toLowerCase());
            if (existing) { existing.amount = perDrink; existing.cat = mainCat; }
            else { mainSection.ingredients.push({ amount: perDrink, name: batchName, cat: mainCat }); }
        }
                
        batchBuilderState.ingredients = [];
        closeBatchBuilder();
        renderBuilder();
        
        const scrollArea = document.getElementById('scroll-area');
        if (scrollArea) scrollArea.scrollTop = 0;
    }

    function renderBatchForm() {
        const container = document.getElementById('batch-form-container');
        if (!container) return;
        if (!batchBuilderState) { container.innerHTML = ''; return; }
        const types = ['Spirit Batch', 'Juice Batch', 'Espresso Batch', 'Mocktail', 'Custom'];
        
        container.innerHTML = `
            <div class="batch-form">
                <h4 class="batch-form-title">NEW BATCH</h4>
                <div class="batch-type-pills">
                    ${types.map(t => `<button class="batch-type-pill ${batchBuilderState.type === t ? 'active' : ''}" data-type="${t}">${t.replace(' Batch', '')}</button>`).join('')}
                </div>
                ${batchBuilderState.type === 'Custom' ? `<input type="text" class="premium-text-input batch-custom-input" placeholder="Batch name" value="${batchBuilderState.customType.replace(/"/g, '&quot;')}">` : ''}
                <h5 class="batch-section-label">CONSTITUENTS (1-COCKTAIL RATIO)</h5>
                <div id="batch-ingredients-list"></div>
                <button id="batch-add-ing-btn" class="builder-add-ing">＋ INGREDIENT</button>
                
                <div class="batch-per-drink-row" style="flex-direction: column; align-items: stretch; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                    <div style="display:flex; justify-content: space-between; margin-bottom: 12px; align-items: center;">
                        <span class="text-muted text-xs">RATIO SUM:</span>
                        <span id="batch-auto-sum" class="text-muted text-xs" style="font-size: 0.9rem;">0 ml</span>
                    </div>
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <span class="batch-per-drink-label text-gold" style="font-size: 0.75rem; letter-spacing: 1.5px;">SERVICE POUR:</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button class="batch-stepper-btn" id="batch-per-drink-minus">−5</button>
                            <input type="number" id="batch-per-drink-input" class="batch-per-drink-input" value="${batchBuilderState.perDrink}">
                            <button class="batch-stepper-btn" id="batch-per-drink-plus">+5</button>
                            <span class="batch-per-drink-suffix">ml</span>
                        </div>
                    </div>
                </div>

                <div class="batch-form-actions" style="margin-top: 20px;">
                    <button id="batch-cancel-btn" class="batch-cancel">CANCEL</button>
                    <button id="batch-create-btn" class="batch-confirm">CREATE BATCH</button>
                </div>
            </div>
        `;

        container.querySelectorAll('.batch-type-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                triggerHaptic('light');
                const newType = pill.getAttribute('data-type');
                if (newType === batchBuilderState.type) return;

                // Return current batch ingredients to MAIN so the sweep can re-pick them under the new rules
                const mainSec = builderState.sections.find(s => s.name === 'MAIN');
                if (mainSec) {
                    batchBuilderState.ingredients.forEach(ing => {
                        if (ing.name && ing.name.trim()) mainSec.ingredients.push(ing);
                    });
                }
                batchBuilderState.ingredients = [];
                batchBuilderState.type = newType;
                
                sweepIntoBatch(newType);

                renderBuilder();
                renderBatchForm();
            });
        });

        const customInput = container.querySelector('.batch-custom-input');
        if (customInput) customInput.addEventListener('input', e => { batchBuilderState.customType = e.target.value; });
        
        renderBatchIngredients();
        
        document.getElementById('batch-add-ing-btn').addEventListener('click', () => {
            triggerHaptic('light');
            let defaultCat = 'amber-glow';
            if (BATCH_CONFIG[batchBuilderState.type]) defaultCat = BATCH_CONFIG[batchBuilderState.type].allowedCategories[0];
            else if (batchBuilderState.type === 'Mocktail') defaultCat = 'juice-glow';
            let defName = defaultCat === 'coffee-dark' ? 'Espresso' : '';
            batchBuilderState.ingredients.push({ amount: 0, name: defName, cat: defaultCat });
            renderBatchIngredients();
        });

        document.getElementById('batch-per-drink-input').addEventListener('input', e => {
            batchBuilderState.perDrink = parseFloat(e.target.value) || 0;
        });
        document.getElementById('batch-per-drink-minus').addEventListener('click', () => {
            triggerHaptic('light');
            batchBuilderState.perDrink = Math.max(0, (batchBuilderState.perDrink || 0) - 5);
            document.getElementById('batch-per-drink-input').value = batchBuilderState.perDrink;
        });
        document.getElementById('batch-per-drink-plus').addEventListener('click', () => {
            triggerHaptic('light');
            batchBuilderState.perDrink = (batchBuilderState.perDrink || 0) + 5;
            document.getElementById('batch-per-drink-input').value = batchBuilderState.perDrink;
        });
        document.getElementById('batch-cancel-btn').addEventListener('click', () => { triggerHaptic('light'); closeBatchBuilder(); });
        document.getElementById('batch-create-btn').addEventListener('click', () => { triggerHaptic('heavy'); confirmBatchBuilder(); });
        
        updateBatchYieldDisplay();
    }

    function renderBatchIngredients() {
        const list = document.getElementById('batch-ingredients-list');
        if (!list || !batchBuilderState) return;
        list.innerHTML = '';
        batchBuilderState.ingredients.forEach((ing, idx) => {
            const row = document.createElement('div');
            row.className = 'builder-row';
            
            let amountHtml = '';
            if (ing.cat === 'static-ruby') {
                const u = ing.unit || 'dash';
                const countInput = u === 'top' ? '' : `<input type="number" class="builder-static-input" value="${ing.amount || ''}" placeholder="0" style="width:30px;">`;
                amountHtml = `
                    <div style="display:flex; width: 85px; align-items:center; gap:4px; margin-right:4px;">
                       ${countInput}
                       <button class="unit-pill" data-unit="${u}">${u}</button>
                    </div>
                `;
            } else {
                amountHtml = `<input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">`;
            }
            
            row.innerHTML = `
                ${amountHtml}
                <input type="text" class="builder-row-name" list="shelf-suggestions" autocomplete="off" value="${(ing.name || '').replace(/"/g, '&quot;')}" placeholder="Ingredient">
                <button class="builder-row-cat ${ing.cat}">${catLabels[ing.cat] || 'SPIRIT'}</button>
                <button class="builder-row-remove">×</button>
            `;
            
            if (ing.cat === 'static-ruby') {
                const staticInput = row.querySelector('.builder-static-input');
                if (staticInput) {
                    staticInput.addEventListener('input', (e) => {
                        batchBuilderState.ingredients[idx].amount = parseFloat(e.target.value) || 0;
                    });
                }
                const unitPill = row.querySelector('.unit-pill');
                if (unitPill) {
                    unitPill.addEventListener('click', (e) => {
                        triggerHaptic('light');
                        let currIdx = STATIC_UNITS.indexOf(e.target.dataset.unit || 'dash');
                        const nextUnit = STATIC_UNITS[(currIdx + 1) % STATIC_UNITS.length];
                        batchBuilderState.ingredients[idx].unit = nextUnit;
                        if (nextUnit === 'top') batchBuilderState.ingredients[idx].amount = 1;
                        renderBatchIngredients();
                    });
                }
            } else {
                row.querySelector('.builder-row-amount').addEventListener('input', e => {
                    batchBuilderState.ingredients[idx].amount = parseFloat(e.target.value) || 0;
                    updateBatchYieldDisplay();
                });
            }
            
            row.querySelector('.builder-row-name').addEventListener('input', e => {
                batchBuilderState.ingredients[idx].name = e.target.value;
            });
            row.querySelector('.builder-row-cat').addEventListener('click', () => {
                triggerHaptic('light');
                
                let cats = ['amber-glow', 'neon-cyan', 'juice-glow', 'puree-mango', 'magenta-glow', 'coffee-dark', 'static-ruby'];
                if (BATCH_CONFIG[batchBuilderState.type]) {
                    cats = BATCH_CONFIG[batchBuilderState.type].allowedCategories;
                } else if (batchBuilderState.type === 'Mocktail') {
                    cats = ['juice-glow', 'puree-mango', 'magenta-glow'];
                }

                if (cats.length === 1) {
                    row.classList.remove('bouncer-reject-pulse');
                    void row.offsetWidth; 
                    row.classList.add('bouncer-reject-pulse');
                    triggerHaptic('heavy');
                    const catName = catLabels[cats[0]] || (cats[0] === 'coffee-dark' ? 'ESPRESSO' : 'this category');
                    openAlertModal({ title: 'THE BOUNCER', message: `This bucket is strictly locked to ${catName}.` });
                    return; 
                }

                const current = batchBuilderState.ingredients[idx].cat;
                let curIdx = cats.indexOf(current);
                if (curIdx === -1) curIdx = 0;
                
                const next = cats[(curIdx + 1) % cats.length];
                batchBuilderState.ingredients[idx].cat = next;
                
                if (next === 'static-ruby' || current === 'static-ruby') {
                    renderBatchIngredients(); 
                } else {
                    const btn = row.querySelector('.builder-row-cat');
                    btn.className = `builder-row-cat ${next}`;
                    btn.innerText = catLabels[next];
                }
            });
            row.querySelector('.builder-row-remove').addEventListener('click', () => {
                triggerHaptic('light');
                const removed = batchBuilderState.ingredients.splice(idx, 1)[0];
                
                const mainSec = builderState.sections.find(s => s.name === 'MAIN');
                if (mainSec && removed.name.trim() !== '') {
                    mainSec.ingredients.push(removed);
                    renderBuilder();
                }

                if (batchBuilderState.ingredients.length === 0) {
                    let defCat = 'amber-glow';
                    if (BATCH_CONFIG[batchBuilderState.type]) defCat = BATCH_CONFIG[batchBuilderState.type].allowedCategories[0];
                    batchBuilderState.ingredients.push({ amount: 0, name: '', cat: defCat });
                }
                renderBatchIngredients();
                updateBatchYieldDisplay();
            });
            list.appendChild(row);
        });
    }

    function updateBatchYieldDisplay() {
        const autoSum = document.getElementById('batch-auto-sum');
        if (!autoSum || !batchBuilderState) return;
        const total = batchBuilderState.ingredients.filter(i => i.cat !== 'static-ruby').reduce((s, i) => s + (i.amount || 0), 0);
        autoSum.innerText = `${total.toFixed(1).replace(/\.0$/, '')} ml`;
    }

    const addBatchBtn = document.getElementById('add-batch-btn');
    if (addBatchBtn) {
        addBatchBtn.addEventListener('click', () => {
            triggerHaptic('light');
            if (batchBuilderState) closeBatchBuilder();
            else openBatchBuilder();
        });
    }

    renderBuilder();

    // --- THE SHELF ---
    const SHELF_KEY = 'codex_shelf_v1';
    let shelfData = {};
    let shelfAddState = null;
    const shelfCatLabels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'juice-glow': 'JUICE', 'magenta-glow': 'SYRUP', 'coffee-dark': 'ESPRESSO', 'puree-mango': 'PUREE', 'static-ruby': 'OTHER' };
    const shelfDefaultAbvs = { 'amber-glow': 40, 'neon-cyan': 20, 'juice-glow': 0, 'magenta-glow': 0, 'coffee-dark': 0, 'puree-mango': 0, 'static-ruby': 45 };

    function loadShelf() {
        try {
            const raw = localStorage.getItem(SHELF_KEY);
            shelfData = raw ? JSON.parse(raw) : {};
        } catch { shelfData = {}; }
    }

    function saveShelf() {
        try { localStorage.setItem(SHELF_KEY, JSON.stringify(shelfData)); } catch {}
        refreshShelfDatalist();
    }

    function refreshShelfDatalist() {
        let dl = document.getElementById('shelf-suggestions');
        if (!dl) {
            dl = document.createElement('datalist');
            dl.id = 'shelf-suggestions';
            document.body.appendChild(dl);
        }
        dl.innerHTML = '';
        Object.keys(shelfData)
            .sort((a, b) => a.localeCompare(b))
            .forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                dl.appendChild(opt);
            });
    }

    window.autoSeedShelf = function() {
        const isBatchRef = (name) => {
            const low = (name || '').toLowerCase();
            return /^(spirit|juice|cream).*batch$/.test(low) || /^mocktail$/.test(low);
        };
        let changed = false;
        Object.keys(recipeVault || {}).forEach(cocktailName => {
            (recipeVault[cocktailName] || []).forEach(ing => {
                if (!ing.name || isBatchRef(ing.name)) return;
                if (!shelfData[ing.name]) {
                    shelfData[ing.name] = {
                        category: ing.color || 'amber-glow',
                        abv: shelfDefaultAbvs[ing.color] ?? 0,
                        inStock: true
                    };
                    changed = true;
                }
            });
        });
        if (changed) saveShelf();
    };

    loadShelf();
    refreshShelfDatalist();

    const legacyLockBtn = document.getElementById('edit-toggle');
    if (legacyLockBtn) legacyLockBtn.remove();

    function expandSpecBuilder() {
        document.getElementById('new-spec-btn')?.classList.add('hidden');
        document.getElementById('builder-content')?.classList.remove('hidden');
    }
    function collapseSpecBuilder() {
        document.getElementById('new-spec-btn')?.classList.remove('hidden');
        document.getElementById('builder-content')?.classList.add('hidden');
    }
    window.expandSpecBuilder = expandSpecBuilder;
    window.collapseSpecBuilder = collapseSpecBuilder;
    document.getElementById('new-spec-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        expandSpecBuilder();
    });
    document.getElementById('cancel-spec-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        resetBuilder();
    });

    if (!document.getElementById('action-sheet-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="action-sheet-modal" class="modal-overlay hidden">
                <div class="action-sheet">
                    <div class="action-sheet-title"></div>
                    <button class="action-sheet-btn" data-action="edit">EDIT SPEC</button>
                    <button class="action-sheet-btn action-sheet-danger" data-action="delete">DELETE</button>
                    <button class="action-sheet-btn action-sheet-cancel" data-action="cancel">CANCEL</button>
                </div>
            </div>
        `);
        const sheet = document.getElementById('action-sheet-modal');
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) { sheet.classList.add('hidden'); return; }
            const action = e.target.getAttribute('data-action');
            if (!action) return;
            const cocktailName = sheet.dataset.cocktailName;
            sheet.classList.add('hidden');
            if (action === 'edit' && cocktailName) editSpec(cocktailName);
            else if (action === 'delete' && cocktailName) deleteSpec(cocktailName);
        });
    }
    window.openActionSheet = (cocktailName) => {
        const sheet = document.getElementById('action-sheet-modal');
        if (!sheet) return;
        sheet.dataset.cocktailName = cocktailName;
        sheet.querySelector('.action-sheet-title').innerText = cocktailName;
        sheet.classList.remove('hidden');
    };
    
    // --- EDIT & DELETE ---
    window.editSpec = (name) => {
        triggerHaptic('heavy');
        editingCocktailName = name;
        const related = [name, ...Object.keys(recipeVault).filter(n => n.startsWith(name + ' — '))];
        builderState = { name: name, sections: [] };
        related.forEach(sectionName => {
            const isMain = sectionName === name;
            const sec = { name: isMain ? 'MAIN' : sectionName.replace(name + ' — ', ''), ingredients: [] };
            (recipeVault[sectionName] || []).forEach(ing => {
                sec.ingredients.push({ amount: ing.amount, name: ing.name, cat: ing.color, unit: ing.unit });
            });
            builderState.sections.push(sec);
        });
        builderState.sections.sort((a, b) => (a.name === 'MAIN' ? -1 : (b.name === 'MAIN' ? 1 : 0)));
        document.getElementById('builder-name').value = name;
        renderBuilder();
        if (typeof expandSpecBuilder === 'function') expandSpecBuilder();
        document.getElementById('scroll-area').scrollTop = 0;
    };

    window.deleteSpec = (name) => {
        openConfirmModal({
            title: 'DELETE SPEC',
            message: `Delete "${name}"? This can't be undone.`,
            confirmLabel: 'DELETE',
            danger: true,
            onConfirm: async () => {
                triggerHaptic('heavy');
                showLoader("DELETING...");
                try {
                    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: name }) });
                    await loadVault();
                } catch (e) { hideLoader(); }
            }
        });
    };

    // --- SMART PARSER ---
    const parseBtn = document.getElementById('parse-btn');
    if (parseBtn) {
        parseBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const title = capitalize(document.getElementById('spec-title-input').value.trim());
            const text = document.getElementById('keep-paste-area').value;
            if(!title || !text) { openAlertModal({ title: 'MISSING INFO', message: 'Need both a cocktail title and recipe text.' }); return; }
            if (editingCocktailName && editingCocktailName !== title) editingCocktailName = null;

            parsedStagingData = [];
            const lines = text.split('\n');
            const lineRegex = /^(\d+(?:[.,]\d+)?)\s*(.+)$/;
            const ratioRegex = /^\d+\s*:\s*\d+\s+(.+)$/;
            const unitStrip = /^(?:ml|g|oz|cl|tbsp|tsp|dash(?:es)?|squeeze(?:s)?|pinch(?:es)?|drop(?:s)?|barspoon(?:s)?|bsp|cube(?:s)?|leaves|leaf|shot(?:s)?)\s+/i;
            const underscoreRegex = /^_+\s*(.+?)\s*_+$/;
            
            const batchHeaderRegex = /^(spirit\s*batch|juice\s*batch|cream(?:\s+batch)?|mocktail|.+\s+batch)\s*:?\s*$/i;

            const detectBatchType = (raw) => {
                const low = raw.toLowerCase();
                if (/spirit\s*batch/.test(low)) return 'Spirit Batch';
                if (/juice\s*batch/.test(low)) return 'Juice Batch';
                if (/mocktail/.test(low)) return 'Mocktail';
                if (/cream/.test(low)) return 'Cream';
                return capitalize(raw.replace(/:$/, '').trim());
            };

            const categorize = categorizeIngredient;

            let currentSection = title;
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;

                const underscoreMatch = trimmed.match(underscoreRegex);
                if (underscoreMatch) {
                    currentSection = `${title} — ${detectBatchType(underscoreMatch[1])}`;
                    return;
                }

                if (!/^\d/.test(trimmed) && batchHeaderRegex.test(trimmed)) {
                    currentSection = `${title} — ${detectBatchType(trimmed)}`;
                    return;
                }

                const ratioMatch = trimmed.match(ratioRegex);
                if (ratioMatch) {
                    const parts = ratioMatch[1].split(/\s+and\s+/i);
                    parts.forEach(p => {
                        const name = capitalize(p.trim());
                        if (!name) return;
                        parsedStagingData.push({ cocktailName: currentSection, ingredientName: name, amount: 0, bottleSize: 0, categoryTag: categorize(name) });
                    });
                    return;
                }

                const ingMatch = trimmed.match(lineRegex);
                if (ingMatch) {
                    const amt = parseFloat(ingMatch[1].replace(',', '.'));
                    const rest = ingMatch[2].replace(unitStrip, '').trim();
                    if (!rest) return;
                    const name = capitalize(rest);
                    parsedStagingData.push({ cocktailName: currentSection, ingredientName: name, amount: amt, bottleSize: 0, categoryTag: categorize(name) });
                    return;
                }
            });
            renderStagingArea();
        });
    }

    function renderStagingArea() {
        const container = document.getElementById('staging-area');
        const list = document.getElementById('staging-list');
        list.innerHTML = '';
        
        if(parsedStagingData.length === 0) {
            container.classList.add('hidden');
            openAlertModal({ title: 'NO INGREDIENTS', message: "Couldn't find any ingredients. Check your format (e.g., '30ml Gin')." });
            return;
        }

        const labels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'magenta-glow': 'SYRUP', 'juice-glow': 'JUICE' };
        const groups = {};
        parsedStagingData.forEach((ing, i) => {
            if (!groups[ing.cocktailName]) groups[ing.cocktailName] = [];
            groups[ing.cocktailName].push({ ing, originalIndex: i });
        });

        Object.entries(groups).forEach(([sectionName, items]) => {
            const header = document.createElement('div');
            header.className = 'staging-section-header';
            header.innerText = sectionName;
            list.appendChild(header);
            
            items.forEach(({ ing, originalIndex }) => {
                const row = document.createElement('div');
                row.className = 'staging-row';
                row.innerHTML = `
                    <div class="staging-inputs">
                        <input type="number" class="stage-amt" value="${ing.amount}" onchange="updateStaging(${originalIndex}, 'amount', this.value)">
                        <input type="text" class="stage-name" value="${ing.ingredientName}" onchange="updateStaging(${originalIndex}, 'ingredientName', this.value)">
                    </div>
                    <button class="stage-cat ${ing.categoryTag}" onclick="cycleCategory(${originalIndex})">${labels[ing.categoryTag]}</button>
                `;
                list.appendChild(row);
            });
        });
        container.classList.remove('hidden');
    }

    window.updateStaging = (index, field, val) => {
        if(field === 'amount') parsedStagingData[index].amount = parseFloat(val);
        else parsedStagingData[index][field] = capitalize(val);
    };

    window.cycleCategory = (index) => {
        triggerHaptic('light');
        const tags = ['amber-glow', 'neon-cyan', 'magenta-glow', 'juice-glow'];
        const labels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'magenta-glow': 'SYRUP', 'juice-glow': 'JUICE' };
        let curr = tags.indexOf(parsedStagingData[index].categoryTag);
        let next = (curr + 1) % tags.length;
        const newTag = tags[next];
        parsedStagingData[index].categoryTag = newTag;
        const rows = document.querySelectorAll('#staging-list .staging-row');
        if (rows[index]) {
            const btn = rows[index].querySelector('.stage-cat');
            if (btn) { btn.className = `stage-cat ${newTag}`; btn.innerText = labels[newTag]; }
        }
    };

    const syncBtn = document.getElementById('sync-vault-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            if(parsedStagingData.length === 0) return;
            triggerHaptic('heavy');
            showLoader("PUSHING TO CODEX...");
            try {
                if (editingCocktailName) {
                    const toDelete = [editingCocktailName, ...Object.keys(recipeVault).filter(n => n.startsWith(editingCocktailName + ' — '))];
                    for (const n of toDelete) {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: n }) });
                    }
                }
                await fetch(API_URL, { method: 'POST', body: JSON.stringify(parsedStagingData) });
                
                document.getElementById('spec-title-input').value = '';
                document.getElementById('keep-paste-area').value = '';
                document.getElementById('staging-area').classList.add('hidden');
                parsedStagingData = [];
                editingCocktailName = null;
                
                await loadVault();
            } catch (e) { hideLoader(); }
        });
    }

    // --- THE LAB: SYRUP & BRIX ENGINE ---
    let brixMode = 'build';
    document.querySelectorAll('#lab-module .mod-pill').forEach(p => p.addEventListener('click', (e) => {
        triggerHaptic('light');
        document.querySelectorAll('#lab-module .mod-pill').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        brixMode = e.target.getAttribute('data-val');
        
        document.getElementById('ui-brix-build').classList.toggle('hidden', brixMode !== 'build');
        document.getElementById('ui-brix-fix').classList.toggle('hidden', brixMode !== 'fix');
        document.getElementById('brix-results').innerHTML = '';
    }));

    let activeSyrupBase = { val: 100 }; 
    const btnSyrupBase = document.getElementById('btn-syrup-base');
    if (btnSyrupBase) {
        btnSyrupBase.addEventListener('click', () => {
            openSelectModal('SWEETENER BASE', [
                {label: 'Dry Sugar (White/Demerara)', value: 100},
                {label: 'Honey (~80 Bx)', value: 80},
                {label: 'Agave (~75 Bx)', value: 75},
                {label: 'Maple Syrup (~66 Bx)', value: 66}
            ], (v, l) => {
                activeSyrupBase.val = parseFloat(v); 
                btnSyrupBase.innerText = l;
            });
        });
    }

    let activeSyrupTarget = { type: 'ratio', val: 1 };
    const btnSyrupTarget = document.getElementById('btn-syrup-target');
    if (btnSyrupTarget) {
        btnSyrupTarget.addEventListener('click', () => {
            openSelectModal('TARGET PROFILE', [
                {label: '1:1 Ratio (Weight)', value: '1:1', data: 1},
                {label: '1.5:1 Ratio (Weight)', value: '1.5:1', data: 1/1.5},
                {label: '1.85:1 Ratio (Weight)', value: '1.85:1', data: 1/1.85},
                {label: '2:1 Ratio (Weight)', value: '2:1', data: 0.5},
                {label: '3:1 Ratio (Weight)', value: '3:1', data: 1/3},
                {label: 'Custom Brix Target', value: 'custom', data: null}
            ], (v, l, data) => {
                activeSyrupTarget = { type: v === 'custom' ? 'custom' : 'ratio', val: data };
                btnSyrupTarget.innerText = l;
                document.getElementById('custom-brix-container').classList.toggle('hidden', v !== 'custom');
            });
        });
    }

    const calcBuildBtn = document.getElementById('calc-build-btn');
    if (calcBuildBtn) {
        calcBuildBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const baseWeight = parseFloat(document.getElementById('syrup-base-weight').value) || 1000;
            const res = document.getElementById('brix-results');
            let waterToAdd = 0;
            let finalBrix = 0;
            const baseBrix = activeSyrupBase.val;
            const totalSugar = baseWeight * (baseBrix / 100);

            if (activeSyrupTarget.type === 'ratio') {
                waterToAdd = baseWeight * activeSyrupTarget.val;
                const totalWeight = baseWeight + waterToAdd;
                finalBrix = (totalSugar / totalWeight) * 100;
            } else {
                const targetBrix = parseFloat(document.getElementById('custom-target-brix').value) || 50;
                if (targetBrix >= baseBrix) {
                    return openAlertModal({ title: 'INVALID BRIX', message: `Target Brix (${targetBrix.toFixed(1)}) must be lower than Base Brix (${baseBrix.toFixed(1)}).` });
                }
                const totalWeight = totalSugar / (targetBrix / 100);
                waterToAdd = totalWeight - baseWeight;
                finalBrix = targetBrix;
            }

            res.innerHTML = `
                <h3 class="zone-header">SYRUP RECIPE</h3>
                <div class="result-row neon-cyan"><span class="ing-name">Filtered Water to Add</span><span class="ing-amount">${waterToAdd.toFixed(1)}g</span></div>
                <div class="result-row magenta-glow"><span class="ing-name">Final Yield (Weight)</span><span class="ing-amount">${(baseWeight + waterToAdd).toFixed(1)}g</span></div>
                <div class="result-row mt-10"><span class="ing-name text-gold fw-bold">FINAL BRIX</span><span class="ing-amount">${finalBrix.toFixed(1)} Bx</span></div>
            `;
        });
    }

    const calcFixBtn = document.getElementById('calc-fix-btn');
    if (calcFixBtn) {
        calcFixBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const currentBrix = parseFloat(document.getElementById('fix-current-brix').value) || 65;
            const targetBrix = parseFloat(document.getElementById('fix-target-brix').value) || 50;
            const currentWeight = parseFloat(document.getElementById('fix-current-weight').value) || 1000;
            const res = document.getElementById('brix-results');

            if (currentBrix === targetBrix) {
                res.innerHTML = `<div class="result-row text-gold"><span class="ing-name">Already at Target Brix</span></div>`;
                return;
            }

            if (currentBrix > targetBrix) {
                const waterToAdd = currentWeight * ((currentBrix / targetBrix) - 1);
                res.innerHTML = `
                    <h3 class="zone-header">DILUTION REQUIRED</h3>
                    <div class="result-row neon-cyan"><span class="ing-name">Filtered Water to Add</span><span class="ing-amount">${waterToAdd.toFixed(1)}g</span></div>
                    <div class="result-row mt-10"><span class="ing-name text-gold fw-bold">NEW YIELD</span><span class="ing-amount">${(currentWeight + waterToAdd).toFixed(1)}g</span></div>
                `;
            } else {
                const sugarToAdd = currentWeight * ((targetBrix - currentBrix) / (100 - targetBrix));
                res.innerHTML = `
                    <h3 class="zone-header">ENRICHMENT REQUIRED</h3>
                    <div class="result-row magenta-glow"><span class="ing-name">Dry Sugar to Add</span><span class="ing-amount">${sugarToAdd.toFixed(1)}g</span></div>
                    <div class="result-row mt-10"><span class="ing-name text-gold fw-bold">NEW YIELD</span><span class="ing-amount">${(currentWeight + sugarToAdd).toFixed(1)}g</span></div>
                `;
            }
        });
    }

    // --- OPS MODULE ENGINE ---
    const OPS_KEY = 'codex_ops_v1';
    let opsData = { opening: [], prep: [], closing: [], periodic: [] };
    let activeOpsCategory = 'prep';

    function loadOps() {
        try {
            const raw = localStorage.getItem(OPS_KEY);
            if (raw) opsData = JSON.parse(raw);
            opsLoadedOk = true;
        } catch (e) {
            console.error('Failed to load OPS data — trying backup');
        }
        // If the primary is missing/empty/corrupt but a backup holds tasks, restore from it
        if (opsTaskCount(opsData) === 0) {
            try {
                const backup = JSON.parse(localStorage.getItem(OPS_BACKUP_KEY) || 'null');
                if (opsTaskCount(backup) > 0) {
                    opsData = backup;
                    console.warn('Restored OPS data from backup.');
                }
            } catch {}
        }

        const now = new Date();
        let lastWipeStr = localStorage.getItem('codex_ops_last_wipe');
        let wipeDate = new Date();
        wipeDate.setHours(10, 0, 0, 0); 

        if (now.getHours() < 10) wipeDate.setDate(wipeDate.getDate() - 1);

        // --- MIGRATIONS (run before wipe so shapes are correct) ---
        let migrated = false;
        // mid -> prep
        if (opsData.mid && Array.isArray(opsData.mid)) {
            opsData.prep = [...(opsData.prep || []), ...opsData.mid];
            delete opsData.mid;
            migrated = true;
        }
        // weekly + monthly -> periodic (stamp default interval if missing)
        if (!opsData.periodic) opsData.periodic = [];
        if (opsData.weekly && Array.isArray(opsData.weekly)) {
            opsData.weekly.forEach(t => { if (!t.intervalDays) t.intervalDays = 7; opsData.periodic.push(t); });
            delete opsData.weekly;
            migrated = true;
        }
        if (opsData.monthly && Array.isArray(opsData.monthly)) {
            opsData.monthly.forEach(t => { if (!t.intervalDays) t.intervalDays = 30; opsData.periodic.push(t); });
            delete opsData.monthly;
            migrated = true;
        }
        // subtasks: string[] -> {text, done}[]  (idempotent — skips if already objects)
        ['opening', 'prep', 'closing', 'periodic'].forEach(cat => {
            (opsData[cat] || []).forEach(t => {
                if (Array.isArray(t.subtasks)) {
                    t.subtasks = t.subtasks.map(s => typeof s === 'string' ? { text: s, done: false } : s);
                }
            });
        });
        // prep: classify kind (batch vs mise) + default qty — idempotent (only when kind missing)
        (opsData.prep || []).forEach(t => {
            if (!t.kind) {
                const isBatchText = /batch|mix|syrup|infus|cordial|shrub|puree|juice/i.test(t.text || '');
                t.kind = (t.linkedSpec || isBatchText) ? 'batch' : 'mise';
                migrated = true;
            }
            if (t.kind === 'batch' && !t.qty) { t.qty = 1; migrated = true; }
        });
        // periodic: seed log from lastCompleted — idempotent (only when log missing)
        (opsData.periodic || []).forEach(t => {
            if (!t.log) {
                t.log = t.lastCompleted ? [{ ts: t.lastCompleted }] : [];
                migrated = true;
            }
        });
        if (migrated) saveOps();

        // --- DAILY WIPE (SOPs untick, PREP completed-deletes; PERIODIC self-manages via interval, no calendar wipe) ---
        if (!lastWipeStr || new Date(parseInt(lastWipeStr)) < wipeDate) {
            ['opening', 'closing'].forEach(cat => {
                (opsData[cat] || []).forEach(t => {
                    t.completed = false;
                    if (Array.isArray(t.subtasks)) t.subtasks.forEach(s => s.done = false);
                });
            });
            if (opsData.prep && opsData.prep.length > 0) {
                opsData.prep = opsData.prep.filter(t => !t.completed);
            }
            localStorage.setItem('codex_ops_last_wipe', Date.now().toString());
            saveOps();
        }
    }

    const OPS_BACKUP_KEY = 'codex_ops_backup_v1';
    let opsLoadedOk = false;   // true once we've successfully read (or confirmed empty) storage

    function opsTaskCount(d) {
        if (!d) return 0;
        return ['opening', 'prep', 'closing', 'periodic']
            .reduce((n, k) => n + (Array.isArray(d[k]) ? d[k].length : 0), 0);
    }

    function saveOps() {
        // SAFETY: never let an empty in-memory state overwrite real stored data.
        // If we hold zero tasks but storage has some, the load failed — bail out instead of wiping.
        if (opsTaskCount(opsData) === 0) {
            try {
                const existing = JSON.parse(localStorage.getItem(OPS_KEY) || 'null');
                if (opsTaskCount(existing) > 0) {
                    console.error('saveOps aborted: refusing to overwrite stored tasks with an empty state.');
                    return;
                }
            } catch {}
        }
        const payload = JSON.stringify(opsData);
        localStorage.setItem(OPS_KEY, payload);
        // Rolling backup — only ever written when there is something worth keeping
        if (opsTaskCount(opsData) > 0) {
            try { localStorage.setItem(OPS_BACKUP_KEY, payload); } catch {}
        }
    }

    window.renderOpsList = function() {
        const container = document.getElementById('ops-list-container');
        if (!container) return;
        container.innerHTML = '';

        // Calculate and Update Dashboard Progress (opening + closing only — PREP is shift-flexible)
        const sopCategories = ['opening', 'closing'];
        let totalDaily = 0;
        let completedDaily = 0;
        sopCategories.forEach(cat => {
            if (opsData[cat]) {
                totalDaily += opsData[cat].length;
                completedDaily += opsData[cat].filter(t => t.completed).length;
            }
        });
        const progressPercent = totalDaily === 0 ? 0 : Math.round((completedDaily / totalDaily) * 100);
        
        const countEl = document.getElementById('ops-progress-count');
        const fillEl = document.getElementById('ops-progress-fill');
        if (countEl) countEl.innerText = `${completedDaily}/${totalDaily} (${progressPercent}%)`;
        if (fillEl) fillEl.style.width = `${progressPercent}%`;

        const tasks = opsData[activeOpsCategory] || [];
        const isNumberedSop = activeOpsCategory === 'opening' || activeOpsCategory === 'closing';
        const isPrep = activeOpsCategory === 'prep';
        const isPeriodic = activeOpsCategory === 'periodic';
        const isDraggable = isNumberedSop || isPrep;  // PREP draggable for urgency; SOPs draggable for order
        const DAY_MS = 1000 * 60 * 60 * 24;

        // PERIODIC auto-uncheck: any completed task now past its interval rejoins the active list.
        // lastCompleted is preserved so history ("Last: Jun 24") survives.
        if (isPeriodic) {
            tasks.forEach(t => {
                if (t.completed && t.lastCompleted) {
                    const interval = t.intervalDays || 30;
                    const daysSince = Math.floor((Date.now() - t.lastCompleted) / DAY_MS);
                    if (daysSince >= interval) t.completed = false;
                }
            });
            saveOps();
        }

        let sortedTasks = [];
        if (isNumberedSop) {
            sortedTasks = [...tasks].map((t, i) => ({...t, originalIndex: i}));
        } else if (isPrep) {
            // PREP: grouped — BATCHES first, then MISE; within each group completed sinks, uncompleted keep drag order
            const groupRank = (t) => (t.kind === 'mise' ? 1 : 0);
            sortedTasks = [...tasks].map((t, i) => ({...t, originalIndex: i}))
                                      .sort((a, b) => {
                                          if (groupRank(a) !== groupRank(b)) return groupRank(a) - groupRank(b);
                                          if (a.completed !== b.completed) return a.completed ? 1 : -1;
                                          return 0;
                                      });
        } else {
            // PERIODIC: uncompleted by days-until-due ascending (most overdue first), completed sink to bottom
            sortedTasks = [...tasks].map((t, i) => ({...t, originalIndex: i}))
                                      .sort((a, b) => {
                                          if (a.completed !== b.completed) return a.completed ? 1 : -1;
                                          const dueA = (a.intervalDays || 30) - (a.lastCompleted ? Math.floor((Date.now() - a.lastCompleted) / DAY_MS) : -99999);
                                          const dueB = (b.intervalDays || 30) - (b.lastCompleted ? Math.floor((Date.now() - b.lastCompleted) / DAY_MS) : -99999);
                                          return dueA - dueB;
                                      });
        }

        if (sortedTasks.length === 0) {
            container.innerHTML = '<p class="text-muted text-sm text-center" style="padding: 20px;">No tasks. Tap ＋ ADD TASK below to begin.</p>';
            return;
        }

        const formatDate = (ts) => {
            const d = new Date(ts);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };

        // Re-render just one task's subtask block in place (no full repaint, keeps row expanded + scroll)
        function rerenderSubtasks(rowEl, cat, taskIdx) {
            const task = opsData[cat][taskIdx];
            const subWrap = rowEl.querySelector('.ops-subtasks');
            if (!subWrap) return;
            buildSubtaskBlock(subWrap, rowEl, cat, taskIdx);
            // update badge count
            const badge = rowEl.querySelector('.ops-subtask-badge .count');
            const total = (task.subtasks || []).length;
            const done = (task.subtasks || []).filter(s => s.done).length;
            if (badge) badge.innerText = `${done}/${total}`;
            if (total === 0) { const b = rowEl.querySelector('.ops-subtask-badge'); if (b) b.remove(); }
        }

        // Build the interactive subtask list inside a wrapper
        function buildSubtaskBlock(subWrap, rowEl, cat, taskIdx) {
            const task = opsData[cat][taskIdx];
            subWrap.innerHTML = '';
            (task.subtasks || []).forEach((sub, sIdx) => {
                const sRow = document.createElement('div');
                sRow.className = `ops-subtask-row ${sub.done ? 'done' : ''}`;
                sRow.innerHTML = `
                    <div class="ops-subtask-check ${sub.done ? 'done' : ''}">${sub.done ? '✓' : ''}</div>
                    <span class="ops-subtask-text">${(sub.text || '').replace(/</g,'&lt;')}</span>
                    <span class="ops-subtask-edit">✎</span>
                    <span class="ops-subtask-del">×</span>
                `;
                // tick subtask -> roll-up
                sRow.querySelector('.ops-subtask-check').addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    const wasDone = task.subtasks[sIdx].done;
                    task.subtasks[sIdx].done = !wasDone;
                    const allDone = task.subtasks.length > 0 && task.subtasks.every(s => s.done);
                    if (allDone) { task.completed = true; if (isPeriodic || isPrep) task.lastCompleted = Date.now(); }
                    else if (task.completed) { task.completed = false; }
                    saveOps();
                    renderOpsList();
                });
                // edit subtask inline (tap text OR the pencil)
                const startSubEdit = (e) => {
                    e.stopPropagation();
                    const span = sRow.querySelector('.ops-subtask-text');
                    if (!span) return;
                    const input = document.createElement('input');
                    input.type = 'text'; input.className = 'ops-subtask-input'; input.value = task.subtasks[sIdx].text;
                    span.replaceWith(input); input.focus(); input.select();
                    const commit = () => {
                        const v = input.value.trim();
                        if (v) task.subtasks[sIdx].text = v;
                        saveOps();
                        rerenderSubtasks(rowEl, cat, taskIdx);
                    };
                    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(); });
                    input.addEventListener('blur', commit);
                };
                sRow.querySelector('.ops-subtask-text').addEventListener('click', startSubEdit);
                sRow.querySelector('.ops-subtask-edit').addEventListener('click', startSubEdit);
                // delete subtask
                sRow.querySelector('.ops-subtask-del').addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    task.subtasks.splice(sIdx, 1);
                    saveOps();
                    rerenderSubtasks(rowEl, cat, taskIdx);
                });
                subWrap.appendChild(sRow);
            });
            // + add step (reopens blank for rapid entry)
            const addLine = document.createElement('div');
            addLine.className = 'ops-subtask-add';
            addLine.innerHTML = `＋ add step`;
            addLine.addEventListener('click', (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'text'; input.className = 'ops-subtask-input'; input.placeholder = 'New step…';
                addLine.replaceWith(input); input.focus();
                const commit = (reopen) => {
                    const v = input.value.trim();
                    if (v) {
                        if (!task.subtasks) task.subtasks = [];
                        task.subtasks.push({ text: v, done: false });
                        // adding an undone subtask un-completes a rolled-up parent
                        if (task.completed && !task.subtasks.every(s => s.done)) task.completed = false;
                        saveOps();
                    }
                    rerenderSubtasks(rowEl, cat, taskIdx);
                    if (v && reopen) {
                        // immediately reopen a fresh add input
                        const newAdd = rowEl.querySelector('.ops-subtask-add');
                        if (newAdd) newAdd.click();
                    }
                };
                input.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(true); });
                input.addEventListener('blur', () => commit(false));
            });
            subWrap.appendChild(addLine);
        }

        // Ring builder for UPKEEP rows: fill = elapsed/interval. C = 2πr ≈ 88 at r=14.
        function buildRing(taskObj) {
            const interval = taskObj.intervalDays || 30;
            const C = 88;
            let dash = 0, color = 'rgba(200,169,126,0.5)', glyph = '';
            if (taskObj.completed) {
                dash = C; color = '#C8A97E'; glyph = '<span style="color:#C8A97E;">✓</span>';
            } else if (taskObj.lastCompleted) {
                const daysSince = Math.floor((Date.now() - taskObj.lastCompleted) / DAY_MS);
                const daysUntilDue = interval - daysSince;
                dash = Math.min(C, Math.max(0, (daysSince / interval) * C));
                if (daysUntilDue < 0) { dash = C; color = '#d97c8e'; glyph = '<span style="color:#d97c8e;">!</span>'; }
                else if (daysUntilDue <= 3) { color = '#E5B15D'; }
            }
            return `<div class="ops-ring"><svg width="34" height="34"><circle class="track" cx="17" cy="17" r="14"/><circle cx="17" cy="17" r="14" stroke="${color}" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash} ${C}"/></svg><div class="ops-ring-inner">${glyph}</div></div>`;
        }

        // Countdown block for UPKEEP rows
        function buildCountdown(taskObj) {
            const interval = taskObj.intervalDays || 30;
            if (taskObj.completed && taskObj.lastCompleted) {
                return `<div class="ops-count"><div class="num done-date">${formatDate(taskObj.lastCompleted)}</div><div class="lbl">DONE</div></div>`;
            }
            if (taskObj.lastCompleted) {
                const daysSince = Math.floor((Date.now() - taskObj.lastCompleted) / DAY_MS);
                const due = interval - daysSince;
                if (due < 0) return `<div class="ops-count overdue"><div class="num">−${Math.abs(due)}d</div><div class="lbl">OVERDUE</div></div>`;
                const cls = due <= 3 ? 'soon' : 'ok';
                return `<div class="ops-count ${cls}"><div class="num">${due}d</div><div class="lbl">DUE</div></div>`;
            }
            return `<div class="ops-count ok"><div class="num">${interval}d</div><div class="lbl">EVERY</div></div>`;
        }

        let lastPrepGroup = null;  // section header tracker for the PREP loop

        sortedTasks.forEach((taskObj, displayIndex) => {
            // PREP section headers: BATCHES / MISE, emitted at group boundaries
            if (isPrep) {
                const grp = taskObj.kind === 'mise' ? 'MISE' : 'BATCHES';
                if (grp !== lastPrepGroup) {
                    const header = document.createElement('div');
                    header.className = 'ops-prep-section';
                    header.innerText = grp;
                    container.appendChild(header);
                    lastPrepGroup = grp;
                }
            }

            const subCount = (taskObj.subtasks || []).length;
            const subDone = (taskObj.subtasks || []).filter(s => s.done).length;
            const hasSubtasks = subCount > 0;
            const isLinked = !!(taskObj.linkedSpec && taskObj.linkedSection);
            const isBatchKind = isPrep && taskObj.kind !== 'mise';
            const row = document.createElement('div');
            let rowClasses = `ops-row ${taskObj.completed ? 'completed' : ''}`;
            if (isLinked) rowClasses += ' ops-row-linked';
            row.className = rowClasses;
            row.setAttribute('draggable', isDraggable ? 'true' : 'false');
            
            let html = `<div class="ops-row-main">`;
            
            if (isNumberedSop) {
                html += `<div class="ops-number">${displayIndex + 1}</div>`;
            } else if (isPeriodic) {
                html += buildRing(taskObj);
            } else {
                html += `<div class="ops-checkbox"></div>`;
            }
            
            let labelHtml = '';
            if (isLinked) {
                labelHtml += `<span class="ops-link-glyph">🔗</span>`;
            }
            labelHtml += taskObj.text;
            
            if (isPrep && isLinked && taskObj.lastCompleted) {
                labelHtml += `<div class="ops-time-tag">Last batched: ${formatDate(taskObj.lastCompleted)}</div>`;
            }
            
            html += `<span class="ops-text" style="flex:1;">${labelHtml}</span>`;
            
            // PREP batch rows: qty chip (always visible, doubles as the batch marker)
            if (isBatchKind && !taskObj.completed) {
                html += `<span class="ops-qty-chip" data-qty="${taskObj.qty || 1}">×${taskObj.qty || 1}</span>`;
            }
            if (hasSubtasks) {
                html += `<span class="ops-subtask-badge"><span class="chevron">⌄</span><span class="count">${subDone}/${subCount}</span></span>`;
            }
            if (isPeriodic) {
                html += buildCountdown(taskObj);
            }
            if (isDraggable) {
                html += `<div class="drag-handle-task">≡</div>`;
            }
            html += `</div>`;
            html += `<div class="ops-subtasks"></div>`;
            if (isPeriodic) {
                html += `<div class="ops-history"></div>`;
            }
            row.innerHTML = html;

            // populate subtask block (always — empty block just shows "+ add step" when expanded)
            buildSubtaskBlock(row.querySelector('.ops-subtasks'), row, activeOpsCategory, taskObj.originalIndex);

            // badge toggles expansion
            const badgeEl = row.querySelector('.ops-subtask-badge');
            if (badgeEl) {
                badgeEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    row.classList.toggle('expanded');
                });
            }

            const checkTarget = isNumberedSop ? row.querySelector('.ops-number')
                              : isPeriodic ? row.querySelector('.ops-ring')
                              : row.querySelector('.ops-checkbox');
            if (checkTarget) {
                checkTarget.addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    const task = opsData[activeOpsCategory][taskObj.originalIndex];
                    const isNowComplete = !task.completed;
                    task.completed = isNowComplete;
                    // manual completion also marks all subtasks done; unchecking clears them
                    if (Array.isArray(task.subtasks)) task.subtasks.forEach(s => s.done = isNowComplete);
                    if (isPrep && isNowComplete) {
                        task.lastCompleted = Date.now();
                    }
                    if (isPeriodic) {
                        // MANUAL tick pushes to the log; MANUAL untick pops it (accidental-tap safety).
                        // Render-time auto-uncheck (task come due again) never touches the log.
                        if (!task.log) task.log = [];
                        if (isNowComplete) {
                            task.lastCompleted = Date.now();
                            task.log.push({ ts: task.lastCompleted });
                            if (task.log.length > 20) task.log.shift();
                        } else {
                            task.log.pop();
                            task.lastCompleted = task.log.length ? task.log[task.log.length - 1].ts : null;
                        }
                    }
                    saveOps();
                    renderOpsList();
                });
            }

            // PREP batch rows: qty chip → inline − N + stepper (auto-collapses)
            const qtyChip = row.querySelector('.ops-qty-chip');
            if (qtyChip) {
                qtyChip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    // collapse any other open stepper first
                    document.querySelectorAll('.ops-qty-stepper').forEach(s => s.dispatchEvent(new Event('forceCollapse')));
                    const task = opsData[activeOpsCategory][taskObj.originalIndex];
                    const stepper = document.createElement('span');
                    stepper.className = 'ops-qty-stepper';
                    stepper.innerHTML = `<span class="qs-btn" data-d="-1">−</span><span class="qs-n">${task.qty || 1}</span><span class="qs-btn" data-d="1">＋</span>`;
                    qtyChip.replaceWith(stepper);
                    let collapseTimer = null;
                    const collapse = () => {
                        clearTimeout(collapseTimer);
                        document.removeEventListener('pointerdown', outside, true);
                        // full re-render restores the chip with all handlers wired
                        renderOpsList();
                    };
                    const armTimer = () => { clearTimeout(collapseTimer); collapseTimer = setTimeout(collapse, 4000); };
                    const outside = (ev) => { if (!stepper.contains(ev.target)) collapse(); };
                    stepper.addEventListener('forceCollapse', collapse);
                    stepper.querySelectorAll('.qs-btn').forEach(b => {
                        b.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            triggerHaptic('light');
                            const d = parseInt(b.getAttribute('data-d'));
                            task.qty = Math.min(9, Math.max(1, (task.qty || 1) + d));
                            stepper.querySelector('.qs-n').innerText = task.qty;
                            saveOps();
                            armTimer();
                        });
                    });
                    document.addEventListener('pointerdown', outside, true);
                    armTimer();
                });
            }

            // UPKEEP history block (rendered collapsed; shown when row expands)
            if (isPeriodic) {
                const histWrap = row.querySelector('.ops-history');
                if (histWrap) {
                    const buildHistory = (visibleCount) => {
                        const task = opsData[activeOpsCategory][taskObj.originalIndex];
                        const log = (task.log || []).slice().reverse();  // newest first
                        const interval = task.intervalDays || 30;
                        histWrap.innerHTML = '';
                        if (log.length === 0) {
                            histWrap.innerHTML = `<div class="ops-hist-cadence">EVERY <b>${interval}d</b> · no history yet</div>`;
                            return;
                        }
                        // real average gap (needs >= 2 entries)
                        let cadence = `EVERY <b>${interval}d</b>`;
                        if (log.length >= 2) {
                            let gaps = [];
                            for (let i = 0; i < log.length - 1; i++) gaps.push((log[i].ts - log[i + 1].ts) / DAY_MS);
                            const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                            const avgCls = avg > interval * 1.2 ? ' style="color: var(--due-amber, #E5B15D);"' : '';
                            cadence += ` · REAL AVG <b${avgCls}>${avg.toFixed(1)}d</b>`;
                        }
                        let html = `<div class="ops-hist-cadence">${cadence}</div>`;
                        const shown = log.slice(0, visibleCount);
                        shown.forEach((entry, i) => {
                            const older = log[i + 1];
                            let gap = '';
                            if (older) {
                                const g = Math.round((entry.ts - older.ts) / DAY_MS);
                                const long = g > interval * 1.3;
                                gap = `<span class="ops-hist-gap${long ? ' long' : ''}">+${g}d</span>`;
                            }
                            html += `<div class="ops-hist-row"><span class="ops-hist-check">✓</span><span class="ops-hist-date">${formatDate(entry.ts)}</span>${gap}</div>`;
                        });
                        if (log.length > visibleCount) {
                            html += `<div class="ops-hist-older">${shown.length} OF ${log.length} · <span data-more="1">OLDER</span></div>`;
                        } else if (log.length > 4) {
                            html += `<div class="ops-hist-older">${log.length} OF ${log.length}</div>`;
                        }
                        histWrap.innerHTML = html;
                        const more = histWrap.querySelector('[data-more]');
                        if (more) more.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            triggerHaptic('light');
                            buildHistory(visibleCount + 4);
                        });
                    };
                    buildHistory(4);
                }
            }

            row.querySelector('.ops-text').addEventListener('click', (e) => {
                e.stopPropagation();
                // Linked PREP item — tap jumps to the Codex spec
                if (isLinked) {
                    const specName = taskObj.linkedSpec;
                    // Never offer destructive break-link when the vault isn't live —
                    // an empty/cached vault means "couldn't load", not "spec deleted".
                    if (!recipeVault[specName] && !vaultLive) {
                        openAlertModal({ title: 'OFFLINE', message: "Can't reach the Codex right now. Pull to refresh and try again." });
                        return;
                    }
                    if (!recipeVault[specName]) {
                        openConfirmModal({
                            title: 'SPEC NOT FOUND',
                            message: `"${specName}" no longer exists in the Codex. Break the link, or delete this task?`,
                            confirmLabel: 'BREAK LINK',
                            cancelLabel: 'KEEP',
                            onConfirm: () => {
                                delete opsData[activeOpsCategory][taskObj.originalIndex].linkedSpec;
                                delete opsData[activeOpsCategory][taskObj.originalIndex].linkedSection;
                                saveOps();
                                renderOpsList();
                            }
                        });
                        return;
                    }
                    triggerHaptic('light');
                    // Jump to CODEX tab and expand the linked spec
                    const codexTab = document.querySelector('.nav-tab[data-target="codex-module"]');
                    if (codexTab) codexTab.click();
                    setTimeout(() => {
                        const items = document.querySelectorAll('#managed-vault-list .vault-item');
                        items.forEach(item => {
                            const title = item.querySelector('.cocktail-title');
                            if (title && title.innerText === specName) {
                                item.classList.add('expanded');
                                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        });
                    }, 100);
                    return;
                }
                triggerHaptic('light');
                row.classList.toggle('expanded');
            });

            if (isDraggable) {
                row.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', taskObj.originalIndex);
                    row.style.opacity = '0.4';
                });
                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    row.style.borderTop = '2px solid var(--nodee-gold)';
                });
                row.addEventListener('dragleave', (e) => {
                    row.style.borderTop = 'none';
                });
                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.style.borderTop = 'none';
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                    const toIdx = taskObj.originalIndex;
                    if (fromIdx !== toIdx && !isNaN(fromIdx)) {
                        const item = opsData[activeOpsCategory].splice(fromIdx, 1)[0];
                        opsData[activeOpsCategory].splice(toIdx, 0, item);
                        saveOps();
                        renderOpsList();
                    }
                });
                row.addEventListener('dragend', () => {
                    row.style.opacity = '1';
                    document.querySelectorAll('.ops-row').forEach(r => r.style.borderTop = 'none');
                });
            }

            let pressTimer = null;
            let pressStart = null;
            row.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.drag-handle-task')) return; 
                pressStart = { x: e.clientX, y: e.clientY };
                pressTimer = setTimeout(() => {
                    pressTimer = null;
                    triggerHaptic('medium');
                    
                    const actions = [];
                    if (isLinked) actions.push({ label: 'View Spec', value: 'view-spec' });
                    if (isPeriodic) actions.push({ label: 'Set Frequency', value: 'set-freq' });
                    if (isPrep) actions.push({ label: taskObj.kind === 'mise' ? 'Move to Batches' : 'Move to Mise', value: 'move-kind' });
                    actions.push({ label: 'Edit Task', value: 'edit' });
                    actions.push({ label: 'Delete Task', value: 'delete' });
                    
                    openSelectModal('TASK ACTIONS', actions, (val) => {
                        if (val === 'delete') {
                            opsData[activeOpsCategory].splice(taskObj.originalIndex, 1);
                            saveOps();
                            renderOpsList();
                        } else if (val === 'move-kind') {
                            const t = opsData[activeOpsCategory][taskObj.originalIndex];
                            t.kind = t.kind === 'mise' ? 'batch' : 'mise';
                            if (t.kind === 'batch' && !t.qty) t.qty = 1;
                            saveOps();
                            renderOpsList();
                        } else if (val === 'edit') {
                            setTimeout(() => {
                                openSelectModal('EDIT TASK', [], null, {
                                    placeholder: 'Edit task text...',
                                    btnLabel: 'SAVE',
                                    prefill: opsData[activeOpsCategory][taskObj.originalIndex].text,
                                    onSubmit: (newText) => {
                                        const t = newText.trim();
                                        if (!t) return;
                                        opsData[activeOpsCategory][taskObj.originalIndex].text = t;
                                        saveOps();
                                        renderOpsList();
                                    }
                                });
                            }, 350);
                        } else if (val === 'view-spec') {
                            const codexTab = document.querySelector('.nav-tab[data-target="codex-module"]');
                            if (codexTab) codexTab.click();
                            setTimeout(() => {
                                const items = document.querySelectorAll('#managed-vault-list .vault-item');
                                items.forEach(item => {
                                    const title = item.querySelector('.cocktail-title');
                                    if (title && title.innerText === taskObj.linkedSpec) {
                                        item.classList.add('expanded');
                                        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                });
                            }, 100);
                        } else if (val === 'set-freq') {
                            setTimeout(() => {
                                openSelectModal('FREQUENCY', [
                                    { label: 'Every 7 days', value: 7 },
                                    { label: 'Every 14 days', value: 14 },
                                    { label: 'Every 30 days', value: 30 },
                                    { label: 'Every 60 days', value: 60 },
                                    { label: 'Every 90 days', value: 90 }
                                ], (days) => {
                                    opsData[activeOpsCategory][taskObj.originalIndex].intervalDays = parseInt(days);
                                    saveOps();
                                    renderOpsList();
                                }, {
                                    placeholder: 'Custom days...',
                                    btnLabel: 'SET',
                                    onSubmit: (val) => {
                                        const days = parseInt(val);
                                        if (!isNaN(days) && days > 0) {
                                            opsData[activeOpsCategory][taskObj.originalIndex].intervalDays = days;
                                            saveOps();
                                            renderOpsList();
                                        }
                                    }
                                });
                            }, 350);
                        }
                    });
                }, 500);
            });
            row.addEventListener('pointermove', (e) => {
                if (!pressTimer || !pressStart) return;
                if (Math.abs(e.clientX - pressStart.x) > 10 || Math.abs(e.clientY - pressStart.y) > 10) {
                    clearTimeout(pressTimer); pressTimer = null;
                }
            });
            row.addEventListener('pointerup', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
            row.addEventListener('pointercancel', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

            container.appendChild(row);
        });
    }

    loadOps();
    renderOpsList();

    document.querySelectorAll('.ops-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            triggerHaptic('light');
            document.querySelectorAll('.ops-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeOpsCategory = pill.getAttribute('data-val');
            renderOpsList();
        });
    });

    // --- PREP ADD SHEET (type-first, suggestions from Codex sub-batches + past entries, qty parsing) ---
    const PREP_HISTORY_KEY = 'codex_prep_history_v1';
    function loadPrepHistory() {
        try { return JSON.parse(localStorage.getItem(PREP_HISTORY_KEY)) || []; } catch { return []; }
    }
    function pushPrepHistory(entry) {
        let h = loadPrepHistory().filter(e => e.text.toLowerCase() !== entry.text.toLowerCase());
        h.unshift({ ...entry, lastUsed: Date.now() });
        if (h.length > 30) h = h.slice(0, 30);
        try { localStorage.setItem(PREP_HISTORY_KEY, JSON.stringify(h)); } catch {}
    }

    const BATCH_TEXT_RE = /batch|mix|syrup|infus|cordial|shrub|puree|juice/i;

    function commitPrepTask({ text, linkedSpec, linkedSection, qty }) {
        const kind = (linkedSpec || BATCH_TEXT_RE.test(text)) ? 'batch' : 'mise';
        const task = { text, completed: false, subtasks: [], kind };
        if (kind === 'batch') task.qty = qty || 1;
        if (linkedSpec) { task.linkedSpec = linkedSpec; task.linkedSection = linkedSection; }
        opsData.prep.push(task);
        saveOps();
        pushPrepHistory({ text, linkedSpec, linkedSection });
        renderOpsList();
    }

    function openPrepAddSheet() {
        let sheet = document.getElementById('prep-add-sheet');
        if (!sheet) {
            document.body.insertAdjacentHTML('beforeend', `
                <div id="prep-add-sheet" class="modal-overlay hidden">
                    <div class="prep-sheet">
                        <div class="prep-sheet-head">
                            <span class="prep-sheet-title">NEW PREP TASK</span>
                            <button class="prep-sheet-x">✕</button>
                        </div>
                        <input type="text" id="prep-add-input" class="premium-text-input" placeholder="Type task — e.g. 2x sky colada…" autocomplete="off" style="margin-bottom: 0;">
                        <div id="prep-add-sugs"></div>
                    </div>
                </div>
            `);
            sheet = document.getElementById('prep-add-sheet');
            sheet.addEventListener('click', (e) => { if (e.target === sheet) closePrepAddSheet(); });
            sheet.querySelector('.prep-sheet-x').addEventListener('click', closePrepAddSheet);
            const input = document.getElementById('prep-add-input');
            input.addEventListener('input', renderPrepSuggestions);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const { qty, query } = parsePrepInput(input.value);
                    if (!query.trim()) return;
                    // Enter commits typed text as ad-hoc (qty honored for batch-y text; re-prefixed for mise so nothing typed is lost)
                    const isBatchy = BATCH_TEXT_RE.test(query);
                    const text = (!isBatchy && qty > 1) ? `${qty}x ${capitalize(query.trim())}` : capitalize(query.trim());
                    commitPrepTask({ text, qty: isBatchy ? qty : 1 });
                    input.value = '';
                    renderPrepSuggestions();
                }
            });
        }
        sheet.classList.remove('hidden');
        renderPrepSuggestions();
        setTimeout(() => document.getElementById('prep-add-input')?.focus(), 300);
    }

    function closePrepAddSheet() {
        const sheet = document.getElementById('prep-add-sheet');
        if (sheet) sheet.classList.add('hidden');
        const input = document.getElementById('prep-add-input');
        if (input) input.value = '';
    }

    function parsePrepInput(raw) {
        const m = (raw || '').match(/^(?:x\s*(\d+)|(\d+)\s*x?)\s+(.*)$/i);
        if (m) return { qty: parseInt(m[1] || m[2]) || 1, query: m[3] || '' };
        return { qty: 1, query: raw || '' };
    }

    function renderPrepSuggestions() {
        const wrap = document.getElementById('prep-add-sugs');
        const input = document.getElementById('prep-add-input');
        if (!wrap || !input) return;
        const { qty, query } = parsePrepInput(input.value);
        const q = query.trim().toLowerCase();
        wrap.innerHTML = '';

        const history = loadPrepHistory();
        let rows = [];

        if (!q) {
            // Empty input → 3 most recent as one-tap re-adds
            rows = history.slice(0, 3).map(h => ({ ...h, glyph: h.linkedSpec ? '🔗' : '↺' }));
            if (rows.length) wrap.insertAdjacentHTML('beforeend', '<div class="prep-sug-label">RECENT</div>');
        } else {
            // Codex sub-batches, matched against the full "Cocktail — Section" string
            const vaultMatches = Object.keys(recipeVault || {})
                .filter(n => n.includes(' — ') && n.toLowerCase().includes(q))
                .sort((a, b) => {
                    const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
                    const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
                    return ap - bp || a.localeCompare(b);
                })
                .map(n => {
                    const [spec, section] = n.split(' — ');
                    return { text: n, linkedSpec: spec, linkedSection: section, glyph: '🔗' };
                });
            // History matches (skip ones duplicating a vault match)
            const seen = new Set(vaultMatches.map(v => v.text.toLowerCase()));
            const histMatches = history
                .filter(h => h.text.toLowerCase().includes(q) && !seen.has(h.text.toLowerCase()))
                .map(h => ({ ...h, glyph: h.linkedSpec ? '🔗' : '↺' }));
            rows = [...vaultMatches, ...histMatches].slice(0, 4);
        }

        rows.forEach(r => {
            const el = document.createElement('div');
            el.className = 'prep-sug';
            const qtyChip = (qty > 1) ? `<span class="prep-sug-qty">×${qty}</span>` : '';
            el.innerHTML = `<span class="prep-sug-glyph">${r.glyph}</span><span class="prep-sug-text">${r.text}</span>${qtyChip}`;
            el.addEventListener('click', () => {
                triggerHaptic('light');
                commitPrepTask({ text: r.text, linkedSpec: r.linkedSpec, linkedSection: r.linkedSection, qty });
                const input = document.getElementById('prep-add-input');
                input.value = '';
                renderPrepSuggestions();
                input.focus();
            });
            wrap.appendChild(el);
        });
    }

        const opsAddBtn = document.getElementById('ops-add-btn');
    if (opsAddBtn) {
        opsAddBtn.addEventListener('click', () => {
            triggerHaptic('light');
            
            // PREP: dedicated add-sheet — type-first with live suggestions + history + qty parsing
            if (activeOpsCategory === 'prep') {
                openPrepAddSheet();
                return;
            }

            // PERIODIC: type name, then pick frequency
            if (activeOpsCategory === 'periodic') {
                openSelectModal('NEW UPKEEP TASK', [], null, {
                    placeholder: 'Task name (e.g. Deep clean well)...',
                    btnLabel: 'NEXT',
                    onSubmit: (val) => {
                        const taskText = val.trim();
                        if (!taskText) return;
                        setTimeout(() => {
                            openSelectModal('FREQUENCY', [
                                { label: 'Every 7 days', value: 7 },
                                { label: 'Every 14 days', value: 14 },
                                { label: 'Every 30 days', value: 30 },
                                { label: 'Every 60 days', value: 60 },
                                { label: 'Every 90 days', value: 90 }
                            ], (days) => {
                                opsData.periodic.push({ text: taskText, completed: false, subtasks: [], intervalDays: parseInt(days), lastCompleted: null });
                                saveOps();
                                renderOpsList();
                            }, {
                                placeholder: 'Custom days...',
                                btnLabel: 'ADD',
                                onSubmit: (d) => {
                                    const days = parseInt(d) || 30;
                                    opsData.periodic.push({ text: taskText, completed: false, subtasks: [], intervalDays: days, lastCompleted: null });
                                    saveOps();
                                    renderOpsList();
                                }
                            });
                        }, 350);
                    }
                });
                return;
            }
            
            openSelectModal('NEW TASK', [], null, {
                placeholder: 'Type main task here...',
                btnLabel: 'ADD',
                onSubmit: (val) => {
                    opsData[activeOpsCategory].push({ text: val, completed: false, subtasks: [] });
                    saveOps();
                    renderOpsList();
                }
            });
        });
    }

    const opsResetBtn = document.getElementById('ops-reset-btn');
    if (opsResetBtn) {
        opsResetBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            let totalDaily = 0;
            let completedDaily = 0;
            ['opening', 'closing'].forEach(cat => {
                if (opsData[cat]) {
                    totalDaily += opsData[cat].length;
                    completedDaily += opsData[cat].filter(t => t.completed).length;
                }
            });

            openConfirmModal({
                title: 'END SHIFT',
                message: `Shift Progress: ${completedDaily}/${totalDaily} SOP tasks completed.\n\nReset SOPs and clear completed prep? (Uncompleted prep + periodic tasks remain).`,
                confirmLabel: 'RESET BOARD',
                danger: false,
                onConfirm: () => {
                    // SOPs: just untick
                    ['opening', 'closing'].forEach(cat => {
                        if(opsData[cat]) opsData[cat].forEach(t => t.completed = false);
                    });
                    // PREP: delete completed, keep uncompleted
                    if (opsData.prep) opsData.prep = opsData.prep.filter(t => !t.completed);
                    localStorage.setItem('codex_ops_last_wipe', Date.now().toString());
                    saveOps();
                    renderOpsList();
                    const scrollArea = document.getElementById('scroll-area');
                    if (scrollArea) scrollArea.scrollTop = 0;
                }
            });
        });
    }

    // --- NAV & LOCK LOGIC ---
    const tabs = document.querySelectorAll('.nav-tab');
    const modules = document.querySelectorAll('.module');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            triggerHaptic('light');
            const targetEl = e.currentTarget;
            tabs.forEach(t => t.classList.remove('active'));
            modules.forEach(m => m.classList.remove('active'));
            targetEl.classList.add('active');
            const moduleTarget = document.getElementById(targetEl.getAttribute('data-target'));
            if (moduleTarget) moduleTarget.classList.add('active');
            const scrollArea = document.getElementById('scroll-area');
            if (scrollArea) scrollArea.scrollTop = 0;
        });
    });

    });
