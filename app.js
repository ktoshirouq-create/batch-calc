document.addEventListener('DOMContentLoaded', () => {
    
    // --- BATCHING ENGINE RULES (THE BOUNCER) ---
    const BATCH_CONFIG = {
        'Spirit Batch': { allowedCategories: ['amber-glow', 'neon-cyan', 'magenta-glow'] }, 
        'Juice Batch': { allowedCategories: ['juice-glow', 'puree-mango', 'magenta-glow', 'mixer-fizz'] }, 
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
        if (/soda|sparkling|tonic|sprite|cola|coke|ginger beer|ginger ale|fever.?tree|mystic|lemonade|seltzer|club soda|mixer/.test(low)) return 'mixer-fizz';
        if (/bitters|angostura|ango|peychaud|egg white|^egg$|tincture|saline|absinthe rinse/.test(low)) return 'static-ruby';
        if (SYRUP_KEYS.some(k => low.includes(k))) return 'magenta-glow';
        if (LIQUEUR_KEYS.some(k => low.includes(k))) return 'neon-cyan';
        if (JUICE_KEYS.some(k => low.includes(k))) return 'juice-glow';
        return 'amber-glow';
    }

    // --- TOASTS (brief confirmation, with optional undo) ---
    let toastTimer = null;
    function showToast(message, undoFn) {
        let el = document.getElementById('codex-toast');
        if (!el) {
            document.body.insertAdjacentHTML('beforeend', '<div id="codex-toast" class="codex-toast hidden"></div>');
            el = document.getElementById('codex-toast');
        }
        el.innerHTML = `<span class="toast-msg"></span>` + (undoFn ? `<button class="toast-undo">UNDO</button>` : '');
        el.querySelector('.toast-msg').innerText = message;
        if (undoFn) {
            el.querySelector('.toast-undo').addEventListener('click', () => {
                triggerHaptic('heavy');
                clearTimeout(toastTimer);
                el.classList.add('hidden');
                undoFn();
            });
        }
        el.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.add('hidden'), undoFn ? 5000 : 2600);
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
    // Recompute on focus and hourly — otherwise the legal dates go stale past
    // midnight while the app sits open, which is exactly when they're used.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') updateBouncer();
    });
    setInterval(updateBouncer, 60 * 60 * 1000);

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
            // Select any prefilled text so you can just type the new value
            setTimeout(() => { input.focus(); if (input.value) input.select(); }, 350);
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

    // One typed-number pattern for every numeric setting — replaces the
    // mix of pickers, cycles and steppers that made the app feel inconsistent.
    function openNumberModal(title, current, suffix, onSet) {
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'num-modal';
        wrap.innerHTML = `
            <div class="num-modal-row">
                <input type="number" class="num-modal-input" value="${current || ''}" inputmode="numeric">
                <span class="num-modal-suffix">${suffix || ''}</span>
            </div>
            <div class="modal-actions">
                <button class="btn-secondary">CANCEL</button>
                <button class="btn-primary">SET</button>
            </div>`;
        const input = wrap.querySelector('.num-modal-input');
        wrap.querySelectorAll('button')[0].addEventListener('click', () => { triggerHaptic('light'); closeSelectModal(); });
        const commit = () => {
            const v = parseFloat(input.value);
            if (!isNaN(v) && v > 0) { triggerHaptic('heavy'); closeSelectModal(); onSet(v); }
        };
        wrap.querySelectorAll('button')[1].addEventListener('click', commit);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
        list.appendChild(wrap);
        modal.classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 350);
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
                // Render OUTSIDE the network try/catch — a rendering bug must never
                // be reported as "offline", which sends you hunting the wrong problem.
                try { renderVault(); } catch (renderErr) { console.error('Render failed:', renderErr); }
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
        const mainIngs = (vaultFilter === 'mocktails' || vaultFilter === 'u21') ? [] : (recipeVault[cocktail] || []);

        if (mainIngs.length > 0) {
            const mainSection = document.createElement('div');
            mainSection.className = 'vault-main-section';
            let html = '';
            mainIngs.forEach(ing => {
                html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span>`;
                if (isToppedRow(ing)) {
                    html += `<span class="ing-amount">top</span></div>`;
                } else if (ing.color === 'static-ruby') {
                    html += `<span class="ing-amount">${Math.round((ing.amount || 0) * round)} ${ing.unit || 'dash'}</span></div>`;
                } else {
                    html += `<span class="ing-amount">${formatAmount(ing.amount * round)}ml</span></div>`;
                }
            });
            // Total yield for the round (static items excluded — dashes aren't volume)
            const mainTotal = mainIngs
                .filter(i => i.color !== 'static-ruby' && !isToppedRow(i))
                .reduce((s, i) => s + (i.amount || 0) * round, 0);
            if (mainTotal > 0) {
                const perDrink = round > 0 ? mainTotal / round : mainTotal;
                html += `<div class="result-row vault-total-row"><span class="ing-name">TOTAL</span><span class="ing-amount">${formatAmount(mainTotal)}ml<span class="vt-sub"> · ${formatAmount(perDrink)}ml each</span></span></div>`;
            }
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
                const label = isStandaloneName(sbName)
                    ? standaloneLabel(sbName)
                    : sbName.replace(cocktail + ' — ', '');

                // Batches are built BY THE BOTTLE (stored amounts are a ratio, pour set
                // to taste) so they always render at bottle scale. Alternate recipes
                // like a Mocktail are made per serve and scale with SERVES instead.
                const isBatch = isBatchSection(label) || isStandaloneName(sbName);
                const ratioSum = sbIngs.filter(i => i.color !== 'static-ruby' && !isToppedRow(i))
                                       .reduce((s, i) => s + (i.amount || 0), 0);
                const bottleML = getBatchSize(sbName);
                const mode = getBatchMode(sbName);
                const factor = !isBatch
                    ? round                                            // per-serve recipe
                    : ((mode === 'bottle' || ratioSum <= 0) ? 1 : (bottleML / ratioSum));

                const mainRef = mainIngs.find(i => i.name === label);
                const perBottle = ratioSum > 0 ? Math.round(ratioSum * factor) : bottleML;

                const section = document.createElement('div');
                section.className = 'vault-subbatch' + (isBatch ? '' : ' vault-altrecipe')
                    + (isU21Section(label) ? ' vault-u21' : '');
                const sectionTitle = isMocktailSection(label) ? getMocktailName(cocktail)
                    : (isU21Section(label) ? '18+ VERSION' : label);
                let html = `<h4 class="vault-subbatch-title">${sectionTitle.toUpperCase()}` +
                    (isBatch
                        ? `<button class="sb-size" data-batch="${sbName.replace(/"/g, '&quot;')}" aria-label="Bottle size for ${label}">${bottleML}ml</button>`
                        : `<span class="vault-yield-label">PER SERVE</span>`) + `</h4>`;
                sbIngs.forEach(ing => {
                    let amtHtml;
                    if (isToppedRow(ing)) {
                        amtHtml = 'top';
                    } else if (ing.color === 'static-ruby') {
                        amtHtml = `${ing.amount || 0} ${ing.unit || 'dash'}`;
                    } else {
                        amtHtml = `${formatAmount(Math.round((ing.amount || 0) * factor))}ml`;
                    }
                    html += `<div class="subbatch-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${amtHtml}</span></div>`;
                });
                // Fixed bottle-worth: doesn't move with SERVES (batches only)
                if (isBatch && mainRef && mainRef.amount > 0) {
                    const cocktails = Math.floor(perBottle / mainRef.amount);
                    html += `<div class="sb-worth">1 bottle (${perBottle}ml) = ${cocktails} cocktails at ${formatAmount(mainRef.amount)}ml</div>`;
                }
                section.innerHTML = html;
                const sizeBtn = section.querySelector('.sb-size');
                if (sizeBtn) sizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    openNumberModal('BOTTLE SIZE', bottleML, 'ml', (ml) => {
                        setBatchSize(sbName, ml);
                        renderVaultContent(container, cocktail, subBatches, round);
                    });
                });
                container.appendChild(section);
            });
        }
    }

    let vaultFilter = 'all';
    let vaultQuery = '';

    function renderVault() {
        const list = document.getElementById('managed-vault-list');
        if (!list) return;
        list.innerHTML = '';
        const specs = Object.keys(recipeVault);
        if (specs.length === 0) {
            list.innerHTML = vaultLive
                ? '<div class="empty-state"><p>No specs yet.</p><span>Tap ＋ NEW SPEC above to add your first cocktail.</span></div>'
                : '<div class="empty-state"><p>Can\'t reach the Codex.</p><span>No cached copy on this device yet — pull down to refresh.</span></div>';
            return;
        }

        const catOrder = { 'amber-glow': 1, 'neon-cyan': 2, 'juice-glow': 3, 'mixer-fizz': 4, 'magenta-glow': 5, 'coffee-dark': 6, 'puree-mango': 7, 'static-ruby': 8 };
        // --- FILTER + SEARCH ---
        const q = (vaultQuery || '').toLowerCase().trim();
        const specHasMocktail = (name) => specs.some(s => s.startsWith(name + ' — ') && isMocktailSection(s.slice(name.length + 3)));
        const matchesQuery = (name) => {
            if (!q) return true;
            if (name.toLowerCase().includes(q)) return true;
            if (getMocktailName(name).toLowerCase().includes(q)) return true;
            // search ingredients too — "what uses Tia Maria?"
            const related = [name, ...specs.filter(s => s.startsWith(name + ' — '))];
            return related.some(r => (recipeVault[r] || []).some(i => (i.name || '').toLowerCase().includes(q)));
        };

        let mains = specs.filter(s => !s.includes(' — '));
        let standalones = specs.filter(s => isStandaloneName(s));
        if (vaultFilter === 'cocktails') { standalones = []; }
        else if (vaultFilter === 'mocktails') { mains = mains.filter(specHasMocktail); standalones = []; }
        else if (vaultFilter === 'u21') {
            mains = mains.filter(n => specs.some(s => s.startsWith(n + ' — ') && isU21Section(s.slice(n.length + 3))));
            standalones = [];
        }
        else if (vaultFilter === 'batches') { mains = []; }
        mains = mains.filter(matchesQuery);
        standalones = standalones.filter(matchesQuery);
        const orphans = (vaultFilter === 'batches' || vaultFilter === 'mocktails' || vaultFilter === 'u21') ? [] :
            specs.filter(s => s.includes(' — ') && !isStandaloneName(s)
                && !specs.some(m => !m.includes(' — ') && s.startsWith(m + ' — ')))
                 .filter(matchesQuery);
        const toRender = [...mains, ...orphans, ...standalones];

        // Filter/search produced nothing (the vault itself isn't empty)
        if (toRender.length === 0) {
            list.innerHTML = `<div class="empty-state"><p>Nothing matches.</p><span>${q ? 'Try a different search term.' : 'No specs in this category yet.'}</span></div>`;
            return;
        }

        toRender.forEach(cocktail => {
            recipeVault[cocktail].sort((a, b) => (catOrder[a.color] || 10) - (catOrder[b.color] || 10));
            let subBatches = specs.filter(s => s.startsWith(cocktail + ' — '));
            // In the MOCKTAILS view, show only the mocktail recipe — you're asking
            // "what can I make for someone not drinking", not for the spirit version.
            if (vaultFilter === 'mocktails') {
                subBatches = subBatches.filter(s => isMocktailSection(s.slice(cocktail.length + 3)));
            } else if (vaultFilter === 'u21') {
                subBatches = subBatches.filter(s => isU21Section(s.slice(cocktail.length + 3)));
            }
            // Fixed reading order — you always want the spirit batch first.
            const SECTION_RANK = (n) => {
                const l = (isStandaloneName(n) ? standaloneLabel(n) : n.replace(cocktail + ' — ', '')).toLowerCase();
                if (/spirit/.test(l)) return 1;
                if (/juice/.test(l)) return 2;
                if (/espresso|coffee/.test(l)) return 3;
                if (/cream/.test(l)) return 4;
                if (/^18\+|u21/.test(l)) return 5;
                if (/mocktail/.test(l)) return 6;
                return 7;
            };
            // Pull in any standalone batch this cocktail references from MAIN
            (recipeVault[cocktail] || []).forEach(ing => {
                const ref = `${STANDALONE_OWNER} — ${ing.name}`;
                if (recipeVault[ref] && !subBatches.includes(ref)) subBatches.push(ref);
            });
            subBatches.forEach(sb => recipeVault[sb].sort((a, b) => (catOrder[a.color] || 10) - (catOrder[b.color] || 10)));

            // Divider before the first standalone batch
            if (isStandaloneName(cocktail) && !list.querySelector('.vault-batches-header')) {
                const bh = document.createElement('div');
                bh.className = 'vault-batches-header';
                bh.innerText = 'BATCHES';
                list.appendChild(bh);
            }
            subBatches.sort((a, b) => SECTION_RANK(a) - SECTION_RANK(b) || a.localeCompare(b));

            const id = cocktail.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

            const vItem = document.createElement('div');
            vItem.className = 'vault-item';

            const header = document.createElement('div');
            header.className = 'vault-header';
            const displayName = isStandaloneName(cocktail) ? standaloneLabel(cocktail)
                : (vaultFilter === 'mocktails' ? getMocktailName(cocktail) : cocktail);
            // Quiet variant markers — only shown when the drink actually has them
            const hasMocktail = specs.some(s => s.startsWith(cocktail + ' — ') && isMocktailSection(s.slice(cocktail.length + 3)));
            const hasU21 = specs.some(s => s.startsWith(cocktail + ' — ') && isU21Section(s.slice(cocktail.length + 3)));
            const pills =
                (hasMocktail ? `<span class="variant-pill vp-mock" aria-label="Has a mocktail version">0%</span>` : '') +
                (hasU21 ? `<span class="variant-pill vp-18" aria-label="Has an 18+ version">18+</span>` : '');
            header.innerHTML = `<span class="cocktail-title">${displayName}</span>${pills}` +
                `<button class="row-more" aria-label="Actions for ${displayName}">⋯</button>`;
            header.querySelector('.row-more').addEventListener('click', (e) => {
                e.stopPropagation();
                triggerHaptic('light');
                if (typeof window.openActionSheet === 'function') window.openActionSheet(cocktail);
            });
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
                <span class="text-sm fw-bold text-muted">SERVES:</span>
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

            // Tap toggles expand. Actions live on the ⋯ button — no hidden long-press.
            vItem.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('input')) return;
                triggerHaptic('light');
                vItem.classList.toggle('expanded');
            });
            list.appendChild(vItem);
        });
        // Auto-seed the shelf data layer (UI removed; data powers autocomplete + category overrides)
        if (typeof autoSeedShelf === 'function') autoSeedShelf();
        if (typeof renderShelf === 'function') renderShelf();
    }

    document.getElementById('vault-search')?.addEventListener('input', (e) => {
        vaultQuery = e.target.value;
        renderVault();
    });
    document.querySelectorAll('.vault-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            triggerHaptic('light');
            document.querySelectorAll('.vault-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            vaultFilter = btn.getAttribute('data-filter');
            renderVault();
        });
    });

    // --- SPEC BUILDER ---
    let builderState = { name: '', sections: [{ name: 'MAIN', ingredients: [] }] };
    // 'cocktail' = a drink with MAIN + optional sub-batches.
    // 'batch'    = a standalone batch that isn't owned by any one cocktail;
    //              stored under the reserved owner "Batch — <name>".
    let builderKind = 'cocktail';
    const STANDALONE_OWNER = 'Batch';
    let standaloneBottleML = 700;
    const isStandaloneName = (n) => (n || '').startsWith(STANDALONE_OWNER + ' — ');
    // A "batch" is something you bottle. A Mocktail (or any other named section)
    // is an ALTERNATE RECIPE for the same drink — made per serve, never bottled.
    const BATCH_SECTIONS = ['spirit batch', 'juice batch', 'espresso batch', 'cream', 'cream batch'];
    const isBatchSection = (sectionLabel) => BATCH_SECTIONS.includes((sectionLabel || '').toLowerCase().trim());
    const isMocktailSection = (sectionLabel) => /mocktail/i.test(sectionLabel || '');
    // A low-ABV swap (e.g. Vodka U21 in place of the spirit) — a recipe, not a batch
    const isU21Section = (sectionLabel) => /^18\+|u21/i.test((sectionLabel || '').trim());
    const standaloneLabel  = (n) => (n || '').replace(STANDALONE_OWNER + ' — ', '');

    function applyBuilderKind() {
        const isBatch = builderKind === 'batch';
        document.querySelectorAll('.spec-kind-pill').forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-kind') === builderKind);
        });
        const nameInput = document.getElementById('builder-name');
        if (nameInput) nameInput.placeholder = isBatch ? 'Batch Name (e.g. Passion+Lem)' : 'Cocktail Name';
        const note = document.getElementById('builder-yield-note');
        if (note) note.innerText = isBatch ? 'STANDALONE BATCH — NOT TIED TO ONE COCKTAIL' : 'STANDARD YIELD: 1 COCKTAIL';
        document.getElementById('standalone-bottle-row')?.classList.toggle('hidden', !isBatch);
        // A standalone batch IS the batch — no sub-batches or extra sections
        document.getElementById('add-batch-btn')?.classList.toggle('hidden', isBatch);
        document.getElementById('add-section-btn')?.classList.toggle('hidden', isBatch);
    }
    const catLabels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'juice-glow': 'JUICE', 'magenta-glow': 'SYRUP', 'coffee-dark': 'ESPRESSO', 'puree-mango': 'PUREE', 'mixer-fizz': 'MIXER', 'static-ruby': 'OTHER' };
    const STATIC_UNITS = ['dash', 'squeeze'];
    // Mixers are normally topped, not measured — but can be given an ml amount
    // when they're part of a batch rather than poured at service.
    const MIXER_UNITS = ['top', 'ml'];
    const isTopped = (ing) => ing && ing.cat === 'mixer-fizz' && (ing.unit || 'top') === 'top';
    const isToppedRow = (row) => row && row.color === 'mixer-fizz' && (row.unit || 'top') === 'top';

    function renderBuilder() {
        const container = document.getElementById('builder-sections');
        if (!container) return;
        container.innerHTML = '';
        builderState.sections.forEach((sec, secIdx) => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'builder-section';
            sectionEl.innerHTML = `
                <div class="builder-section-header">
                    <span class="builder-section-title">${
                        isMocktailSection(sec.name)
                            ? getMocktailName(capitalize((document.getElementById('builder-name')?.value || '').trim()) || 'Mocktail').toUpperCase()
                            : sec.name
                    }</span>
                    ${(secIdx > 0 && isMocktailSection(sec.name))
                        ? `<button class="builder-mocktail-name" aria-label="Name this mocktail">✎ name</button>` : ''}
                    ${(secIdx > 0 && isBatchSection(sec.name))
                        ? `<button class="builder-section-size" aria-label="Bottle size for ${sec.name}">${sec.bottleML || getBatchSize(`${(document.getElementById('builder-name')?.value || '').trim()} — ${sec.name}`)}ml</button>` : ''}
                    ${secIdx > 0 ? '<button class="builder-section-remove">×</button>' : ''}
                </div>
                <div class="builder-rows"></div>
                <button class="builder-add-ing">＋ INGREDIENT</button>
                ${(secIdx > 0 && !isBatchSection(sec.name))
                    ? '<button class="builder-use-batch">＋ USE BATCH</button>' : ''}
            `;
            const rowsEl = sectionEl.querySelector('.builder-rows');
            sec.ingredients.forEach((ing, ingIdx) => {
                const row = document.createElement('div');
                row.className = 'builder-row';
                
                let amountHtml = '';
                if (ing.cat === 'static-ruby') {
                    const u = ing.unit || 'dash';
                    // 'top' has no meaningful count — hide the number input entirely
                    const countInput = u === 'top' ? '' :
                        `<span class="static-step"><button class="ss-btn" data-d="-1">−</button><span class="ss-n">${ing.amount || 0}</span><button class="ss-btn" data-d="1">+</button></span>`;
                    amountHtml = `
                        <div style="display:flex; align-items:center; gap:4px; margin-right:4px;">
                           ${countInput}
                           <button class="unit-pill" data-unit="${u}">${u}</button>
                        </div>
                    `;
                } else if (ing.cat === 'mixer-fizz') {
                    const mu = ing.unit || 'top';
                    amountHtml = `
                        <div style="display:flex; align-items:center; gap:4px; margin-right:4px;">
                           ${mu === 'ml' ? `<input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">` : ''}
                           <button class="unit-pill mixer-unit" data-unit="${mu}">${mu}</button>
                        </div>
                    `;
                } else {
                    amountHtml = `<input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">`;
                }
                
                row.innerHTML = `
                    ${amountHtml}
                    <input type="text" class="builder-row-name" autocomplete="off" value="${(ing.name || '').replace(/"/g, '&quot;')}" placeholder="Ingredient">
                    <button class="builder-row-cat ${ing.cat}">${catLabels[ing.cat] || 'SPIRIT'}</button>
                    <button class="builder-row-remove">×</button>
                `;
                
                if (ing.cat === 'static-ruby') {
                    row.querySelectorAll('.ss-btn').forEach(b => {
                        b.addEventListener('click', (e) => {
                            e.preventDefault();
                            triggerHaptic('light');
                            const d = parseInt(b.getAttribute('data-d'));
                            const t = builderState.sections[secIdx].ingredients[ingIdx];
                            t.amount = Math.max(0, (parseFloat(t.amount) || 0) + d);
                            const n = row.querySelector('.ss-n');
                            if (n) n.innerText = t.amount;
                        });
                    });
                    const unitPill = row.querySelector('.unit-pill');
                    if (unitPill) {
                        unitPill.addEventListener('click', (e) => {
                            triggerHaptic('light');
                            let currIdx = STATIC_UNITS.indexOf(e.target.dataset.unit || 'dash');
                            const nextUnit = STATIC_UNITS[(currIdx + 1) % STATIC_UNITS.length];
                            const t = builderState.sections[secIdx].ingredients[ingIdx];
                            t.unit = nextUnit;
                            // 'top' has no count; 'squeeze' is almost always one (an egg white)
                            if (nextUnit === 'top') t.amount = 1;
                            else if (nextUnit === 'squeeze') t.amount = t.amount || 1;
                            else if (!t.amount) t.amount = 1;
                            renderBuilder();
                        });
                    }
                } else {
                    const amtEl = row.querySelector('.builder-row-amount');   // absent on topped mixers
                    if (amtEl) amtEl.addEventListener('input', e => {
                        builderState.sections[secIdx].ingredients[ingIdx].amount = parseFloat(e.target.value) || 0;
                    });
                    const mixPill = row.querySelector('.mixer-unit');
                    if (mixPill) mixPill.addEventListener('click', () => {
                        triggerHaptic('light');
                        const t = builderState.sections[secIdx].ingredients[ingIdx];
                        const i = MIXER_UNITS.indexOf(t.unit || 'top');
                        t.unit = MIXER_UNITS[(i + 1) % MIXER_UNITS.length];
                        if (t.unit === 'top') t.amount = 1;      // keeps it past the save filter
                        else if (!t.amount) t.amount = 100;
                        renderBuilder();
                    });
                }
                
                attachIngredientSuggestions(row.querySelector('.builder-row-name'), (picked, cat) => {
                    const ing2 = builderState.sections[secIdx].ingredients[ingIdx];
                    ing2.name = picked;
                    if (cat) ing2.cat = cat;
                    renderBuilder();
                });
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
                const cats = ['amber-glow', 'neon-cyan', 'juice-glow', 'mixer-fizz', 'puree-mango', 'magenta-glow', 'coffee-dark', 'static-ruby'];
                const current = builderState.sections[secIdx].ingredients[ingIdx].cat;
                    const next = cats[(cats.indexOf(current) + 1) % cats.length];
                    builderState.sections[secIdx].ingredients[ingIdx].cat = next;
                    if (next === 'mixer-fizz') {
                        const t = builderState.sections[secIdx].ingredients[ingIdx];
                        if (!t.unit || !MIXER_UNITS.includes(t.unit)) { t.unit = 'top'; t.amount = 1; }
                        renderBuilder();
                        return;
                    }
                    if (next === 'static-ruby' && !builderState.sections[secIdx].ingredients[ingIdx].amount) {
                        builderState.sections[secIdx].ingredients[ingIdx].amount = 1;
                    }
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
            // Recipe sections (Mocktail etc) can POUR FROM a batch — the batch recipe
            // stays in one place and the section just references it.
            const useBatchBtn = sectionEl.querySelector('.builder-use-batch');
            if (useBatchBtn) {
                useBatchBtn.addEventListener('click', () => {
                    triggerHaptic('light');
                    const opts = [];
                    // batches defined in this spec
                    builderState.sections.forEach(s => {
                        if (s.name !== 'MAIN' && isBatchSection(s.name)) opts.push({ label: s.name, value: s.name });
                    });
                    // standalone batches
                    Object.keys(recipeVault || {}).filter(isStandaloneName).forEach(n => {
                        opts.push({ label: standaloneLabel(n), value: standaloneLabel(n) });
                    });
                    if (!opts.length) {
                        openAlertModal({ title: 'NO BATCHES', message: 'Add a batch to this spec first, or create a standalone batch.' });
                        return;
                    }
                    openSelectModal('POUR FROM BATCH', opts, (val, label) => {
                        setTimeout(() => {
                            openNumberModal(`POUR OF ${label.toUpperCase()}`, 60, 'ml', (ml) => {
                                const ings = builderState.sections[secIdx].ingredients;
                                const existing = ings.find(i => (i.name || '').toLowerCase() === label.toLowerCase());
                                const cat = /juice|mocktail/i.test(label) ? 'juice-glow' : 'amber-glow';
                                if (existing) { existing.amount = ml; existing.cat = cat; }
                                else ings.push({ amount: ml, name: label, cat });
                                renderBuilder();
                            });
                        }, 350);
                    });
                });
            }

            const mockNameBtn = sectionEl.querySelector('.builder-mocktail-name');
            if (mockNameBtn) {
                mockNameBtn.addEventListener('click', () => {
                    triggerHaptic('light');
                    const cocktailNow = capitalize((document.getElementById('builder-name')?.value || '').trim());
                    if (!cocktailNow) {
                        openAlertModal({ title: 'NAME FIRST', message: 'Give the cocktail a name before naming its mocktail.' });
                        return;
                    }
                    openSelectModal('MOCKTAIL NAME', [], null, {
                        placeholder: 'Mocktail name…',
                        btnLabel: 'SET',
                        prefill: hasCustomMocktailName(cocktailNow) ? getMocktailName(cocktailNow) : '',
                        onSubmit: (v) => {
                            setMocktailName(cocktailNow, capitalize((v || '').trim()));
                            renderBuilder();
                            renderVault();
                        }
                    });
                });
            }

            const sizeBtn = sectionEl.querySelector('.builder-section-size');
            if (sizeBtn) {
                sizeBtn.addEventListener('click', () => {
                    triggerHaptic('light');
                    const cocktailNow = (document.getElementById('builder-name')?.value || '').trim();
                    const current = sec.bottleML || getBatchSize(`${cocktailNow} — ${sec.name}`);
                    openNumberModal(`${sec.name.toUpperCase()} BOTTLE`, current, 'ml', (ml) => {
                        builderState.sections[secIdx].bottleML = ml;
                        renderBuilder();
                    });
                });
            }
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
        builderKind = 'cocktail';
        standaloneBottleML = 700;
        const sbi = document.getElementById('standalone-bottle-input');
        if (sbi) sbi.value = 700;
        applyBuilderKind();
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
                { label: 'Mocktail', value: 'Mocktail' },
                { label: '18+ Version', value: '18+' }
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
                    // Only batches are built from MAIN's ingredients. A Mocktail (or any
                    // other recipe section) is written from scratch — no picker.
                    if (isBatchSection(val)) setTimeout(() => openSectionPicker(val, pre), 350);
                    else { builderState.sections.push({ name: val, ingredients: [] }); renderBuilder(); }
                },
                {
                    placeholder: 'Or type custom section name...',
                    btnLabel: 'ADD CUSTOM',
                    onSubmit: (val) => {
                        // Custom: no rule — checklist opens unticked
                        const custom = capitalize(val);
                        if (isBatchSection(custom)) setTimeout(() => openSectionPicker(custom, []), 350);
                        else { builderState.sections.push({ name: custom, ingredients: [] }); renderBuilder(); }
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
            // Standalone batch: everything lands under "Batch — <name>"
            if (builderKind === 'batch') {
                const fullName = `${STANDALONE_OWNER} — ${name}`;
                const mainSec = builderState.sections.find(s => s.name === 'MAIN') || builderState.sections[0];
                (mainSec ? mainSec.ingredients : []).forEach(ing => {
                    // Static rows (dash / squeeze / top) are counted, not measured —
                    // they can sit at 0 and must NOT be silently dropped on save.
                    const isStatic = ing.cat === 'static-ruby';
                    if (!ing.name.trim()) return;
                    if (!isStatic && !ing.amount) return;
                    payload.push({
                        cocktailName: fullName,
                        ingredientName: capitalize(ing.name.trim()),
                        amount: isStatic ? (parseFloat(ing.amount) || 1) : parseFloat(ing.amount),
                        bottleSize: 0,
                        categoryTag: ing.cat,
                        unit: ing.cat === 'static-ruby' ? (ing.unit || 'dash') : (ing.cat === 'mixer-fizz' ? (ing.unit || 'top') : '')
                    });
                });
                setBatchMode(fullName, 'bottle');
                setBatchSize(fullName, standaloneBottleML || 700);
                if (payload.length === 0) {
                    openAlertModal({ title: 'NO INGREDIENTS', message: 'Add at least one ingredient with name and amount.' });
                    return;
                }
                showLoader("SAVING BATCH...");
                try {
                    const toDelete = editingCocktailName ? [editingCocktailName] : [fullName];
                    for (const n of toDelete) {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: n }) });
                    }
                    await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
                    resetBuilder();
                    await loadVault();
                } catch (e) {
                    hideLoader();
                    openAlertModal({ title: 'SAVE FAILED', message: 'Something went wrong. Please try again.' });
                }
                return;
            }
            builderState.sections.forEach(sec => {
                const sectionName = sec.name === 'MAIN' ? name : `${name} — ${sec.name}`;
                // Remember the bottle size entered in the builder header
                if (sec.name !== 'MAIN' && sec.bottleML) {
                    setBatchSize(sectionName, sec.bottleML);
                    setBatchMode(sectionName, getBatchMode(sectionName) || 'drink');
                }
                sec.ingredients.forEach(ing => {
                    // Static rows (dash / squeeze / top) are counted, not measured —
                    // they can sit at 0 and must NOT be silently dropped on save.
                    const isStatic = ing.cat === 'static-ruby';
                    if (!ing.name.trim()) return;
                    if (!isStatic && !ing.amount) return;
                    payload.push({
                        cocktailName: sectionName,
                        ingredientName: capitalize(ing.name.trim()),
                        amount: isStatic ? (parseFloat(ing.amount) || 1) : parseFloat(ing.amount),
                        bottleSize: 0,
                        categoryTag: ing.cat,
                        unit: ing.cat === 'static-ruby' ? (ing.unit || 'dash') : (ing.cat === 'mixer-fizz' ? (ing.unit || 'top') : '')
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
                showToast(`Saved "${name}"`);
            } catch (e) {
                hideLoader();
                openAlertModal({ title: 'SAVE FAILED', message: 'Something went wrong. Please try again.' });
            }
        });
    }


    // --- BATCH BUILDER ---
    let batchBuilderState = null;

    function openBatchBuilder() {
        // Smart default: open to the first unused batch type (Spirit → Juice → Espresso → Mocktail)
        const typeOrder = ['Spirit Batch', 'Juice Batch', 'Espresso Batch', 'Mocktail'];
        const defaultType = typeOrder.find(t => !builderState.sections.find(s => s.name === t)) || 'Spirit Batch';
        batchBuilderState = { type: defaultType, customType: '', ingredients: [], perDrink: 0, mode: 'bottle', bottleML: BATCH_BOTTLE_ML };
        
        const addBtn = document.getElementById('add-batch-btn');
        if (addBtn) addBtn.classList.add('hidden');
        
        sweepIntoBatch(defaultType);
        renderBuilder();
        renderBatchForm();
    }

    // Shared sweep — sweeps MAIN into the batch, merges existing sub-section, fills placeholders if empty
    function sweepIntoBatch(targetType) {
        const mainSec = builderState.sections.find(s => s.name === 'MAIN');
        
        let allowed = ['amber-glow', 'neon-cyan', 'juice-glow', 'mixer-fizz', 'puree-mango', 'magenta-glow', 'coffee-dark'];
        if (BATCH_CONFIG[targetType]) allowed = BATCH_CONFIG[targetType].allowedCategories;
        else if (targetType === 'Mocktail') allowed = ['juice-glow', 'puree-mango', 'magenta-glow', 'mixer-fizz'];
        
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
                batchBuilderState.perDrink = batchBuilderState.ingredients.filter(i => i.cat !== 'static-ruby' && !isTopped(i)).reduce((sum, ing) => sum + (ing.amount || 0), 0);
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
        // Remember how this batch was defined so the prep card renders it correctly
        const cocktailNameNow = capitalize((document.getElementById('builder-name').value || '').trim());
        if (cocktailNameNow) {
            const fullBatchName = `${cocktailNameNow} — ${batchBuilderState.type === 'Custom' ? capitalize(batchBuilderState.customType.trim()) : batchBuilderState.type}`;
            setBatchMode(fullBatchName, batchBuilderState.mode);
            if (batchBuilderState.mode === 'bottle') setBatchSize(fullBatchName, batchBuilderState.bottleML || BATCH_BOTTLE_ML);
        }
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
                <div class="batch-mode-pills">
                    <button class="batch-mode-pill ${batchBuilderState.mode === 'bottle' ? 'active' : ''}" data-mode="bottle">PER BOTTLE</button>
                    <button class="batch-mode-pill ${batchBuilderState.mode === 'drink' ? 'active' : ''}" data-mode="drink">PER DRINK</button>
                </div>
                ${batchBuilderState.mode === 'bottle' ? `
                <div class="batch-bottle-row">
                    <span class="text-muted text-xs">BOTTLE SIZE:</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <input type="number" id="batch-bottle-input" class="batch-per-drink-input" value="${batchBuilderState.bottleML}">
                        <span class="batch-per-drink-suffix">ml</span>
                    </div>
                </div>` : ''}
                <h5 class="batch-section-label">${batchBuilderState.mode === 'bottle' ? 'CONSTITUENTS (PER BOTTLE)' : 'CONSTITUENTS (1-COCKTAIL RATIO)'}</h5>
                <div id="batch-ingredients-list"></div>
                <button id="batch-add-ing-btn" class="builder-add-ing">＋ INGREDIENT</button>
                
                <div class="batch-per-drink-row" style="flex-direction: column; align-items: stretch; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                    <div style="display:flex; justify-content: space-between; margin-bottom: 12px; align-items: center;">
                        <span class="text-muted text-xs">${batchBuilderState.mode === 'bottle' ? 'BATCH TOTAL:' : 'RATIO SUM:'}</span>
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
                    <div id="batch-drinks-readout" class="batch-drinks-readout"></div>
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

        // Mode toggle — converts the numbers so you never retype them
        container.querySelectorAll('.batch-mode-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const newMode = pill.getAttribute('data-mode');
                if (newMode === batchBuilderState.mode) return;
                triggerHaptic('light');
                const sum = batchBuilderState.ingredients
                    .filter(i => i.cat !== 'static-ruby' && !isTopped(i))
                    .reduce((s, i) => s + (i.amount || 0), 0);
                const bottle = batchBuilderState.bottleML || BATCH_BOTTLE_ML;
                if (sum > 0) {
                    // drink -> bottle: scale the ratio up to fill the bottle
                    // bottle -> drink: scale back down to the pour size (or keep ratio if no pour)
                    const f = (newMode === 'bottle')
                        ? (bottle / sum)
                        : ((batchBuilderState.perDrink > 0 ? batchBuilderState.perDrink : sum) / sum);
                    batchBuilderState.ingredients.forEach(i => {
                        if (i.cat !== 'static-ruby' && !isTopped(i)) i.amount = Math.round((i.amount || 0) * f);
                    });
                }
                batchBuilderState.mode = newMode;
                renderBatchForm();
            });
        });

        const bottleInput = document.getElementById('batch-bottle-input');
        if (bottleInput) bottleInput.addEventListener('input', e => {
            batchBuilderState.bottleML = parseFloat(e.target.value) || BATCH_BOTTLE_ML;
            updateBatchYieldDisplay();
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
                const countInput = u === 'top' ? '' :
                    `<span class="static-step"><button class="ss-btn" data-d="-1">−</button><span class="ss-n">${ing.amount || 0}</span><button class="ss-btn" data-d="1">+</button></span>`;
                amountHtml = `
                    <div style="display:flex; align-items:center; gap:4px; margin-right:4px;">
                       ${countInput}
                       <button class="unit-pill" data-unit="${u}">${u}</button>
                    </div>
                `;
            } else if (ing.cat === 'mixer-fizz') {
                const mu = ing.unit || 'top';
                amountHtml = `
                    <div style="display:flex; align-items:center; gap:4px; margin-right:4px;">
                       ${mu === 'ml' ? `<input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">` : ''}
                       <button class="unit-pill mixer-unit" data-unit="${mu}">${mu}</button>
                    </div>
                `;
            } else {
                amountHtml = `<input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">`;
            }
            
            row.innerHTML = `
                ${amountHtml}
                <input type="text" class="builder-row-name" autocomplete="off" value="${(ing.name || '').replace(/"/g, '&quot;')}" placeholder="Ingredient">
                <button class="builder-row-cat ${ing.cat}">${catLabels[ing.cat] || 'SPIRIT'}</button>
                <button class="builder-row-remove">×</button>
            `;
            
            if (ing.cat === 'static-ruby') {
                row.querySelectorAll('.ss-btn').forEach(b => {
                    b.addEventListener('click', (e) => {
                        e.preventDefault();
                        triggerHaptic('light');
                        const d = parseInt(b.getAttribute('data-d'));
                        const t = batchBuilderState.ingredients[idx];
                        t.amount = Math.max(0, (parseFloat(t.amount) || 0) + d);
                        const n = row.querySelector('.ss-n');
                        if (n) n.innerText = t.amount;
                    });
                });
                const unitPill = row.querySelector('.unit-pill');
                if (unitPill) {
                    unitPill.addEventListener('click', (e) => {
                        triggerHaptic('light');
                        let currIdx = STATIC_UNITS.indexOf(e.target.dataset.unit || 'dash');
                        const nextUnit = STATIC_UNITS[(currIdx + 1) % STATIC_UNITS.length];
                        const t = batchBuilderState.ingredients[idx];
                        t.unit = nextUnit;
                        if (nextUnit === 'top') t.amount = 1;
                        else if (nextUnit === 'squeeze') t.amount = t.amount || 1;
                        else if (!t.amount) t.amount = 1;
                        renderBatchIngredients();
                    });
                }
            } else {
                const amtEl = row.querySelector('.builder-row-amount');
                if (amtEl) amtEl.addEventListener('input', e => {
                    batchBuilderState.ingredients[idx].amount = parseFloat(e.target.value) || 0;
                    updateBatchYieldDisplay();
                });
                const mixPill = row.querySelector('.mixer-unit');
                if (mixPill) mixPill.addEventListener('click', () => {
                    triggerHaptic('light');
                    const t = batchBuilderState.ingredients[idx];
                    const i = MIXER_UNITS.indexOf(t.unit || 'top');
                    t.unit = MIXER_UNITS[(i + 1) % MIXER_UNITS.length];
                    if (t.unit === 'top') t.amount = 1;
                    else if (!t.amount) t.amount = 100;
                    renderBatchIngredients();
                    updateBatchYieldDisplay();
                });
            }
            
            attachIngredientSuggestions(row.querySelector('.builder-row-name'), (picked, cat) => {
                batchBuilderState.ingredients[idx].name = picked;
                if (cat) batchBuilderState.ingredients[idx].cat = cat;
                renderBatchIngredients();
            });
            row.querySelector('.builder-row-name').addEventListener('input', e => {
                const val = e.target.value;
                batchBuilderState.ingredients[idx].name = val;
                if (!val.trim()) return;
                // The batch builder never applied a category — a known ingredient
                // like Yuzu came in as SPIRIT even though the shelf says LIQUEUR.
                const current = batchBuilderState.ingredients[idx].cat;
                let detected = null, shelfHit = false;
                if (typeof shelfData !== 'undefined') {
                    const m = Object.keys(shelfData).find(k => k.toLowerCase() === val.toLowerCase().trim());
                    if (m) { detected = shelfData[m].category; shelfHit = true; }
                }
                if (!shelfHit) detected = categorizeIngredient(val);
                if (detected && detected !== current && (shelfHit || current === 'amber-glow')) {
                    // respect the bucket's allowed categories
                    let allowed = null;
                    if (BATCH_CONFIG[batchBuilderState.type]) allowed = BATCH_CONFIG[batchBuilderState.type].allowedCategories;
                    else if (batchBuilderState.type === 'Mocktail') allowed = ['juice-glow', 'puree-mango', 'magenta-glow', 'mixer-fizz'];
                    if (!allowed || allowed.includes(detected)) {
                        batchBuilderState.ingredients[idx].cat = detected;
                        const btn = row.querySelector('.builder-row-cat');
                        btn.className = `builder-row-cat ${detected}`;
                        btn.innerText = catLabels[detected] || 'SPIRIT';
                    }
                }
            });
            row.querySelector('.builder-row-cat').addEventListener('click', () => {
                triggerHaptic('light');
                
                let cats = ['amber-glow', 'neon-cyan', 'juice-glow', 'mixer-fizz', 'puree-mango', 'magenta-glow', 'coffee-dark', 'static-ruby'];
                if (BATCH_CONFIG[batchBuilderState.type]) {
                    cats = BATCH_CONFIG[batchBuilderState.type].allowedCategories;
                } else if (batchBuilderState.type === 'Mocktail') {
                    cats = ['juice-glow', 'puree-mango', 'magenta-glow', 'mixer-fizz'];
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
        const total = batchBuilderState.ingredients.filter(i => i.cat !== 'static-ruby' && !isTopped(i)).reduce((s, i) => s + (i.amount || 0), 0);
        autoSum.innerText = `${total.toFixed(1).replace(/\.0$/, '')} ml`;
        const readout = document.getElementById('batch-drinks-readout');
        if (readout) {
            const pour = batchBuilderState.perDrink;
            if (batchBuilderState.mode === 'bottle' && total > 0 && pour > 0) {
                const drinks = Math.floor(total / pour);
                const bottle = batchBuilderState.bottleML || BATCH_BOTTLE_ML;
                const off = Math.abs(total - bottle);
                readout.innerHTML = `${drinks} drinks per bottle` +
                    (off > 5 ? ` <span class="bdr-warn">· total is ${total > bottle ? 'over' : 'under'} ${bottle}ml by ${Math.round(off)}ml</span>` : '');
            } else {
                readout.innerText = '';
            }
        }
    }

    const addBatchBtn = document.getElementById('add-batch-btn');
    if (addBatchBtn) {
        addBatchBtn.addEventListener('click', () => {
            triggerHaptic('light');
            if (batchBuilderState) { closeBatchBuilder(); return; }
            // Offer existing standalone batches before building a new one
            const shared = Object.keys(recipeVault || {}).filter(isStandaloneName);
            if (shared.length) {
                const opts = shared.map(n => ({ label: standaloneLabel(n), value: n }));
                opts.push({ label: '＋ Build a new batch…', value: '__new__' });
                openSelectModal('ADD BATCH', opts, (val, label) => {
                    if (val === '__new__') { openBatchBuilder(); return; }
                    // Reference it from MAIN with a pour amount
                    setTimeout(() => {
                        openSelectModal(`POUR OF ${label.toUpperCase()}`, [
                            { label: '30 ml', value: 30 }, { label: '40 ml', value: 40 },
                            { label: '50 ml', value: 50 }, { label: '60 ml', value: 60 },
                            { label: '70 ml', value: 70 }
                        ], (ml) => addSharedBatchRef(val, parseFloat(ml)), {
                            placeholder: 'Custom pour in ml…',
                            btnLabel: 'ADD',
                            onSubmit: (v) => { const ml = parseFloat(v); if (ml > 0) addSharedBatchRef(val, ml); }
                        });
                    }, 350);
                });
            } else {
                openBatchBuilder();
            }
        });
    }

    // Adds a MAIN row pointing at a standalone batch (the recipe stays in one place)
    function addSharedBatchRef(fullName, ml) {
        const mainSec = builderState.sections.find(s => s.name === 'MAIN');
        if (!mainSec) return;
        const label = standaloneLabel(fullName);
        const existing = mainSec.ingredients.find(i => (i.name || '').toLowerCase() === label.toLowerCase());
        const ings = recipeVault[fullName] || [];
        const juicey = ings.some(i => ['juice-glow', 'puree-mango'].includes(i.color));
        const cat = juicey ? 'juice-glow' : 'amber-glow';
        if (existing) { existing.amount = ml; existing.cat = cat; }
        else mainSec.ingredients.push({ amount: ml, name: label, cat, sharedBatch: fullName });
        renderBuilder();
    }

    renderBuilder();

    // --- THE SHELF ---
    const SHELF_KEY = 'codex_shelf_v1';
    let shelfData = {};
    let shelfAddState = null;
    const shelfCatLabels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'juice-glow': 'JUICE', 'magenta-glow': 'SYRUP', 'coffee-dark': 'ESPRESSO', 'puree-mango': 'PUREE', 'mixer-fizz': 'MIXER', 'static-ruby': 'OTHER' };
    const shelfDefaultAbvs = { 'amber-glow': 40, 'neon-cyan': 20, 'juice-glow': 0, 'magenta-glow': 0, 'coffee-dark': 0, 'puree-mango': 0, 'mixer-fizz': 0, 'static-ruby': 45 };

    function loadShelf() {
        try {
            const raw = localStorage.getItem(SHELF_KEY);
            shelfData = raw ? JSON.parse(raw) : {};
        } catch { shelfData = {}; }
    }

    function saveShelf() {
        try { localStorage.setItem(SHELF_KEY, JSON.stringify(shelfData)); } catch {}
        refreshShelfDatalist();
        if (typeof scheduleSettingsPush === 'function') scheduleSettingsPush();
    }

    // Custom suggestion pills under an ingredient field — matches ANYWHERE in the
    // name (not just prefix), recency-first, and stays quiet until you type.
    // Picking one also applies that ingredient's stored category.
    function attachIngredientSuggestions(input, onPick) {
        if (!input) return;
        const rowEl = document.createElement('div');
        rowEl.className = 'ing-sugg-row hidden';
        input.parentNode.insertBefore(rowEl, input.nextSibling);

        const hide = () => { rowEl.classList.add('hidden'); rowEl.innerHTML = ''; };

        const render = () => {
            const q = (input.value || '').toLowerCase().trim();
            if (!q) { hide(); return; }
            const names = Object.keys(shelfData || {});
            const hits = names
                .filter(n => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
                .sort((a, b) => {
                    const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
                    const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
                    return ap - bp || a.localeCompare(b);
                })
                .slice(0, 6);
            if (!hits.length) { hide(); return; }
            rowEl.innerHTML = '';
            hits.forEach(n => {
                const pill = document.createElement('button');
                pill.type = 'button';
                pill.className = `ing-sugg ${shelfData[n].category || ''}`;
                pill.innerText = n;
                pill.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerHaptic('light');
                    input.value = n;
                    hide();
                    onPick(n, shelfData[n].category);
                });
                rowEl.appendChild(pill);
            });
            rowEl.classList.remove('hidden');
        };

        input.addEventListener('input', render);
        input.addEventListener('blur', () => setTimeout(hide, 180));   // let the tap land first
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

    const shelfCats = ['amber-glow', 'neon-cyan', 'juice-glow', 'mixer-fizz', 'puree-mango', 'magenta-glow', 'coffee-dark', 'static-ruby'];

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
            </div>`;
        form.querySelector('.shelf-add-name').addEventListener('input', e => { shelfAddState.name = e.target.value; });
        form.querySelector('.shelf-add-cat').addEventListener('click', () => {
            triggerHaptic('light');
            shelfAddState.cat = shelfCats[(shelfCats.indexOf(shelfAddState.cat) + 1) % shelfCats.length];
            const btn = form.querySelector('.shelf-add-cat');
            btn.className = `shelf-add-cat ${shelfAddState.cat}`;
            btn.innerText = shelfCatLabels[shelfAddState.cat];
            shelfAddState.abv = shelfDefaultAbvs[shelfAddState.cat] || 0;
            form.querySelector('.shelf-add-abv').value = shelfAddState.abv;
        });
        form.querySelector('.shelf-add-abv').addEventListener('input', e => { shelfAddState.abv = parseFloat(e.target.value) || 0; });
        form.querySelector('.shelf-add-cancel').addEventListener('click', () => { triggerHaptic('light'); toggleShelfAddForm(); });
        form.querySelector('.shelf-add-save').addEventListener('click', () => {
            triggerHaptic('heavy');
            const name = capitalize(shelfAddState.name.trim());
            if (!name) return openAlertModal({ title: 'NOTICE', message: 'Ingredient name required.' });
            if (shelfData[name]) return openAlertModal({ title: 'NOTICE', message: `"${name}" is already on the shelf.` });
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
        const catOrder = { 'amber-glow': 1, 'neon-cyan': 2, 'juice-glow': 3, 'mixer-fizz': 4, 'magenta-glow': 5, 'coffee-dark': 6, 'puree-mango': 7, 'static-ruby': 8 };
        const entries = Object.entries(shelfData).sort((a, b) => {
            const oa = catOrder[a[1].category] || 10, ob = catOrder[b[1].category] || 10;
            return oa !== ob ? oa - ob : a[0].localeCompare(b[0]);
        });
        if (!entries.length) {
            list.innerHTML = '<p class="text-muted text-sm" style="margin-top:16px; padding:8px;">No ingredients yet. Add one above, or save a cocktail to auto-seed.</p>';
            return;
        }
        entries.forEach(([name, data]) => {
            const row = document.createElement('div');
            row.className = `shelf-row ${data.category}${data.inStock === false ? ' shelf-row-oos' : ''}`;
            const bottle = getIngBottleSize(name);
            row.innerHTML = `
                <button class="shelf-stock-btn ${data.inStock === false ? 'oos' : 'in-stock'}" aria-label="Toggle stock for ${name}">${data.inStock === false ? '○' : '●'}</button>
                <span class="shelf-ing-name">${name}</span>
                <button class="shelf-cat-btn ${data.category}" aria-label="Category for ${name}">${shelfCatLabels[data.category] || 'SPIRIT'}</button>
                <input type="number" class="shelf-abv-input" value="${data.abv || 0}" min="0" max="100" aria-label="ABV for ${name}">
                <span class="shelf-abv-suffix">%</span>
                <button class="shelf-bottle-btn" aria-label="Bottle size for ${name}">${bottle}ml</button>
                <button class="row-more" aria-label="Actions for ${name}">⋯</button>`;
            row.querySelector('.shelf-stock-btn').addEventListener('click', e => {
                e.stopPropagation(); triggerHaptic('light');
                const nowIn = (shelfData[name].inStock === false);
                shelfData[name].inStock = nowIn;
                saveShelf();
                const btn = e.target;
                btn.innerText = nowIn ? '●' : '○';
                btn.className = `shelf-stock-btn ${nowIn ? 'in-stock' : 'oos'}`;
                row.classList.toggle('shelf-row-oos', !nowIn);
            });
            row.querySelector('.shelf-abv-input').addEventListener('change', e => {
                shelfData[name].abv = parseFloat(e.target.value) || 0; saveShelf();
            });
            row.querySelector('.shelf-cat-btn').addEventListener('click', e => {
                e.stopPropagation(); triggerHaptic('light');
                const cur = shelfData[name].category;
                const next = shelfCats[(shelfCats.indexOf(cur) + 1) % shelfCats.length];
                shelfData[name].category = next;
                saveShelf();
                // Update in place — a full re-render re-sorts and the row jumps
                // away mid-edit, so you end up chasing it down the list.
                const btn = e.target;
                btn.className = `shelf-cat-btn ${next}`;
                btn.innerText = shelfCatLabels[next] || 'SPIRIT';
                row.className = `shelf-row ${next}${shelfData[name].inStock === false ? ' shelf-row-oos' : ''}`;
            });
            row.querySelector('.shelf-bottle-btn').addEventListener('click', e => {
                e.stopPropagation(); triggerHaptic('light');
                const btn = e.target;
                openNumberModal(`${name.toUpperCase()} BOTTLE`, getIngBottleSize(name), 'ml', (ml) => {
                    setIngBottleSize(name, ml);
                    btn.innerText = `${ml}ml`;   // in place, no jump
                });
            });
            const shelfActions = () => {
                triggerHaptic('medium');
                openSelectModal(name.toUpperCase(), [
                    { label: 'Rename / Merge', value: 'rename' },
                    { label: 'Remove from shelf', value: 'remove' }
                ], (val) => {
                    if (val === 'rename') setTimeout(() => renameShelfIngredient(name), 350);
                    else setTimeout(() => confirmRemoveShelf(name), 350);
                });
            };

            const confirmRemoveShelf = (nm) => {
                openConfirmModal({
                    title: 'REMOVE INGREDIENT',
                    message: `Remove "${nm}" from the shelf?`,
                    confirmLabel: 'REMOVE',
                    danger: true,
                    onConfirm: () => {
                        const removed = shelfData[nm];
                        delete shelfData[nm];
                        saveShelf(); renderShelf();
                        showToast(`Removed "${nm}"`, () => {
                            shelfData[nm] = removed; saveShelf(); renderShelf();
                        });
                    }
                });
            };
            row.querySelector('.row-more').addEventListener('click', e => { e.stopPropagation(); shelfActions(); });
            list.appendChild(row);
        });
    };

    // Rename an ingredient everywhere it appears. If the new name already exists,
    // this becomes a MERGE — the two shelf entries collapse into one and every
    // spec row is rewritten. Fixes twins like "Simple" vs "Simple Syrup".
    async function renameShelfIngredient(oldName) {
        openSelectModal('RENAME INGREDIENT', [], null, {
            placeholder: 'New name…',
            btnLabel: 'NEXT',
            prefill: oldName,
            onSubmit: async (val) => {
                const newName = capitalize((val || '').trim());
                if (!newName || newName === oldName) return;
                const isMerge = !!shelfData[newName];

                // Which specs mention the old name?
                const affected = [];
                Object.keys(recipeVault).forEach(specName => {
                    if ((recipeVault[specName] || []).some(i => i.name === oldName)) affected.push(specName);
                });

                const doIt = async () => {
                    showLoader(isMerge ? "MERGING..." : "RENAMING...");
                    try {
                        for (const specName of affected) {
                            const rows = [];
                            const seen = new Set();
                            (recipeVault[specName] || []).forEach(ing => {
                                const nm = ing.name === oldName ? newName : ing.name;
                                // merging can create a duplicate line in one spec — combine amounts
                                if (seen.has(nm.toLowerCase())) {
                                    const prev = rows.find(r => r.ingredientName.toLowerCase() === nm.toLowerCase());
                                    if (prev) prev.amount += (ing.amount || 0);
                                    return;
                                }
                                seen.add(nm.toLowerCase());
                                rows.push({
                                    cocktailName: specName, ingredientName: nm, amount: ing.amount,
                                    bottleSize: 0, categoryTag: ing.color, unit: ing.unit || ''
                                });
                            });
                            await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: specName }) });
                            await fetch(API_URL, { method: 'POST', body: JSON.stringify(rows) });
                        }
                        // Shelf side: carry settings over, drop the old entry
                        const oldEntry = shelfData[oldName];
                        if (!shelfData[newName] && oldEntry) shelfData[newName] = oldEntry;
                        const oldBottle = getIngBottleSize(oldName);
                        if (oldBottle && !isMerge) setIngBottleSize(newName, oldBottle);
                        delete shelfData[oldName];
                        saveShelf();
                        await loadVault();
                        renderShelf();
                        showToast(isMerge ? `Merged into "${newName}"` : `Renamed to "${newName}"`);
                    } catch (e) {
                        hideLoader();
                        showToast("Rename failed — check connection");
                    }
                };

                if (isMerge) {
                    setTimeout(() => openConfirmModal({
                        title: 'MERGE INGREDIENTS',
                        message: `"${newName}" already exists. Merge "${oldName}" into it?\n\n${affected.length} spec${affected.length === 1 ? '' : 's'} will be updated.`,
                        confirmLabel: 'MERGE',
                        onConfirm: doIt
                    }), 350);
                } else if (affected.length) {
                    setTimeout(() => openConfirmModal({
                        title: 'RENAME INGREDIENT',
                        message: `Rename "${oldName}" to "${newName}" in ${affected.length} spec${affected.length === 1 ? '' : 's'}?`,
                        confirmLabel: 'RENAME',
                        onConfirm: doIt
                    }), 350);
                } else {
                    doIt();
                }
            }
        });
    }

    loadShelf();
    refreshShelfDatalist();
    renderShelf();
    document.getElementById('shelf-add-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        toggleShelfAddForm();
    });

    const legacyLockBtn = document.getElementById('edit-toggle');
    if (legacyLockBtn) legacyLockBtn.remove();

    function expandSpecBuilder() {
        document.getElementById('new-spec-btn')?.classList.add('hidden');
        document.getElementById('builder-content')?.classList.remove('hidden');
        document.getElementById('builder-save-bar')?.classList.remove('hidden');
    }
    function collapseSpecBuilder() {
        document.getElementById('new-spec-btn')?.classList.remove('hidden');
        document.getElementById('builder-content')?.classList.add('hidden');
        document.getElementById('builder-save-bar')?.classList.add('hidden');
    }
    window.expandSpecBuilder = expandSpecBuilder;
    window.collapseSpecBuilder = collapseSpecBuilder;
    document.querySelectorAll('.spec-kind-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            triggerHaptic('light');
            builderKind = pill.getAttribute('data-kind');
            applyBuilderKind();
        });
    });
    document.getElementById('standalone-bottle-input')?.addEventListener('input', (e) => {
        standaloneBottleML = parseFloat(e.target.value) || 700;
    });
    applyBuilderKind();

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
                    <button class="action-sheet-btn" data-action="rename">RENAME</button>
                    <button class="action-sheet-btn" data-action="u21">ADD 18+ VERSION</button>
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
            if (action === 'u21' && cocktailName) addU21Version(cocktailName);
            else if (action === 'edit' && cocktailName) editSpec(cocktailName);
            else if (action === 'rename' && cocktailName) {
                // In the mocktails view this names the MOCKTAIL only — renaming the
                // spec there would also rename the alcoholic version.
                if (vaultFilter === 'mocktails') {
                    openSelectModal('MOCKTAIL NAME', [], null, {
                        placeholder: 'Mocktail name…',
                        btnLabel: 'SET',
                        prefill: getMocktailName(cocktailName),
                        onSubmit: (v) => {
                            const nm = capitalize((v || '').trim());
                            setMocktailName(cocktailName, nm);
                            renderVault();
                            showToast(nm ? `Mocktail named "${nm}"` : 'Mocktail name reset');
                        }
                    });
                } else renameSpec(cocktailName);
            }
            else if (action === 'delete' && cocktailName) deleteSpec(cocktailName);
        });
    }
    window.openActionSheet = (cocktailName) => {
        const sheet = document.getElementById('action-sheet-modal');
        if (!sheet) return;
        const inMocktails = (vaultFilter === 'mocktails');
        sheet.dataset.cocktailName = cocktailName;
        sheet.querySelector('.action-sheet-title').innerText =
            inMocktails ? getMocktailName(cocktailName) : cocktailName;
        const u21Btn = sheet.querySelector('[data-action="u21"]');
        if (u21Btn) {
            const has = !!recipeVault[`${cocktailName} — 18+`];
            u21Btn.innerText = has ? 'REMOVE 18+ VERSION' : 'ADD 18+ VERSION';
            u21Btn.classList.toggle('hidden', inMocktails || isStandaloneName(cocktailName));
        }
        const renameBtn = sheet.querySelector('[data-action="rename"]');
        if (renameBtn) renameBtn.innerText = inMocktails ? 'RENAME MOCKTAIL' : 'RENAME';
        // Deleting from the mocktails view would delete the whole drink — hide it
        const delBtn = sheet.querySelector('[data-action="delete"]');
        if (delBtn) delBtn.classList.toggle('hidden', inMocktails);
        sheet.classList.remove('hidden');
    };
    
    // --- EDIT & DELETE ---
    window.editSpec = (name) => {
        triggerHaptic('heavy');
        editingCocktailName = name;
        if (isStandaloneName(name)) {
            builderKind = 'batch';
            standaloneBottleML = getBatchSize(name);
            const sbi = document.getElementById('standalone-bottle-input');
            if (sbi) sbi.value = standaloneBottleML;
            builderState = { name: standaloneLabel(name), sections: [{ name: 'MAIN', ingredients: [] }] };
            (recipeVault[name] || []).forEach(ing => {
                builderState.sections[0].ingredients.push({ amount: ing.amount, name: ing.name, cat: ing.color, unit: ing.unit });
            });
            document.getElementById('builder-name').value = standaloneLabel(name);
            applyBuilderKind();
            renderBuilder();
            if (typeof expandSpecBuilder === 'function') expandSpecBuilder();
            document.getElementById('scroll-area').scrollTop = 0;
            return;
        }
        builderKind = 'cocktail';
        applyBuilderKind();
        const related = [name, ...Object.keys(recipeVault).filter(n => n.startsWith(name + ' — '))];
        builderState = { name: name, sections: [] };
        related.forEach(sectionName => {
            const isMain = sectionName === name;
            const secLabel = isMain ? 'MAIN' : sectionName.replace(name + ' — ', '');
            const sec = { name: secLabel, ingredients: [] };
            if (!isMain && isBatchSection(secLabel)) sec.bottleML = getBatchSize(sectionName);
            (recipeVault[sectionName] || []).forEach(ing => {
                sec.ingredients.push({ amount: ing.amount, name: ing.name, cat: ing.color, unit: ing.unit });
            });
            builderState.sections.push(sec);
        });
        const BUILDER_RANK = (n) => {
            const l = (n || '').toLowerCase();
            if (l === 'main') return 0;
            if (/spirit/.test(l)) return 1;
            if (/juice/.test(l)) return 2;
            if (/espresso|coffee/.test(l)) return 3;
            if (/cream/.test(l)) return 4;
            if (/^18\+|u21/.test(l)) return 5;
            if (/mocktail/.test(l)) return 6;
            return 7;
        };
        builderState.sections.sort((a, b) => BUILDER_RANK(a.name) - BUILDER_RANK(b.name));
        document.getElementById('builder-name').value = name;
        renderBuilder();
        if (typeof expandSpecBuilder === 'function') expandSpecBuilder();
        document.getElementById('scroll-area').scrollTop = 0;
    };

    // Rename a cocktail (or standalone batch) and carry every sub-batch,
    // linked prep task and stored batch setting across to the new name.
    window.renameSpec = (name) => {
        const isStandalone = isStandaloneName(name);
        const currentLabel = isStandalone ? standaloneLabel(name) : name;
        openSelectModal('RENAME', [], null, {
            placeholder: 'New name…',
            btnLabel: 'RENAME',
            prefill: currentLabel,
            onSubmit: async (val) => {
                const newLabel = capitalize((val || '').trim());
                if (!newLabel || newLabel === currentLabel) return;
                const newFull = isStandalone ? `${STANDALONE_OWNER} — ${newLabel}` : newLabel;
                if (recipeVault[newFull]) {
                    openAlertModal({ title: 'NAME TAKEN', message: `"${newLabel}" already exists.` });
                    return;
                }
                const related = [name, ...Object.keys(recipeVault).filter(n => n.startsWith(name + ' — '))];
                const payload = [];
                related.forEach(secName => {
                    const suffix = secName === name ? '' : secName.slice(name.length);   // " — Spirit Batch"
                    const target = newFull + suffix;
                    // carry batch mode/size across to the new key
                    const mode = getBatchMode(secName);
                    if (mode) setBatchMode(target, mode);
                    const size = getBatchSize(secName);
                    if (size) setBatchSize(target, size);
                    (recipeVault[secName] || []).forEach(ing => {
                        payload.push({
                            cocktailName: target, ingredientName: ing.name, amount: ing.amount,
                            bottleSize: 0, categoryTag: ing.color, unit: ing.unit || ''
                        });
                    });
                });
                showLoader("RENAMING...");
                try {
                    for (const n of related) {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: n }) });
                    }
                    await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });

                    // Re-point any prep task that linked to the old name
                    let tasksTouched = false;
                    ['opening', 'prep', 'closing', 'periodic'].forEach(cat => {
                        (opsData[cat] || []).forEach(t => {
                            if (t.linkedSpec === name) { t.linkedSpec = newFull; tasksTouched = true; }
                            if (t.linkedSpec === STANDALONE_OWNER && t.linkedSection === currentLabel && isStandalone) {
                                t.linkedSection = newLabel; tasksTouched = true;
                            }
                            if (t.text === currentLabel || t.text === name) { t.text = newLabel; tasksTouched = true; }
                        });
                    });
                    if (tasksTouched) { saveOps(); renderOpsList(); }

                    await loadVault();
                    showToast(`Renamed to "${newLabel}"`);
                } catch (e) {
                    hideLoader();
                    showToast("Rename failed — check connection");
                }
            }
        });
    };

    // The 18+ swap is always the same: replace the alcoholic pour with Vodka U21
    // at the same volume, keep everything else. One tap rather than retyping it.
    window.addU21Version = async (name) => {
        const sectionName = `${name} — 18+`;
        if (recipeVault[sectionName]) {
            openConfirmModal({
                title: 'REMOVE 18+ VERSION',
                message: `Remove the 18+ version of "${name}"?`,
                confirmLabel: 'REMOVE',
                danger: true,
                onConfirm: async () => {
                    showLoader('REMOVING...');
                    try {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: sectionName }) });
                        await loadVault();
                        showToast('18+ version removed');
                    } catch (e) { hideLoader(); showToast('Failed — check connection'); }
                }
            });
            return;
        }
        const mainIngs = recipeVault[name] || [];
        if (!mainIngs.length) {
            openAlertModal({ title: 'NOTHING TO COPY', message: 'This spec has no MAIN ingredients yet.' });
            return;
        }
        // Alcohol = spirits, liqueurs, and any batch reference that carries them
        const isAlcoholic = (ing) => {
            if (ing.color === 'amber-glow' || ing.color === 'neon-cyan') return true;
            const sub = recipeVault[`${name} — ${ing.name}`];
            return !!(sub && sub.some(i => i.color === 'amber-glow' || i.color === 'neon-cyan'));
        };
        let swapVolume = 0;
        const rows = [];
        mainIngs.forEach(ing => {
            if (isAlcoholic(ing)) { swapVolume += (ing.amount || 0); return; }
            rows.push({
                cocktailName: sectionName, ingredientName: ing.name, amount: ing.amount,
                bottleSize: 0, categoryTag: ing.color, unit: ing.unit || ''
            });
        });
        if (swapVolume > 0) {
            rows.unshift({
                cocktailName: sectionName, ingredientName: 'Vodka U21', amount: swapVolume,
                bottleSize: 0, categoryTag: 'amber-glow', unit: ''
            });
        }
        if (!rows.length) {
            openAlertModal({ title: 'NOTHING TO COPY', message: "Couldn't build an 18+ version from this spec." });
            return;
        }
        showLoader('ADDING 18+...');
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(rows) });
            await loadVault();
            showToast(`18+ version added${swapVolume ? ` · ${swapVolume}ml Vodka U21` : ''}`);
        } catch (e) { hideLoader(); showToast('Failed — check connection'); }
    };

    window.deleteSpec = (name) => {
        openConfirmModal({
            title: 'DELETE SPEC',
            message: `Delete "${name}"?`,
            confirmLabel: 'DELETE',
            danger: true,
            onConfirm: async () => {
                triggerHaptic('heavy');
                // Snapshot every row so UNDO can put it back exactly
                const related = [name, ...Object.keys(recipeVault).filter(n => n.startsWith(name + ' — '))];
                const snapshot = [];
                related.forEach(secName => {
                    (recipeVault[secName] || []).forEach(ing => {
                        snapshot.push({
                            cocktailName: secName, ingredientName: ing.name, amount: ing.amount,
                            bottleSize: 0, categoryTag: ing.color, unit: ing.unit || ''
                        });
                    });
                });
                showLoader("DELETING...");
                try {
                    for (const n of related) {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: n }) });
                    }
                    await loadVault();
                    showToast(`Deleted "${isStandaloneName(name) ? standaloneLabel(name) : name}"`, async () => {
                        showLoader("RESTORING...");
                        try {
                            await fetch(API_URL, { method: 'POST', body: JSON.stringify(snapshot) });
                            await loadVault();
                            showToast('Restored');
                        } catch (e) { hideLoader(); showToast("Couldn't restore — check connection"); }
                    });
                } catch (e) { hideLoader(); showToast("Delete failed — check connection"); }
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
        const tags = ['amber-glow', 'neon-cyan', 'magenta-glow', 'juice-glow', 'mixer-fizz'];
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

    // --- OPS CLOUD SYNC (per-task rows; multi-user safe) ---
    // Each task is its own sheet row keyed by taskId. Only CHANGED tasks are
    // pushed, and the server rejects a write whose updatedAt is older than what
    // it holds — so two people ticking different tasks never clobber each other.
    // Deletes become tombstones so they propagate instead of resurrecting.
    const OPS_DEVICE_KEY = 'codex_device_name';
    const OPS_PUSHED_KEY = 'codex_ops_pushed_v1';   // id -> {sig, updatedAt}
    const OPS_PULLTS_KEY = 'codex_ops_pull_ts_v1';
    const SETTINGS_PULLTS_KEY = 'codex_settings_pull_ts_v1';
    let opsPushTimer = null;
    let opsSyncState = 'idle';

    function getDeviceName() {
        return localStorage.getItem(OPS_DEVICE_KEY) || '';
    }
    function setDeviceName(n) {
        try { localStorage.setItem(OPS_DEVICE_KEY, n); } catch {}
    }
    // First launch on a device: ask who this is, so shared history reads
    // "Done Jun 24 by Jack" rather than an anonymous device id.
    function ensureDeviceName() {
        if (getDeviceName()) return;
        setTimeout(() => {
            openSelectModal('WHO ARE YOU?', [], null, {
                placeholder: 'Your name…',
                btnLabel: 'SET',
                onSubmit: (v) => {
                    const n = (v || '').trim();
                    if (n) { setDeviceName(capitalize(n)); renderOpsList(); }
                }
            });
        }, 900);
    }

    const newTaskId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    function loadPushed() {
        try { return JSON.parse(localStorage.getItem(OPS_PUSHED_KEY)) || {}; } catch { return {}; }
    }
    function savePushed(m) {
        try { localStorage.setItem(OPS_PUSHED_KEY, JSON.stringify(m)); } catch {}
    }
    // Signature of the meaningful fields — used to detect what actually changed
    function taskSig(t, cat) {
        return JSON.stringify([cat, t.text, !!t.completed, t.intervalDays || '', t.lastCompleted || '',
            t.log || [], t.subtasks || [], t.kind || '', t.qty || '', t.bottleML || '',
            t.linkedSpec || '', t.linkedSection || '', t.orderIndex]);
    }

    const OPS_CATS = ['opening', 'prep', 'closing', 'periodic'];

    // Give every task an id + order, then work out which ones changed since the
    // last successful push. Returns the list of tasks to send (incl. tombstones).
    function collectDirtyTasks() {
        const pushed = loadPushed();
        const now = Date.now();
        const dirty = [];
        const liveIds = new Set();

        OPS_CATS.forEach(cat => {
            (opsData[cat] || []).forEach((t, idx) => {
                if (!t.taskId) t.taskId = newTaskId();
                if (t.orderIndex === undefined || t.orderIndex === null) t.orderIndex = (idx + 1) * 1000;
                liveIds.add(t.taskId);
                const sig = taskSig(t, cat);
                const prev = pushed[t.taskId];
                if (!prev || prev.sig !== sig) {
                    t.updatedAt = now;
                    dirty.push(Object.assign({}, t, {
                        category: cat, deleted: false,
                        updatedBy: getDeviceName() || 'unknown'
                    }));
                }
            });
        });

        // Anything we pushed before that no longer exists locally = deleted
        Object.keys(pushed).forEach(id => {
            if (!liveIds.has(id) && !pushed[id].tombstoned) {
                dirty.push({ taskId: id, deleted: true, updatedAt: now, updatedBy: getDeviceName() || 'unknown' });
            }
        });
        return dirty;
    }

    function setOpsSyncBadge(state, extra) {
        opsSyncState = state;
        const el = document.getElementById('ops-sync-badge');
        if (!el) return;
        const map = {
            idle:    ['', ''],
            syncing: ['SYNCING…', 'syncing'],
            ok:      ['SYNCED', 'ok'],
            offline: ['OFFLINE — SAVED LOCALLY', 'offline']
        };
        const [text, cls] = map[state] || ['', ''];
        el.innerText = extra ? `${text} ${extra}` : text;
        el.className = 'ops-sync-badge ' + cls;
    }

    function scheduleOpsPush() {
        clearTimeout(opsPushTimer);
        opsPushTimer = setTimeout(pushOpsToCloud, 2000);
    }

    async function pushOpsToCloud() {
        const dirty = collectDirtyTasks();
        if (!dirty.length) return;
        setOpsSyncBadge('syncing');
        try {
            await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ type: 'opsTasks', device: getDeviceName(), tasks: dirty })
            });
            // Record what we sent so we can detect the next change
            const pushed = loadPushed();
            dirty.forEach(t => {
                if (t.deleted) pushed[t.taskId] = { sig: '', updatedAt: t.updatedAt, tombstoned: true };
                else pushed[t.taskId] = { sig: taskSig(t, t.category), updatedAt: t.updatedAt };
            });
            savePushed(pushed);
            saveOpsLocalOnly();   // persist the ids/updatedAt we just assigned
            setOpsSyncBadge('ok');
            setTimeout(() => { if (opsSyncState === 'ok') setOpsSyncBadge('idle'); }, 2000);
        } catch (e) {
            console.error('OPS push failed — retries on next change/open', e);
            setOpsSyncBadge('offline');
        }
    }

    async function pullOpsFromCloud() {
        setOpsSyncBadge('syncing');
        const since = parseFloat(localStorage.getItem(OPS_PULLTS_KEY)) || 0;
        try {
            const res = await fetch(`${API_URL}?type=ops&since=${since}`);
            if (!res.ok) throw new Error('bad response');
            const payload = await res.json();
            const incoming = payload.tasks || [];
            let changed = false;

            incoming.forEach(remote => {
                if (!remote.taskId) return;
                // find it locally, whichever bucket it's in
                let foundCat = null, foundIdx = -1;
                OPS_CATS.forEach(cat => {
                    const i = (opsData[cat] || []).findIndex(t => t.taskId === remote.taskId);
                    if (i >= 0) { foundCat = cat; foundIdx = i; }
                });
                const localTask = foundCat ? opsData[foundCat][foundIdx] : null;
                const localUpd = localTask ? (localTask.updatedAt || 0) : 0;
                if (localTask && localUpd > (remote.updatedAt || 0)) return;   // ours is newer

                if (remote.deleted) {
                    if (localTask) { opsData[foundCat].splice(foundIdx, 1); changed = true; }
                    return;
                }
                const cat = remote.category || foundCat || 'prep';
                const merged = {
                    taskId: remote.taskId,
                    text: remote.text || '',
                    completed: !!remote.completed,
                    orderIndex: remote.orderIndex,
                    subtasks: remote.subtasks || [],
                    log: remote.log || [],
                    updatedAt: remote.updatedAt || 0,
                    updatedBy: remote.updatedBy || ''
                };
                if (remote.intervalDays)  merged.intervalDays  = parseFloat(remote.intervalDays);
                if (remote.lastCompleted) merged.lastCompleted = parseFloat(remote.lastCompleted);
                if (remote.kind)          merged.kind          = remote.kind;
                if (remote.qty)           merged.qty           = parseFloat(remote.qty);
                if (remote.bottleML)      merged.bottleML      = parseFloat(remote.bottleML);
                if (remote.linkedSpec)    merged.linkedSpec    = remote.linkedSpec;
                if (remote.linkedSection) merged.linkedSection = remote.linkedSection;

                if (localTask && foundCat === cat) opsData[cat][foundIdx] = merged;
                else {
                    if (localTask) opsData[foundCat].splice(foundIdx, 1);   // moved category
                    if (!opsData[cat]) opsData[cat] = [];
                    opsData[cat].push(merged);
                }
                changed = true;
                // treat pulled state as already-pushed so we don't echo it back
                const pushed = loadPushed();
                pushed[remote.taskId] = { sig: taskSig(merged, cat), updatedAt: merged.updatedAt };
                savePushed(pushed);
            });

            if (changed) {
                OPS_CATS.forEach(cat => {
                    (opsData[cat] || []).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                });
                saveOpsLocalOnly();
                renderOpsList();
            }
            if (payload.now) localStorage.setItem(OPS_PULLTS_KEY, String(payload.now));
            setOpsSyncBadge('ok');
            setTimeout(() => { if (opsSyncState === 'ok') setOpsSyncBadge('idle'); }, 2000);
        } catch (e) {
            console.error('OPS pull failed — using local copy', e);
            setOpsSyncBadge('offline');
        }
    }

    // --- SHARED SETTINGS (bottle sizes, batch modes, shelf) ---
    // --- SHARED SETTINGS (per-ENTRY rows, not one blob per scope) ---
    // A blob would mean two people editing the shelf clobber each other. Each
    // entry syncs on its own row with its own timestamp, so edits to different
    // ingredients (or different batches) never collide.
    const SYNCED_SETTING_KEYS = [
        ['ing_bottles', 'codex_ing_bottles_v1'],
        ['batch_modes', 'codex_batch_modes_v1'],
        ['mocktail_names', 'codex_mocktail_names_v1'],
        ['batch_sizes', 'codex_batch_sizes_v1'],
        ['shelf',       'codex_shelf_v1']
    ];
    const SETTINGS_PUSHED_KEY = 'codex_settings_pushed_v1';   // "scope:entry" -> {sig, ts}
    let settingsPushTimer = null;

    const readScope = (lsKey) => {
        try { return JSON.parse(localStorage.getItem(lsKey) || '{}') || {}; } catch { return {}; }
    };
    const loadSettingsPushed = () => {
        try { return JSON.parse(localStorage.getItem(SETTINGS_PUSHED_KEY)) || {}; } catch { return {}; }
    };
    const saveSettingsPushed = (m) => {
        try { localStorage.setItem(SETTINGS_PUSHED_KEY, JSON.stringify(m)); } catch {}
    };

    function scheduleSettingsPush() {
        clearTimeout(settingsPushTimer);
        settingsPushTimer = setTimeout(pushSettings, 2500);
    }

    async function pushSettings() {
        const pushed = loadSettingsPushed();
        const now = Date.now();
        const payload = [];
        const seen = new Set();

        SYNCED_SETTING_KEYS.forEach(([scope, lsKey]) => {
            const obj = readScope(lsKey);
            Object.keys(obj).forEach(entry => {
                const key = `${scope}:${entry}`;
                seen.add(key);
                const sig = JSON.stringify(obj[entry]);
                if (!pushed[key] || pushed[key].sig !== sig) {
                    payload.push({ key, value: obj[entry], updatedAt: now, updatedBy: getDeviceName() });
                }
            });
        });
        // Entries we pushed before that are gone locally = deletions (tombstone)
        Object.keys(pushed).forEach(key => {
            if (!seen.has(key) && !pushed[key].deleted) {
                payload.push({ key, value: null, updatedAt: now, updatedBy: getDeviceName() });
            }
        });
        if (!payload.length) return;

        try {
            await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ type: 'settings', device: getDeviceName(), settings: payload })
            });
            payload.forEach(p => {
                pushed[p.key] = p.value === null
                    ? { sig: '', ts: p.updatedAt, deleted: true }
                    : { sig: JSON.stringify(p.value), ts: p.updatedAt };
            });
            saveSettingsPushed(pushed);
        } catch (e) {
            console.error('Settings push failed — retries on next change/open', e);
        }
    }

    async function pullSettings() {
        const since = parseFloat(localStorage.getItem(SETTINGS_PULLTS_KEY)) || 0;
        try {
            const res = await fetch(`${API_URL}?type=settings&since=${since}`);
            if (!res.ok) return;
            const data = await res.json();
            const pushed = loadSettingsPushed();
            const scopes = {};
            let changed = false;

            (data.settings || []).forEach(s => {
                if (!s.key) return;
                const i = String(s.key).indexOf(':');
                if (i < 0) return;                                  // legacy whole-blob row — ignore
                const scope = s.key.slice(0, i), entry = s.key.slice(i + 1);
                const def = SYNCED_SETTING_KEYS.find(([k]) => k === scope);
                if (!def) return;
                if (!scopes[def[1]]) scopes[def[1]] = readScope(def[1]);
                // ours newer? keep ours
                const localTs = pushed[s.key] ? pushed[s.key].ts : 0;
                if (localTs > (s.updatedAt || 0)) return;
                if (s.value === null || s.value === undefined) delete scopes[def[1]][entry];
                else scopes[def[1]][entry] = s.value;
                pushed[s.key] = s.value == null
                    ? { sig: '', ts: s.updatedAt || 0, deleted: true }
                    : { sig: JSON.stringify(s.value), ts: s.updatedAt || 0 };
                changed = true;
            });

            if (changed) {
                Object.keys(scopes).forEach(lsKey => {
                    try { localStorage.setItem(lsKey, JSON.stringify(scopes[lsKey])); } catch {}
                });
                saveSettingsPushed(pushed);
                if (typeof loadShelf === 'function') loadShelf();
                if (typeof refreshShelfDatalist === 'function') refreshShelfDatalist();
                if (typeof renderShelf === 'function') renderShelf();
                if (typeof renderVault === 'function') renderVault();
            }
            if (data.now) localStorage.setItem(SETTINGS_PULLTS_KEY, String(data.now));
        } catch (e) { console.error('Settings pull failed', e); }
    }

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
        saveOpsLocalOnly();
        scheduleOpsPush();
    }

    // Write to localStorage without triggering a cloud push (used when applying
    // state that just CAME from the cloud — avoids a pointless echo).
    function saveOpsLocalOnly() {
        const payload = JSON.stringify(opsData);
        localStorage.setItem(OPS_KEY, payload);
        // Rolling backup — only ever written when there is something worth keeping
        if (opsTaskCount(opsData) > 0) {
            try { localStorage.setItem(OPS_BACKUP_KEY, payload); } catch {}
        }
    }

    // --- BATCH PREP CARD ---
    // Batch bottles are 700ml unless a task says otherwise. Ingredient bottle
    // sizes default to 700ml and are overridable per ingredient (tap the figure).
    const BATCH_BOTTLE_ML = 700;
    const ING_BOTTLE_KEY = 'codex_ing_bottles_v1';
    // Batch definition mode, keyed by full batch name ("Cocktail — Section").
    // 'bottle' = amounts are literal for one bottle. 'drink' = legacy ratio, scaled up.
    // Stored locally until the sheet gains a mode column.
    // A mocktail isn't always just the virgin version of the same drink, so its
    // display name can be overridden. Default is "<Cocktail> Mocktail".
    const MOCKTAIL_NAME_KEY = 'codex_mocktail_names_v1';
    function loadMocktailNames() {
        try { return JSON.parse(localStorage.getItem(MOCKTAIL_NAME_KEY)) || {}; } catch { return {}; }
    }
    function getMocktailName(cocktail) {
        // Default appends the suffix; a name you set is used exactly as typed.
        return loadMocktailNames()[(cocktail || '').toLowerCase().trim()] || `${cocktail} Mocktail`;
    }
    function hasCustomMocktailName(cocktail) {
        return !!loadMocktailNames()[(cocktail || '').toLowerCase().trim()];
    }
    function setMocktailName(cocktail, name) {
        const m = loadMocktailNames();
        const k = (cocktail || '').toLowerCase().trim();
        if (name) m[k] = name; else delete m[k];
        try { localStorage.setItem(MOCKTAIL_NAME_KEY, JSON.stringify(m)); } catch {}
        if (typeof scheduleSettingsPush === 'function') scheduleSettingsPush();
    }

    const BATCH_MODE_KEY = 'codex_batch_modes_v1';
    const BATCH_SIZE_KEY = 'codex_batch_sizes_v1';
    function loadBatchModes() {
        try { return JSON.parse(localStorage.getItem(BATCH_MODE_KEY)) || {}; } catch { return {}; }
    }
    function getBatchMode(fullName) {
        return loadBatchModes()[(fullName || '').toLowerCase().trim()] || 'drink';
    }
    function setBatchMode(fullName, mode) {
        const m = loadBatchModes();
        m[(fullName || '').toLowerCase().trim()] = mode;
        try { localStorage.setItem(BATCH_MODE_KEY, JSON.stringify(m)); } catch {}
        if (typeof scheduleSettingsPush === 'function') scheduleSettingsPush();
    }
    function loadBatchSizes() {
        try { return JSON.parse(localStorage.getItem(BATCH_SIZE_KEY)) || {}; } catch { return {}; }
    }
    function getBatchSize(fullName) {
        return loadBatchSizes()[(fullName || '').toLowerCase().trim()] || BATCH_BOTTLE_ML;
    }
    function setBatchSize(fullName, ml) {
        const m = loadBatchSizes();
        m[(fullName || '').toLowerCase().trim()] = ml;
        try { localStorage.setItem(BATCH_SIZE_KEY, JSON.stringify(m)); } catch {}
        if (typeof scheduleSettingsPush === 'function') scheduleSettingsPush();
    }
    function loadIngBottles() {
        try { return JSON.parse(localStorage.getItem(ING_BOTTLE_KEY)) || {}; } catch { return {}; }
    }
    function getIngBottleSize(name) {
        const m = loadIngBottles();
        return m[(name || '').toLowerCase().trim()] || 700;
    }
    function setIngBottleSize(name, ml) {
        const m = loadIngBottles();
        m[(name || '').toLowerCase().trim()] = ml;
        try { localStorage.setItem(ING_BOTTLE_KEY, JSON.stringify(m)); } catch {}
        if (typeof scheduleSettingsPush === 'function') scheduleSettingsPush();
    }
    // Only things that COME in a bottle get a bottle count; in-house stuff shows ml.
    const BOTTLED_CATS = ['amber-glow', 'neon-cyan'];

    // Renders the per-bottle recipe + shopping totals for a linked batch task.
    function buildBatchCard(wrap, rowEl, cat, taskIdx) {
        const task = opsData[cat][taskIdx];
        // Look up the SUB-BATCH row ("Cocktail — Section"), not the parent cocktail.
        // The parent only holds batch references (e.g. "Spirit Batch 60ml"), which
        // tells you nothing about what actually goes in the bottle.
        const specName = task.linkedSection
            ? `${task.linkedSpec} — ${task.linkedSection}`
            : task.linkedSpec;
        const ings = (recipeVault[specName] || []).filter(i => i.color !== 'static-ruby' && !isToppedRow(i));
        wrap.innerHTML = '';
        if (!ings.length) {
            wrap.innerHTML = `<div class="batch-card-note">${vaultLive ? 'No ingredients found for this batch.' : "Can't reach the Codex — pull to refresh."}</div>`;
            return;
        }
        const perDrinkTotal = ings.reduce((s, i) => s + (i.amount || 0), 0);
        if (perDrinkTotal <= 0) {
            wrap.innerHTML = `<div class="batch-card-note">Batch has no measurable amounts.</div>`;
            return;
        }
        const bottleML = task.bottleML || getBatchSize(specName);
        // In 'bottle' mode the stored amounts ARE the bottle recipe — no scaling.
        const mode = getBatchMode(specName);
        const factor = (mode === 'bottle') ? 1 : (bottleML / perDrinkTotal);
        const qty = task.qty || 1;

        let html = `<div class="batch-card-label">PER BOTTLE (${bottleML}ml)</div>`;
        ings.forEach(i => {
            const per = Math.round((i.amount || 0) * factor);
            html += `<div class="batch-card-row"><span class="bc-name">${i.name}</span><span class="bc-amt ${i.color}">${per}ml</span></div>`;
        });

        if (qty > 1) {
            html += `<div class="batch-card-label" style="margin-top:12px;">YOU NEED (${qty} bottles)</div>`;
            ings.forEach(i => {
                const total = Math.round((i.amount || 0) * factor * qty);
                let val;
                if (BOTTLED_CATS.includes(i.color)) {
                    // Bottled goods: show bottle-equivalents only (decimal), tap to set size
                    const size = getIngBottleSize(i.name);
                    const bottles = (total / size).toFixed(1).replace(/\.0$/, '');
                    val = `<span class="bc-bottles" data-ing="${(i.name || '').replace(/"/g, '&quot;')}">${bottles} bottle${bottles === '1' ? '' : 's'}</span>`;
                } else {
                    // In-house stuff (syrup/juice/puree) isn't bottled — show ml
                    val = `${total}ml`;
                }
                html += `<div class="batch-card-row"><span class="bc-name">${i.name}</span><span class="bc-amt">${val}</span></div>`;
            });
        }
        wrap.innerHTML = html;

        wrap.querySelectorAll('.bc-bottles').forEach(el => {
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const ingName = el.getAttribute('data-ing');
                triggerHaptic('light');
                openSelectModal(`${ingName.toUpperCase()} BOTTLE SIZE`, [
                    { label: '500 ml', value: 500 },
                    { label: '700 ml', value: 700 },
                    { label: '1000 ml (1L)', value: 1000 },
                    { label: '1500 ml', value: 1500 }
                ], (ml) => {
                    setIngBottleSize(ingName, parseInt(ml));
                    buildBatchCard(wrap, rowEl, cat, taskIdx);
                }, {
                    placeholder: 'Custom size in ml…',
                    btnLabel: 'SET',
                    onSubmit: (v) => {
                        const ml = parseInt(v);
                        if (ml > 0) { setIngBottleSize(ingName, ml); buildBatchCard(wrap, rowEl, cat, taskIdx); }
                    }
                });
            });
        });
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
            // Shared batches: two cocktails using an identically-named section
            // (e.g. "Passion+Lem") are the same bottle — collapse to one task.
            const seenSection = new Map();
            for (let i = tasks.length - 1; i >= 0; i--) {
                const t = tasks[i];
                if (!t.linkedSection) continue;
                const key = t.linkedSection.toLowerCase().trim();
                if (/^(spirit|juice|espresso)\s*batch$|^mocktail$|^cream$/.test(key)) continue;  // generic names aren't shared
                if (seenSection.has(key)) {
                    const keep = seenSection.get(key);
                    keep.qty = Math.max(keep.qty || 1, t.qty || 1);
                    tasks.splice(i, 1);
                } else {
                    seenSection.set(key, t);
                }
            }
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
            const emptyMsg = {
                opening: ['No opening tasks yet.', 'Add the steps you run at the start of every shift.'],
                closing: ['No closing tasks yet.', 'Add the steps you run at the end of every shift.'],
                prep:    ['Nothing to prep.', 'Tap ＋ ADD TASK to add a batch or a mise job.'],
                periodic:['No upkeep tasks yet.', 'Add recurring jobs like deep cleans, with how often they’re due.']
            }[activeOpsCategory] || ['No tasks yet.', 'Tap ＋ ADD TASK below to begin.'];
            container.innerHTML = `<div class="empty-state"><p>${emptyMsg[0]}</p><span>${emptyMsg[1]}</span></div>`;
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
                    let done = false;
                    const commit = () => {
                        if (done) return;
                        done = true;
                        const v = input.value.trim();
                        if (v) task.subtasks[sIdx].text = v;
                        saveOps();
                        rerenderSubtasks(rowEl, cat, taskIdx);
                    };
                    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
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
            // + add step — SOPs only (OPEN/CLOSE). Prep batches and upkeep don't use sub-steps.
            if (cat !== 'opening' && cat !== 'closing') return;
            const addLine = document.createElement('div');
            addLine.className = 'ops-subtask-add';
            addLine.innerHTML = `＋ add step`;
            addLine.addEventListener('click', (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'text'; input.className = 'ops-subtask-input'; input.placeholder = 'New step…';
                addLine.replaceWith(input); input.focus();
                // Guard against a double-add: committing removes the input from the
                // DOM, which fires blur — so Enter would commit, then blur would
                // commit the same text again.
                let committed = false;
                const commit = (reopen) => {
                    if (committed) return;
                    committed = true;
                    const v = input.value.trim();
                    input.value = '';
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
                input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(true); } });
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

        // PREP section headers double as drop targets so you can drag a task
        // into a section even when it's empty.
        function makePrepHeader(label) {
            const header = document.createElement('div');
            header.className = 'ops-prep-section';
            header.innerText = label;
            header.addEventListener('dragover', (e) => { e.preventDefault(); header.classList.add('drop-hover'); });
            header.addEventListener('dragleave', () => header.classList.remove('drop-hover'));
            header.addEventListener('drop', (e) => {
                e.preventDefault();
                header.classList.remove('drop-hover');
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                if (isNaN(fromIdx)) return;
                const wantKind = label === 'MISE' ? 'mise' : 'batch';
                const item = opsData[activeOpsCategory].splice(fromIdx, 1)[0];
                if (!item) return;
                if (item.kind !== wantKind) {
                    item.kind = wantKind;
                    if (wantKind === 'batch' && !item.qty) item.qty = 1;
                    rememberPrepKind(item.text, wantKind);
                }
                opsData[activeOpsCategory].push(item);
                saveOps();
                renderOpsList();
            });
            return header;
        }

        sortedTasks.forEach((taskObj, displayIndex) => {
            // PREP section headers: BATCHES / MISE, emitted at group boundaries
            if (isPrep) {
                const grp = taskObj.kind === 'mise' ? 'MISE' : 'BATCHES';
                if (grp !== lastPrepGroup) {
                    container.appendChild(makePrepHeader(grp));
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
            if (hasSubtasks && isNumberedSop) {
                html += `<span class="ops-subtask-badge"><span class="chevron">⌄</span><span class="count">${subDone}/${subCount}</span></span>`;
            }
            if (isPeriodic) {
                html += buildCountdown(taskObj);
            }
            html += `<button class="row-more" aria-label="Task actions">⋯</button>`;
            if (isDraggable) {
                html += `<div class="drag-handle-task" aria-label="Drag to reorder">≡</div>`;
            }
            html += `</div>`;
            html += `<div class="ops-subtasks"></div>`;
            if (isPeriodic) {
                html += `<div class="ops-history"></div>`;
            }
            if (isPrep && isLinked) {
                html += `<div class="ops-batch-card"></div>`;
            }
            row.innerHTML = html;

            // populate subtask block (always — empty block just shows "+ add step" when expanded)
            buildSubtaskBlock(row.querySelector('.ops-subtasks'), row, activeOpsCategory, taskObj.originalIndex);

            // linked prep rows get the per-bottle batch card
            const batchWrap = row.querySelector('.ops-batch-card');
            if (batchWrap) buildBatchCard(batchWrap, row, activeOpsCategory, taskObj.originalIndex);

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
                            task.log.push({ ts: task.lastCompleted, by: getDeviceName() || '' });
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
                    stepper.innerHTML = `<span class="qs-btn" data-d="-1">−</span><input type="number" class="qs-n qs-input" value="${task.qty || 1}" inputmode="numeric"><span class="qs-btn" data-d="1">＋</span>`;
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
                            task.qty = Math.min(99, Math.max(1, (task.qty || 1) + d));
                            stepper.querySelector('.qs-n').value = task.qty;
                            saveOps();
                            const bw = row.querySelector('.ops-batch-card');
                            if (bw) buildBatchCard(bw, row, activeOpsCategory, taskObj.originalIndex);
                            armTimer();
                        });
                    });
                    const qi = stepper.querySelector('.qs-input');
                    if (qi) {
                        qi.addEventListener('click', ev => ev.stopPropagation());
                        qi.addEventListener('input', () => {
                            const v = parseInt(qi.value);
                            if (!isNaN(v) && v > 0) {
                                task.qty = Math.min(99, v);
                                saveOps();
                                const bw2 = row.querySelector('.ops-batch-card');
                                if (bw2) buildBatchCard(bw2, row, activeOpsCategory, taskObj.originalIndex);
                            }
                            armTimer();
                        });
                    }
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
                            const who = entry.by ? `<span class="ops-hist-by">${entry.by}</span>` : '';
                            html += `<div class="ops-hist-row"><span class="ops-hist-check">✓</span><span class="ops-hist-date">${formatDate(entry.ts)}</span>${gap}${who}</div>`;
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
                // Linked PREP item — tap expands the per-bottle batch card in place.
                // (Long-press → View Spec still jumps to the Codex.)
                if (isLinked && isPrep) {
                    triggerHaptic('light');
                    row.classList.toggle('expanded');
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
                        // PREP: dropping across the BATCHES/MISE divider re-files the task
                        if (isPrep && item.kind !== taskObj.kind) {
                            item.kind = taskObj.kind === 'mise' ? 'mise' : 'batch';
                            if (item.kind === 'batch' && !item.qty) item.qty = 1;
                            rememberPrepKind(item.text, item.kind);
                        }
                        opsData[activeOpsCategory].splice(toIdx, 0, item);
                        // Midpoint ordering: only this task's orderIndex changes,
                        // so simultaneous drags on other devices don't collide.
                        const arr = opsData[activeOpsCategory];
                        const pos = arr.indexOf(item);
                        const before = pos > 0 ? (arr[pos - 1].orderIndex || 0) : 0;
                        const after = pos < arr.length - 1 ? (arr[pos + 1].orderIndex || before + 2000) : before + 2000;
                        item.orderIndex = (before + after) / 2;
                        saveOps();
                        renderOpsList();
                    }
                });
                row.addEventListener('dragend', () => {
                    row.style.opacity = '1';
                    document.querySelectorAll('.ops-row').forEach(r => r.style.borderTop = 'none');
                });
            }

            const openTaskActions = () => {
                    triggerHaptic('medium');
                    
                    const actions = [];
                    if (isLinked) actions.push({ label: 'View Spec', value: 'view-spec' });
                    if (isPeriodic) actions.push({ label: 'Set Frequency', value: 'set-freq' });
                    if (isPrep) actions.push({ label: taskObj.kind === 'mise' ? 'Move to Batches' : 'Move to Mise', value: 'move-kind' });
                    if (isPrep && isLinked) actions.push({ label: 'Batch Bottle Size', value: 'batch-size' });
                    actions.push({ label: 'Edit Task', value: 'edit' });
                    actions.push({ label: 'Delete Task', value: 'delete' });
                    
                    openSelectModal('TASK ACTIONS', actions, (val) => {
                        if (val === 'delete') {
                            const cat = activeOpsCategory;
                            const idx = taskObj.originalIndex;
                            const removed = JSON.parse(JSON.stringify(opsData[cat][idx]));
                            opsData[cat].splice(idx, 1);
                            saveOps();
                            renderOpsList();
                            showToast(`Deleted "${removed.text}"`, () => {
                                opsData[cat].splice(Math.min(idx, opsData[cat].length), 0, removed);
                                saveOps();
                                renderOpsList();
                            });
                        } else if (val === 'batch-size') {
                            setTimeout(() => {
                                openSelectModal('BATCH BOTTLE SIZE', [
                                    { label: '500 ml', value: 500 },
                                    { label: '700 ml (standard)', value: 700 },
                                    { label: '1000 ml (1L)', value: 1000 },
                                    { label: '1500 ml', value: 1500 }
                                ], (ml) => {
                                    opsData[activeOpsCategory][taskObj.originalIndex].bottleML = parseInt(ml);
                                    saveOps();
                                    renderOpsList();
                                }, {
                                    placeholder: 'Custom size in ml…',
                                    btnLabel: 'SET',
                                    onSubmit: (v) => {
                                        const ml = parseInt(v);
                                        if (ml > 0) {
                                            opsData[activeOpsCategory][taskObj.originalIndex].bottleML = ml;
                                            saveOps();
                                            renderOpsList();
                                        }
                                    }
                                });
                            }, 350);
                        } else if (val === 'move-kind') {
                            const t = opsData[activeOpsCategory][taskObj.originalIndex];
                            t.kind = t.kind === 'mise' ? 'batch' : 'mise';
                            if (t.kind === 'batch' && !t.qty) t.qty = 1;
                            rememberPrepKind(t.text, t.kind);   // learn the correction
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
            };
            const moreBtn = row.querySelector('.row-more');
            if (moreBtn) moreBtn.addEventListener('click', (e) => { e.stopPropagation(); openTaskActions(); });

            container.appendChild(row);
        });

        // Ensure both PREP headers exist even when a section is empty (drop targets)
        if (isPrep) {
            ['BATCHES', 'MISE'].forEach(label => {
                const present = [...container.querySelectorAll('.ops-prep-section')]
                    .some(h => h.innerText === label);
                if (!present) container.appendChild(makePrepHeader(label));
            });
        }
    }

    loadOps();
    renderOpsList();
    ensureDeviceName();
    pullOpsFromCloud();   // reconcile with the sheet; local render already happened
    pullSettings();

    // Re-pull when returning to the app, and flush anything unpushed
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            pushOpsToCloud();   // flush anything pending (no-op when nothing changed)
            pullOpsFromCloud();
            pullSettings();
        }
    });
    window.addEventListener('online', () => { pushOpsToCloud(); pullSettings(); });

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

    // Remembers which section you filed a task under, so next time you type the
    // same name it lands there automatically (overrides keyword guessing).
    const PREP_KIND_KEY = 'codex_prep_kinds_v1';
    function loadPrepKinds() {
        try { return JSON.parse(localStorage.getItem(PREP_KIND_KEY)) || {}; } catch { return {}; }
    }
    function rememberPrepKind(text, kind) {
        const m = loadPrepKinds();
        m[(text || '').toLowerCase().trim()] = kind;
        try { localStorage.setItem(PREP_KIND_KEY, JSON.stringify(m)); } catch {}
    }
    function recallPrepKind(text) {
        return loadPrepKinds()[(text || '').toLowerCase().trim()] || null;
    }

    function commitPrepTask({ text, linkedSpec, linkedSection, qty }) {
        const remembered = recallPrepKind(text);
        const kind = linkedSpec ? 'batch'
                   : remembered ? remembered
                   : (BATCH_TEXT_RE.test(text) ? 'batch' : 'mise');
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
                        <div class="prep-input-row">
                            <input type="text" id="prep-add-input" class="premium-text-input" placeholder="Type task — e.g. 2x sky colada…" autocomplete="off" style="margin-bottom: 0;">
                            <button id="prep-add-save" class="prep-save-btn">SAVE</button>
                        </div>
                        <div id="prep-add-sugs"></div>
                    </div>
                </div>
            `);
            sheet = document.getElementById('prep-add-sheet');
            sheet.addEventListener('click', (e) => { if (e.target === sheet) closePrepAddSheet(); });
            sheet.querySelector('.prep-sheet-x').addEventListener('click', closePrepAddSheet);
            document.getElementById('prep-add-save').addEventListener('click', () => {
                triggerHaptic('heavy');
                commitTypedPrepTask();
            });
            const input = document.getElementById('prep-add-input');
            input.addEventListener('input', renderPrepSuggestions);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') commitTypedPrepTask();
            });
        }
        sheet.classList.remove('hidden');
        renderPrepSuggestions();
        setTimeout(() => document.getElementById('prep-add-input')?.focus(), 300);
    }

    // Commit whatever is typed (Enter or SAVE). Honours remembered section choice.
    function commitTypedPrepTask() {
        const input = document.getElementById('prep-add-input');
        if (!input) return;
        const { qty, query } = parsePrepInput(input.value);
        if (!query.trim()) return;
        const clean = capitalize(query.trim());
        const remembered = recallPrepKind(clean);
        const isBatchy = remembered ? (remembered === 'batch') : BATCH_TEXT_RE.test(query);
        const text = (!isBatchy && qty > 1) ? `${qty}x ${clean}` : clean;
        commitPrepTask({ text, qty: isBatchy ? qty : 1 });
        input.value = '';
        renderPrepSuggestions();
        input.focus();
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
                    return { text: isStandaloneName(n) ? section : n, linkedSpec: spec, linkedSection: section, glyph: '🔗' };
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
