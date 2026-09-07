// Google Apps Script Web App URL
const API_URL = "https://script.google.com/macros/s/AKfycbwQKIBKuZUFN2Ezog3BDOeRen5Tm1a6WHVpShVO1dSpwirtHh1odnkoEwzAr0JmBi2N/exec";

let globalData = { funders: [], schools: [], vendors: [], activities: [], disbursements: [] };
let chartInstance = null;

window.onload = function() {
    fetchData();
};

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');
}

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        // Safe defaults - disbursements sheet oda data varala na kooda error varaadhu
        globalData = {
            funders: data.funders || [],
            schools: data.schools || [],
            vendors: data.vendors || [],
            activities: data.activities || [],
            disbursements: data.disbursements || []
        };

        populateDropdowns();
        calculateMetrics();
        renderTablesAndCards();
        renderChart();
        setNextIDs();
        showSelectedCSRBalance();

    } catch (e) {
        console.error(e);
        showToast("Data loading failed. Please check permissions.", "error");
    }
}

function setNextIDs() {
    if (globalData.funders && globalData.funders.length) {
        document.getElementById('funderId').value = Math.max(...globalData.funders.map(f => Number(f.ID) || 0)) + 1;
    } else {
        document.getElementById('funderId').value = 1;
    }

    if (globalData.schools && globalData.schools.length) {
        document.getElementById('schoolId').value = Math.max(...globalData.schools.map(s => Number(s.ID) || 0)) + 1;
    } else {
        document.getElementById('schoolId').value = 1;
    }

    if (globalData.vendors && globalData.vendors.length) {
        document.getElementById('vendorId').value = Math.max(...globalData.vendors.map(v => Number(v.ID) || 0)) + 1;
    } else {
        document.getElementById('vendorId').value = 1;
    }

    if (globalData.activities && globalData.activities.length) {
        document.getElementById('actId').value = Math.max(...globalData.activities.map(a => Number(a.ID) || 0)) + 1;
    } else {
        document.getElementById('actId').value = 1;
    }

    if (globalData.disbursements && globalData.disbursements.length) {
        document.getElementById('csrId').value = Math.max(...globalData.disbursements.map(d => Number(d.ID) || 0)) + 1;
    } else {
        document.getElementById('csrId').value = 1;
    }
}

function populateDropdowns() {
    const filterSelect = document.getElementById('funderFilter');
    const schoolFunderSelect = document.getElementById('schoolFunderSelect');
    const vendorFunderSelect = document.getElementById('vendorFunderSelect');
    const vendorFunderFilter = document.getElementById('vendorFunderFilter');
    const vendorYearFilter = document.getElementById('vendorYearFilter');
    const actFunderSelect = document.getElementById('actFunderSelect');
    const actFunderFilter = document.getElementById('activityFunderFilter');
    const csrSchoolSelect = document.getElementById('csrSchoolSelect');
    const csrFunderSelect = document.getElementById('csrFunderSelect');

    if (filterSelect) filterSelect.innerHTML = '<option value="ALL">All Funders Overview</option>';
    if (vendorFunderFilter) vendorFunderFilter.innerHTML = '<option value="ALL">All Funders</option>';
    if (actFunderFilter) actFunderFilter.innerHTML = '<option value="ALL">All Funders</option>';
    
    if (schoolFunderSelect) schoolFunderSelect.innerHTML = '';
    if (vendorFunderSelect) vendorFunderSelect.innerHTML = '';
    if (actFunderSelect) actFunderSelect.innerHTML = '';
    if (csrFunderSelect) csrFunderSelect.innerHTML = '';
    if (csrSchoolSelect) csrSchoolSelect.innerHTML = '';

    globalData.funders.forEach(f => {
        const fName = f.Funder_Name || f.funder_name || f["Funder Name"];
        if(fName) {
            if (filterSelect) filterSelect.innerHTML += `<option value="${fName}">${fName}</option>`;
            if (schoolFunderSelect) schoolFunderSelect.innerHTML += `<option value="${fName}">${fName}</option>`;
            if (vendorFunderSelect) vendorFunderSelect.innerHTML += `<option value="${fName}">${fName}</option>`;
            if (vendorFunderFilter) vendorFunderFilter.innerHTML += `<option value="${fName}">${fName}</option>`;
            if (actFunderSelect) actFunderSelect.innerHTML += `<option value="${fName}">${fName}</option>`;
            if (actFunderFilter) actFunderFilter.innerHTML += `<option value="${fName}">${fName}</option>`;
            if (csrFunderSelect) csrFunderSelect.innerHTML += `<option value="${fName}">${fName}</option>`;
        }
    });

    globalData.schools.forEach(s => {
        const sName = s.School_Name || s.school_name || s["School Name"];
        if (sName && csrSchoolSelect) {
            csrSchoolSelect.innerHTML += `<option value="${sName}">#${s.ID} - ${sName}</option>`;
        }
    });

    if (vendorYearFilter) {
        vendorYearFilter.innerHTML = '<option value="ALL">All Years</option>';
        const years = [...new Set((globalData.vendors || []).map(v => v.Financial_Year || v.financial_year || v["Financial Year"]))].filter(Boolean);
        years.forEach(y => {
            vendorYearFilter.innerHTML += `<option value="${y}">${y}</option>`;
        });
    }
}

