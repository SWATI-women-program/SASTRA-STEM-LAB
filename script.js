/* =============================================================================
   CSR STEM Lab Portal - script.js (refactored)
   -----------------------------------------------------------------------------
   Sections
     1. Configuration & lookup data
     2. Generic helpers (escaping, number/date parsing, formatting)
     3. State
     4. Data loading & saving (Google Apps Script API)
     5. Dashboard (metrics, chart, drill-down modal)
     6. Lists, grids & tables
     7. Forms (edit mode, validation, save)
     8. Map analytics (Leaflet, geocoding queue)
     9. UI plumbing (tabs, modal, toast, CSV export, event binding, init)
   ============================================================================= */
'use strict';

(() => {

/* =============================================================================
   1. CONFIGURATION & LOOKUP DATA
   ============================================================================= */

const CONFIG = Object.freeze({
    // Google Apps Script Web App URL
    API_URL: "https://script.google.com/macros/s/AKfycbxwwfj2lz8RZA81amrGzHnGchiubY-BmxQnUW3bt_5jGmb0cZnbNkV0Z1fNm4fYRFsd/exec",
    REQUEST_TIMEOUT_MS: 30000,
    GEOCODE_TIMEOUT_MS: 15000,
    GEOCODE_DELAY_MS: 1100,               // Nominatim usage policy: max 1 request / second
    GEOCODE_CACHE_KEY: 'csr_portal_geocache_v1',
    SEARCH_DEBOUNCE_MS: 250,
    TN_CENTER: Object.freeze({ lat: 11.1271, lon: 78.6569 }),
    CHENNAI_CENTER: Object.freeze({ lat: 13.0827, lon: 80.2707 })
});

// The sheet may return columns as Snake_Case, snake_case or "Spaced Names".
// Every lookup goes through these lists so all screens read the data the same way.
const FIELD = Object.freeze({
    id:            ['ID', 'Id', 'id'],
    funderName:    ['Funder_Name', 'funder_name', 'Funder Name', 'Funder'],
    schoolName:    ['School_Name', 'school_name', 'School Name'],
    vendorName:    ['Vendor_Name', 'vendor_name', 'Vendor Name'],
    totalFund:     ['Total_Fund', 'total_fund', 'Total Fund'],
    confirmDate:   ['Confirm_Date', 'Confirm Date', 'Confirmed_Date'],
    receivedDate:  ['Received_Date', 'Received Date'],
    contact:       ['Contact_Number', 'contact_number', 'Contact Number'],
    category:      ['Category', 'category'],
    status:        ['Status', 'status'],
    district:      ['District', 'district'],
    address:       ['School Address', 'School_Address', 'Address'],
    lat:           ['Latitude', 'lat', 'Lat'],
    lon:           ['Longitude', 'lng', 'Lon', 'Long'],
    financialYear: ['Financial_Year', 'financial_year', 'Financial Year'],
    service:       ['Service', 'service'],
    unitCost:      ['Unit_Cost', 'unit_cost', 'Unit Cost'],
    unitsSold:     ['Units_Sold', 'Units Sold'],
    units:         ['Units', 'units'],
    amountPaid:    ['Amount_Paid', 'amount_paid', 'Amount Paid'],
    amountPending: ['Amount_Pending', 'amount_pending', 'Amount Pending'],
    amount:        ['Amount', 'amount'],
    description:   ['Description', 'description']
});

// One entry per editable record type.
const FORMS = Object.freeze({
    funder:   { form: 'funderForm',   idInput: 'funderId', cancel: 'funderCancelBtn',   list: 'funders',       tab: 'funders',    label: 'Funder' },
    school:   { form: 'schoolForm',   idInput: 'schoolId', cancel: 'schoolCancelBtn',   list: 'schools',       tab: 'schools',    label: 'School' },
    vendor:   { form: 'vendorForm',   idInput: 'vendorId', cancel: 'vendorCancelBtn',   list: 'vendors',       tab: 'vendors',    label: 'Vendor' },
    activity: { form: 'activityForm', idInput: 'actId',    cancel: 'activityCancelBtn', list: 'activities',    tab: 'activities', label: 'Activity' },
    csr:      { form: 'csrForm',      idInput: 'csrId',    cancel: 'csrCancelBtn',      list: 'disbursements', tab: 'sastracsr',  label: 'Disbursement' }
});

// Approximate district headquarters, used only when a school has no usable
// coordinates and no address that could be geocoded.
const DISTRICT_CENTERS = Object.freeze({
    'ariyalur': { lat: 11.1401, lon: 79.0786 },
    'chengalpattu': { lat: 12.6819, lon: 79.9888 },
    'chennai': { lat: 13.0827, lon: 80.2707 },
    'coimbatore': { lat: 11.0168, lon: 76.9558 },
    'cuddalore': { lat: 11.7480, lon: 79.7714 },
    'dharmapuri': { lat: 12.1211, lon: 78.1582 },
    'dindigul': { lat: 10.3673, lon: 77.9803 },
    'erode': { lat: 11.3410, lon: 77.7172 },
    'kallakurichi': { lat: 11.7384, lon: 78.9639 },
    'kancheepuram': { lat: 12.8342, lon: 79.7036 },
    'kanyakumari': { lat: 8.1833, lon: 77.4119 },
    'karur': { lat: 10.9601, lon: 78.0766 },
    'krishnagiri': { lat: 12.5266, lon: 78.2140 },
    'madurai': { lat: 9.9252, lon: 78.1198 },
    'mayiladuthurai': { lat: 11.1018, lon: 79.6521 },
    'nagapattinam': { lat: 10.7672, lon: 79.8449 },
    'namakkal': { lat: 11.2189, lon: 78.1677 },
    'nilgiris': { lat: 11.4102, lon: 76.6950 },
    'perambalur': { lat: 11.2342, lon: 78.8807 },
    'pudukkottai': { lat: 10.3833, lon: 78.8001 },
    'ramanathapuram': { lat: 9.3639, lon: 78.8395 },
    'ranipet': { lat: 12.9224, lon: 79.3333 },
    'salem': { lat: 11.6643, lon: 78.1460 },
    'sivaganga': { lat: 9.8433, lon: 78.4809 },
    'tenkasi': { lat: 8.9594, lon: 77.3152 },
    'thanjavur': { lat: 10.7870, lon: 79.1378 },
    'theni': { lat: 10.0104, lon: 77.4768 },
    'thoothukudi': { lat: 8.7642, lon: 78.1348 },
    'tiruchirappalli': { lat: 10.7905, lon: 78.7047 },
    'tirunelveli': { lat: 8.7139, lon: 77.7567 },
    'tirupathur': { lat: 12.4963, lon: 78.5730 },
    'tiruppur': { lat: 11.1085, lon: 77.3411 },
    'tiruvallur': { lat: 13.1439, lon: 79.9080 },
    'tiruvannamalai': { lat: 12.2253, lon: 79.0747 },
    'tiruvarur': { lat: 10.7661, lon: 79.6344 },
    'vellore': { lat: 12.9165, lon: 79.1325 },
    'viluppuram': { lat: 11.9401, lon: 79.4861 },
    'virudhunagar': { lat: 9.5850, lon: 77.9570 }
});

// Common alternate spellings -> key used in DISTRICT_CENTERS.
const DISTRICT_ALIASES = Object.freeze({
    'kanchipuram': 'kancheepuram',
    'kanniyakumari': 'kanyakumari',
    'trichy': 'tiruchirappalli',
    'tiruchi': 'tiruchirappalli',
    'tiruchirapalli': 'tiruchirappalli',
    'tuticorin': 'thoothukudi',
    'villupuram': 'viluppuram',
    'tanjore': 'thanjavur',
    'ooty': 'nilgiris',
    'the nilgiris': 'nilgiris',
    'udhagamandalam': 'nilgiris',
    'tirupattur': 'tirupathur',
    'tirupur': 'tiruppur',
    'thiruvallur': 'tiruvallur',
    'thiruvarur': 'tiruvarur',
    'thiruvannamalai': 'tiruvannamalai',
    'pudukottai': 'pudukkottai',
    'thirunelveli': 'tirunelveli'
});

// Generous bounding box around Tamil Nadu. Used to sanity-check geocoder hits
// and to detect latitude/longitude typed the wrong way round.
const TN_BOUNDS = Object.freeze({ minLat: 7.5, maxLat: 14.5, minLon: 75.5, maxLon: 81.0 });

/* =============================================================================
   2. GENERIC HELPERS
   ============================================================================= */

const $ = (id) => document.getElementById(id);

function on(id, eventName, handler) {
    const el = $(id);
    if (el) el.addEventListener(eventName, handler);
}

/** Escape text before it is placed into an HTML string. */
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}

/**
 * First non-blank value among `keys`. Unlike `a || b`, a legitimate 0 is kept.
 */
function pick(row, keys, fallback = '') {
    if (!row) return fallback;
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return fallback;
}

const getField = (row, name, fallback = '') => pick(row, FIELD[name], fallback);

/** Tolerant number parser: handles "1,00,000", "₹500", blanks and junk. */
function toNumber(value, fallback = 0) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (value === null || value === undefined) return fallback;
    const cleaned = String(value).replace(/[₹,\s]/g, '');
    if (cleaned === '') return fallback;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const INR_WHOLE = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const INR_DECIMAL = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,00,000 / -₹5,000 / ₹1,250.50 */
function formatINR(value) {
    const n = round2(toNumber(value));
    const abs = Math.abs(n);
    const body = Number.isInteger(abs) ? INR_WHOLE.format(abs) : INR_DECIMAL.format(abs);
    return `${n < 0 ? '-' : ''}₹${body}`;
}

/** Number -> value for an <input type="number"> ('' when not numeric). */
function numberToInput(value) {
    if (value === '' || value === null || value === undefined) return '';
    const n = toNumber(value, NaN);
    return Number.isFinite(n) ? String(n) : '';
}

const norm = (value) => String(value ?? '').trim().toLowerCase();
const sameText = (a, b) => norm(a) === norm(b);
const unique = (items) => [...new Set(items)];

function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sheet dates arrive as ISO timestamps in UTC. For a user in India (UTC+5:30)
 * "2025-03-15" is serialised as "2025-03-14T18:30:00.000Z", so splitting on 'T'
 * shows the previous day. Convert to the browser's local calendar date instead.
 */
function toInputDate(value) {
    if (value === '' || value === null || value === undefined) return '';
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyData() {
    return { funders: [], schools: [], vendors: [], activities: [], disbursements: [] };
}

function nextId(list) {
    const max = list.reduce((m, row) => Math.max(m, toNumber(getField(row, 'id'))), 0);
    return Math.floor(max) + 1;
}

/* =============================================================================
   3. STATE
   ============================================================================= */

let globalData = emptyData();
let chartInstance = null;
let chartUnavailable = false;
let fetchSeq = 0;                 // lets a newer fetch supersede an older one
let isSubmitting = false;
let lastModalTrigger = null;

// ID of the record currently loaded into each form (null = creating a new one).
const editing = { funder: null, school: null, vendor: null, activity: null, csr: null };

// Map state
let map = null;
let markersGroup = null;
let currentMapMode = 'tn';
let pendingMapFit = false;

/* =============================================================================
   4. DATA LOADING & SAVING
   ============================================================================= */

async function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function normalizeData(data) {
    const list = (value) => (Array.isArray(value) ? value : []);
    return {
        funders: list(data && data.funders),
        schools: list(data && data.schools),
        vendors: list(data && data.vendors),
        activities: list(data && data.activities),
        disbursements: list(data && data.disbursements)
    };
}

function setSyncing(isSyncing) {
    const btn = $('syncBtn');
    if (!btn) return;
    btn.disabled = isSyncing;
    btn.setAttribute('aria-busy', String(isSyncing));
    const icon = btn.querySelector('i');
    if (icon) icon.classList.toggle('fa-spin', isSyncing);
}

async function fetchData() {
    const seq = ++fetchSeq;
    setSyncing(true);
    try {
        const response = await fetchWithTimeout(CONFIG.API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (seq !== fetchSeq) return;                    // a newer request is in flight
        if (data && data.error) throw new Error(String(data.error));

        globalData = normalizeData(data);
        renderAll();
    } catch (error) {
        if (seq !== fetchSeq) return;
        console.error('Data loading failed:', error);
        showToast('Data loading failed. Please check permissions.', 'error');
    } finally {
        if (seq === fetchSeq) setSyncing(false);
    }
}

/** Re-render everything that depends on the sheet data. */
function renderAll() {
    populateDropdowns();
    renderFunderTable();
    filterSchools();
    filterVendors();
    filterActivities();
    renderCSRBalances();
    renderDisbursementTable();
    calculateMetrics();
    setNextIDs();
    showSelectedCSRBalance();
    populateMapDropdowns();
    applyMapFilters();
}

async function parseJsonSafe(response) {
    try {
        return await response.json();
    } catch (_) {
        return null;      // Apps Script may legitimately answer with plain text
    }
}

async function sendData(payload, kind) {
    if (isSubmitting) return false;
    isSubmitting = true;
    setFormsDisabled(true);
    try {
        const response = await fetchWithTimeout(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await parseJsonSafe(response);
        if (result && (result.success === false || result.status === 'error' || result.error)) {
            throw new Error(result.message || result.error || 'The server rejected the request.');
        }

        showToast('Record Saved Successfully!', 'success');
        resetForm(kind);
        await fetchData();
        return true;
    } catch (error) {
        console.error('Save failed:', error);
        showToast('Failed to save data!', 'error');
        return false;
    } finally {
        isSubmitting = false;
        setFormsDisabled(false);
    }
}

function setFormsDisabled(disabled) {
    document.querySelectorAll('form button[type="submit"]').forEach((btn) => { btn.disabled = disabled; });
}

/* =============================================================================
   5. DASHBOARD
   ============================================================================= */

function vendorAmounts(v) {
    const unitCost = toNumber(getField(v, 'unitCost'));
    const units = toNumber(getField(v, 'unitsSold'));
    const paid = toNumber(getField(v, 'amountPaid'));
    const storedPending = getField(v, 'amountPending', null);
    const computed = unitCost * units;
    const pending = storedPending !== null ? toNumber(storedPending) : Math.max(computed - paid, 0);
    const total = computed > 0 ? computed : paid + pending;
    return { unitCost, units, paid, pending, total };
}

function activityAmounts(a) {
    const unitCost = toNumber(getField(a, 'unitCost'));
    const rawUnits = toNumber(getField(a, 'units'), 1);
    const units = rawUnits > 0 ? rawUnits : 1;
    const paid = toNumber(getField(a, 'amountPaid'));
    const storedPending = getField(a, 'amountPending', null);
    const computed = unitCost * units;
    const pending = storedPending !== null ? toNumber(storedPending) : Math.max(computed - paid, 0);
    const total = computed > 0 ? computed : paid + pending;
    return { unitCost, units, paid, pending, total };
}

/**
 * Single source of truth for fund / expense / pending figures.
 * `funderName === null` means "all funders".
 */
function computeTotals(funderName = null, { excludeDisbursementId = null } = {}) {
    const matches = (row) => funderName === null || sameText(getField(row, 'funderName'), funderName);
    let totalFund = 0;
    let expense = 0;
    let pending = 0;

    globalData.funders.forEach((f) => {
        if (matches(f)) totalFund += toNumber(getField(f, 'totalFund'));
    });
    globalData.vendors.forEach((v) => {
        if (!matches(v)) return;
        const amounts = vendorAmounts(v);
        expense += amounts.paid;
        pending += amounts.pending;
    });
    globalData.activities.forEach((a) => {
        if (!matches(a)) return;
        const amounts = activityAmounts(a);
        expense += amounts.paid;
        pending += amounts.pending;
    });
    globalData.disbursements.forEach((d) => {
        if (!matches(d)) return;
        if (excludeDisbursementId !== null && String(getField(d, 'id')) === String(excludeDisbursementId)) return;
        expense += toNumber(getField(d, 'amount'));
    });

    return { totalFund, expense, pending, balance: totalFund - expense };
}

function getSelectedDashboardFunder() {
    const select = $('funderFilter');
    return !select || select.value === 'ALL' ? null : select.value;
}

function calculateMetrics() {
    const totals = computeTotals(getSelectedDashboardFunder());

    const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    setText('totalFund', formatINR(totals.totalFund));
    setText('totalExpense', formatINR(totals.expense));
    setText('balance', formatINR(totals.balance));
    setText('vendorPending', formatINR(totals.pending));

    renderChart(totals);
}

function renderChart(totals) {
    if (chartUnavailable) return;
    const canvas = $('financialChart');
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
        chartUnavailable = true;
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = '<p class="empty-state">The chart library could not be loaded. Check your internet connection and reload.</p>';
        }
        return;
    }

    const values = [totals.totalFund, totals.expense, totals.pending];

    if (chartInstance) {
        chartInstance.data.datasets[0].data = values;
        chartInstance.update();
        return;
    }

    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Total Funds Received', 'Total Expenses', 'Total Pending'],
            datasets: [{
                label: 'Financials (in ₹)',
                data: values,
                backgroundColor: ['#4f46e5', '#ef4444', '#f59e0b'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => formatINR(ctx.parsed.y) } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: (value) => formatINR(value) } }
            }
        }
    });
}

