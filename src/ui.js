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
    const settingDuration = document.getElementById('setting-duration');
    const settingStart = document.getElementById('setting-start');
    const settingStep = document.getElementById('setting-step');
    const settingReset = document.getElementById('setting-reset');

    const totalYears = voyageData?.metadata?.total_years ?? 250;
    const destinationName =
        voyageData?.metadata?.destination_name ??
        voyageData?.metadata?.destination?.name ??
        'Proxima Centauri';

    const defaults = { duration: totalYears, start: 0, step: 0.1 };

    slider.min = defaults.start;
    slider.max = defaults.duration;
    slider.step = defaults.step;
    settingDuration.value = defaults.duration;
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
        timelinePins,
        pinElements,
        _toastTimer: null,
        _totalYears: totalYears,
    };

    function applyTimelineSettings() {
        const duration = clampNumber(parseFloat(settingDuration.value), 1, 5000, defaults.duration);
        const start = clampNumber(parseFloat(settingStart.value), 0, duration - 0.1, 0);
        const step = clampNumber(parseFloat(settingStep.value), 0.01, 50, defaults.step);

        // Echo clamped values back into the inputs so the user sees what was applied
        settingDuration.value = duration;
        settingStart.value = start;
        settingStep.value = step;

        slider.min = start;
        slider.max = duration;
        slider.step = step;

        ui._totalYears = duration;

        let current = parseFloat(slider.value);
        if (!Number.isFinite(current)) current = start;
        current = Math.min(Math.max(current, start), duration);
        slider.value = current;

        // Always re-fire input so main.js refreshes scene + UI with the new bounds.
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    settingsButton.addEventListener('click', () => settingsPanel.classList.toggle('open'));
    settingsClose.addEventListener('click', () => settingsPanel.classList.remove('open'));
    // 'change' covers blur/Enter/spinner clicks; 'input' alone would re-clamp every keystroke.
    settingDuration.addEventListener('change', applyTimelineSettings);
    settingStart.addEventListener('change', applyTimelineSettings);
    settingStep.addEventListener('change', applyTimelineSettings);
    settingReset.addEventListener('click', () => {
        settingDuration.value = defaults.duration;
        settingStart.value = defaults.start;
        settingStep.value = defaults.step;
        applyTimelineSettings();
    });

    popupClose.addEventListener('click', () => closePinPopup({ popup }));

    return ui;
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
        el.className = 'timeline-pin';
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
