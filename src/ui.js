export function createUI(voyageData) {
    const slider = document.getElementById('slider');
    const yearDisplay = document.getElementById('year-display');
    const lightPanel = document.getElementById('light-panel');
    const solStatus = document.getElementById('sol-status');
    const muteButton = document.getElementById('mute-button');
    const popup = document.getElementById('pin-popup');
    const popupClose = popup.querySelector('.close');
    const milestoneToast = document.getElementById('milestone-toast');
    const timelinePins = document.getElementById('timeline-pins');
    const destinationLabel = document.getElementById('destination-label');
    const settingsButton = document.getElementById('settings-button');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = settingsPanel.querySelector('.settings-close');
    const settingsDestination = document.getElementById('settings-destination');
    const settingStart = document.getElementById('setting-start');
    const settingStep = document.getElementById('setting-step');
    const settingReset = document.getElementById('setting-reset');
    const settingSpeed = document.getElementById('setting-speed');
    const settingPlaybackRate = document.getElementById('setting-playback-rate');
    const playButton = document.getElementById('play-button');
    const settingChangeDestination = document.getElementById('setting-change-destination');
    const setupOverlay = document.getElementById('setup-overlay');
    const setupDestination = document.getElementById('setup-destination');
    const setupSpeed = document.getElementById('setup-speed');
    const setupBegin = document.getElementById('setup-begin');
    const setupEstimate = document.getElementById('setup-estimate');
    const starDetailOverlay = document.getElementById('star-detail-overlay');
    const starDetailPanel = document.getElementById('star-detail-panel');
    const starDetailClose = document.getElementById('star-detail-close');
    const starDetailSetDestination = document.getElementById('star-detail-set-destination');
    const addMemoryButton = document.getElementById('add-memory-button');
    const memoryFormOverlay = document.getElementById('memory-form-overlay');
    const memoryForm = document.getElementById('memory-form');
    const memoryFormClose = memoryForm.querySelector('.form-close');
    const memoryFormCancel = memoryForm.querySelector('button.cancel');
    const memoryYear = document.getElementById('memory-year');
    const memoryGen = document.getElementById('memory-generation');
    const memoryTitle = document.getElementById('memory-title');
    const memoryAuthor = document.getElementById('memory-author');
    const memoryText = document.getElementById('memory-text');
    const starTooltip = document.getElementById('star-tooltip');
    const journeyPanel = document.getElementById('journey-panel');
    const aheadPanel = document.getElementById('ahead-panel');
    const aheadEvents = document.getElementById('ahead-events');

    const totalYears = voyageData?.metadata?.total_years ?? 250;
    const destinationName =
        voyageData?.metadata?.destination_name ??
        voyageData?.metadata?.destination?.name ??
        'Proxima Centauri';

    const defaults = { start: 0, step: 0.1 };

    // Trip duration (slider.max) is derived from the active voyage and updated
    // by applyVoyageMetadata(); we only own start + step here.
    slider.min = defaults.start;
    slider.max = totalYears;
    slider.step = defaults.step;
    settingStart.value = defaults.start;
    settingStep.value = defaults.step;

    if (destinationLabel) {
        destinationLabel.querySelector('.name').textContent = destinationName;
    }
    settingsDestination.textContent = destinationName;

    const pinElements = timelinePins
        ? renderTimelinePins(timelinePins, voyageData?.pins ?? [], totalYears)
        : [];

    const ui = {
        slider,
        yearDisplay,
        lightPanel,
        solStatus,
        muteButton,
        popup,
        milestoneToast,
        destinationLabel,
        settingsPanel,
        settingsDestination,
        settingSpeed,
        settingChangeDestination,
        setupOverlay,
        setupDestination,
        setupSpeed,
        setupBegin,
        setupEstimate,
        starDetailOverlay,
        starDetailPanel,
        starDetailClose,
        starDetailSetDestination,
        timelinePins,
        pinElements,
        addMemoryButton,
        memoryFormOverlay,
        memoryForm,
        memoryYear,
        memoryGen,
        memoryTitle,
        memoryAuthor,
        memoryText,
        starTooltip,
        journeyPanel,
        aheadPanel,
        aheadEvents,
        playButton,
        settingPlaybackRate,
        _toastTimer: null,
        _totalYears: totalYears,
        _memorySubmitHandler: null,
        _pinClickHandler: null,
        _setupSubmitHandler: null,
        _starSetDestinationHandler: null,
        _speedChangeHandler: null,
        _activeStarDetail: null,
    };

    function applyTimelineSettings() {
        const duration = ui._totalYears;
        const start = clampNumber(parseFloat(settingStart.value), 0, duration - 0.1, 0);
        const step = clampNumber(parseFloat(settingStep.value), 0.01, 50, defaults.step);

        // Echo clamped values back into the inputs so the user sees what was applied
        settingStart.value = start;
        settingStep.value = step;

        slider.min = start;
        slider.step = step;

        let current = parseFloat(slider.value);
        if (!Number.isFinite(current)) current = start;
        current = Math.min(Math.max(current, start), duration);
        slider.value = current;

        // Always re-fire input so main.js refreshes scene + UI with the new bounds.
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    settingsButton.addEventListener('click', () => settingsPanel.classList.toggle('open'));
    settingsClose.addEventListener('click', () => settingsPanel.classList.remove('open'));

    if (settingSpeed) {
        settingSpeed.addEventListener('change', () => {
            const v = parseFloat(settingSpeed.value);
            if (!Number.isFinite(v) || v <= 0 || v >= 1) return;
            if (ui._speedChangeHandler) ui._speedChangeHandler(v);
        });
    }
    if (settingChangeDestination) {
        settingChangeDestination.addEventListener('click', () => {
            settingsPanel.classList.remove('open');
            openSetupModal(ui);
        });
    }
    if (setupBegin) {
        setupBegin.addEventListener('click', () => {
            const id = parseInt(setupDestination.value, 10);
            const speed = parseFloat(setupSpeed.value);
            if (!Number.isFinite(id) || !Number.isFinite(speed) || speed <= 0 || speed >= 1) return;
            if (ui._setupSubmitHandler) ui._setupSubmitHandler({ destinationStarId: id, speedC: speed });
            closeSetupModal(ui);
        });
    }
    if (setupDestination && setupSpeed && setupEstimate) {
        const refresh = () => updateSetupEstimate(ui);
        setupDestination.addEventListener('change', refresh);
        setupSpeed.addEventListener('input', refresh);
    }
    if (starDetailClose) {
        starDetailClose.addEventListener('click', () => closeStarDetail(ui));
    }
    if (starDetailOverlay) {
        starDetailOverlay.addEventListener('click', (e) => {
            if (e.target === starDetailOverlay) closeStarDetail(ui);
        });
    }
    if (starDetailSetDestination) {
        starDetailSetDestination.addEventListener('click', () => {
            const star = ui._activeStarDetail;
            if (!star) return;
            if (ui._starSetDestinationHandler) ui._starSetDestinationHandler(star);
            closeStarDetail(ui);
        });
    }
    // 'change' covers blur/Enter/spinner clicks; 'input' alone would re-clamp every keystroke.
    settingStart.addEventListener('change', applyTimelineSettings);
    settingStep.addEventListener('change', applyTimelineSettings);
    settingReset.addEventListener('click', () => {
        settingStart.value = defaults.start;
        settingStep.value = defaults.step;
        applyTimelineSettings();
    });

    popupClose.addEventListener('click', () => closePinPopup({ popup }));

    addMemoryButton.addEventListener('click', () => openMemoryForm(ui));
    memoryFormClose.addEventListener('click', () => closeMemoryForm(ui));
    memoryFormCancel.addEventListener('click', () => closeMemoryForm(ui));
    memoryFormOverlay.addEventListener('click', (e) => {
        if (e.target === memoryFormOverlay) closeMemoryForm(ui);
    });
    memoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = readMemoryForm(ui);
        if (!pin) return;
        if (ui._memorySubmitHandler) ui._memorySubmitHandler(pin);
        closeMemoryForm(ui);
    });

    return ui;
}

