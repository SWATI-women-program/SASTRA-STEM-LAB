// Google Apps Script Web App URL
const API_URL = "https://script.google.com/macros/s/AKfycbzXPmUjw27iCQy6-XNpgiq0yx_VpQ0NdlCFwwW0Vc6EcJYQbp9G9RlZ190inI5Fs7Ca/exec";

let globalData = { funders: [], schools: [], vendors: [], activities: [] };
let chartInstance = null;

window.onload = function() {
    fetchData();
};

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    if(element) element.classList.add('active');
    
    const titles = {
        'dashboard': 'Dashboard Overview',
        'funders': 'Funder / CSR Management',
        'schools': 'School Management',
        'vendors': 'Vendor Directory',
        'activities': 'Expense & Activity Logs',
        'sastra-csr': 'SASTRA CSR Allocation'
    };
    document.getElementById('pageTitle').innerText = titles[tabId] || 'Dashboard Overview';
}

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        globalData = await response.json();

        populateDropdowns();
        calculateMetrics();
        renderTablesAndCards();
        renderChart();
        renderSastraCsrTable();
        setNextIDs();

    } catch (e) {
        console.error(e);
        showToast("Data loading failed. Please check permissions.", "error");
    }
}

function setNextIDs() {
    if (globalData.funders && globalData.funders.length) {
        document.getElementById('funderId').value = "FND" + String(globalData.funders.length + 1).padStart(3, '0');
    } else {
        document.getElementById('funderId').value = "FND001";
    }

    if (globalData.schools && globalData.schools.length) {
        document.getElementById('schoolId').value = "SCH" + String(globalData.schools.length + 1).padStart(3, '0');
    } else {
        document.getElementById('schoolId').value = "SCH001";
    }

    if (globalData.vendors && globalData.vendors.length) {
        document.getElementById('vendorId').value = "VND" + String(globalData.vendors.length + 1).padStart(3, '0');
    } else {
        document.getElementById('vendorId').value = "VND001";
    }

    if (globalData.activities && globalData.activities.length) {
        document.getElementById('actId').value = "ACT" + String(globalData.activities.length + 1).padStart(3, '0');
    } else {
        document.getElementById('actId').value = "ACT001";
    }
}

function populateDropdowns() {
    const schoolFunder = document.getElementById('schoolFunder');
    const actSchool = document.getElementById('actSchool');
    const actVendor = document.getElementById('actVendor');
    
    const sastraFunderSource = document.getElementById('sastraFunderSource');
    const sastraSchool = document.getElementById('sastraSchool');
    const sastraVendor = document.getElementById('sastraVendor');

    schoolFunder.innerHTML = '<option value="">Select Funder</option>';
    actSchool.innerHTML = '<option value="">Select School</option>';
    actVendor.innerHTML = '<option value="">Select Vendor</option>';
    
    sastraFunderSource.innerHTML = '<option value="">Choose Funder Source</option>';
    sastraSchool.innerHTML = '<option value="">Select School</option>';
    sastraVendor.innerHTML = '<option value="">Select Vendor</option>';

    if(globalData.funders) {
        globalData.funders.forEach(f => {
            schoolFunder.innerHTML += `<option value="${f.funderId}">${f.funderName}</option>`;
            sastraFunderSource.innerHTML += `<option value="${f.funderId}">${f.funderName}</option>`;
        });
    }

    if(globalData.schools) {
        globalData.schools.forEach(s => {
            actSchool.innerHTML += `<option value="${s.schoolId}">${s.schoolName}</option>`;
            sastraSchool.innerHTML += `<option value="${s.schoolId}">${s.schoolName}</option>`;
        });
    }

    if(globalData.vendors) {
        globalData.vendors.forEach(v => {
            actVendor.innerHTML += `<option value="${v.vendorId}">${v.vendorName}</option>`;
            sastraVendor.innerHTML += `<option value="${v.vendorId}">${v.vendorName}</option>`;
        });
    }
}