function populateDropdowns() {
    const funderNames = unique(
        globalData.funders.map((f) => String(getField(f, 'funderName')).trim()).filter(Boolean)
    );
    const funderOptions = funderNames.map((name) => ({ value: name, label: name }));

    fillSelect('funderFilter', funderOptions, 'All Funders Overview');
    fillSelect('schoolFunderFilter', funderOptions, 'All Funders');
    fillSelect('vendorFunderFilter', funderOptions, 'All Funders');
    fillSelect('activityFunderFilter', funderOptions, 'All Funders');

    fillSelect('schoolFunderSelect', funderOptions);
    fillSelect('vendorFunderSelect', funderOptions);
    fillSelect('actFunderSelect', funderOptions);
    fillSelect('csrFunderSelect', funderOptions);

    const schoolOptions = [];
    const seenSchools = new Set();
    globalData.schools.forEach((s) => {
        const name = String(getField(s, 'schoolName')).trim();
        if (!name || seenSchools.has(norm(name))) return;
        seenSchools.add(norm(name));
        schoolOptions.push({ value: name, label: `#${getField(s, 'id')} - ${name}` });
    });
    fillSelect('csrSchoolSelect', schoolOptions);

    const years = unique(
        globalData.vendors.map((v) => String(getField(v, 'financialYear')).trim()).filter(Boolean)
    ).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    fillSelect('vendorYearFilter', years.map((y) => ({ value: y, label: y })), 'All Years');
}