function readMemoryForm(ui) {
    const year = parseFloat(ui.memoryYear.value);
    if (!Number.isFinite(year) || year < 0) return null;
    const generation = Math.max(1, Math.round(parseFloat(ui.memoryGen.value) || 1));
    const title = ui.memoryTitle.value.trim();
    const author = ui.memoryAuthor.value.trim();
    const text = ui.memoryText.value.trim();
    if (!title || !author || !text) return null;
    return { year, generation, title, author, text };
}

export function openMemoryForm(ui, defaults = {}) {
    ui.memoryForm.reset();
    ui.memoryYear.value = defaults.year ?? (parseFloat(ui.slider.value) || 0);
    ui.memoryGen.value = defaults.generation ?? 1;
    ui.memoryTitle.value = defaults.title ?? '';
    ui.memoryAuthor.value = defaults.author ?? '';
    ui.memoryText.value = defaults.text ?? '';
    ui.memoryFormOverlay.classList.add('open');
    ui.memoryTitle.focus();
}

export function closeMemoryForm(ui) {
    ui.memoryFormOverlay.classList.remove('open');
}

export function onMemorySubmit(ui, handler) {
    ui._memorySubmitHandler = handler;
}

export function addTimelinePin(ui, pin) {
    if (!ui.timelinePins) return null;
    const totalYears = ui._totalYears;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'timeline-pin' + (pin._userAdded ? ' user-pin' : '');
    el.style.left = `${(pin.year / totalYears) * 100}%`;
    el.setAttribute('aria-label', `Year ${pin.year} — ${pin.title}`);

    const label = document.createElement('span');
    label.className = 'pin-label';
    label.textContent = `Year ${pin.year} · ${pin.title}`;
    el.appendChild(label);

    ui.timelinePins.appendChild(el);

    const entry = { el, data: pin };
    ui.pinElements.push(entry);

    if (ui._pinClickHandler) {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            ui._pinClickHandler(pin);
        });
    }
    return entry;
}

