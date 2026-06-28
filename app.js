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
    let fDrinks = 20; 
    let fDilution = 20;
    let abvDilution = 20;

    let activeSpecSelect = null; 
    let activeRevSpec = null;
    let activeRevIng = null;
    let activeRevIngAmt = 0;
    let activeAbvSpec = null;

   // --- HELPERS ---
    const capitalize = (str) => str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const triggerHaptic = (t = 'light') => {
        if (!navigator.vibrate) return;
        t === 'heavy' ? navigator.vibrate([80, 40, 80]) : navigator.vibrate(30);
    };

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
            wrap.innerHTML = `
                <input type="text" class="premium-text-input" placeholder="${customInput.placeholder || 'Custom...'}" style="margin-bottom: 0;">
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

    // --- DB & VAULT ---
    async function loadVault() {
        showLoader("SYNCING CODEX...");
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error("Network error");
            const data = await res.json();
            recipeVault = {}; 
            data.forEach(row => {
                if(!recipeVault[row.cocktailName]) recipeVault[row.cocktailName] = [];
                recipeVault[row.cocktailName].push({ name: row.ingredientName, amount: row.amount, color: row.categoryTag });
            });
            renderVault();
            hideLoader();
        } catch (e) {
            console.error("Sync Failed:", e);
            const lText = document.querySelector('.loader-text');
            if (lText) lText.innerText = "OFFLINE MODE";
            setTimeout(hideLoader, 1500);
        }
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
                    html += `<span class="ing-amount">${ing.amount || ''} ${ing.unit || 'dash'}</span></div>`;
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
                    let amtHtml = ing.color === 'static-ruby' ? `${ing.amount || ''} ${ing.unit || 'dash'}` : `${formatAmount(ing.amount * round)}ml`;
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
            content.className = 'vault-content view-service';

            if (subBatches.length > 0) {
                const viewToggle = document.createElement('div');
                viewToggle.className = 'pill-group view-toggle';
                viewToggle.style.marginTop = '12px';
                viewToggle.style.marginBottom = '18px';
                viewToggle.onclick = (e) => e.stopPropagation();
                viewToggle.innerHTML = `
                    <button class="view-pill active" data-view="service">SERVICE</button>
                    <button class="view-pill" data-view="prep">PREP</button>
                `;
                details.appendChild(viewToggle);

                viewToggle.querySelectorAll('.view-pill').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        triggerHaptic('light');
                        viewToggle.querySelectorAll('.view-pill').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        content.className = btn.getAttribute('data-view') === 'service' ? 'vault-content view-service' : 'vault-content view-prep';
                    });
                });
            }

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
        // Auto-seed the Shelf with any new ingredients pulled in this vault load
        if (typeof autoSeedShelf === 'function') autoSeedShelf();
        if (typeof renderShelf === 'function') renderShelf();
    }

    // --- SPEC BUILDER ---
    let builderState = { name: '', sections: [{ name: 'MAIN', ingredients: [] }] };
    const catLabels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'juice-glow': 'JUICE', 'magenta-glow': 'SYRUP', 'coffee-dark': 'ESPRESSO', 'puree-mango': 'PUREE', 'static-ruby': 'STATIC' };

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
                    amountHtml = `
                        <div style="display:flex; width: 85px; align-items:center; gap:4px; margin-right:4px;">
                           <input type="number" class="builder-static-input" value="${ing.amount || ''}" placeholder="0" style="width:30px;">
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
                            builderState.sections[secIdx].ingredients[ingIdx].amount = parseFloat(e.target.value) || 0;
                        });
                    }
                    const unitPill = row.querySelector('.unit-pill');
                    if (unitPill) {
                        unitPill.addEventListener('click', (e) => {
                            triggerHaptic('light');
                            const units = ['dash', 'squeeze', 'rinse'];
                            let currIdx = units.indexOf(e.target.dataset.unit || 'dash');
                            builderState.sections[secIdx].ingredients[ingIdx].unit = units[(currIdx + 1) % units.length];
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
                    // Match against shelf case-insensitively; if found, auto-set category to match the shelf entry
                    if (typeof shelfData !== 'undefined' && val.trim()) {
                        const shelfMatch = Object.keys(shelfData).find(k => k.toLowerCase() === val.toLowerCase().trim());
                        if (shelfMatch) {
                            const shelfCat = shelfData[shelfMatch].category;
                            if (builderState.sections[secIdx].ingredients[ingIdx].cat !== shelfCat) {
                                builderState.sections[secIdx].ingredients[ingIdx].cat = shelfCat;
                                const catBtn = row.querySelector('.builder-row-cat');
                                catBtn.className = `builder-row-cat ${shelfCat}`;
                                catBtn.innerText = catLabels[shelfCat] || 'SPIRIT';
                                if (shelfCat === 'static-ruby') renderBuilder(); // Re-render to switch UI
                            }
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
                    builderState.sections.push({ name: val, ingredients: [] });
                    renderBuilder();
                },
                {
                    placeholder: 'Or type custom section name...',
                    btnLabel: 'ADD CUSTOM',
                    onSubmit: (val) => {
                        builderState.sections.push({ name: capitalize(val), ingredients: [] });
                        renderBuilder();
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
        batchBuilderState = { type: 'Spirit Batch', customType: '', ingredients: [], perDrink: 0 };
        
        const addBtn = document.getElementById('add-batch-btn');
        if (addBtn) addBtn.classList.add('hidden');
        
        const mainSec = builderState.sections.find(s => s.name === 'MAIN');
        let allowed = BATCH_CONFIG['Spirit Batch'].allowedCategories;
        if (mainSec) {
            for (let i = mainSec.ingredients.length - 1; i >= 0; i--) {
                const ing = mainSec.ingredients[i];
                // Removed the math barrier. If it has a name and the right category, sweep it!
                if (ing.name && ing.name.trim() !== '' && allowed.includes(ing.cat)) {
                    batchBuilderState.ingredients.unshift(mainSec.ingredients.splice(i, 1)[0]);
                }
            }
        }
        if (batchBuilderState.ingredients.length === 0) {
            let defName = allowed[0] === 'coffee-dark' ? 'Espresso' : '';
            batchBuilderState.ingredients.push({ amount: 0, name: defName, cat: allowed[0] });
        } else {
            batchBuilderState.perDrink = batchBuilderState.ingredients.filter(i => i.cat !== 'static-ruby').reduce((sum, ing) => sum + (ing.amount || 0), 0);
        }
        renderBuilder();
        renderBatchForm();
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

                const mainSec = builderState.sections.find(s => s.name === 'MAIN');
                if (mainSec) {
                    batchBuilderState.ingredients.forEach(ing => {
                        if (ing.name.trim()) mainSec.ingredients.push(ing);
                    });
                }
                batchBuilderState.ingredients = [];
                batchBuilderState.type = newType;
                
                let allowed = ['amber-glow', 'neon-cyan', 'juice-glow', 'puree-mango', 'magenta-glow', 'coffee-dark'];
                if (BATCH_CONFIG[newType]) allowed = BATCH_CONFIG[newType].allowedCategories;
                else if (newType === 'Mocktail') allowed = ['juice-glow', 'puree-mango', 'magenta-glow'];

                if (mainSec) {
                    for (let i = mainSec.ingredients.length - 1; i >= 0; i--) {
                        const ing = mainSec.ingredients[i];
                        const safeAmount = parseFloat(ing.amount) || 0;
                        if (ing.name && ing.name.trim() !== '' && safeAmount > 0 && allowed.includes(ing.cat)) {
                            batchBuilderState.ingredients.unshift(mainSec.ingredients.splice(i, 1)[0]);
                        }
                    }
                }

                if (batchBuilderState.ingredients.length === 0) {
                    if (newType === 'Juice Batch' || newType === 'Mocktail') {
                        batchBuilderState.ingredients.push({ amount: 0, name: 'Juice', cat: 'juice-glow' });
                        batchBuilderState.ingredients.push({ amount: 0, name: 'Puree', cat: 'puree-mango' });
                        
                        const spiritSec = builderState.sections.find(s => s.name === 'Spirit Batch');
                        const syrupInSpirit = spiritSec ? spiritSec.ingredients.some(i => i.cat === 'magenta-glow') : false;
                        
                        if (!syrupInSpirit) {
                            batchBuilderState.ingredients.push({ amount: 0, name: 'Syrup', cat: 'magenta-glow' });
                        }
                    } else {
                        let defCat = allowed[0] || 'amber-glow';
                        const batchNameMap = { 'coffee-dark': 'Espresso', 'juice-glow': 'Juice', 'magenta-glow': 'Syrup', 'puree-mango': 'Puree' };
                        let defName = batchNameMap[defCat] || '';
                        batchBuilderState.ingredients.push({ amount: 0, name: defName, cat: defCat });
                    }
                    batchBuilderState.perDrink = 0;
                } else {
                    batchBuilderState.perDrink = batchBuilderState.ingredients.filter(i => i.cat !== 'static-ruby').reduce((sum, ing) => sum + (ing.amount || 0), 0);
                }

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
                amountHtml = `
                    <div style="display:flex; width: 85px; align-items:center; gap:4px; margin-right:4px;">
                       <input type="number" class="builder-static-input" value="${ing.amount || ''}" placeholder="0" style="width:30px;">
                       <button class="unit-pill" data-unit="${u}">${u}</button>
                    </div>
                `;
            } else {
                amountHtml = `<input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">`;
            }
            
            row.innerHTML = `
                ${amountHtml}
                <input type="text" class="builder-row-name" value="${(ing.name || '').replace(/"/g, '&quot;')}" placeholder="Ingredient">
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
                        const units = ['dash', 'squeeze', 'rinse'];
                        let currIdx = units.indexOf(e.target.dataset.unit || 'dash');
                        batchBuilderState.ingredients[idx].unit = units[(currIdx + 1) % units.length];
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
    const shelfCatLabels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'juice-glow': 'JUICE', 'magenta-glow': 'SYRUP', 'coffee-dark': 'ESPRESSO', 'puree-mango': 'PUREE', 'static-ruby': 'STATIC' };
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

    function injectShelfCard() {
        if (document.getElementById('shelf-card')) return;
        const codexModule = document.getElementById('codex-module');
        if (!codexModule) return;
        codexModule.insertAdjacentHTML('beforeend', `
            <div id="shelf-card" class="card glass-panel">
                <h2 class="card-title text-gold">THE SHELF</h2>
                <button id="shelf-add-btn" class="btn-secondary" style="width: 100%; margin-top: 12px;">＋ ADD INGREDIENT</button>
                <div id="shelf-add-form" class="hidden"></div>
                <div id="shelf-list"></div>
            </div>
        `);
        document.getElementById('shelf-add-btn').addEventListener('click', () => {
            triggerHaptic('light');
            toggleShelfAddForm();
        });
    }

    function toggleShelfAddForm() {
        const form = document.getElementById('shelf-add-form');
        if (!form) return;
        if (shelfAddState) {
            shelfAddState = null;
            form.classList.add('hidden');
            form.innerHTML = '';
            return;
        }
        shelfAddState = { name: '', cat: 'amber-glow', abv: 40 };
        form.classList.remove('hidden');
        form.innerHTML = `
            <div class="shelf-add-form-inner">
                <input type="text" class="shelf-add-name premium-text-input" placeholder="Ingredient name">
                <div class="shelf-add-controls">
                    <button class="shelf-add-cat amber-glow">SPIRIT</button>
                    <input type="number" class="shelf-add-abv" value="40" min="0" max="100">
                    <span class="shelf-add-abv-suffix">%</span>
                </div>
                <div class="shelf-add-actions">
                    <button class="shelf-add-cancel">CANCEL</button>
                    <button class="shelf-add-save">SAVE</button>
                </div>
            </div>
        `;
        form.querySelector('.shelf-add-name').addEventListener('input', e => { shelfAddState.name = e.target.value; });
        form.querySelector('.shelf-add-cat').addEventListener('click', () => {
            triggerHaptic('light');
            const cats = ['amber-glow', 'neon-cyan', 'juice-glow', 'puree-mango', 'magenta-glow', 'coffee-dark', 'static-ruby'];
            shelfAddState.cat = cats[(cats.indexOf(shelfAddState.cat) + 1) % cats.length];
            const btn = form.querySelector('.shelf-add-cat');
            btn.className = `shelf-add-cat ${shelfAddState.cat}`;
            btn.innerText = shelfCatLabels[shelfAddState.cat];
            shelfAddState.abv = shelfDefaultAbvs[shelfAddState.cat] || 0;
            form.querySelector('.shelf-add-abv').value = shelfAddState.abv;
        });
        form.querySelector('.shelf-add-abv').addEventListener('input', e => { shelfAddState.abv = parseFloat(e.target.value) || 0; });
        form.querySelector('.shelf-add-cancel').addEventListener('click', () => {
            triggerHaptic('light');
            toggleShelfAddForm();
        });
        form.querySelector('.shelf-add-save').addEventListener('click', () => {
            triggerHaptic('heavy');
            const name = capitalize(shelfAddState.name.trim());
            if (!name) return openAlertModal({title:'NOTICE', message:"Ingredient name required."});
            if (shelfData[name]) return openAlertModal({title:'NOTICE', message:`"${name}" is already on the shelf.`});
            shelfData[name] = { category: shelfAddState.cat, abv: shelfAddState.abv, inStock: true };
            saveShelf();
            toggleShelfAddForm();
            renderShelf();
        });
    }

    window.renderShelf = function() {
        const list = document.getElementById('shelf-list');
        if (!list) return;
        list.innerHTML = '';
        const catOrder = { 'amber-glow': 1, 'neon-cyan': 2, 'juice-glow': 3, 'magenta-glow': 4, 'coffee-dark': 5, 'puree-mango': 6, 'static-ruby': 7 };
        const entries = Object.entries(shelfData).sort((a, b) => {
            const ordA = catOrder[a[1].category] || 10;
            const ordB = catOrder[b[1].category] || 10;
            if (ordA !== ordB) return ordA - ordB;
            return a[0].localeCompare(b[0]);
        });
        if (entries.length === 0) {
            list.innerHTML = '<p class="text-muted text-sm" style="margin-top: 16px; padding: 8px;">No ingredients yet. Add one above, or save a cocktail to auto-seed.</p>';
            return;
        }
        entries.forEach(([name, data]) => {
            const row = document.createElement('div');
            row.className = `shelf-row ${data.category}${data.inStock ? '' : ' shelf-row-oos'}`;
            row.innerHTML = `
                <button class="shelf-stock-btn ${data.inStock ? 'in-stock' : 'oos'}">${data.inStock ? '●' : '○'}</button>
                <span class="shelf-ing-name">${name}</span>
                <button class="shelf-cat-btn ${data.category}">${shelfCatLabels[data.category] || 'SPIRIT'}</button>
                <input type="number" class="shelf-abv-input" value="${data.abv || 0}" min="0" max="100">
                <span class="shelf-abv-suffix">%</span>
            `;
            row.querySelector('.shelf-stock-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                triggerHaptic('light');
                shelfData[name].inStock = !shelfData[name].inStock;
                saveShelf();
                renderShelf();
            });
            row.querySelector('.shelf-abv-input').addEventListener('change', e => {
                shelfData[name].abv = parseFloat(e.target.value) || 0;
                saveShelf();
            });
            row.querySelector('.shelf-cat-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                triggerHaptic('light');
                const cats = ['amber-glow', 'neon-cyan', 'juice-glow', 'puree-mango', 'magenta-glow', 'coffee-dark', 'static-ruby'];
                const current = shelfData[name].category;
                const next = cats[(cats.indexOf(current) + 1) % cats.length];
                shelfData[name].category = next;
                saveShelf();
                renderShelf();
            });
            let pressTimer = null;
            let pressStart = null;
            row.addEventListener('pointerdown', (e) => {
                if (e.target.closest('button') || e.target.closest('input')) return;
                pressStart = { x: e.clientX, y: e.clientY };
                pressTimer = setTimeout(() => {
                    pressTimer = null;
                    triggerHaptic('medium');
                    openConfirmModal({
                        title: 'REMOVE INGREDIENT', 
                        message: `Remove "${name}" from the shelf?`, 
                        onConfirm: () => {
                            delete shelfData[name];
                            saveShelf();
                            renderShelf();
                        }
                    });
                }, 500);
            });
            row.addEventListener('pointermove', (e) => {
                if (!pressTimer || !pressStart) return;
                const dx = Math.abs(e.clientX - pressStart.x);
                const dy = Math.abs(e.clientY - pressStart.y);
                if (dx > 10 || dy > 10) { clearTimeout(pressTimer); pressTimer = null; }
            });
            row.addEventListener('pointerup', () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            });
            row.addEventListener('pointercancel', () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            });
            list.appendChild(row);
        });
    };

    loadShelf();
    refreshShelfDatalist();
    injectShelfCard();
    renderShelf();

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
            const syrupKeys = ['syrup', 'sugar', 'agave', 'honey', 'gomme', 'orgeat', 'falernum', 'grenadine', 'cordial'];
            const liqueurKeys = ['liqueur', 'licor', 'amaro', 'campari', 'aperol', 'vermouth', 'cointreau', 'triple sec', 'chartreuse', 'bénédictine', 'benedictine', 'maraschino', 'amaretto', 'disaronno', 'dissarono', 'kahlua', 'tia maria', 'baileys', 'crème de', 'creme de', 'sambuca', 'absinthe', 'pastis', 'sherry', 'port', 'madeira', 'lillet', 'suze', 'fernet', 'jägermeister', 'jagermeister', 'drambuie', 'galliano', 'frangelico', 'midori', 'curaçao', 'curacao', 'st-germain', 'st. germain', 'bitters', 'angostura', 'peychaud', 'wine', 'champagne', 'prosecco', 'cava'];
            const juiceKeys = ['juice', 'puree', 'lemon', 'lime', 'orange', 'grapefruit', 'pineapple', 'cranberry', 'apple', 'tomato', 'water', 'soda', 'tonic', 'cola', 'ginger beer', 'coconut', 'milk', 'cream', 'egg', 'yuzu', 'passion', 'mango', 'raspberry', 'strawberry', 'blackberry', 'blueberry', 'watermelon', 'cucumber', 'kiwi', 'lychee', 'guava', 'peach', 'pear', 'rhubarb', 'beetroot', 'carrot', 'fig'];

            const detectBatchType = (raw) => {
                const low = raw.toLowerCase();
                if (/spirit\s*batch/.test(low)) return 'Spirit Batch';
                if (/juice\s*batch/.test(low)) return 'Juice Batch';
                if (/mocktail/.test(low)) return 'Mocktail';
                if (/cream/.test(low)) return 'Cream';
                return capitalize(raw.replace(/:$/, '').trim());
            };

            const categorize = (name) => {
                const low = name.toLowerCase();
                if (/spirit\s*batch/.test(low)) return 'amber-glow';
                if (/juice\s*batch/.test(low)) return 'juice-glow';
                if (/mocktail/.test(low)) return 'juice-glow';
                if (/cream.*batch/.test(low)) return 'magenta-glow';
                if (syrupKeys.some(k => low.includes(k))) return 'magenta-glow';
                if (liqueurKeys.some(k => low.includes(k))) return 'neon-cyan';
                if (juiceKeys.some(k => low.includes(k))) return 'juice-glow';
                return 'amber-glow';
            };

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

    // --- SCALE: BATCHING & STEPPERS ---
    const updateScaleUI = () => {
        const fdEl = document.getElementById('fd-val');
        const dilEl = document.getElementById('dil-val');
        if (fdEl) fdEl.innerText = fDrinks;
        if (dilEl) dilEl.innerText = fDilution + '%';
    };

    const fdMinus = document.getElementById('fd-minus');
    const fdPlus = document.getElementById('fd-plus');
    const dilMinus = document.getElementById('dil-minus');
    const dilPlus = document.getElementById('dil-plus');
    
    if (fdMinus) fdMinus.addEventListener('click', () => { triggerHaptic('light'); if(fDrinks > 1) { fDrinks--; updateScaleUI(); } });
    if (fdPlus) fdPlus.addEventListener('click', () => { triggerHaptic('light'); fDrinks++; updateScaleUI(); });
    if (dilMinus) dilMinus.addEventListener('click', () => { triggerHaptic('light'); if(fDilution > 0) { fDilution--; updateScaleUI(); } });
    if (dilPlus) dilPlus.addEventListener('click', () => { triggerHaptic('light'); fDilution++; updateScaleUI(); });

    window.updateDilution = (val) => {
        triggerHaptic('light');
        fDilution = val;
        updateScaleUI();
    };

    const btnFwdSpec = document.getElementById('btn-forward-spec');
    if (btnFwdSpec) {
        btnFwdSpec.addEventListener('click', () => {
            const specs = Object.keys(recipeVault).map(s => ({label: s, value: s}));
            openSelectModal('SELECT SPEC FOR BATCH', specs, (val, label) => {
                activeSpecSelect = val;
                document.getElementById('btn-forward-spec').innerText = label;
                document.getElementById('btn-forward-spec').style.color = "var(--text-main)";
                document.getElementById('btn-forward-spec').classList.remove('text-muted');
            });
        });
    }

    const calcFwdBtn = document.getElementById('calc-forward-btn');
    if (calcFwdBtn) {
        calcFwdBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const res = document.getElementById('forward-results');
            if(!activeSpecSelect || fDrinks <= 0) return;
            
            const spec = recipeVault[activeSpecSelect];
            let html = '<h3 class="zone-header">BATCH YIELD</h3>';
            let totalVol = 0;

            spec.forEach(ing => {
                const amt = ing.amount * fDrinks;
                if (ing.color !== 'static-ruby') totalVol += amt;
                let amtDisplay = ing.color === 'static-ruby' ? `${ing.amount * fDrinks} ${ing.unit || 'dash'}` : `${amt.toFixed(0)}ml`;
                html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${amtDisplay}</span></div>`;
            });

            if (fDilution > 0) {
                const water = totalVol * (fDilution / 100);
                totalVol += water;
                html += `<div class="result-row"><span class="ing-name text-muted">Filtered Water (${fDilution}%)</span><span class="ing-amount text-muted">${water.toFixed(0)}ml</span></div>`;
            }
            
            html += `<div class="result-row mt-10"><span class="ing-name text-gold fw-bold">TOTAL LIQUID VOLUME</span><span class="ing-amount">${totalVol.toFixed(0)}ml</span></div>`;
            res.innerHTML = html;
        });
    }

    const btnRevSpec = document.getElementById('btn-reverse-spec');
    if (btnRevSpec) {
        btnRevSpec.addEventListener('click', () => {
            const specs = Object.keys(recipeVault).map(s => ({label: s, value: s}));
            openSelectModal('SELECT SPEC', specs, (val, label) => {
                activeRevSpec = val;
                document.getElementById('btn-reverse-spec').innerText = label;
                document.getElementById('btn-reverse-spec').style.color = "var(--text-main)";
                document.getElementById('btn-reverse-spec').classList.remove('text-muted');
                
                activeRevIng = null;
                document.getElementById('btn-reverse-ing').innerText = "Select Limiting Ingredient...";
                document.getElementById('btn-reverse-ing').classList.add('text-muted');
                document.getElementById('btn-reverse-ing').classList.remove('hidden');
                document.getElementById('reverse-vol-container').classList.add('hidden');
            });
        });
    }

    const btnRevIng = document.getElementById('btn-reverse-ing');
    if (btnRevIng) {
        btnRevIng.addEventListener('click', () => {
            if(!activeRevSpec) return;
            const spec = recipeVault[activeRevSpec].filter(i => i.color !== 'static-ruby');
            const ings = spec.map(ing => ({label: `${ing.name} (${ing.amount}ml)`, value: ing.name, data: ing.amount}));
            
            openSelectModal('LIMITING INGREDIENT', ings, (val, label, amt) => {
                activeRevIng = val;
                activeRevIngAmt = amt;
                document.getElementById('btn-reverse-ing').innerText = label;
                document.getElementById('btn-reverse-ing').style.color = "var(--text-main)";
                document.getElementById('btn-reverse-ing').classList.remove('text-muted');
                document.getElementById('reverse-vol-container').classList.remove('hidden');
            });
        });
    }

    const calcRevBtn = document.getElementById('calc-reverse-btn');
    if (calcRevBtn) {
        calcRevBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const availVol = parseFloat(document.getElementById('reverse-vol').value) || 0;
            const res = document.getElementById('reverse-results');
            
            if(!activeRevSpec || !activeRevIng || availVol <= 0) return;

            const maxDrinks = Math.floor(availVol / activeRevIngAmt);
            const spec = recipeVault[activeRevSpec];
            
            let html = `<h3 class="zone-header">MAX YIELD: ${maxDrinks} DRINKS</h3>`;
            
            spec.forEach(ing => {
                const reqAmt = ing.amount * maxDrinks;
                let displayAmt = ing.color === 'static-ruby' ? `${reqAmt} ${ing.unit || 'dash'}` : `${reqAmt.toFixed(0)}ml`;
                if(ing.name === activeRevIng) displayAmt = `${reqAmt.toFixed(0)}ml <span class="text-muted text-sm">(Empty)</span>`;
                
                html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${displayAmt}</span></div>`;
            });
            res.innerHTML = html;
        });
    }

    // --- OPS MODULE ENGINE ---
    const OPS_KEY = 'codex_ops_v1';
    let opsData = { opening: [], mid: [], closing: [], weekly: [], monthly: [] };
    let activeOpsCategory = 'opening';

    function loadOps() {
        try {
            const raw = localStorage.getItem(OPS_KEY);
            if (raw) opsData = JSON.parse(raw);
        } catch (e) { console.error('Failed to load OPS data'); }

        const now = new Date();
        let lastWipeStr = localStorage.getItem('codex_ops_last_wipe');
        let wipeDate = new Date();
        wipeDate.setHours(10, 0, 0, 0); 

        if (now.getHours() < 10) wipeDate.setDate(wipeDate.getDate() - 1);

        if (!lastWipeStr || new Date(parseInt(lastWipeStr)) < wipeDate) {
            opsData.opening?.forEach(t => t.completed = false);
            opsData.mid?.forEach(t => t.completed = false);
            opsData.closing?.forEach(t => t.completed = false);
            
            if (now.getDay() === 1 && (!lastWipeStr || new Date(parseInt(lastWipeStr)).getDay() !== 1)) {
                opsData.weekly.forEach(t => t.completed = false);
            }
            if (now.getDate() === 1 && (!lastWipeStr || new Date(parseInt(lastWipeStr)).getDate() !== 1)) {
                opsData.monthly.forEach(t => t.completed = false);
            }
            localStorage.setItem('codex_ops_last_wipe', Date.now().toString());
            saveOps();
        }
    }

    function saveOps() {
        localStorage.setItem(OPS_KEY, JSON.stringify(opsData));
    }

    window.renderOpsList = function() {
        const container = document.getElementById('ops-list-container');
        if (!container) return;
        container.innerHTML = '';

        // Calculate and Update Dashboard Progress
        const dailyCategories = ['opening', 'mid', 'closing'];
        let totalDaily = 0;
        let completedDaily = 0;
        dailyCategories.forEach(cat => {
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
        const isDaily = dailyCategories.includes(activeOpsCategory);

        let sortedTasks = [];
        if (isDaily) {
            sortedTasks = [...tasks].map((t, i) => ({...t, originalIndex: i}));
        } else {
            sortedTasks = [...tasks].map((t, i) => ({...t, originalIndex: i}))
                                      .sort((a, b) => {
                                          if (a.completed !== b.completed) return a.completed ? 1 : -1;
                                          return (a.lastCompleted || 0) - (b.lastCompleted || 0);
                                      });
        }

        if (sortedTasks.length === 0) {
            container.innerHTML = '<p class="text-muted text-sm text-center" style="padding: 20px;">No tasks. Tap ＋ ADD TASK below to begin.</p>';
            return;
        }

        sortedTasks.forEach((taskObj, displayIndex) => {
            const hasSubtasks = taskObj.subtasks && taskObj.subtasks.length > 0;
            const row = document.createElement('div');
            row.className = `ops-row ${taskObj.completed ? 'completed' : ''}`;
            row.setAttribute('draggable', isDaily ? 'true' : 'false');
            
            let html = `<div class="ops-row-main">`;
            
            if (isDaily) {
                html += `<div class="ops-number">${displayIndex + 1}</div>`;
            } else {
                html += `<div class="ops-checkbox"></div>`;
            }
            
            let textContent = taskObj.text;
            if (!isDaily && !taskObj.completed && taskObj.lastCompleted) {
                const daysAgo = Math.floor((Date.now() - taskObj.lastCompleted) / (1000 * 60 * 60 * 24));
                let timeLabel = daysAgo === 0 ? 'Today' : `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;
                textContent += `<div class="ops-time-tag ${daysAgo >= 7 ? 'text-red' : ''}">Last completed: ${timeLabel}</div>`;
            }
            
            html += `<span class="ops-text" style="flex:1;">${textContent}</span>`;
            
            if (isDaily) {
                html += `<div class="drag-handle-task">≡</div>`;
            }
            html += `</div>`;
            
            if (hasSubtasks) {
                html += `<div class="ops-subtasks">`;
                taskObj.subtasks.forEach(sub => {
                    html += `<div style="font-size: 0.8rem; color: var(--text-muted);">• ${sub}</div>`;
                });
                html += `</div>`;
            }
            row.innerHTML = html;

            const checkTarget = isDaily ? row.querySelector('.ops-number') : row.querySelector('.ops-checkbox');
            if (checkTarget) {
                checkTarget.addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    const isNowComplete = !opsData[activeOpsCategory][taskObj.originalIndex].completed;
                    opsData[activeOpsCategory][taskObj.originalIndex].completed = isNowComplete;
                    
                    if (!isDaily && isNowComplete) {
                        opsData[activeOpsCategory][taskObj.originalIndex].lastCompleted = Date.now();
                    }
                    saveOps();
                    renderOpsList();
                });
            }

            row.querySelector('.ops-text').addEventListener('click', (e) => {
                e.stopPropagation();
                if (hasSubtasks) {
                    triggerHaptic('light');
                    row.classList.toggle('expanded');
                }
            });

            if (isDaily) {
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
                    openSelectModal('TASK ACTIONS', [
                        { label: 'Add Sub-Step', value: 'add-sub' },
                        { label: 'Delete Task', value: 'delete' }
                    ], (val) => {
                        if (val === 'delete') {
                            opsData[activeOpsCategory].splice(taskObj.originalIndex, 1);
                            saveOps();
                            renderOpsList();
                        } else if (val === 'add-sub') {
                            setTimeout(() => {
                                openSelectModal('ADD SUB-STEP', [], null, {
                                    placeholder: 'e.g. Backflush groupheads...',
                                    btnLabel: 'ADD',
                                    onSubmit: (subText) => {
                                        if (!opsData[activeOpsCategory][taskObj.originalIndex].subtasks) {
                                            opsData[activeOpsCategory][taskObj.originalIndex].subtasks = [];
                                        }
                                        opsData[activeOpsCategory][taskObj.originalIndex].subtasks.push(subText);
                                        saveOps();
                                        renderOpsList();
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

    const opsAddBtn = document.getElementById('ops-add-btn');
    if (opsAddBtn) {
        opsAddBtn.addEventListener('click', () => {
            triggerHaptic('light');
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
            ['opening', 'mid', 'closing'].forEach(cat => {
                if (opsData[cat]) {
                    totalDaily += opsData[cat].length;
                    completedDaily += opsData[cat].filter(t => t.completed).length;
                }
            });

            openConfirmModal({
                title: 'END SHIFT',
                message: `Shift Progress: ${completedDaily}/${totalDaily} tasks completed.\n\nEnd shift and reset the daily board? (Periodic tasks remain saved).`,
                confirmLabel: 'RESET BOARD',
                danger: false,
                onConfirm: () => {
                    ['opening', 'mid', 'closing'].forEach(cat => {
                        if(opsData[cat]) opsData[cat].forEach(t => t.completed = false);
                    });
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

    // --- SESSION TIMEOUT: DEFAULT TO SERVICE MODE ---
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            document.querySelectorAll('.view-toggle .view-pill[data-view="service"]').forEach(btn => {
                if (!btn.classList.contains('active')) btn.click();
            });
        }
    });
});