function calculateMetrics() {
    let totalFund = 0;
    let totalSpent = 0;
    let totalPending = 0;

    if(globalData.funders) {
        totalFund = globalData.funders.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    }

    if(globalData.activities) {
        globalData.activities.forEach(a => {
            const unitCost = Number(a.unitCost || 0);
            const units = Number(a.units || 1);
            const paid = Number(a.paid || 0);
            const pending = Number(a.pending || 0);
            
            totalSpent += (unitCost * units);
            totalPending += pending;
        });
    }

    const totalBalance = totalFund - totalSpent;

    document.getElementById('dashTotalFund').innerText = `₹${totalFund.toLocaleString('en-IN')}`;
    document.getElementById('dashTotalSpent').innerText = `₹${totalSpent.toLocaleString('en-IN')}`;
    document.getElementById('dashTotalBalance').innerText = `₹${totalBalance.toLocaleString('en-IN')}`;
    document.getElementById('dashTotalPending').innerText = `₹${totalPending.toLocaleString('en-IN')}`;
    
    const sastraPool = document.getElementById('sastraTotalPool');
    if(sastraPool) {
        sastraPool.innerText = `₹${totalBalance.toLocaleString('en-IN')}`;
    }
}

function renderTablesAndCards() {
    // Funders Table
    const funderBody = document.getElementById('funderTableBody');
    funderBody.innerHTML = '';
    
    (globalData.funders || []).forEach(f => {
        const spent = getFunderSpent(f.funderId);
        const balance = Number(f.amount) - spent;
        funderBody.innerHTML += `
            <tr>
                <td><b>${f.funderId}</b></td>
                <td>${f.funderName}</td>
                <td>₹${Number(f.amount).toLocaleString('en-IN')}</td>
                <td>₹${spent.toLocaleString('en-IN')}</td>
                <td style="color:${balance < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:700;">₹${balance.toLocaleString('en-IN')}</td>
                <td><button class="btn btn-sm btn-outline" onclick="showFunderDetails('${f.funderId}')"><i class="fa-solid fa-eye"></i> View</button></td>
            </tr>
        `;
    });

    // Schools Table
    const schoolBody = document.getElementById('schoolTableBody');
    schoolBody.innerHTML = '';
    (globalData.schools || []).forEach(s => {
        const stats = getSchoolStats(s.schoolId);
        const funderObj = (globalData.funders || []).find(f => f.funderId === s.funderId);
        schoolBody.innerHTML += `
            <tr>
                <td><b>${s.schoolId}</b></td>
                <td>${s.schoolName}</td>
                <td>${s.district}</td>
                <td>${funderObj ? funderObj.funderName : s.funderId}</td>
                <td>₹${stats.spent.toLocaleString('en-IN')}</td>
                <td>₹${stats.pending.toLocaleString('en-IN')}</td>
                <td><button class="btn btn-sm btn-outline" onclick="showSchoolDetails('${s.schoolId}')"><i class="fa-solid fa-eye"></i> View</button></td>
            </tr>
        `;
    });

    // Vendors Table
    const vendorBody = document.getElementById('vendorTableBody');
    vendorBody.innerHTML = '';
    (globalData.vendors || []).forEach(v => {
        const stats = getVendorStats(v.vendorId);
        vendorBody.innerHTML += `
            <tr>
                <td><b>${v.vendorId}</b></td>
                <td>${v.vendorName}</td>
                <td>${v.category || '-'}</td>
                <td>${v.contact || '-'}</td>
                <td>₹${stats.paid.toLocaleString('en-IN')}</td>
                <td>₹${stats.pending.toLocaleString('en-IN')}</td>
                <td><button class="btn btn-sm btn-outline" onclick="showVendorDetails('${v.vendorId}')"><i class="fa-solid fa-eye"></i> View</button></td>
            </tr>
        `;
    });

    // Activity Cards (Grouped by School)
    renderActivityCards();
}

function renderSastraCsrTable() {
    const tableBody = document.getElementById('sastraFunderTableBody');
    if(!tableBody) return;
    tableBody.innerHTML = '';

    (globalData.funders || []).forEach(f => {
        const spent = getFunderSpent(f.funderId);
        const balance = Number(f.amount || 0) - spent;
        tableBody.innerHTML += `
            <tr>
                <td><b>${f.funderId}</b></td>
                <td>${f.funderName}</td>
                <td>₹${Number(f.amount || 0).toLocaleString('en-IN')}</td>
                <td>₹${spent.toLocaleString('en-IN')}</td>
                <td style="color:${balance < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:700;">₹${balance.toLocaleString('en-IN')}</td>
            </tr>
        `;
    });
}