function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(value, min), max);
}

function renderTimelinePins(container, pins, totalYears) {
    container.innerHTML = '';
    return pins.map((pin) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'timeline-pin' + (pin._userAdded ? ' user-pin' : '');
        el.style.left = `${(pin.year / totalYears) * 100}%`;
        el.setAttribute('aria-label', `Year ${pin.year} — ${pin.title}`);

        const label = document.createElement('span');
        label.className = 'pin-label';
        label.textContent = `Year ${pin.year} · ${pin.title}`;
        el.appendChild(label);

        container.appendChild(el);
        return { el, data: pin };
    });
}

export function onTimelinePinClick(ui, handler) {
    ui._pinClickHandler = handler;
    for (const { el, data } of ui.pinElements) {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            handler(data);
        });
    }
}

export function updateUI(ui, wp, Voyage) {
    ui.yearDisplay.innerHTML = `<span class="current">${wp.year.toFixed(1)}</span>of ${Math.round(ui._totalYears)} years`;

    const past = Voyage.isPastLightHorizon(wp.year);
    const horizon = Voyage.getLightHorizon();

    const primary = ui.lightPanel.querySelector('.primary');
    const secondary = ui.lightPanel.querySelector('.secondary');

    if (past) {
        ui.lightPanel.classList.add('past-horizon');
        primary.textContent = 'No light from Earth will ever reach this ship again.';
        secondary.textContent = `Last light departed Earth in year ${horizon.last_earth_year}.`;
    } else {
        ui.lightPanel.classList.remove('past-horizon');
        primary.textContent = `Light from Earth year ${Math.round(wp.earthLightYear)} is reaching you now.`;
        secondary.textContent = `Light horizon at ship-year ${horizon.ship_year.toFixed(1)}.`;
    }

    const mag = ui.solStatus.querySelector('.magnitude');
    const vis = ui.solStatus.querySelector('.visibility');
    mag.textContent = wp.solMag.toFixed(2);
    vis.textContent = solVisibilityLabel(wp.solMag);

    if (ui.pinElements) {
        for (const { el, data } of ui.pinElements) {
            el.classList.toggle('active', Math.abs(data.year - wp.year) < 2);
        }
    }
}