function calculateMetrics() {
    const selectedFunder = document.getElementById('funderFilter').value;

    let totalFund = 0;
    let totalExpense = 0;
    let totalPending = 0;

    // 1. Calculate Funders Total
    globalData.funders.forEach(f => {
        const name = f.Funder_Name || f.funder_name || f["Funder Name"];
        if (selectedFunder === "ALL" || name === selectedFunder) {
            totalFund += Number(f.Total_Fund || f["Total Fund"] || 0);
        }
    });

    // 2. Calculate Vendor Expenses & Pending
    globalData.vendors.forEach(v => {
        const funder = v.Funder_Name || v.funder_name || v["Funder Name"];
        if (selectedFunder === "ALL" || funder === selectedFunder) {
            totalExpense += Number(v.Amount_Paid || v["Amount Paid"] || 0);
            totalPending += Number(v.Amount_Pending || v["Amount Pending"] || 0);
        }
    });

    // 3. Calculate Activities Expenses & Pending
    (globalData.activities || []).forEach(a => {
        const funder = a.Funder_Name || a.funder_name || a["Funder Name"];
        if (selectedFunder === "ALL" || funder === selectedFunder) {
            totalExpense += Number(a.Amount_Paid || a["Amount Paid"] || 0);
            
            const cost = Number(a.Unit_Cost || a["Unit Cost"] || 0);
            const units = Number(a.Units || a["Units"] || 1);
            const total = cost * units;
            const paid = Number(a.Amount_Paid || a["Amount Paid"] || 0);
            const actPending = Number(a.Amount_Pending || a["Amount Pending"] || (total - paid));

            totalPending += actPending;
        }
    });

    // 4. Add School Disbursements (SASTRA CSR-la irundhu school ku direct kudutha amount)
    (globalData.disbursements || []).forEach(d => {
        const funder = d.Funder_Name || d.funder_name || d["Funder Name"];
        if (selectedFunder === "ALL" || funder === selectedFunder) {
            totalExpense += Number(d.Amount || d["Amount"] || 0);
        }
    });

    const balance = totalFund - totalExpense;

    // Indian Standard (en-IN) Formatting Applied Here
    document.getElementById('totalFund').innerText = '₹' + totalFund.toLocaleString('en-IN');
    document.getElementById('totalExpense').innerText = '₹' + totalExpense.toLocaleString('en-IN');
    document.getElementById('balance').innerText = '₹' + balance.toLocaleString('en-IN');
    document.getElementById('vendorPending').innerText = '₹' + totalPending.toLocaleString('en-IN');
    
    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('financialChart').getContext('2d');
    const fund = parseFloat(document.getElementById('totalFund').innerText.replace(/[₹,]/g, '')) || 0;
    const expense = parseFloat(document.getElementById('totalExpense').innerText.replace(/[₹,]/g, '')) || 0;
    const pending = parseFloat(document.getElementById('vendorPending').innerText.replace(/[₹,]/g, '')) || 0;

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total Funds Received', 'Total Expenses', 'Total Pending'],
            datasets: [{
                label: 'Financials (in ₹)',
                data: [fund, expense, pending],
                backgroundColor: ['#4f46e5', '#ef4444', '#f59e0b'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderTablesAndCards() {
    const funderTableBody = document.querySelector('#funderTable tbody');
    if(funderTableBody) {
        funderTableBody.innerHTML = '';
        globalData.funders.forEach(f => {
            const name = f.Funder_Name || f.funder_name || f["Funder Name"];
            funderTableBody.innerHTML += `
                <tr>
                    <td>#${f.ID}</td>
                    <td><b>${name}</b></td>
                    <td>${f.Confirm_Date ? String(f.Confirm_Date).split('T')[0] : '-'}</td>
                    <td>${f.Received_Date ? String(f.Received_Date).split('T')[0] : '-'}</td>
                    <td>₹${Number(f.Total_Fund || 0).toLocaleString('en-IN')}</td>
                    <td>
                        <button class="btn btn-action btn-primary" onclick='editFunder(${JSON.stringify(f)})'><i class="fa-solid fa-pen"></i> Edit</button>
                    </td>
                </tr>
            `;
        });
    }

    renderSchoolGrid(globalData.schools || []);
    renderVendorGrid(globalData.vendors || []);
    renderActivityGrid(globalData.activities || []);
    renderCSRBalances();
    renderDisbursementTable(globalData.disbursements || []);
}

// ============ SASTRA CSR - Fund Allocation Feature ============

function getFunderUsedAmount(funderName) {
    let used = 0;
    globalData.vendors.forEach(v => {
        const vf = v.Funder_Name || v["Funder Name"];
        if (vf === funderName) used += Number(v.Amount_Paid || 0);
    });
    (globalData.activities || []).forEach(a => {
        const af = a.Funder_Name || a["Funder Name"];
        if (af === funderName) used += Number(a.Amount_Paid || 0);
    });
    (globalData.disbursements || []).forEach(d => {
        const df = d.Funder_Name || d["Funder Name"];
        if (df === funderName) used += Number(d.Amount || 0);
    });
    return used;
}

function renderCSRBalances() {
    const container = document.getElementById('csrBalanceContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!globalData.funders || globalData.funders.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#666; padding:2rem;">Innum CSR / Funder record edhuvum illa. Mudhalla "Funder Details" tab-la add pannunga.</div>`;
        return;
    }

    globalData.funders.forEach(f => {
        const name = f.Funder_Name || f["Funder Name"];
        const totalFund = Number(f.Total_Fund || f["Total Fund"] || 0);
        const used = getFunderUsedAmount(name);
        const balance = totalFund - used;
        const pct = totalFund > 0 ? Math.min(100, Math.round((used / totalFund) * 100)) : 0;
        const cardType = balance < 0 ? 'danger' : (balance === 0 ? 'warning' : 'success');

        container.innerHTML += `
            <div class="metric-card ${cardType}">
                <div class="metric-header">
                    <h3>${name}</h3>
                    <div class="icon-box"><i class="fa-solid fa-building-columns"></i></div>
                </div>
                <p>₹${balance.toLocaleString('en-IN')}</p>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.6rem; line-height:1.5;">
                    Total Fund: ₹${totalFund.toLocaleString('en-IN')}<br>
                    Used: ₹${used.toLocaleString('en-IN')} (${pct}%)
                </div>
            </div>
        `;
    });
}

function showSelectedCSRBalance() {
    const funderSelect = document.getElementById('csrFunderSelect');
    const hint = document.getElementById('csrBalanceHint');
    if (!funderSelect || !hint) return;

    const name = funderSelect.value;
    const f = (globalData.funders || []).find(x => (x.Funder_Name || x["Funder Name"]) === name);
    if (!f) {
        hint.innerText = '';
        return;
    }

    const totalFund = Number(f.Total_Fund || f["Total Fund"] || 0);
    const used = getFunderUsedAmount(name);
    const balance = totalFund - used;

    hint.innerText = `Available Balance in "${name}": ₹${balance.toLocaleString('en-IN')}`;
    hint.style.color = balance > 0 ? 'var(--success)' : 'var(--danger)';
}

function renderDisbursementTable(list) {
    const tbody = document.querySelector('#csrTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#666; padding:1.5rem;">Innum entha school kum CSR amount kudukala.</td></tr>`;
        return;
    }

    list.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>#${d.ID}</td>
                <td><b>${d.School_Name || d["School Name"] || '-'}</b></td>
                <td>${d.Funder_Name || d["Funder Name"] || '-'}</td>
                <td>₹${Number(d.Amount || 0).toLocaleString('en-IN')}</td>
                <td>${d.Date ? String(d.Date).split('T')[0] : '-'}</td>
                <td>${d.Description || '-'}</td>
                <td>
                    <button class="btn btn-action btn-primary" onclick='editDisbursement(${JSON.stringify(d)})'><i class="fa-solid fa-pen"></i></button>
                </td>
            </tr>
        `;
    });
}

function editDisbursement(d) {
    document.getElementById('csrId').value = d.ID;
    document.getElementById('csrSchoolSelect').value = d.School_Name || d["School Name"] || '';
    document.getElementById('csrFunderSelect').value = d.Funder_Name || d["Funder Name"] || '';
    document.getElementById('csrAmount').value = d.Amount || '';
    document.getElementById('csrDate').value = d.Date ? String(d.Date).split('T')[0] : '';
    document.getElementById('csrDescription').value = d.Description || '';
    showSelectedCSRBalance();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveDisbursementData() {
    const amount = Number(document.getElementById('csrAmount').value) || 0;
    const funderName = document.getElementById('csrFunderSelect').value;
    const f = (globalData.funders || []).find(x => (x.Funder_Name || x["Funder Name"]) === funderName);

    if (f) {
        const totalFund = Number(f.Total_Fund || f["Total Fund"] || 0);
        const used = getFunderUsedAmount(funderName);
        const available = totalFund - used;
        if (amount > available) {
            showToast(`"${funderName}" la ₹${available.toLocaleString('en-IN')} mattum thaan balance iruku!`, "error");
            return;
        }
    }

    const payload = {
        action: "saveDisbursement",
        data: {
            ID: document.getElementById('csrId').value,
            School_Name: document.getElementById('csrSchoolSelect').value,
            Funder_Name: funderName,
            Amount: document.getElementById('csrAmount').value,
            Date: document.getElementById('csrDate').value,
            Description: document.getElementById('csrDescription').value
        }
    };
    await sendData(payload, 'csrForm');
}

function getDirectImageUrl(url) {
    if (!url) return 'https://via.placeholder.com/300x160?text=No+School+Photo';
    if (url.includes('drive.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://lh3.googleusercontent.com/d/${match[1]}`;
        }
    }
    return url;
}

function renderSchoolGrid(schools) {
    const schoolContainer = document.getElementById('schoolContainer');
    if (!schoolContainer) return;
    schoolContainer.innerHTML = '';
    
    schools.forEach(s => {
        const funderName = s.Funder_Name || s.funder_name || s["Funder Name"] || 'N/A';
        const contact = s.Contact_Number || s.contact_number || s["Contact Number"] || 'N/A';
        const rawPhotoUrl = s.Photo_URL || s.photo_url || s["Photo URL"];
        const photoUrl = getDirectImageUrl(rawPhotoUrl);

        schoolContainer.innerHTML += `
            <div class="school-card">
                <img src="${photoUrl}" 
                     alt="School Photo" 
                     onerror="this.onerror=null; this.src='https://via.placeholder.com/300x160?text=Image+Not+Found';">
                <div class="school-card-body">
                    <span class="badge">${s.Category || 'General'}</span>
                    <span class="badge badge-status">${s.Status || 'In Progress'}</span>
                    <h3>#${s.ID} ${s.School_Name || 'School Name'}</h3>
                    <div class="school-info">Funder: <b>${funderName}</b></div>
                    <div class="school-info">Contact: <b>${contact}</b></div>
                    <button class="btn btn-action btn-primary" style="margin-top:0.8rem; width:100%; justify-content:center;" onclick='editSchool(${JSON.stringify(s)})'>
                        <i class="fa-solid fa-pen"></i> Edit Entry
                    </button>
                </div>
            </div>
        `;
    });
}

function renderVendorGrid(vendorsList) {
    const vendorContainer = document.getElementById('vendorContainer');
    if (!vendorContainer) return;
    
    vendorContainer.innerHTML = '';

    if (vendorsList.length === 0) {
        vendorContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#666; padding:2rem;">No vendor registration for the selected CSR/Year.</div>`;
        return;
    }

    vendorsList.forEach(v => {
        const year = v.Financial_Year || v.financial_year || v["Financial Year"] || '-';
        const unitCost = Number(v.Unit_Cost || v["Unit Cost"] || 0);
        const units = Number(v.Units_Sold || v["Units Sold"] || 0);
        const total = (unitCost && units) ? (unitCost * units) : (Number(v.Amount_Paid || 0) + Number(v.Amount_Pending || 0));

        vendorContainer.innerHTML += `
            <div class="school-card" style="cursor:pointer;" onclick='showVendorDetails(${JSON.stringify(v)})'>
                <div class="school-card-body">
                    <span class="badge">${year}</span>
                    <h3>#${v.ID} ${v.Vendor_Name || 'Vendor Name'}</h3>
                    <div class="school-info">Funder: <b>${v.Funder_Name || 'N/A'}</b></div>
                    <div class="school-info">Service: <b>${v.Service || 'N/A'}</b></div>
                    <div class="school-info">Total Bill: <b>₹${total.toLocaleString('en-IN')}</b></div>
                    <div class="school-info">Paid: <b style="color:green;">₹${Number(v.Amount_Paid || 0).toLocaleString('en-IN')}</b></div>
                    <div class="school-info">Pending: <b style="color:red;">₹${Number(v.Amount_Pending || 0).toLocaleString('en-IN')}</b></div>
                    <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                        <button class="btn btn-action btn-primary" style="width:100%; justify-content:center;" onclick='event.stopPropagation(); editVendor(${JSON.stringify(v)})'>
                            <i class="fa-solid fa-pen"></i> Edit Entry
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

function renderActivityGrid(activitiesList) {
    const container = document.getElementById('activityContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!activitiesList || activitiesList.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#666; padding:2rem;">No activity records.</div>`;
        return;
    }

    activitiesList.forEach(a => {
        const cost = Number(a.Unit_Cost || a["Unit Cost"] || 0);
        const units = Number(a.Units || a["Units"] || 1);
        const total = cost * units;
        const paid = Number(a.Amount_Paid || a["Amount Paid"] || 0);
        const pending = Number(a.Amount_Pending || a["Amount Pending"] || (total - paid));

        container.innerHTML += `
            <div class="school-card">
                <div class="school-card-body">
                    <span class="badge">${a.Category || 'Activity'}</span>
                    <h3>#${a.ID} ${a.Vendor_Name || a["Vendor Name"] || 'Vendor'}</h3>
                    <div class="school-info">Funder: <b>${a.Funder_Name || a["Funder Name"] || 'N/A'}</b></div>
                    <div class="school-info">Description: <b>${a.Description || 'N/A'}</b></div>
                    <div class="school-info">Total Bill: <b>₹${total.toLocaleString('en-IN')}</b></div>
                    <div class="school-info">Paid: <b style="color:green;">₹${paid.toLocaleString('en-IN')}</b></div>
                    <div class="school-info">Pending: <b style="color:red;">₹${pending.toLocaleString('en-IN')}</b></div>
                    <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                        <button class="btn btn-action btn-primary" style="width:100%; justify-content:center;" onclick='editActivity(${JSON.stringify(a)})'>
                            <i class="fa-solid fa-pen"></i> Edit Entry
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

function calculateVendorTotal() {
    const unitCost = Number(document.getElementById('vendorUnitCost').value) || 0;
    const units = Number(document.getElementById('vendorUnits').value) || 0;
    const paid = Number(document.getElementById('vendorPaid').value) || 0;

    const totalCost = unitCost * units;
    const pending = totalCost > 0 ? (totalCost - paid) : 0;

    document.getElementById('vendorPendingAmt').value = pending >= 0 ? pending : 0;
}

function calculateActivityTotal() {
    const cost = Number(document.getElementById('actUnitCost').value) || 0;
    const units = Number(document.getElementById('actUnits').value) || 1;
    const paid = Number(document.getElementById('actPaid').value) || 0;

    const total = cost * units;
    const pending = total > paid ? (total - paid) : 0;

    document.getElementById('actPending').value = pending;
}

function filterVendors() {
    const selectedFunder = document.getElementById('vendorFunderFilter').value;
    const selectedYear = document.getElementById('vendorYearFilter').value;

    const filtered = (globalData.vendors || []).filter(v => {
        const funder = v.Funder_Name || v.funder_name || v["Funder Name"] || '';
        const year = v.Financial_Year || v.financial_year || v["Financial Year"] || '';

        const matchesFunder = (selectedFunder === "ALL" || funder === selectedFunder);
        const matchesYear = (selectedYear === "ALL" || String(year) === String(selectedYear));

        return matchesFunder && matchesYear;
    });

    renderVendorGrid(filtered);
}

function filterActivities() {
    const selectedFunder = document.getElementById('activityFunderFilter').value;
    const selectedCategory = document.getElementById('activityCategoryFilter').value;

    const filtered = (globalData.activities || []).filter(a => {
        const funder = a.Funder_Name || a["Funder Name"] || '';
        const cat = a.Category || '';

        const matchesFunder = (selectedFunder === "ALL" || funder === selectedFunder);
        const matchesCat = (selectedCategory === "ALL" || cat === selectedCategory);

        return matchesFunder && matchesCat;
    });

    renderActivityGrid(filtered);
}

function filterSchools() {
    const query = document.getElementById('schoolSearch').value.toLowerCase();
    const filtered = (globalData.schools || []).filter(s => {
        const name = (s.School_Name || '').toLowerCase();
        const id = String(s.ID);
        return name.includes(query) || id.includes(query);
    });
    renderSchoolGrid(filtered);
}

function showVendorDetails(v) {
    const unitCost = Number(v.Unit_Cost || v["Unit Cost"] || 0);
    const units = Number(v.Units_Sold || v["Units Sold"] || 0);
    const total = (unitCost && units) ? (unitCost * units) : (Number(v.Amount_Paid || 0) + Number(v.Amount_Pending || 0));

    document.getElementById('modalTitle').innerText = v.Vendor_Name || 'Vendor Details';
    document.getElementById('modalBody').innerHTML = `
        <div style="display:grid; gap:0.6rem;">
            <p><b>Vendor ID:</b> #${v.ID}</p>
            <p><b>Associated Funder:</b> ${v.Funder_Name || 'N/A'}</p>
            <p><b>Financial Year:</b> ${v.Financial_Year || '-'}</p>
            <p><b>Service Provided:</b> ${v.Service || 'N/A'}</p>
            <hr style="margin:0.5rem 0;">
            <p><b>Unit Cost:</b> ₹${unitCost.toLocaleString('en-IN')}</p>
            <p><b>Units Delivered/Sold:</b> ${units}</p>
            <p><b>Total Amount:</b> ₹${total.toLocaleString('en-IN')}</p>
            <p><b>Paid Amount:</b> <span style="color:green; font-weight:bold;">₹${Number(v.Amount_Paid || 0).toLocaleString('en-IN')}</span></p>
            <p><b>Balance Pending:</b> <span style="color:red; font-weight:bold;">₹${Number(v.Amount_Pending || 0).toLocaleString('en-IN')}</span></p>
            <button class="btn btn-primary" style="margin-top:1rem;" onclick='closeModal(); editVendor(${JSON.stringify(v)});'>
                <i class="fa-solid fa-pen"></i> Edit Vendor Info
            </button>
        </div>
    `;
    document.getElementById('detailsModal').style.display = 'flex';
}

function showDashboardDetails(type) {
    const selectedFunder = document.getElementById('funderFilter').value;
    let title = "";
    let contentHtml = "";

    if (type === 'totalFund') {
        title = "Total Funds Summary";
        contentHtml = `
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead>
                    <tr style="border-bottom:2px solid #ddd;">
                        <th style="padding:8px;">ID</th>
                        <th style="padding:8px;">Funder</th>
                        <th style="padding:8px;">Total Fund</th>
                        <th style="padding:8px;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;
        globalData.funders.forEach(f => {
            const name = f.Funder_Name || f["Funder Name"];
            if (selectedFunder === "ALL" || name === selectedFunder) {
                contentHtml += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px;">#${f.ID}</td>
                        <td style="padding:8px;"><b>${name}</b></td>
                        <td style="padding:8px;">₹${Number(f.Total_Fund || 0).toLocaleString('en-IN')}</td>
                        <td style="padding:8px;">
                            <button class="btn btn-action btn-primary" onclick='closeModal(); switchTab("funders", document.querySelectorAll(".nav-item")[1]); editFunder(${JSON.stringify(f)});'><i class="fa-solid fa-pen"></i></button>
                        </td>
                    </tr>
                `;
            }
        });
        contentHtml += `</tbody></table>`;

    } else if (type === 'expenses' || type === 'pending') {
        title = type === 'expenses' ? "Expenses Summary (Vendors & Activities)" : "Pending Payments (Vendors & Activities)";
        contentHtml = `
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead>
                    <tr style="border-bottom:2px solid #ddd;">
                        <th style="padding:8px;">Type</th>
                        <th style="padding:8px;">Name / Category</th>
                        <th style="padding:8px;">Funder</th>
                        <th style="padding:8px;">${type === 'expenses' ? 'Paid' : 'Pending'}</th>
                        <th style="padding:8px;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Add Vendors Data
        globalData.vendors.forEach(v => {
            const funder = v.Funder_Name || v["Funder Name"];
            const amt = type === 'expenses' ? Number(v.Amount_Paid || 0) : Number(v.Amount_Pending || 0);

            if ((selectedFunder === "ALL" || funder === selectedFunder) && amt > 0) {
                contentHtml += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px;"><span class="badge" style="background:#e0e7ff; color:#3730a3;">Vendor</span></td>
                        <td style="padding:8px;"><b>${v.Vendor_Name}</b></td>
                        <td style="padding:8px;">${funder || 'N/A'}</td>
                        <td style="padding:8px; color:${type === 'expenses' ? 'green' : 'red'}; font-weight:bold;">₹${amt.toLocaleString('en-IN')}</td>
                        <td style="padding:8px;">
                            <button class="btn btn-action btn-primary" onclick='closeModal(); switchTab("vendors", document.querySelectorAll(".nav-item")[3]); editVendor(${JSON.stringify(v)});'><i class="fa-solid fa-pen"></i></button>
                        </td>
                    </tr>
                `;
            }
        });

        // Add Activities Data
        (globalData.activities || []).forEach(a => {
            const funder = a.Funder_Name || a["Funder Name"];
            const cost = Number(a.Unit_Cost || a["Unit Cost"] || 0);
            const units = Number(a.Units || a["Units"] || 1);
            const total = cost * units;
            const paid = Number(a.Amount_Paid || a["Amount Paid"] || 0);
            const pending = Number(a.Amount_Pending || a["Amount Pending"] || (total - paid));

            const amt = type === 'expenses' ? paid : pending;

            if ((selectedFunder === "ALL" || funder === selectedFunder) && amt > 0) {
                contentHtml += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px;"><span class="badge" style="background:#fef3c7; color:#92400e;">Activity</span></td>
                        <td style="padding:8px;"><b>${a.Vendor_Name || a.Category}</b><br><small>${a.Description || ''}</small></td>
                        <td style="padding:8px;">${funder || 'N/A'}</td>
                        <td style="padding:8px; color:${type === 'expenses' ? 'green' : 'red'}; font-weight:bold;">₹${amt.toLocaleString('en-IN')}</td>
                        <td style="padding:8px;">
                            <button class="btn btn-action btn-primary" onclick='closeModal(); switchTab("activities", document.querySelectorAll(".nav-item")[4]); editActivity(${JSON.stringify(a)});'><i class="fa-solid fa-pen"></i></button>
                        </td>
                    </tr>
                `;
            }
        });

        // Add School Disbursement Data (only counts as "expense", never "pending")
        if (type === 'expenses') {
            (globalData.disbursements || []).forEach(d => {
                const funder = d.Funder_Name || d["Funder Name"];
                const amt = Number(d.Amount || 0);

                if ((selectedFunder === "ALL" || funder === selectedFunder) && amt > 0) {
                    contentHtml += `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:8px;"><span class="badge" style="background:#d1fae5; color:#047857;">CSR to School</span></td>
                            <td style="padding:8px;"><b>${d.School_Name || d["School Name"]}</b></td>
                            <td style="padding:8px;">${funder || 'N/A'}</td>
                            <td style="padding:8px; color:green; font-weight:bold;">₹${amt.toLocaleString('en-IN')}</td>
                            <td style="padding:8px;">
                                <button class="btn btn-action btn-primary" onclick='closeModal(); switchTab("sastracsr", document.querySelectorAll(".nav-item")[5]); editDisbursement(${JSON.stringify(d)});'><i class="fa-solid fa-pen"></i></button>
                            </td>
                        </tr>
                    `;
                }
            });
        }

        contentHtml += `</tbody></table>`;
    }

    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerHTML = contentHtml;
    document.getElementById('detailsModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('detailsModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('detailsModal');
    if (event.target === modal) {
        closeModal();
    }
};

function editFunder(f) {
    document.getElementById('funderId').value = f.ID;
    document.getElementById('funderName').value = f.Funder_Name || f["Funder Name"] || '';
    document.getElementById('funderConfirmDate').value = f.Confirm_Date ? String(f.Confirm_Date).split('T')[0] : '';
    document.getElementById('funderReceivedDate').value = f.Received_Date ? String(f.Received_Date).split('T')[0] : '';
    document.getElementById('funderTotalAmount').value = f.Total_Fund || f["Total Fund"] || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function editSchool(s) {
    document.getElementById('schoolId').value = s.ID;
    document.getElementById('schoolName').value = s.School_Name || '';
    document.getElementById('schoolFunderSelect').value = s.Funder_Name || s["Funder Name"] || '';
    document.getElementById('schoolContact').value = s.Contact_Number || s["Contact Number"] || '';
    document.getElementById('schoolCategory').value = s.Category || 'STEM Kits Only';
    document.getElementById('schoolStatus').value = s.Status || 'In Progress';
    document.getElementById('schoolPhoto').value = s.Photo_URL || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function editVendor(v) {
    document.getElementById('vendorId').value = v.ID;
    document.getElementById('vendorName').value = v.Vendor_Name || '';
    document.getElementById('vendorFunderSelect').value = v.Funder_Name || v["Funder Name"] || '';
    document.getElementById('vendorYear').value = v.Financial_Year || v["Financial Year"] || '';
    document.getElementById('vendorService').value = v.Service || '';
    document.getElementById('vendorUnitCost').value = v.Unit_Cost || v["Unit Cost"] || '';
    document.getElementById('vendorUnits').value = v.Units_Sold || v["Units Sold"] || '';
    document.getElementById('vendorPaid').value = v.Amount_Paid || '';
    document.getElementById('vendorPendingAmt').value = v.Amount_Pending || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function editActivity(a) {
    document.getElementById('actId').value = a.ID;
    document.getElementById('actCategory').value = a.Category || 'Events & Monitoring';
    document.getElementById('actFunderSelect').value = a.Funder_Name || a["Funder Name"] || '';
    document.getElementById('actVendor').value = a.Vendor_Name || a["Vendor Name"] || '';
    document.getElementById('actDescription').value = a.Description || '';
    document.getElementById('actUnitCost').value = a.Unit_Cost || a["Unit Cost"] || '';
    document.getElementById('actUnits').value = a.Units || 1;
    document.getElementById('actPaid').value = a.Amount_Paid || 0;
    document.getElementById('actPending').value = a.Amount_Pending || 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveFunderData() {
    const payload = {
        action: "saveFunder",
        data: {
            ID: document.getElementById('funderId').value,
            Funder_Name: document.getElementById('funderName').value,
            Confirm_Date: document.getElementById('funderConfirmDate').value,
            Received_Date: document.getElementById('funderReceivedDate').value,
            Total_Fund: document.getElementById('funderTotalAmount').value
        }
    };
    await sendData(payload, 'funderForm');
}

async function saveSchoolData() {
    const payload = {
        action: "saveSchool",
        data: {
            ID: document.getElementById('schoolId').value,
            School_Name: document.getElementById('schoolName').value,
            Funder_Name: document.getElementById('schoolFunderSelect').value,
            Contact_Number: document.getElementById('schoolContact').value,
            Category: document.getElementById('schoolCategory').value,
            Status: document.getElementById('schoolStatus').value,
            Photo_URL: document.getElementById('schoolPhoto').value
        }
    };
    await sendData(payload, 'schoolForm');
}

async function saveVendorData() {
    const payload = {
        action: "saveVendor",
        data: {
            ID: document.getElementById('vendorId').value,
            Vendor_Name: document.getElementById('vendorName').value,
            Funder_Name: document.getElementById('vendorFunderSelect').value,
            Financial_Year: document.getElementById('vendorYear').value,
            Service: document.getElementById('vendorService').value,
            Unit_Cost: document.getElementById('vendorUnitCost').value,
            Units_Sold: document.getElementById('vendorUnits').value,
            Amount_Paid: document.getElementById('vendorPaid').value,
            Amount_Pending: document.getElementById('vendorPendingAmt').value
        }
    };
    await sendData(payload, 'vendorForm');
}

async function saveActivityData() {
    const payload = {
        action: "saveActivity",
        data: {
            ID: document.getElementById('actId').value,
            Category: document.getElementById('actCategory').value,
            Funder_Name: document.getElementById('actFunderSelect').value,
            Vendor_Name: document.getElementById('actVendor').value,
            Description: document.getElementById('actDescription').value,
            Unit_Cost: document.getElementById('actUnitCost').value,
            Units: document.getElementById('actUnits').value,
            Amount_Paid: document.getElementById('actPaid').value,
            Amount_Pending: document.getElementById('actPending').value
        }
    };
    await sendData(payload, 'activityForm');
}

async function sendData(payload, formId) {
    try {
        await fetch(API_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload) 
        });
        showToast("Record Saved Successfully!", "success");
        document.getElementById(formId).reset();
        fetchData();
    } catch (e) {
        showToast("Failed to save data!", "error");
    }
}

function exportToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    let csv = [];
    for (let row of table.rows) {
        let cols = Array.from(row.cells).slice(0, -1).map(td => `"${td.innerText.replace(/"/g, '""')}"`);
        csv.push(cols.join(','));
    }
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    showToast("CSV Downloaded Successfully!", "success");
}

function showToast(message, type = "success") {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