/**
 * Rebuild a <select>, keeping the user's current choice when it still exists
 * (so a background sync does not reset filters or half-filled forms).
 */
function fillSelect(id, options, allLabel = null) {
    const select = $(id);
    if (!select) return;
    const previous = select.value;
    const parts = [];
    if (allLabel) parts.push(`<option value="ALL">${escapeHtml(allLabel)}</option>`);
    options.forEach((o) => parts.push(`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`));
    select.innerHTML = parts.join('');
    if (previous && Array.from(select.options).some((o) => o.value === previous)) {
        select.value = previous;
    }
}

/**
 * Select `value` in a <select>.
 *  - allowAdd: add the value as an option when missing (used for funder/school links so
 *              an orphaned name is preserved instead of silently blanked).
 *  - fallback: value to use when `value` is blank or not an option (fixed lists).
 */
function setSelectValue(id, value, { allowAdd = false, fallback = null } = {}) {
    const select = $(id);
    if (!select) return;
    const text = String(value ?? '').trim();
    const exists = text !== '' && Array.from(select.options).some((o) => o.value === text);

    if (exists) {
        select.value = text;
    } else if (text !== '' && allowAdd) {
        const option = document.createElement('option');
        option.value = text;
        option.textContent = `${text} (not in list)`;
        select.appendChild(option);
        select.value = text;
    } else if (fallback !== null) {
        select.value = fallback;
    }
}

/* =============================================================================
   6. LISTS, GRIDS & TABLES
   ============================================================================= */

const value = (id, fallback = '') => {
    const el = $(id);
    return el ? el.value : fallback;
};

const emptyRow = (cols, message) =>
    `<tr><td colspan="${cols}" class="empty-state">${escapeHtml(message)}</td></tr>`;

const emptyCard = (message) =>
    `<div class="empty-state grid-empty">${escapeHtml(message)}</div>`;

function editButton(kind, id, { label = 'Edit', block = false, large = false } = {}) {
    const safeId = escapeHtml(id);
    const classes = ['btn', large ? 'btn-spaced' : 'btn-action', 'btn-primary', block ? 'btn-block' : '']
        .filter(Boolean).join(' ');
    return `<button type="button" class="${classes}"
                data-action="edit" data-kind="${kind}" data-id="${safeId}"
                aria-label="Edit ${kind} #${safeId}">
                <i class="fa-solid fa-pen" aria-hidden="true"></i>${label ? ` ${escapeHtml(label)}` : ''}
            </button>`;
}

function statusClass(status) {
    switch (norm(status)) {
        case 'completed': return 'badge-status--completed';
        case 'pending': return 'badge-status--pending';
        default: return 'badge-status--progress';
    }
}

function renderFunderTable() {
    const tbody = document.querySelector('#funderTable tbody');
    if (!tbody) return;

    if (globalData.funders.length === 0) {
        tbody.innerHTML = emptyRow(6, 'No funders added yet.');
        return;
    }

    tbody.innerHTML = globalData.funders.map((f) => {
        const id = getField(f, 'id');
        return `
            <tr>
                <td>#${escapeHtml(id)}</td>
                <td><b>${escapeHtml(getField(f, 'funderName'))}</b></td>
                <td>${escapeHtml(toInputDate(getField(f, 'confirmDate')) || '-')}</td>
                <td>${escapeHtml(toInputDate(getField(f, 'receivedDate')) || '-')}</td>
                <td>${escapeHtml(formatINR(getField(f, 'totalFund')))}</td>
                <td>${editButton('funder', id)}</td>
            </tr>`;
    }).join('');
}

function renderSchoolGrid(schools) {
    const container = $('schoolContainer');
    if (!container) return;

    if (schools.length === 0) {
        container.innerHTML = emptyCard('No matching schools found for selected filters.');
        return;
    }

    container.innerHTML = schools.map((s) => {
        const id = getField(s, 'id');
        const status = getField(s, 'status', 'In Progress');
        return `
            <div class="school-card">
                <div class="school-card-body">
                    <span class="badge">${escapeHtml(getField(s, 'category', 'General'))}</span>
                    <span class="badge badge-status ${statusClass(status)}">${escapeHtml(status)}</span>
                    <h3>#${escapeHtml(id)} ${escapeHtml(getField(s, 'schoolName', 'School Name'))}</h3>
                    <div class="school-info">Funder: <b>${escapeHtml(getField(s, 'funderName', 'N/A'))}</b></div>
                    <div class="school-info">Contact: <b>${escapeHtml(getField(s, 'contact', 'N/A'))}</b></div>
                    <div class="card-actions">${editButton('school', id, { label: 'Edit Entry', block: true })}</div>
                </div>
            </div>`;
    }).join('');
}

function filterSchools() {
    const query = norm(value('schoolSearch'));
    const funder = value('schoolFunderFilter', 'ALL');
    const category = value('schoolCategoryFilter', 'ALL');
    const status = value('schoolStatusFilter', 'ALL');

    const filtered = globalData.schools.filter((s) => {
        const name = norm(getField(s, 'schoolName'));
        const id = String(getField(s, 'id'));
        return (name.includes(query) || id.includes(query))
            && (funder === 'ALL' || sameText(getField(s, 'funderName'), funder))
            && (category === 'ALL' || sameText(getField(s, 'category'), category))
            && (status === 'ALL' || sameText(getField(s, 'status'), status));
    });

    renderSchoolGrid(filtered);
}

function renderVendorGrid(vendors) {
    const container = $('vendorContainer');
    if (!container) return;

    if (vendors.length === 0) {
        container.innerHTML = emptyCard('No vendor registration for the selected CSR/Year.');
        return;
    }

    container.innerHTML = vendors.map((v) => {
        const id = getField(v, 'id');
        const amounts = vendorAmounts(v);
        return `
            <div class="school-card is-clickable" role="button" tabindex="0"
                 data-action="vendor-details" data-id="${escapeHtml(id)}">
                <div class="school-card-body">
                    <span class="badge">${escapeHtml(getField(v, 'financialYear', '-'))}</span>
                    <h3>#${escapeHtml(id)} ${escapeHtml(getField(v, 'vendorName', 'Vendor Name'))}</h3>
                    <div class="school-info">Funder: <b>${escapeHtml(getField(v, 'funderName', 'N/A'))}</b></div>
                    <div class="school-info">Service: <b>${escapeHtml(getField(v, 'service', 'N/A'))}</b></div>
                    <div class="school-info">Total Bill: <b>${escapeHtml(formatINR(amounts.total))}</b></div>
                    <div class="school-info">Paid: <b class="text-success">${escapeHtml(formatINR(amounts.paid))}</b></div>
                    <div class="school-info">Pending: <b class="text-danger">${escapeHtml(formatINR(amounts.pending))}</b></div>
                    <div class="card-actions">${editButton('vendor', id, { label: 'Edit Entry', block: true })}</div>
                </div>
            </div>`;
    }).join('');
}