function updateSastraFunderBalance() {
    const funderId = document.getElementById('sastraFunderSource').value;
    const balanceInput = document.getElementById('sastraAvailableBalance');
    
    if(!funderId) {
        balanceInput.value = "₹0";
        return;
    }

    const funder = (globalData.funders || []).find(f => f.funderId === funderId);
    if(funder) {
        const spent = getFunderSpent(funderId);
        const balance = Number(funder.amount || 0) - spent;
        balanceInput.value = `₹${balance.toLocaleString('en-IN')}`;
    }
}

function getFunderSpent(funderId) {
    const schoolsOfFunder = (globalData.schools || [])
        .filter(s => s.funderId === funderId)
        .map(s => s.schoolId);

    let spent = 0;
    (globalData.activities || []).forEach(a => {
        if(schoolsOfFunder.includes(a.schoolId)) {
            spent += Number(a.unitCost || 0) * Number(a.units || 1);
        }
    });
    return spent;
}

function getSchoolStats(schoolId) {
    let spent = 0;
    let pending = 0;
    (globalData.activities || []).forEach(a => {
        if(a.schoolId === schoolId) {
            spent += Number(a.unitCost || 0) * Number(a.units || 1);
            pending += Number(a.pending || 0);
        }
    });
    return { spent, pending };
}

function getVendorStats(vendorId) {
    let paid = 0;
    let pending = 0;
    (globalData.activities || []).forEach(a => {
        if(a.vendorId === vendorId) {
            paid += Number(a.paid || 0);
            pending += Number(a.pending || 0);
        }
    });
    return { paid, pending };
}