export function updateJourneyPanel(ui, wp, Voyage) {
    if (!ui.journeyPanel) return;
    const meta = (typeof Voyage.getMetadata === 'function')
        ? (Voyage.getMetadata() || {})
        : {};
    const totalYears = meta.total_years ?? ui._totalYears ?? 250;
    const distLy = meta.total_distance_ly
        ?? (meta.total_distance_pc != null ? meta.total_distance_pc * 3.26156 : 4.244);
    const speedLyYr = meta.ship_speed_ly_per_year ?? (distLy / totalYears);
    const destName = meta.destination_name
        ?? meta.destination?.name
        ?? 'Destination';
    const horizon = (typeof Voyage.getLightHorizon === 'function')
        ? Voyage.getLightHorizon()
        : null;

    // Distances along the trajectory. These are facts the ship's nav computer
    // would know — distance from Sol and remaining distance to destination.
    const fromEarthLy = Math.min(distLy, wp.year * speedLyYr);
    const toDestLy = Math.max(0, distLy - fromEarthLy);

    const setText = (id, t) => {
        const el = document.getElementById(id);
        if (el) el.textContent = t;
    };

    setText(
        'journey-arrival',
        wp.year >= totalYears - 0.05
            ? 'Arrived'
            : `${(totalYears - wp.year).toFixed(1)} yrs to arrival`
    );
    setText('journey-from-earth', `${fromEarthLy.toFixed(2)} ly`);
    setText('journey-to-dest', `${toDestLy.toFixed(2)} ly`);
    setText('journey-dest-name', destName);

    // Progress bar fill + horizon tick
    const fillEl = document.getElementById('journey-fill');
    if (fillEl) {
        const pct = Math.max(0, Math.min(1, wp.year / totalYears)) * 100;
        fillEl.style.width = `${pct}%`;
    }
    const horizonMark = document.getElementById('journey-horizon-mark');
    if (horizonMark && horizon && Number.isFinite(horizon.ship_year)) {
        const pct = Math.max(0, Math.min(1, horizon.ship_year / totalYears)) * 100;
        horizonMark.style.left = `${pct}%`;
    }

    // Light horizon countdown / status
    const horizonRow = document.getElementById('journey-horizon-row');
    const horizonVal = document.getElementById('journey-horizon-val');
    if (horizonRow && horizonVal && horizon) {
        const delta = horizon.ship_year - wp.year;
        horizonRow.classList.remove('crossed', 'imminent');
        if (Math.abs(delta) < 0.5) {
            horizonVal.textContent = 'Crossing now';
            horizonRow.classList.add('imminent');
        } else if (delta > 0) {
            horizonVal.textContent = `in ${delta.toFixed(1)} yrs`;
            if (delta < 10) horizonRow.classList.add('imminent');
        } else {
            horizonVal.textContent = `${Math.abs(delta).toFixed(1)} yrs ago — Earth's gone`;
            horizonRow.classList.add('crossed');
        }
    }
}

// Icon glyph per event type. Keep ASCII-friendly so they render without a
// custom icon font.
const EVENT_ICONS = {
    sol: '☉',
    distance: '◐',
    horizon: '⌬',
    destination: '⌖',
    flyby: '★',
    visibility: '◉',
    boundary: '◇',
    milestone: '◆',
};

/**
 * Render the next `count` upcoming events into the "What's Ahead" panel.
 * Hides the panel entirely once nothing remains.
 */