function filterVendors() {
    const funder = value('vendorFunderFilter', 'ALL');
    const year = value('vendorYearFilter', 'ALL');

    const filtered = globalData.vendors.filter((v) =>
        (funder === 'ALL' || sameText(getField(v, 'funderName'), funder))
        && (year === 'ALL' || sameText(getField(v, 'financialYear'), year))
    );

    renderVendorGrid(filtered);
}

function renderActivityGrid(activities) {
    const container = $('activityContainer');
    if (!container) return;

    if (activities.length === 0) {
        container.innerHTML = emptyCard('No activity records.');
        return;
    }

    container.innerHTML = activities.map((a) => {
        const id = getField(a, 'id');
        const amounts = activityAmounts(a);
        return `
            <div class="school-card">
                <div class="school-card-body">
                    <span class="badge">${escapeHtml(getField(a, 'category', 'Activity'))}</span>
                    <h3>#${escapeHtml(id)} ${escapeHtml(getField(a, 'vendorName', 'Vendor'))}</h3>
                    <div class="school-info">Funder: <b>${escapeHtml(getField(a, 'funderName', 'N/A'))}</b></div>
                    <div class="school-info">Description: <b>${escapeHtml(getField(a, 'description', 'N/A'))}</b></div>
                    <div class="school-info">Total Bill: <b>${escapeHtml(formatINR(amounts.total))}</b></div>
                    <div class="school-info">Paid: <b class="text-success">${escapeHtml(formatINR(amounts.paid))}</b></div>
                    <div class="school-info">Pending: <b class="text-danger">${escapeHtml(formatINR(amounts.pending))}</b></div>
                    <div class="card-actions">${editButton('activity', id, { label: 'Edit Entry', block: true })}</div>
                </div>
            </div>`;
    }).join('');
}

function filterActivities() {
    const funder = value('activityFunderFilter', 'ALL');
    const category = value('activityCategoryFilter', 'ALL');

    const filtered = globalData.activities.filter((a) =>
        (funder === 'ALL' || sameText(getField(a, 'funderName'), funder))
        && (category === 'ALL' || sameText(getField(a, 'category'), category))
    );

    renderActivityGrid(filtered);
}

function renderCSRBalances() {
    const container = $('csrBalanceContainer');
    if (!container) return;

    const names = unique(
        globalData.funders.map((f) => String(getField(f, 'funderName')).trim()).filter(Boolean)
    );

    if (names.length === 0) {
        container.innerHTML = emptyCard('No CSR records found.');
        return;
    }

    container.innerHTML = names.map((name) => {
        const totals = computeTotals(name);
        const pct = totals.totalFund > 0
            ? Math.min(100, Math.round((totals.expense / totals.totalFund) * 100))
            : 0;
        const cardType = totals.balance < 0 ? 'danger' : (totals.balance === 0 ? 'warning' : 'success');

        return `
            <div class="metric-card ${cardType}">
                <div class="metric-header">
                    <h3>${escapeHtml(name)}</h3>
                    <div class="icon-box"><i class="fa-solid fa-building-columns" aria-hidden="true"></i></div>
                </div>
                <p>${escapeHtml(formatINR(totals.balance))}</p>
                <div class="metric-note">
                    Total Fund: ${escapeHtml(formatINR(totals.totalFund))}<br>
                    Used: ${escapeHtml(formatINR(totals.expense))} (${pct}%)
                </div>
            </div>`;
    }).join('');
}

function renderDisbursementTable() {
    const tbody = document.querySelector('#csrTable tbody');
    if (!tbody) return;

    if (globalData.disbursements.length === 0) {
        tbody.innerHTML = emptyRow(6, 'No disbursements found.');
        return;
    }

    tbody.innerHTML = globalData.disbursements.map((d) => {
        const id = getField(d, 'id');
        const category = getField(d, 'category', '') || getField(d, 'description', '-');
        return `
            <tr>
                <td>#${escapeHtml(id)}</td>
                <td><b>${escapeHtml(getField(d, 'schoolName', '-'))}</b></td>
                <td>${escapeHtml(getField(d, 'funderName', '-'))}</td>
                <td><span class="badge">${escapeHtml(category)}</span></td>
                <td>${escapeHtml(formatINR(getField(d, 'amount')))}</td>
                <td>${editButton('csr', id, { label: '' })}</td>
            </tr>`;
    }).join('');
}

function showSelectedCSRBalance() {
    const funderSelect = $('csrFunderSelect');
    const hint = $('csrBalanceHint');
    if (!funderSelect || !hint) return;

    const name = funderSelect.value;
    hint.classList.remove('is-positive', 'is-negative');
    if (!name) {
        hint.textContent = '';
        return;
    }

    const available = computeTotals(name, { excludeDisbursementId: editing.csr }).balance;
    const amount = toNumber(value('csrAmount'));
    const exceeds = amount > available;

    hint.textContent = `Available Balance in "${name}": ${formatINR(available)}`
        + (exceeds ? ' - the amount entered is more than this balance' : '');
    hint.classList.add(available > 0 && !exceeds ? 'is-positive' : 'is-negative');
}

/* ---------- Dashboard drill-down modal ---------- */

function buildDetailsTable(headings, rowsHtml) {
    const head = headings.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const body = rowsHtml.length
        ? rowsHtml.join('')
        : emptyRow(headings.length, 'Nothing to show for the selected funder.');
    return `<div class="details-scroll"><table class="details-table">
                <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
            </table></div>`;
}

function showDashboardDetails(type) {
    const funder = getSelectedDashboardFunder();
    const matches = (row) => funder === null || sameText(getField(row, 'funderName'), funder);
    const rows = [];
    let title = '';
    let headings = [];

    if (type === 'totalFund') {
        title = 'Total Funds Summary';
        headings = ['ID', 'Funder', 'Total Fund', 'Action'];
        globalData.funders.filter(matches).forEach((f) => {
            const id = getField(f, 'id');
            rows.push(`<tr>
                <td>#${escapeHtml(id)}</td>
                <td><b>${escapeHtml(getField(f, 'funderName'))}</b></td>
                <td>${escapeHtml(formatINR(getField(f, 'totalFund')))}</td>
                <td>${editButton('funder', id, { label: '' })}</td>
            </tr>`);
        });
    } else if (type === 'expenses' || type === 'pending') {
        const isExpense = type === 'expenses';
        const amountClass = isExpense ? 'text-success' : 'text-danger';
        title = isExpense ? 'Expenses Summary (Vendors, Activities & CSR)' : 'Pending Payments (Vendors & Activities)';
        headings = ['Type', 'Name / Category', 'Funder', isExpense ? 'Paid' : 'Pending', 'Action'];

        globalData.vendors.filter(matches).forEach((v) => {
            const amounts = vendorAmounts(v);
            const amount = isExpense ? amounts.paid : amounts.pending;
            if (amount <= 0) return;
            const id = getField(v, 'id');
            rows.push(`<tr>
                <td><span class="badge badge--vendor">Vendor</span></td>
                <td><b>${escapeHtml(getField(v, 'vendorName', 'Vendor'))}</b></td>
                <td>${escapeHtml(getField(v, 'funderName', 'N/A'))}</td>
                <td class="${amountClass} fw">${escapeHtml(formatINR(amount))}</td>
                <td>${editButton('vendor', id, { label: '' })}</td>
            </tr>`);
        });

        globalData.activities.filter(matches).forEach((a) => {
            const amounts = activityAmounts(a);
            const amount = isExpense ? amounts.paid : amounts.pending;
            if (amount <= 0) return;
            const id = getField(a, 'id');
            const name = getField(a, 'vendorName', '') || getField(a, 'category', 'Activity');
            rows.push(`<tr>
                <td><span class="badge badge--activity">Activity</span></td>
                <td><b>${escapeHtml(name)}</b><br><small>${escapeHtml(getField(a, 'description'))}</small></td>
                <td>${escapeHtml(getField(a, 'funderName', 'N/A'))}</td>
                <td class="${amountClass} fw">${escapeHtml(formatINR(amount))}</td>
                <td>${editButton('activity', id, { label: '' })}</td>
            </tr>`);
        });

        if (isExpense) {
            globalData.disbursements.filter(matches).forEach((d) => {
                const amount = toNumber(getField(d, 'amount'));
                if (amount <= 0) return;
                const id = getField(d, 'id');
                rows.push(`<tr>
                    <td><span class="badge badge--csr">CSR to School</span></td>
                    <td><b>${escapeHtml(getField(d, 'schoolName', '-'))}</b></td>
                    <td>${escapeHtml(getField(d, 'funderName', 'N/A'))}</td>
                    <td class="${amountClass} fw">${escapeHtml(formatINR(amount))}</td>
                    <td>${editButton('csr', id, { label: '' })}</td>
                </tr>`);
            });
        }
    } else {
        return;
    }

    openModal(title, buildDetailsTable(headings, rows));
}