function renderActivityCards() {
    const container = document.getElementById('activityContainer');
    container.innerHTML = '';

    (globalData.schools || []).forEach(s => {
        const schoolActivities = (globalData.activities || []).filter(a => a.schoolId === s.schoolId);
        
        let activitiesHtml = '';
        if(schoolActivities.length === 0) {
            activitiesHtml = `<p style="color:var(--text-muted); font-size:0.85rem; padding: 0.5rem 0;">No activities recorded yet.</p>`;
        } else {
            schoolActivities.forEach(a => {
                const total = Number(a.unitCost || 0) * Number(a.units || 1);
                activitiesHtml += `
                    <div class="activity-item">
                        <div>
                            <strong>${a.desc}</strong>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${a.actId} | Units: ${a.units} | Paid: ₹${a.paid}</div>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-weight:700;">₹${total}</span>
                            ${a.pending > 0 ? `<div style="font-size:0.75rem; color:var(--danger);">Pending: ₹${a.pending}</div>` : ''}
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML += `
            <div class="card school-card">
                <div class="school-card-header">
                    <h4>${s.schoolName}</h4>
                    <span class="badge">${s.district}</span>
                </div>
                <div class="activity-list">
                    ${activitiesHtml}
                </div>
            </div>
        `;
    });
}

function renderChart() {
    const ctx = document.getElementById('funderChart').getContext('2d');
    
    if(chartInstance) {
        chartInstance.destroy();
    }

    const labels = [];
    const balances = [];

    (globalData.funders || []).forEach(f => {
        labels.push(f.funderName);
        const spent = getFunderSpent(f.funderId);
        balances.push(Number(f.amount || 0) - spent);
    });

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Available Balance (₹)',
                data: balances,
                backgroundColor: '#4f46e5',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function calculateActivityTotal() {
    const cost = Number(document.getElementById('actUnitCost').value || 0);
    const units = Number(document.getElementById('actUnits').value || 1);
    const paid = Number(document.getElementById('actPaid').value || 0);
    
    const total = cost * units;
    const pending = total - paid;
    
    document.getElementById('actPending').value = pending > 0 ? pending : 0;
}

// FORM SUBMISSIONS
function handleFunderSubmit(e) {
    e.preventDefault();
    const payload = {
        type: 'funder',
        funderId: document.getElementById('funderId').value,
        funderName: document.getElementById('funderName').value,
        amount: document.getElementById('funderAmount').value
    };
    sendData(payload, 'funderForm');
}

function handleSchoolSubmit(e) {
    e.preventDefault();
    const payload = {
        type: 'school',
        schoolId: document.getElementById('schoolId').value,
        schoolName: document.getElementById('schoolName').value,
        district: document.getElementById('schoolDistrict').value,
        funderId: document.getElementById('schoolFunder').value
    };
    sendData(payload, 'schoolForm');
}

function handleVendorSubmit(e) {
    e.preventDefault();
    const payload = {
        type: 'vendor',
        vendorId: document.getElementById('vendorId').value,
        vendorName: document.getElementById('vendorName').value,
        category: document.getElementById('vendorCategory').value,
        contact: document.getElementById('vendorContact').value
    };
    sendData(payload, 'vendorForm');
}

function handleActivitySubmit(e) {
    e.preventDefault();
    const payload = {
        type: 'activity',
        actId: document.getElementById('actId').value,
        schoolId: document.getElementById('actSchool').value,
        vendorId: document.getElementById('actVendor').value,
        desc: document.getElementById('actDesc').value,
        unitCost: document.getElementById('actUnitCost').value,
        units: document.getElementById('actUnits').value,
        paid: document.getElementById('actPaid').value,
        pending: document.getElementById('actPending').value
    };
    sendData(payload, 'activityForm');
}

function handleSastraCsrSubmit(e) {
    e.preventDefault();
    const funderId = document.getElementById('sastraFunderSource').value;
    const amountSpent = Number(document.getElementById('sastraAmountSpent').value || 0);
    
    const funder = (globalData.funders || []).find(f => f.funderId === funderId);
    if(funder) {
        const available = Number(funder.amount || 0) - getFunderSpent(funderId);
        if(amountSpent > available) {
            showToast("Selected Funder balance is less than expense amount!", "error");
            return;
        }
    }

    const payload = {
        type: 'activity',
        actId: "ACT" + String((globalData.activities || []).length + 1).padStart(3, '0'),
        schoolId: document.getElementById('sastraSchool').value,
        vendorId: document.getElementById('sastraVendor').value,
        desc: `[SASTRA CSR] ${document.getElementById('sastraDesc').value}`,
        unitCost: amountSpent,
        units: 1,
        paid: amountSpent,
        pending: 0
    };

    sendData(payload, 'sastraCsrForm');
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
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function closeModal() {
    document.getElementById('detailsModal').style.display = 'none';
}

function showFunderDetails(id) {
    const funder = globalData.funders.find(f => f.funderId === id);
    const schools = globalData.schools.filter(s => s.funderId === id);
    let html = `<h3>${funder.funderName} (${funder.funderId})</h3><p>Total Fund: ₹${funder.amount}</p><br><h4>Assigned Schools:</h4><ul>`;
    schools.forEach(s => html += `<li>${s.schoolName} - ${s.district}</li>`);
    html += '</ul>';
    
    document.getElementById('modalTitle').innerText = 'Funder Details';
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('detailsModal').style.display = 'flex';
}

function showSchoolDetails(id) {
    const school = globalData.schools.find(s => s.schoolId === id);
    const acts = globalData.activities.filter(a => a.schoolId === id);
    let html = `<h3>${school.schoolName}</h3><p>District: ${school.district}</p><br><h4>Activities:</h4><ul>`;
    acts.forEach(a => html += `<li>${a.desc}: ₹${Number(a.unitCost) * Number(a.units)}</li>`);
    html += '</ul>';

    document.getElementById('modalTitle').innerText = 'School Details';
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('detailsModal').style.display = 'flex';
}

function showVendorDetails(id) {
    const vendor = globalData.vendors.find(v => v.vendorId === id);
    const acts = globalData.activities.filter(a => a.vendorId === id);
    let html = `<h3>${vendor.vendorName}</h3><p>Category: ${vendor.category}</p><br><h4>Supplied Activities:</h4><ul>`;
    acts.forEach(a => html += `<li>${a.desc} - Paid: ₹${a.paid}, Pending: ₹${a.pending}</li>`);
    html += '</ul>';

    document.getElementById('modalTitle').innerText = 'Vendor Details';
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('detailsModal').style.display = 'flex';
}