export function updateAheadPanel(ui, currentYear, allEvents, count = 3) {
    if (!ui.aheadPanel || !ui.aheadEvents) return;
    const upcoming = (allEvents || [])
        .filter((e) => e.year > currentYear + 0.05)
        .slice(0, count);

    if (upcoming.length === 0) {
        ui.aheadPanel.classList.add('empty');
        ui.aheadEvents.innerHTML = '';
        return;
    }
    ui.aheadPanel.classList.remove('empty');

    const html = upcoming.map((e) => {
        const yrs = e.year - currentYear;
        const countdown = formatCountdown(yrs);
        const icon = EVENT_ICONS[e.type] || EVENT_ICONS.milestone;
        const desc = e.desc ? `${escapeHtml(e.desc)} · ` : '';
        return `
            <div class="ahead-event ${escapeHtml(e.type)}">
                <div class="icon">${icon}</div>
                <div class="body">
                    <div class="title">${escapeHtml(e.title)}</div>
                    <div class="meta">${desc}<span class="countdown">in ${countdown}</span></div>
                </div>
            </div>
        `;
    }).join('');
    ui.aheadEvents.innerHTML = html;
}

function formatCountdown(years) {
    if (years < 1) return `${(years * 12).toFixed(1)} months`;
    if (years < 10) return `${years.toFixed(1)} yrs`;
    return `${Math.round(years)} yrs`;
}

function solVisibilityLabel(mag) {
    if (mag < -10) return 'Brilliant — like a small sun';
    if (mag < 0)   return 'Brighter than any star';
    if (mag < 4)   return 'Easily naked-eye';
    if (mag < 6)   return 'Naked-eye, fading';
    if (mag < 10)  return 'Binoculars only';
    return 'Lost among the field stars';
}

export function showMilestone(ui, label) {
    ui.milestoneToast.textContent = label;
    ui.milestoneToast.classList.add('visible');
    if (ui._toastTimer) clearTimeout(ui._toastTimer);
    ui._toastTimer = setTimeout(() => {
        ui.milestoneToast.classList.remove('visible');
    }, 3200);
}

export function openPinPopup(ui, pin) {
    const meta = ui.popup.querySelector('.meta');
    const title = ui.popup.querySelector('.title');
    const author = ui.popup.querySelector('.author');
    const text = ui.popup.querySelector('.text');

    meta.textContent = `Year ${pin.year} · Generation ${pin.generation}`;
    title.textContent = pin.title;
    author.textContent = pin.author;
    text.textContent = pin.text;

    ui.popup.classList.add('open');
}

export function closePinPopup(ui) {
    ui.popup.classList.remove('open');
}

export function setMuted(ui, muted) {
    ui.muteButton.textContent = muted ? '⊘' : '♪';
    ui.muteButton.title = muted ? 'Unmute' : 'Mute';
}

export function setPlaying(ui, playing) {
    if (!ui.playButton) return;
    ui.playButton.textContent = playing ? '⏸' : '▶';
    ui.playButton.title = playing ? 'Pause voyage' : 'Play voyage';
    ui.playButton.classList.toggle('playing', playing);
}

export function showStarTooltip(ui, info, clientX, clientY) {
    if (!ui.starTooltip) return;
    const swatchColor = `rgb(${info.r}, ${info.g}, ${info.b})`;
    const lightLine = info.lightEmittedYear !== null
        ? `Light reaching you was emitted in <strong>${info.lightEmittedYearLabel}</strong>`
        : 'Object is closer to ship than to Sol';
    const idLine = formatStarIdLine(info);
    const extraRows = formatStarExtraRows(info);

    ui.starTooltip.innerHTML = `
        <div class="name"><span class="swatch" style="background:${swatchColor};color:${swatchColor}"></span>${escapeHtml(info.name)}</div>
        <div class="id">${idLine}</div>
        <div class="row"><span class="label">From ship</span><span class="value">${info.distFromShipLy.toFixed(2)} ly</span></div>
        <div class="row"><span class="label">From Sol</span><span class="value">${info.distFromSolLy.toFixed(2)} ly</span></div>
        <div class="row"><span class="label">App. mag (here)</span><span class="value">${info.magShip.toFixed(2)}</span></div>
        <div class="row"><span class="label">App. mag (Earth)</span><span class="value">${info.magEarth.toFixed(2)}</span></div>
        ${extraRows}
        <div class="light-line">${lightLine}</div>
    `;
    positionTooltip(ui.starTooltip, clientX, clientY);
    ui.starTooltip.classList.add('visible');
}