function showVendorDetails(id) {
    const vendor = globalData.vendors.find((v) => String(getField(v, 'id')) === String(id));
    if (!vendor) {
        showToast('That vendor is no longer available. Please refresh.', 'error');
        return;
    }
    const amounts = vendorAmounts(vendor);

    openModal(getField(vendor, 'vendorName', 'Vendor Details'), `
        <div class="details-list">
            <p><b>Vendor ID:</b> #${escapeHtml(getField(vendor, 'id'))}</p>
            <p><b>Associated Funder:</b> ${escapeHtml(getField(vendor, 'funderName', 'N/A'))}</p>
            <p><b>Financial Year:</b> ${escapeHtml(getField(vendor, 'financialYear', '-'))}</p>
            <p><b>Service Provided:</b> ${escapeHtml(getField(vendor, 'service', 'N/A'))}</p>
            <hr>
            <p><b>Unit Cost:</b> ${escapeHtml(formatINR(amounts.unitCost))}</p>
            <p><b>Units Delivered/Sold:</b> ${escapeHtml(amounts.units)}</p>
            <p><b>Total Amount:</b> ${escapeHtml(formatINR(amounts.total))}</p>
            <p><b>Paid Amount:</b> <span class="text-success fw">${escapeHtml(formatINR(amounts.paid))}</span></p>
            <p><b>Balance Pending:</b> <span class="text-danger fw">${escapeHtml(formatINR(amounts.pending))}</span></p>
            ${editButton('vendor', getField(vendor, 'id'), { label: 'Edit Vendor Info', large: true })}
        </div>`);
}

/* =============================================================================
   7. FORMS
   ============================================================================= */

function setEditMode(kind, recordId) {
    const cfg = FORMS[kind];
    const isEditing = recordId !== null;
    editing[kind] = isEditing ? String(recordId) : null;

    const idInput = $(cfg.idInput);
    if (idInput) idInput.readOnly = isEditing;      // changing the ID mid-edit would create a different record

    const cancelBtn = $(cfg.cancel);
    if (cancelBtn) cancelBtn.hidden = !isEditing;

    const form = $(cfg.form);
    if (form) form.classList.toggle('is-editing', isEditing);
}

function resetForm(kind) {
    const form = $(FORMS[kind].form);
    if (form) form.reset();
    setEditMode(kind, null);
    if (kind === 'vendor') calculateVendorTotal();
    if (kind === 'activity') calculateActivityTotal();
    setNextIDs();
    if (kind === 'csr') showSelectedCSRBalance();
}

/** Suggest the next free ID, but never overwrite an ID that is loaded for editing. */
function setNextIDs() {
    Object.keys(FORMS).forEach((kind) => {
        if (editing[kind] !== null) return;
        const input = $(FORMS[kind].idInput);
        if (input) input.value = nextId(globalData[FORMS[kind].list]);
    });
}

/** Pending = total - paid. If no price/quantity is known, keep what the record already says. */
function updatePendingField(inputId, total, paid, isEditing) {
    const input = $(inputId);
    if (!input) return;
    if (total > 0) {
        input.value = String(round2(Math.max(total - paid, 0)));
    } else if (!isEditing) {
        input.value = '0';
    }
}

function calculateVendorTotal() {
    const total = toNumber(value('vendorUnitCost')) * toNumber(value('vendorUnits'));
    updatePendingField('vendorPendingAmt', total, toNumber(value('vendorPaid')), editing.vendor !== null);
}

function calculateActivityTotal() {
    const rawUnits = toNumber(value('actUnits'), 1);
    const units = rawUnits > 0 ? rawUnits : 1;
    const total = toNumber(value('actUnitCost')) * units;
    updatePendingField('actPending', total, toNumber(value('actPaid')), editing.activity !== null);
}

/* ---------- Loading a record into its form ---------- */

function fillForm(kind, record) {
    switch (kind) {
        case 'funder':
            $('funderId').value = getField(record, 'id');
            $('funderName').value = getField(record, 'funderName');
            $('funderConfirmDate').value = toInputDate(getField(record, 'confirmDate'));
            $('funderReceivedDate').value = toInputDate(getField(record, 'receivedDate'));
            $('funderTotalAmount').value = numberToInput(getField(record, 'totalFund'));
            break;

        case 'school':
            $('schoolId').value = getField(record, 'id');
            $('schoolName').value = getField(record, 'schoolName');
            setSelectValue('schoolFunderSelect', getField(record, 'funderName'), { allowAdd: true });
            $('schoolContact').value = getField(record, 'contact');
            setSelectValue('schoolCategory', getField(record, 'category'), { fallback: 'STEM Kits Only' });
            setSelectValue('schoolStatus', getField(record, 'status'), { fallback: 'In Progress' });
            break;

        case 'vendor': {
            const amounts = vendorAmounts(record);
            $('vendorId').value = getField(record, 'id');
            $('vendorName').value = getField(record, 'vendorName');
            setSelectValue('vendorFunderSelect', getField(record, 'funderName'), { allowAdd: true });
            $('vendorYear').value = getField(record, 'financialYear');
            $('vendorService').value = getField(record, 'service');
            $('vendorUnitCost').value = numberToInput(getField(record, 'unitCost'));
            $('vendorUnits').value = numberToInput(getField(record, 'unitsSold'));
            $('vendorPaid').value = numberToInput(getField(record, 'amountPaid'));
            $('vendorPendingAmt').value = String(round2(amounts.pending));
            break;
        }

        case 'activity': {
            const amounts = activityAmounts(record);
            $('actId').value = getField(record, 'id');
            setSelectValue('actCategory', getField(record, 'category'), { fallback: 'Events & Monitoring' });
            setSelectValue('actFunderSelect', getField(record, 'funderName'), { allowAdd: true });
            $('actVendor').value = getField(record, 'vendorName');
            $('actDescription').value = getField(record, 'description');
            $('actUnitCost').value = numberToInput(getField(record, 'unitCost'));
            $('actUnits').value = String(amounts.units);
            $('actPaid').value = numberToInput(getField(record, 'amountPaid')) || '0';
            $('actPending').value = String(round2(amounts.pending));
            break;
        }

        case 'csr':
            $('csrId').value = getField(record, 'id');
            setSelectValue('csrSchoolSelect', getField(record, 'schoolName'), { allowAdd: true });
            setSelectValue('csrFunderSelect', getField(record, 'funderName'), { allowAdd: true });
            setSelectValue('csrCategory', getField(record, 'category'), { fallback: 'STEM Kits Only' });
            $('csrAmount').value = numberToInput(getField(record, 'amount'));
            break;

        default:
            break;
    }
}

/** Open the right tab, load the record into its form and bring the form into view. */
function goEdit(kind, id) {
    const cfg = FORMS[kind];
    if (!cfg) return;

    const record = globalData[cfg.list].find((r) => String(getField(r, 'id')) === String(id));
    if (!record) {
        showToast('That record is no longer available. Please refresh.', 'error');
        return;
    }

    closeModal();
    switchTab(cfg.tab);
    fillForm(kind, record);
    setEditMode(kind, id);
    if (kind === 'csr') showSelectedCSRBalance();

    // The page scrolls inside .main-content (not the window), so window.scrollTo()
    // would do nothing - scroll the form itself into view instead.
    const form = $(cfg.form);
    if (form) {
        const card = form.closest('.form-card') || form;
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const firstField = form.querySelector('input:not([readonly]):not([type="hidden"]), select');
        if (firstField) firstField.focus({ preventScroll: true });
    }
}

