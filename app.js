(function () {
  const STORAGE_KEY = 'healthModeData_v2';

  function todayKey(date) {
    const d = date ? new Date(date) : new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function defaultState() {
    return {
      theme: 'dark',
      water: {
        goal: 2000,
        byDate: {}, // dateKey -> amount
      },
      distance: {
        goalKm: 5,
        byDate: {},
      },
      weight: {
        unit: 'kg',
        weeks: {}, // "1".."12" -> weight
      },
      custom: {
        trackers: [], // {id, name, unit, goal, mode: 'daily'|'weekly', createdAt}
        values: {}, // trackerId -> { periodKey -> amount }
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultState();

      const base = defaultState();
      const merged = {
        ...base,
        ...parsed,
        water: { ...base.water, ...(parsed.water || {}) },
        distance: { ...base.distance, ...(parsed.distance || {}) },
        weight: { ...base.weight, ...(parsed.weight || {}) },
        custom: {
          ...base.custom,
          ...(parsed.custom || {}),
          trackers: (parsed.custom && parsed.custom.trackers) || [],
          values: (parsed.custom && parsed.custom.values) || {},
        },
      };
      return merged;
    } catch (e) {
      console.warn('HealthMode: could not load saved data, using defaults.', e);
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('HealthMode: could not save data.', e);
    }
  }

  function clampNumber(value, min) {
    const n = Number(value);
    if (Number.isNaN(n)) return min;
    return Math.max(min, n);
  }

  function percent(done, goal) {
    const g = Number(goal || 0);
    if (!g || g <= 0) return 0;
    const d = Number(done || 0);
    return Math.min(100, Math.round((d / g) * 100));
  }

  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      theme = 'dark';
    }
    state.theme = theme;
    document.body.setAttribute('data-theme', theme);
    const buttons = document.querySelectorAll('.theme-toggle-btn');
    buttons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-theme-choice') === theme);
    });
    saveState();
  }

  function getTodayAmount(map) {
    const key = todayKey();
    return Number((map && map[key]) || 0);
  }

  function setTodayAmount(map, value) {
    const key = todayKey();
    map[key] = clampNumber(value, 0);
  }

  function isDayCompleted(map, goal, dateKey) {
    const amount = Number((map && map[dateKey]) || 0);
    const g = Number(goal || 0);
    return g > 0 && amount >= g;
  }

  function renderMonthCalendar(gridEl, titleEl, dateForMonth, isCompletedFn) {
    if (!gridEl || !titleEl) return;

    const baseDate = dateForMonth ? new Date(dateForMonth) : new Date();
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = firstOfMonth.getDay(); // 0-6
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    titleEl.textContent = firstOfMonth.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });

    const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    gridEl.innerHTML = '';

    // Weekday header row
    weekdays.forEach((label) => {
      const d = document.createElement('div');
      d.className = 'calendar-weekday';
      d.textContent = label;
      gridEl.appendChild(d);
    });

    // Empty cells before month starts
    for (let i = 0; i < firstWeekday; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day calendar-day-empty';
      gridEl.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(year, month, day);
      const key = todayKey(d);
      const completed = isCompletedFn(key);

      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      if (completed) cell.classList.add('calendar-day--checked');

      const num = document.createElement('span');
      num.className = 'calendar-day-number';
      num.textContent = String(day);
      cell.appendChild(num);

      if (completed) {
        const check = document.createElement('span');
        check.className = 'calendar-day-check';
        check.textContent = '✓';
        cell.appendChild(check);
      }

      gridEl.appendChild(cell);
    }
  }

  function init() {
    const prefersLight =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    if (!state.theme) {
      state.theme = prefersLight ? 'light' : 'dark';
    }
    setTheme(state.theme);

    const screens = Array.from(document.querySelectorAll('.screen'));
    const bottomPill = document.querySelector('.bottom-carousel-pill');
    const bottomItems = bottomPill
      ? Array.from(bottomPill.querySelectorAll('.bottom-item'))
      : [];

    function updateBottomNav(name) {
      if (!bottomPill || !bottomItems.length) return;
      let activeIndex = 0;
      bottomItems.forEach((item, index) => {
        const target = item.getAttribute('data-go-screen');
        const isActive = target === name;
        item.classList.toggle('is-active', isActive);
        if (isActive) activeIndex = index;
      });
      bottomPill.style.setProperty('--active-index', String(activeIndex));
    }

    function switchScreen(name) {
      const id = `screen-${name}`;
      screens.forEach((sec) => {
        sec.classList.toggle('screen--active', sec.id === id);
      });
      updateBottomNav(name);

      // Show activity rings only on Home (main) screen
      const rings = document.querySelector('.activity-rings');
      if (rings) {
        rings.style.display = name === 'main' ? 'flex' : 'none';
      }
    }

    document.querySelectorAll('[data-go-screen]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-go-screen');
        if (target) switchScreen(target);
      });
    });

    // Ensure bottom carousel matches initial screen
    updateBottomNav('main');

    // Ensure rings are visible on initial Home screen only
    const initialRings = document.querySelector('.activity-rings');
    if (initialRings) initialRings.style.display = 'flex';

    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.getAttribute('data-theme-choice');
        setTheme(theme);
      });
    });

    // Water DOM
    const waterGoalInput = document.getElementById('water-goal');
    const waterTodayInput = document.getElementById('water-today');
    const waterProgress = document.getElementById('water-progress');
    const waterReset = document.getElementById('water-reset');
    const waterCalTitle = document.getElementById('water-calendar-title');
    const waterCalGrid = document.getElementById('water-calendar-grid');

    function updateWaterUI() {
      if (!state.water) state.water = { goal: 2000, byDate: {} };
      const todayAmount = getTodayAmount(state.water.byDate);
      if (waterGoalInput) waterGoalInput.value = state.water.goal;
      if (waterTodayInput) waterTodayInput.value = todayAmount;
      const pct = percent(todayAmount, state.water.goal);
      if (waterProgress) waterProgress.style.width = `${pct}%`;
      renderMonthCalendar(
        waterCalGrid,
        waterCalTitle,
        new Date(),
        (dateKey) => isDayCompleted(state.water.byDate, state.water.goal, dateKey)
      );
    }

    if (waterGoalInput && waterTodayInput) {
      const syncWater = () => {
        state.water.goal = clampNumber(waterGoalInput.value, 0);
        setTodayAmount(state.water.byDate, waterTodayInput.value);
        saveState();
        updateWaterUI();
        updateHomeSummaries();
      };

      ['change', 'blur'].forEach((evt) => {
        waterGoalInput.addEventListener(evt, syncWater);
        waterTodayInput.addEventListener(evt, syncWater);
      });

      document.querySelectorAll('[data-add-water]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const amount = Number(btn.getAttribute('data-add-water')) || 0;
          const current = getTodayAmount(state.water.byDate);
          const next = clampNumber(current + amount, 0);
          if (waterTodayInput) waterTodayInput.value = next;
          syncWater();
        });
      });

      if (waterReset) {
        waterReset.addEventListener('click', () => {
          setTodayAmount(state.water.byDate, 0);
          if (waterTodayInput) waterTodayInput.value = 0;
          saveState();
          updateWaterUI();
          updateHomeSummaries();
        });
      }
    }

    // Distance DOM
    const distanceGoalInput = document.getElementById('distance-goal');
    const distanceTodayInput = document.getElementById('distance-today');
    const distanceProgress = document.getElementById('distance-progress');
    const distanceReset = document.getElementById('distance-reset');
    const distanceCalTitle = document.getElementById('distance-calendar-title');
    const distanceCalGrid = document.getElementById('distance-calendar-grid');

    function updateDistanceUI() {
      if (!state.distance) state.distance = { goalKm: 5, byDate: {} };
      const todayAmount = getTodayAmount(state.distance.byDate);
      if (distanceGoalInput) distanceGoalInput.value = state.distance.goalKm;
      if (distanceTodayInput) distanceTodayInput.value = todayAmount;
      const pct = percent(todayAmount, state.distance.goalKm);
      if (distanceProgress) distanceProgress.style.width = `${pct}%`;
      renderMonthCalendar(
        distanceCalGrid,
        distanceCalTitle,
        new Date(),
        (dateKey) => isDayCompleted(state.distance.byDate, state.distance.goalKm, dateKey)
      );
    }

    if (distanceGoalInput && distanceTodayInput) {
      const syncDistance = () => {
        state.distance.goalKm = clampNumber(distanceGoalInput.value, 0);
        setTodayAmount(state.distance.byDate, distanceTodayInput.value);
        saveState();
        updateDistanceUI();
        updateHomeSummaries();
      };

      ['change', 'blur'].forEach((evt) => {
        distanceGoalInput.addEventListener(evt, syncDistance);
        distanceTodayInput.addEventListener(evt, syncDistance);
      });

      document.querySelectorAll('[data-add-distance]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const amount = Number(btn.getAttribute('data-add-distance')) || 0;
          const current = getTodayAmount(state.distance.byDate);
          const next = Math.max(0, Number((current + amount).toFixed(2)));
          if (distanceTodayInput) distanceTodayInput.value = next;
          syncDistance();
        });
      });

      if (distanceReset) {
        distanceReset.addEventListener('click', () => {
          setTodayAmount(state.distance.byDate, 0);
          if (distanceTodayInput) distanceTodayInput.value = 0;
          saveState();
          updateDistanceUI();
          updateHomeSummaries();
        });
      }
    }

    // Weight weeks
    const weightWeeksContainer = document.getElementById('weight-weeks');

    function ensureWeightWeeks() {
      if (!state.weight) state.weight = { unit: 'kg', weeks: {} };
      if (!state.weight.weeks) state.weight.weeks = {};
    }

    function renderWeightWeeks() {
      ensureWeightWeeks();
      if (!weightWeeksContainer) return;
      weightWeeksContainer.innerHTML = '';
      const weeks = 12;
      for (let i = 1; i <= weeks; i += 1) {
        const row = document.createElement('div');
        row.className = 'weight-row';

        const label = document.createElement('span');
        label.textContent = `Week ${i}`;

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.setAttribute('data-weight-week', String(i));
        const stored = state.weight.weeks[String(i)];
        if (stored != null) input.value = stored;

        row.appendChild(label);
        row.appendChild(input);
        weightWeeksContainer.appendChild(row);
      }
    }

    if (weightWeeksContainer) {
      renderWeightWeeks();
      weightWeeksContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const week = target.getAttribute('data-weight-week');
        if (!week) return;
        ensureWeightWeeks();
        const val = target.value === '' ? null : Number(target.value);
        if (val == null || Number.isNaN(val)) {
          delete state.weight.weeks[week];
        } else {
          state.weight.weeks[week] = val;
        }
        saveState();
        updateHomeSummaries();
      });
    }

    // Custom trackers
    const customNameInput = document.getElementById('custom-name');
    const customUnitInput = document.getElementById('custom-unit');
    const customGoalInput = document.getElementById('custom-goal');
    const customModeSelect = document.getElementById('custom-mode');
    const customAddButton = document.getElementById('custom-add');
    const customTrackersContainer = document.getElementById('custom-trackers');
    const customEmptyHelper = document.getElementById('custom-empty-helper');

    function ensureCustomStructures() {
      if (!state.custom) state.custom = { trackers: [], values: {} };
      if (!Array.isArray(state.custom.trackers)) state.custom.trackers = [];
      if (!state.custom.values) state.custom.values = {};
    }

    function getCustomPeriodKey(tracker, dateObj) {
      const d = dateObj || new Date();
      if (tracker.mode === 'weekly') {
        // Simple week index: weeks since tracker creation
        const created = tracker.createdAt ? new Date(tracker.createdAt) : new Date();
        const diffMs = d - created;
        const diffDays = Math.floor(diffMs / 86400000);
        const weekIndex = Math.max(0, Math.floor(diffDays / 7));
        return `w${weekIndex + 1}`; // w1, w2, ...
      }
      return todayKey(d);
    }

    function getCustomValue(trackerId, periodKey) {
      const store = state.custom.values[trackerId] || {};
      return Number(store[periodKey] || 0);
    }

    function setCustomValue(trackerId, periodKey, value) {
      if (!state.custom.values[trackerId]) state.custom.values[trackerId] = {};
      state.custom.values[trackerId][periodKey] = clampNumber(value, 0);
    }

    function renderCustomTrackers() {
      ensureCustomStructures();
      if (!customTrackersContainer) return;

      customTrackersContainer.innerHTML = '';
      if (customEmptyHelper) {
        customEmptyHelper.style.display = state.custom.trackers.length ? 'none' : 'block';
      }

      state.custom.trackers.forEach((tracker) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-card';
        wrapper.setAttribute('data-tracker-id', tracker.id);

        const header = document.createElement('div');
        header.className = 'custom-card-header';

        const titleWrap = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'custom-name';
        nameEl.textContent = tracker.name;
        const subtitle = document.createElement('div');
        subtitle.className = 'custom-subtitle';
        subtitle.textContent = `Goal: ${tracker.goal} ${tracker.unit} • ${
          tracker.mode === 'weekly' ? 'weekly' : 'daily'
        }`;
        titleWrap.appendChild(nameEl);
        titleWrap.appendChild(subtitle);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'custom-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.setAttribute('data-remove-id', tracker.id);

        header.appendChild(titleWrap);
        header.appendChild(removeBtn);

        const body = document.createElement('div');
        body.className = 'custom-body';

        const field = document.createElement('label');
        field.className = 'field';
        const span = document.createElement('span');
        span.textContent = tracker.mode === 'weekly' ? 'This week' : 'Today';
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '1';
        input.setAttribute('data-custom-id', tracker.id);
        const key = getCustomPeriodKey(tracker);
        const currentVal = getCustomValue(tracker.id, key);
        input.value = currentVal;
        field.appendChild(span);
        field.appendChild(input);

        const quick = document.createElement('div');
        quick.className = 'quick-buttons';
        [1, 5].forEach((inc) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'custom-add-amount';
          b.setAttribute('data-custom-id', tracker.id);
          b.setAttribute('data-amount', String(inc));
          b.textContent = `+${inc}`;
          quick.appendChild(b);
        });

        const calendarWrap = document.createElement('div');
        calendarWrap.className = 'custom-calendar';
        calendarWrap.setAttribute('data-calendar-for', tracker.id);

        body.appendChild(field);
        body.appendChild(quick);
        body.appendChild(calendarWrap);

        wrapper.appendChild(header);
        wrapper.appendChild(body);

        customTrackersContainer.appendChild(wrapper);
      });

      renderCustomCalendars();
    }

    function renderCustomCalendars() {
      ensureCustomStructures();
      if (!customTrackersContainer) return;

      state.custom.trackers.forEach((tracker) => {
        const wrap = customTrackersContainer.querySelector(
          `[data-calendar-for="${tracker.id}"]`
        );
        if (!wrap) return;
        wrap.innerHTML = '';

        if (tracker.mode === 'weekly') {
          const list = document.createElement('ul');
          list.className = 'week-list';

          for (let i = 1; i <= 12; i += 1) {
            const li = document.createElement('li');
            li.className = 'week-row';
            const label = document.createElement('span');
            label.className = 'week-row-label';
            label.textContent = `Week ${i}`;
            const check = document.createElement('span');
            check.className = 'week-row-check';
            const key = `w${i}`;
            const value = getCustomValue(tracker.id, key);
            if (tracker.goal > 0 && value >= tracker.goal) {
              check.textContent = '✓';
            } else {
              check.textContent = '';
            }
            li.appendChild(label);
            li.appendChild(check);
            list.appendChild(li);
          }

          wrap.appendChild(list);
        } else {
          const title = document.createElement('div');
          title.className = 'calendar-header';
          const titleText = document.createElement('span');
          titleText.className = 'calendar-title';
          title.appendChild(titleText);
          const grid = document.createElement('div');
          grid.className = 'calendar-grid';
          wrap.appendChild(title);
          wrap.appendChild(grid);

          renderMonthCalendar(grid, titleText, new Date(), (dateKey) => {
            const amount = getCustomValue(tracker.id, dateKey);
            return tracker.goal > 0 && amount >= tracker.goal;
          });
        }
      });
    }

    if (customAddButton) {
      customAddButton.addEventListener('click', () => {
        ensureCustomStructures();
        const name = (customNameInput && customNameInput.value.trim()) || '';
        const unit = (customUnitInput && customUnitInput.value.trim()) || '';
        const goalVal = customGoalInput ? Number(customGoalInput.value) : 0;
        const mode = (customModeSelect && customModeSelect.value) || 'daily';

        if (!name || Number.isNaN(goalVal)) return;

        const tracker = {
          id: `t_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name,
          unit: unit || 'units',
          goal: clampNumber(goalVal, 0),
          mode: mode === 'weekly' ? 'weekly' : 'daily',
          createdAt: todayKey(),
        };

        state.custom.trackers.push(tracker);
        saveState();

        if (customNameInput) customNameInput.value = '';
        if (customUnitInput) customUnitInput.value = '';
        if (customGoalInput) customGoalInput.value = '';

        renderCustomTrackers();
        updateHomeSummaries();
      });
    }

    if (customTrackersContainer) {
      customTrackersContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.matches('.custom-remove')) {
          const id = target.getAttribute('data-remove-id');
          if (!id) return;
          ensureCustomStructures();
          state.custom.trackers = state.custom.trackers.filter((t) => t.id !== id);
          delete state.custom.values[id];
          saveState();
          renderCustomTrackers();
          updateHomeSummaries();
          return;
        }

        if (target.matches('.custom-add-amount')) {
          const id = target.getAttribute('data-custom-id');
          const amount = Number(target.getAttribute('data-amount')) || 0;
          if (!id) return;
          ensureCustomStructures();
          const tracker = state.custom.trackers.find((t) => t.id === id);
          if (!tracker) return;
          const periodKey = getCustomPeriodKey(tracker);
          const current = getCustomValue(id, periodKey);
          const next = clampNumber(current + amount, 0);
          setCustomValue(id, periodKey, next);

          const input = customTrackersContainer.querySelector(
            `input[data-custom-id="${id}"]`
          );
          if (input) input.value = next;

          saveState();
          renderCustomCalendars();
          updateHomeSummaries();
        }
      });

      customTrackersContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const id = target.getAttribute('data-custom-id');
        if (!id) return;
        ensureCustomStructures();
        const tracker = state.custom.trackers.find((t) => t.id === id);
        if (!tracker) return;
        const periodKey = getCustomPeriodKey(tracker);
        const val = target.value === '' ? 0 : Number(target.value);
        if (!Number.isNaN(val)) {
          setCustomValue(id, periodKey, val);
          saveState();
          renderCustomCalendars();
          updateHomeSummaries();
        }
      });
    }

    // Main menu summaries
    const menuWaterSummary = null;
    const menuDistanceSummary = null;
    const menuWeightSummary = null;
    const menuCustomSummary = null;

    function setRingProgress(circleId, pct) {
      const circle = document.getElementById(circleId);
      if (!circle) return;
      const r = parseFloat(circle.getAttribute('r') || '0');
      if (!r) return;
      const C = 2 * Math.PI * r;
      const clamped = Math.max(0, Math.min(100, pct || 0));
      circle.style.strokeDasharray = `${C}`;
      circle.style.strokeDashoffset = `${C * (1 - clamped / 100)}`;
    }

    function updateActivityRings() {
      const distanceTextEl = document.getElementById('ring-distance-text');
      const waterTextEl = document.getElementById('ring-water-text');
      const customTextEl = document.getElementById('ring-custom-text');
      const customCircle = document.getElementById('ring-custom');
      const customBg = document.getElementById('ring-custom-bg');

      // Distance ring
      const distToday = getTodayAmount((state.distance && state.distance.byDate) || {});
      const distGoal = Number((state.distance && state.distance.goalKm) || 0);
      const distPct = percent(distToday, distGoal);
      setRingProgress('ring-distance', distPct);
      if (distanceTextEl) {
        if (distGoal > 0) {
          distanceTextEl.textContent = `Distance ${distToday} / ${distGoal} km`;
        } else {
          distanceTextEl.textContent = 'Distance 0 / 0 km';
        }
      }

      // Water ring
      const waterToday = getTodayAmount((state.water && state.water.byDate) || {});
      const waterGoal = Number((state.water && state.water.goal) || 0);
      const waterPct = percent(waterToday, waterGoal);
      setRingProgress('ring-water', waterPct);
      if (waterTextEl) {
        if (waterGoal > 0) {
          waterTextEl.textContent = `Water ${waterToday} / ${waterGoal} ml`;
        } else {
          waterTextEl.textContent = 'Water 0 / 0 ml';
        }
      }

      // Custom ring (first custom tracker, percentage)
      ensureCustomStructures();
      const trackers = state.custom.trackers || [];
      if (!trackers.length) {
        if (customTextEl) customTextEl.style.display = 'none';
        if (customCircle) customCircle.style.display = 'none';
        if (customBg) customBg.style.display = 'none';
      } else {
        const tracker = trackers[0];
        const periodKey = getCustomPeriodKey(tracker);
        const value = getCustomValue(tracker.id, periodKey);
        const goal = Number(tracker.goal || 0);
        const pct = percent(value, goal);
        setRingProgress('ring-custom', pct);

        if (customCircle) customCircle.style.display = '';
        if (customBg) customBg.style.display = '';
        if (customTextEl) {
          customTextEl.style.display = '';
          const pctLabel = goal > 0 ? Math.round((value / goal) * 100) : 0;
          customTextEl.textContent = `${tracker.name} ${pctLabel}%`;
        }
      }
    }

    function updateHomeSummaries() {
      updateActivityRings();
    }

    // Initial render
    updateWaterUI();
    updateDistanceUI();
    renderWeightWeeks();
    renderCustomTrackers();
    updateHomeSummaries();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