function formatStarIdLine(info) {
    const parts = [];
    if (info.hipId != null) parts.push(`HIP ${info.hipId}`);
    else if (info.category === 'dwarf') parts.push('Brown / cool dwarf');
    else if (info.category === 'exoplanet_host') parts.push('Exoplanet host');
    if (info.spectralType) parts.push(escapeHtml(info.spectralType));
    parts.push(escapeHtml(info.colorDesc));
    return parts.join(' · ');
}

function formatStarExtraRows(info) {
    const rows = [];
    if (info.planetCount > 0) {
        const noun = info.planetCount === 1 ? 'planet' : 'planets';
        rows.push(`<div class="row"><span class="label">Confirmed exo${noun}</span><span class="value">${info.planetCount}</span></div>`);
    }
    return rows.join('');
}

export function hideStarTooltip(ui) {
    if (!ui.starTooltip) return;
    ui.starTooltip.classList.remove('visible');
}

function positionTooltip(el, clientX, clientY) {
    // Place tooltip near cursor, flipping to keep it on screen.
    const padding = 14;
    const rect = el.getBoundingClientRect();
    const w = rect.width || 220;
    const h = rect.height || 140;
    let x = clientX + padding;
    let y = clientY + padding;
    if (x + w > window.innerWidth - 8) x = clientX - w - padding;
    if (y + h > window.innerHeight - 8) y = clientY - h - padding;
    el.style.transform = `translate(${x}px, ${y}px)`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

// === Setup modal ===

export function populateSetupOptions(ui, namedStars, currentDestinationId, currentSpeedC) {
    if (!ui.setupDestination) return;
    ui.setupDestination.innerHTML = '';
    for (const s of namedStars) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} — ${s.distanceLy.toFixed(2)} ly`;
        ui.setupDestination.appendChild(opt);
    }
    if (currentDestinationId != null && namedStars.some((s) => s.id === currentDestinationId)) {
        ui.setupDestination.value = String(currentDestinationId);
    }
    if (currentSpeedC != null && Number.isFinite(currentSpeedC)) {
        ui.setupSpeed.value = currentSpeedC;
    }
    ui._namedStars = namedStars;
    updateSetupEstimate(ui);
}

function updateSetupEstimate(ui) {
    if (!ui.setupEstimate || !ui._namedStars) return;
    const id = parseInt(ui.setupDestination.value, 10);
    const speed = parseFloat(ui.setupSpeed.value);
    const star = ui._namedStars.find((s) => s.id === id);
    if (!star || !Number.isFinite(speed) || speed <= 0 || speed >= 1) {
        ui.setupEstimate.textContent = 'Pick a destination and a valid speed (0–1×c).';
        return;
    }
    const years = star.distanceLy / speed;
    ui.setupEstimate.innerHTML =
        `<strong>${star.name}</strong> · ${star.distanceLy.toFixed(2)} ly away.<br>` +
        `At <strong>${speed.toFixed(3)}c</strong> the trip takes <strong>${years.toFixed(1)}</strong> ship-years.`;
}

export function openSetupModal(ui) {
    if (!ui.setupOverlay) return;
    ui.setupOverlay.classList.add('open');
    updateSetupEstimate(ui);
}

export function closeSetupModal(ui) {
    if (!ui.setupOverlay) return;
    ui.setupOverlay.classList.remove('open');
}

export function onSetupSubmit(ui, handler) {
    ui._setupSubmitHandler = handler;
}

// === Star detail modal ===

export function openStarDetail(ui, info, isCurrentDestination) {
    if (!ui.starDetailOverlay || !ui.starDetailPanel) return;
    ui._activeStarDetail = info;

    const swatch = ui.starDetailPanel.querySelector('.swatch');
    const nameEl = ui.starDetailPanel.querySelector('.star-name');
    const subEl = ui.starDetailPanel.querySelector('.star-sub');
    const grid = ui.starDetailPanel.querySelector('.info-grid');
    const tag = ui.starDetailPanel.querySelector('.current-tag');
    const setBtn = ui.starDetailSetDestination;

    swatch.style.background = `rgb(${info.r}, ${info.g}, ${info.b})`;
    swatch.style.color = `rgb(${info.r}, ${info.g}, ${info.b})`;
    nameEl.textContent = info.name;

    const subParts = [];
    if (info.hipId != null) subParts.push(`HIP ${info.hipId}`);
    else if (info.category === 'dwarf') subParts.push('Brown / cool dwarf');
    else if (info.category === 'exoplanet_host') subParts.push('Exoplanet host');
    if (info.spectralType) subParts.push(info.spectralType);
    subParts.push(info.colorDesc);
    subEl.textContent = subParts.join(' · ');

    if (tag) tag.hidden = !isCurrentDestination;
    if (setBtn) {
        setBtn.disabled = !!isCurrentDestination;
        setBtn.textContent = isCurrentDestination ? 'Already destination' : 'Set as destination';
    }

    const planetRow = info.planetCount > 0
        ? `<div class="info-row"><span class="label">Confirmed exoplanets</span><span>${info.planetCount}</span></div>`
        : '';

    grid.innerHTML = `
        <div class="info-row"><span class="label">From ship</span><span>${info.distFromShipLy.toFixed(2)} ly</span></div>
        <div class="info-row"><span class="label">From Sol</span><span>${info.distFromSolLy.toFixed(2)} ly</span></div>
        <div class="info-row"><span class="label">Apparent magnitude (here)</span><span>${info.magShip.toFixed(2)}</span></div>
        <div class="info-row"><span class="label">Apparent magnitude (Earth)</span><span>${info.magEarth.toFixed(2)}</span></div>
        ${planetRow}
        <div class="info-row"><span class="label">Light arrives from</span><span>${escapeHtml(info.lightEmittedYearLabel || '—')}</span></div>
    `;

    ui.starDetailOverlay.classList.add('open');
}

export function closeStarDetail(ui) {
    if (!ui.starDetailOverlay) return;
    ui.starDetailOverlay.classList.remove('open');
    ui._activeStarDetail = null;
}

export function onStarSetDestination(ui, handler) {
    ui._starSetDestinationHandler = handler;
}

// === Voyage metadata sync ===

export function applyVoyageMetadata(ui, metadata) {
    const totalYears = metadata?.total_years ?? 250;
    ui._totalYears = totalYears;
    ui.slider.max = totalYears;
    if (parseFloat(ui.slider.value) > totalYears) {
        ui.slider.value = 0;
    }
    if (ui.destinationLabel) {
        ui.destinationLabel.querySelector('.name').textContent = metadata?.destination_name ?? '—';
    }
    if (ui.settingsDestination) {
        ui.settingsDestination.textContent = metadata?.destination_name ?? '—';
    }
    if (ui.settingSpeed && Number.isFinite(metadata?.ship_speed_c)) {
        ui.settingSpeed.value = metadata.ship_speed_c;
    }
}

// === Speed change ===

export function onSpeedChange(ui, handler) {
    ui._speedChangeHandler = handler;
}

// === Timeline rebuild (after destination/speed changes) ===

export function rebuildTimeline(ui, pins, totalYears) {
    if (!ui.timelinePins) return;
    ui._totalYears = totalYears;
    ui.timelinePins.innerHTML = '';
    ui.pinElements.length = 0;
    for (const pin of pins) {
        if (typeof pin.year !== 'number' || pin.year > totalYears) continue;
        addTimelinePin(ui, pin);
    }
}