/* ---------- Validation helpers ---------- */

function fail(message) {
    showToast(message, 'error');
    return false;
}

/** Blank is allowed (optional field); anything typed must be a number >= 0. */
function isBlankOrNonNegative(raw) {
    const text = String(raw ?? '').trim();
    if (text === '') return true;
    const n = toNumber(text, NaN);
    return Number.isFinite(n) && n >= 0;
}

function allBlankOrNonNegative(inputIds) {
    return inputIds.every((id) => isBlankOrNonNegative(value(id)));
}

/** Saving with an ID that already exists silently overwrites that record, so confirm first. */
function confirmOverwriteIfNeeded(kind, id) {
    if (editing[kind] !== null) return true;
    const cfg = FORMS[kind];
    const exists = globalData[cfg.list].some((r) => String(getField(r, 'id')) === String(id));
    return !exists || window.confirm(
        `${cfg.label} ID #${id} already exists. Saving will overwrite that record. Continue?`
    );
}

/* ---------- Save handlers ---------- */

async function saveFunderData() {
    const id = value('funderId').trim();
    const name = value('funderName').trim();
    const totalText = value('funderTotalAmount').trim();
    const total = toNumber(totalText, NaN);

    if (!id) return fail('Funder ID is required.');
    if (!name) return fail('Funder name is required.');
    if (!Number.isFinite(total) || total < 0) return fail('Enter a valid fund amount (0 or more).');

    // Records are linked to funders by name, so two funders with one name would merge their totals.
    const duplicate = globalData.funders.find((f) =>
        sameText(getField(f, 'funderName'), name) && String(getField(f, 'id')) !== id
    );
    if (duplicate) return fail(`A funder named "${name}" already exists (ID #${getField(duplicate, 'id')}).`);

    if (!confirmOverwriteIfNeeded('funder', id)) return false;

    return sendData({
        action: 'saveFunder',
        data: {
            ID: id,
            Funder_Name: name,
            Confirm_Date: value('funderConfirmDate'),
            Received_Date: value('funderReceivedDate'),
            Total_Fund: String(total)
        }
    }, 'funder');
}

async function saveSchoolData() {
    const id = value('schoolId').trim();
    const name = value('schoolName').trim();
    const funder = value('schoolFunderSelect');
    const contact = value('schoolContact').trim();

    if (!id) return fail('School ID is required.');
    if (!name) return fail('School name is required.');
    if (!funder) return fail('Please select a funder. Add one on the Funder Details tab first.');
    if (!contact) return fail('Contact number is required.');
    if (!confirmOverwriteIfNeeded('school', id)) return false;

    return sendData({
        action: 'saveSchool',
        data: {
            ID: id,
            School_Name: name,
            Funder_Name: funder,
            Contact_Number: contact,
            Category: value('schoolCategory'),
            Status: value('schoolStatus')
        }
    }, 'school');
}

async function saveVendorData() {
    calculateVendorTotal();

    const id = value('vendorId').trim();
    const name = value('vendorName').trim();
    const funder = value('vendorFunderSelect');
    const year = value('vendorYear').trim();

    if (!id) return fail('Vendor ID is required.');
    if (!name) return fail('Vendor name is required.');
    if (!funder) return fail('Please select a funder. Add one on the Funder Details tab first.');
    if (!year) return fail('Financial / rate year is required.');
    if (!allBlankOrNonNegative(['vendorUnitCost', 'vendorUnits', 'vendorPaid'])) {
        return fail('Unit cost, quantity and amount paid cannot be negative.');
    }
    if (!confirmOverwriteIfNeeded('vendor', id)) return false;

    return sendData({
        action: 'saveVendor',
        data: {
            ID: id,
            Vendor_Name: name,
            Funder_Name: funder,
            Financial_Year: year,
            Service: value('vendorService').trim(),
            Unit_Cost: value('vendorUnitCost').trim(),
            Units_Sold: value('vendorUnits').trim(),
            Amount_Paid: value('vendorPaid').trim(),
            Amount_Pending: value('vendorPendingAmt').trim()
        }
    }, 'vendor');
}

async function saveActivityData() {
    calculateActivityTotal();

    const id = value('actId').trim();
    const vendor = value('actVendor').trim();
    const description = value('actDescription').trim();
    const funder = value('actFunderSelect');

    if (!id) return fail('Activity ID is required.');
    if (!funder) return fail('Please select a funder. Add one on the Funder Details tab first.');
    if (!vendor) return fail('Vendor / service provider is required.');
    if (!description) return fail('Activity description is required.');
    if (!allBlankOrNonNegative(['actUnitCost', 'actUnits', 'actPaid'])) {
        return fail('Unit cost, quantity and amount paid cannot be negative.');
    }
    if (!confirmOverwriteIfNeeded('activity', id)) return false;

    return sendData({
        action: 'saveActivity',
        data: {
            ID: id,
            Category: value('actCategory'),
            Funder_Name: funder,
            Vendor_Name: vendor,
            Description: description,
            Unit_Cost: value('actUnitCost').trim(),
            Units: value('actUnits').trim(),
            Amount_Paid: value('actPaid').trim(),
            Amount_Pending: value('actPending').trim()
        }
    }, 'activity');
}

async function saveDisbursementData() {
    const id = value('csrId').trim();
    const school = value('csrSchoolSelect');
    const funder = value('csrFunderSelect');

    if (!id) return fail('Disbursement ID is required.');
    if (!school) return fail('Please select a school. Add one on the Schools tab first.');
    if (!funder) return fail('Please select a CSR / funder. Add one on the Funder Details tab first.');
    if (!isBlankOrNonNegative(value('csrAmount'))) return fail('Amount cannot be negative.');
    if (!confirmOverwriteIfNeeded('csr', id)) return false;

    const amount = toNumber(value('csrAmount'), 0);
    const available = computeTotals(funder, { excludeDisbursementId: editing.csr }).balance;
    if (amount > available) {
        const proceed = window.confirm(
            `${formatINR(amount)} is more than the balance available in "${funder}" (${formatINR(available)}). Save anyway?`
        );
        if (!proceed) return false;
    }

    return sendData({
        action: 'saveDisbursement',
        data: {
            ID: id,
            School_Name: school,
            Funder_Name: funder,
            Category: value('csrCategory'),
            Amount: amount
        }
    }, 'csr');
}

/* =============================================================================
   8. MAP ANALYTICS
   ============================================================================= */

const GEOCODE_FAILURE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;   // retry unresolved addresses weekly

let lastMapBounds = [];
let geoCache = loadGeoCache();
const geoPending = new Map();     // cache key -> { query, callbacks[] }
const geoQueue = [];
let geoRunning = false;

function initMap() {
    if (map) return;
    const mapEl = $('map');
    if (!mapEl) return;

    if (typeof L === 'undefined') {
        mapEl.innerHTML = '<p class="empty-state map-error">The map library could not be loaded. Check your internet connection and reload.</p>';
        return;
    }

    map = L.map('map', { zoomControl: false }).setView([CONFIG.TN_CENTER.lat, CONFIG.TN_CENTER.lon], 7);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Fall back to a plain layer group if the cluster plugin failed to load.
    markersGroup = (typeof L.markerClusterGroup === 'function')
        ? L.markerClusterGroup({ disableClusteringAtZoom: 13, spiderfyOnMaxZoom: true })
        : L.layerGroup();
    markersGroup.addTo(map);
}

function populateMapDropdowns() {
    const districts = new Map();
    const funders = new Map();

    globalData.schools.forEach((school) => {
        const district = String(getField(school, 'district')).trim();
        const funder = String(getField(school, 'funderName')).trim();
        if (district && !districts.has(norm(district))) districts.set(norm(district), district);
        if (funder && !funders.has(norm(funder))) funders.set(norm(funder), funder);
    });

    const toOptions = (source) => [...source.values()]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v }));

    fillSelect('map-district-filter', toOptions(districts), 'All Districts');
    fillSelect('map-funder-filter', toOptions(funders), 'All Funders');
}

/* ---------- Coordinates ---------- */

function loadGeoCache() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CONFIG.GEOCODE_CACHE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveGeoCache() {
    try {
        localStorage.setItem(CONFIG.GEOCODE_CACHE_KEY, JSON.stringify(geoCache));
    } catch (_) { /* storage full or unavailable - the cache is only an optimisation */ }
}

/** Cached lookup; an old failure counts as "not cached" so it gets retried. */
function getCachedGeo(key) {
    const entry = geoCache[key];
    if (!entry) return undefined;
    if (entry.failed && Date.now() - (entry.at || 0) > GEOCODE_FAILURE_RETRY_MS) return undefined;
    return entry;
}

const inRegion = (lat, lon) =>
    lat >= TN_BOUNDS.minLat && lat <= TN_BOUNDS.maxLat && lon >= TN_BOUNDS.minLon && lon <= TN_BOUNDS.maxLon;

const isValidLatLng = (lat, lon) =>
    Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Small stable offset so schools without coordinates do not stack on one point. */
function getOffset(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (text.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    }
    return (hash % 100) / 5000;
}

function districtFallback(school) {
    const rawDistrict = norm(getField(school, 'district'));
    const key = DISTRICT_ALIASES[rawDistrict] || rawDistrict;
    const base = DISTRICT_CENTERS[key] || CONFIG.TN_CENTER;
    const seed = `${getField(school, 'schoolName')}|${getField(school, 'id')}`;
    return { lat: base.lat + getOffset(`${seed}|lat`), lon: base.lon + getOffset(`${seed}|lon`) };
}

function buildGeocodeQuery(address) {
    return /tamil\s*nadu/i.test(address) ? address : `${address}, Tamil Nadu, India`;
}

/**
 * Synchronous - never waits for the network. Order of preference:
 *   1. Latitude/Longitude columns   2. cached geocode   3. district centre (and queue a geocode)
 */
function resolveCoordinates(school) {
    let lat = parseFloat(getField(school, 'lat', NaN));
    let lon = parseFloat(getField(school, 'lon', NaN));

    if (isValidLatLng(lat, lon)) {
        // Latitude and longitude entered the wrong way round (e.g. 78.7, 10.8)?
        if (!inRegion(lat, lon) && isValidLatLng(lon, lat) && inRegion(lon, lat)) {
            [lat, lon] = [lon, lat];
        }
        return { lat, lon, approximate: false, geocodeKey: '', geocodeQuery: '' };
    }

    const address = String(getField(school, 'address')).trim();
    const key = address.length > 3 ? norm(address) : '';

    if (key) {
        const cached = getCachedGeo(key);
        if (cached && !cached.failed) {
            return { lat: cached.lat, lon: cached.lon, approximate: false, geocodeKey: '', geocodeQuery: '' };
        }
        const needsLookup = !cached;
        return {
            ...districtFallback(school),
            approximate: true,
            geocodeKey: needsLookup ? key : '',
            geocodeQuery: needsLookup ? buildGeocodeQuery(address) : ''
        };
    }

    return { ...districtFallback(school), approximate: true, geocodeKey: '', geocodeQuery: '' };
}

/* ---------- Geocoding queue (Nominatim: 1 request/second, results cached) ---------- */

function queueGeocode(key, query, callback) {
    if (geoPending.has(key)) {
        geoPending.get(key).callbacks.push(callback);
        return;
    }
    geoPending.set(key, { query, callbacks: [callback] });
    geoQueue.push(key);
    runGeoQueue();
}

async function geocodeOnce(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, CONFIG.GEOCODE_TIMEOUT_MS);
    if (response.status === 429) return { rateLimited: true };
    if (!response.ok) return { error: true };

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        // Reject hits outside Tamil Nadu (a same-named place elsewhere).
        if (isValidLatLng(lat, lon) && inRegion(lat, lon)) return { lat, lon };
    }
    return { notFound: true };
}

async function runGeoQueue() {
    if (geoRunning) return;
    geoRunning = true;

    while (geoQueue.length > 0) {
        const key = geoQueue.shift();
        const job = geoPending.get(key);
        let found = null;

        try {
            const result = await geocodeOnce(job.query);
            if (result.rateLimited) {
                // Back off: drop the rest of the queue; unresolved schools are retried on the next load.
                geoPending.delete(key);
                geoQueue.splice(0).forEach((k) => geoPending.delete(k));
                break;
            }
            if (result.lat !== undefined) {
                found = { lat: result.lat, lon: result.lon };
                geoCache[key] = found;
                saveGeoCache();
            } else if (result.notFound) {
                geoCache[key] = { failed: true, at: Date.now() };
                saveGeoCache();
            }
        } catch (error) {
            console.warn('Geocoding failed:', error);   // network problem - not cached, retried later
        }

        geoPending.delete(key);
        if (found) job.callbacks.forEach((callback) => callback(found));
        if (geoQueue.length > 0) await sleep(CONFIG.GEOCODE_DELAY_MS);
    }

    geoRunning = false;
}

/* ---------- Rendering ---------- */

function buildPopupHtml({ name, address, district, funder, coords }) {
    const location = coords.approximate
        ? 'Approximate location (district area)'
        : `Lat: ${coords.lat.toFixed(4)}, Lon: ${coords.lon.toFixed(4)}`;
    return `
        <div class="map-popup">
            <strong class="map-popup-title">${escapeHtml(name)}</strong><br>
            <small class="map-popup-address">${escapeHtml(address || 'Address not specified')}</small><br><br>
            <b>District:</b> ${escapeHtml(district || 'N/A')}<br>
            <b>Funder:</b> ${escapeHtml(funder)}<br>
            <small class="map-popup-coords">${escapeHtml(location)}</small>
        </div>`;
}

function relocateMarker(marker, found, popupData) {
    const wasShown = markersGroup && markersGroup.hasLayer(marker);
    if (wasShown) markersGroup.removeLayer(marker);
    marker.setLatLng([found.lat, found.lon]);
    marker.setPopupContent(buildPopupHtml({ ...popupData, coords: { ...found, approximate: false } }));
    if (wasShown) markersGroup.addLayer(marker);
}

function focusMarker(marker) {
    if (!map || !marker) return;
    const showPopup = () => {
        map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15));
        marker.openPopup();
    };
    // zoomToShowLayer expands a cluster first, otherwise the marker would not be on the map yet.
    if (markersGroup && markersGroup.hasLayer(marker) && typeof markersGroup.zoomToShowLayer === 'function') {
        markersGroup.zoomToShowLayer(marker, showPopup);
    } else {
        showPopup();
    }
}

const isMapVisible = () => {
    const section = $('map-view');
    return !!section && section.classList.contains('active');
};

function fitMapToSchools() {
    if (!map) return;
    if (lastMapBounds.length > 0) {
        map.fitBounds(lastMapBounds, { padding: [50, 50], maxZoom: 14 });
    } else if (currentMapMode === 'chennai') {
        map.setView([CONFIG.CHENNAI_CENTER.lat, CONFIG.CHENNAI_CENTER.lon], 11);
    } else {
        map.setView([CONFIG.TN_CENTER.lat, CONFIG.TN_CENTER.lon], 7);
    }
}

/**
 * Fully synchronous, so overlapping calls (typing in the search box, switching
 * filters quickly) can no longer interleave and duplicate pins or list items.
 */
function applyMapFilters() {
    if (!map || !markersGroup) return;
    markersGroup.clearLayers();

    const search = norm(value('map-search-input'));
    const selectedDistrict = value('map-district-filter', 'ALL');
    const selectedFunder = value('map-funder-filter', 'ALL');

    const activeFunders = new Set();
    const bounds = [];
    const items = document.createDocumentFragment();
    let count = 0;

    globalData.schools.forEach((school) => {
        const name = String(getField(school, 'schoolName', 'Unnamed School'));
        const address = String(getField(school, 'address'));
        const district = String(getField(school, 'district')).trim();
        const funder = String(getField(school, 'funderName', 'N/A')).trim() || 'N/A';

        if (currentMapMode === 'chennai' && !sameText(district, 'chennai')) return;
        if (selectedDistrict !== 'ALL' && !sameText(district, selectedDistrict)) return;
        if (selectedFunder !== 'ALL' && !sameText(funder, selectedFunder)) return;
        if (search && !norm(name).includes(search) && !norm(address).includes(search)) return;

        count++;
        if (funder !== 'N/A') activeFunders.add(norm(funder));

        const coords = resolveCoordinates(school);
        const popupData = { name, address, district, funder };
        const marker = L.marker([coords.lat, coords.lon]);
        marker.bindPopup(buildPopupHtml({ ...popupData, coords }));
        markersGroup.addLayer(marker);
        bounds.push([coords.lat, coords.lon]);

        if (coords.geocodeKey) {
            queueGeocode(coords.geocodeKey, coords.geocodeQuery, (found) => relocateMarker(marker, found, popupData));
        }

        const li = document.createElement('li');
        li.className = 'school-item';
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.innerHTML = `
            <div class="name">${escapeHtml(name)}</div>
            <div class="details">District: <b>${escapeHtml(district || 'N/A')}</b> | Funder: <b>${escapeHtml(funder)}</b></div>`;
        li.addEventListener('click', () => focusMarker(marker));
        li.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                focusMarker(marker);
            }
        });
        items.appendChild(li);
    });

    const list = $('map-school-list');
    if (list) {
        list.innerHTML = '';
        if (count === 0) {
            list.innerHTML = '<li class="school-empty">No schools match the current filters.</li>';
        } else {
            list.appendChild(items);
        }
    }

    const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    setText('map-stat-count', String(count));
    setText('map-stat-funders', String(activeFunders.size));
    setText('region-title', currentMapMode === 'chennai' ? 'Chennai' : 'Tamil Nadu');
    setText('region-type', `${count} school${count === 1 ? '' : 's'} match the current filters`);

    lastMapBounds = bounds;
    // A hidden map has no size, so fitBounds would compute a nonsense zoom. Defer until it is shown.
    if (isMapVisible()) {
        fitMapToSchools();
    } else {
        pendingMapFit = true;
    }
}

function switchMapView(mode) {
    currentMapMode = mode === 'chennai' ? 'chennai' : 'tn';
    const tnBtn = $('tn-btn');
    const chennaiBtn = $('chennai-btn');
    if (tnBtn) {
        tnBtn.classList.toggle('active', currentMapMode === 'tn');
        tnBtn.setAttribute('aria-pressed', String(currentMapMode === 'tn'));
    }
    if (chennaiBtn) {
        chennaiBtn.classList.toggle('active', currentMapMode === 'chennai');
        chennaiBtn.setAttribute('aria-pressed', String(currentMapMode === 'chennai'));
    }
    applyMapFilters();
}

/* =============================================================================
   9. UI PLUMBING
   ============================================================================= */

function switchTab(tabId) {
    const section = $(tabId);
    if (!section) return;

    document.querySelectorAll('.tab-content').forEach((tab) => {
        tab.classList.toggle('active', tab === section);
    });
    document.querySelectorAll('.nav-item').forEach((item) => {
        const isActive = item.dataset.tab === tabId;
        item.classList.toggle('active', isActive);
        if (isActive) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });

    const scroller = document.querySelector('.main-content');
    if (scroller) scroller.scrollTop = 0;

    if (tabId === 'map-view' && map) {
        // The map was hidden (zero size) until now: let Leaflet re-measure, then apply any deferred fit.
        setTimeout(() => {
            map.invalidateSize();
            if (pendingMapFit) {
                fitMapToSchools();
                pendingMapFit = false;
            }
        }, 200);
    }
}

function openModal(title, html) {
    const modal = $('detailsModal');
    if (!modal) return;
    lastModalTrigger = document.activeElement;
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    modal.classList.add('open');
    const closeButton = modal.querySelector('.close-btn');
    if (closeButton) closeButton.focus();
}

function closeModal() {
    const modal = $('detailsModal');
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    if (lastModalTrigger && document.contains(lastModalTrigger) && typeof lastModalTrigger.focus === 'function') {
        lastModalTrigger.focus({ preventScroll: true });
    }
    lastModalTrigger = null;
}

function showToast(message, type = 'success') {
    const container = $('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = document.createElement('i');
    icon.className = `fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = message;          // textContent: never interpreted as HTML

    toast.append(icon, text);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), type === 'error' ? 5000 : 3000);
}

function exportToCSV(tableId, filename) {
    const table = $(tableId);
    if (!table) return;

    const toCell = (raw) => {
        let text = String(raw).replace(/\s+/g, ' ').trim();
        // Stop spreadsheet apps from running cells that start with a formula character.
        if (/^[=+@]/.test(text) || /^-(?![\d₹])/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [];
    let dataRows = 0;
    Array.from(table.rows).forEach((row, index) => {
        if (row.querySelector('.empty-state')) return;            // "No records" placeholder row
        if (index > 0) dataRows++;
        // Drop the last column (the Actions buttons).
        lines.push(Array.from(row.cells).slice(0, -1).map((td) => toCell(td.innerText)).join(','));
    });

    if (dataRows === 0) {
        showToast('There is no data to export yet.', 'error');
        return;
    }

    // BOM so Excel reads the file as UTF-8 (keeps the ₹ sign and Tamil text intact).
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('CSV Downloaded Successfully!', 'success');
}

/** Try the .png logo, then the .jpg fallback, then hide it (instead of showing a broken image). */
function initLogos() {
    document.querySelectorAll('img[data-fallback]').forEach((img) => {
        const handleFailure = () => {
            if (img.dataset.fallback && !img.dataset.triedFallback) {
                img.dataset.triedFallback = '1';
                img.src = img.dataset.fallback;
            } else {
                const wrapper = img.closest('.logo-wrapper');
                if (wrapper) wrapper.hidden = true;
            }
        };
        img.addEventListener('error', handleFailure);
        // The error may already have fired before this script ran.
        if (img.complete && img.naturalWidth === 0) handleFailure();
    });
}

function handleDocumentClick(event) {
    if (event.target === $('detailsModal')) {      // click on the dimmed backdrop
        closeModal();
        return;
    }

    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const { action, kind, id, tab, type, table, filename, mode } = trigger.dataset;

    switch (action) {
        case 'switch-tab':        switchTab(tab); break;
        case 'edit':              goEdit(kind, id); break;
        case 'cancel-edit':       resetForm(kind); break;
        case 'vendor-details':    showVendorDetails(id); break;
        case 'dashboard-details': showDashboardDetails(type); break;
        case 'export-csv':        exportToCSV(table, filename); break;
        case 'map-mode':          switchMapView(mode); break;
        case 'close-modal':       closeModal(); break;
        default: break;
    }
}

function handleKeydown(event) {
    if (event.key === 'Escape') {
        closeModal();
        return;
    }
    // Cards act as buttons: Enter / Space activate them like a click.
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-action]')) {
        event.preventDefault();
        event.target.click();
    }
}

function bindEvents() {
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);

    // Dashboard & list filters ('input' also catches paste / cut, unlike 'keyup')
    on('funderFilter', 'change', calculateMetrics);
    on('schoolSearch', 'input', filterSchools);
    ['schoolFunderFilter', 'schoolCategoryFilter', 'schoolStatusFilter'].forEach((id) => on(id, 'change', filterSchools));
    ['vendorFunderFilter', 'vendorYearFilter'].forEach((id) => on(id, 'change', filterVendors));
    ['activityFunderFilter', 'activityCategoryFilter'].forEach((id) => on(id, 'change', filterActivities));

    // Map filters (search is debounced so each keystroke does not rebuild every pin)
    on('map-search-input', 'input', debounce(applyMapFilters, CONFIG.SEARCH_DEBOUNCE_MS));
    on('map-district-filter', 'change', applyMapFilters);
    on('map-funder-filter', 'change', applyMapFilters);
    on('syncBtn', 'click', () => fetchData());

    // Live calculators
    ['vendorUnitCost', 'vendorUnits', 'vendorPaid'].forEach((id) => on(id, 'input', calculateVendorTotal));
    ['actUnitCost', 'actUnits', 'actPaid'].forEach((id) => on(id, 'input', calculateActivityTotal));
    on('csrFunderSelect', 'change', showSelectedCSRBalance);
    on('csrAmount', 'input', showSelectedCSRBalance);

    // Form submission (native validation runs first)
    const submitHandlers = {
        funderForm: saveFunderData,
        schoolForm: saveSchoolData,
        vendorForm: saveVendorData,
        activityForm: saveActivityData,
        csrForm: saveDisbursementData
    };
    Object.entries(submitHandlers).forEach(([formId, handler]) => {
        on(formId, 'submit', (event) => {
            event.preventDefault();
            handler();
        });
    });
}

function init() {
    bindEvents();
    initLogos();
    initMap();
    calculateVendorTotal();
    calculateActivityTotal();
    fetchData();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
