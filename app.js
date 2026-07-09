// ==================== KONFIGURASI ====================
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec/',
    AUTO_RELOAD_INTERVAL: 60000, // 1 menit
    MAX_BATCH_ITEMS: 50,
    STORAGE_KEY: 'ikanAppData',
    CACHE_KEY: 'ikanAppCache'
};

// ==================== STATE ====================
let appState = {
    transactions: [],
    buyers: [],
    fish: [],
    unloadings: [],
    paymentMethods: ['Non Kontan', 'Kontan', 'Transfer', 'Tempo'],
    batch: {
        tanggal: '',
        hari: '',
        pembeli: '',
        bongkaran: '',
        metodePembayaran: 'Non Kontan',
        dp: 0,
        items: []
    },
    isLoading: false,
    isOnline: navigator.onLine,
    lastUpdate: null
};

// ==================== UTILITY FUNGSI ====================

/** formatRupiah - Format angka ke Rupiah */
function formatRupiah(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return 'Rp 0';
    }
    return 'Rp ' + new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/** getHariFromDate - Mendapatkan nama hari dari tanggal */
function getHariFromDate(dateStr) {
    if (!dateStr) return '';
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const date = new Date(dateStr);
    return days[date.getDay()];
}

/** formatTanggalIndonesia - Format tanggal ke format Indonesia */
function formatTanggalIndonesia(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/** formatTanggalCetak - Format untuk cetak */
function formatTanggalCetak(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/** convertUTCtoWIB - Konversi UTC ke WIB */
function convertUTCtoWIB(utcDate) {
    if (!utcDate) return null;
    const date = new Date(utcDate);
    // WIB = UTC + 7 jam
    date.setHours(date.getHours() + 7);
    return date;
}

/** convertWIBtoUTC - Konversi WIB ke UTC */
function convertWIBtoUTC(wibDate) {
    if (!wibDate) return null;
    const date = new Date(wibDate);
    date.setHours(date.getHours() - 7);
    return date;
}

/** normalizeDateForDisplay - Normalisasi tanggal untuk display */
function normalizeDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
}

// ==================== SEARCH & SELECT2 ====================

/** setupStartsWithSearch - Setup search starts with */
function setupStartsWithSearch(selector) {
    $(selector).select2({
        matcher: function(params, data) {
            if (!params.term) return data;
            const term = params.term.toLowerCase();
            const text = data.text.toLowerCase();
            if (text.startsWith(term)) return data;
            return null;
        },
        placeholder: 'Cari...',
        allowClear: true    });
}

/** setupSelect2Ikan - Setup Select2 untuk ikan */
function setupSelect2Ikan(selector) {
    $(selector).select2({
        placeholder: 'Pilih ikan...',
        allowClear: true,
        tags: true,
        createTag: function(params) {
            return {
                id: params.term,
                text: params.term,
                newTag: true
            };
        },
        templateResult: function(data) {
            if (!data.id) return data.text;
            if (data.newTag) {
                return $('<span><i class="bi bi-plus-circle text-success"></i> ' + data.text + '</span>');
            }
            return data.text;
        }
    });
}

// ==================== BATCH FUNCTIONS ====================

/** getBatch - Mendapatkan data batch */
function getBatch() {
    return appState.batch;
}

/** updateBatchTotal - Update total batch */
function updateBatchTotal() {
    const tanggal = document.getElementById('transaksiTanggal').value;
    const dp = parseFloat(document.getElementById('transaksiDP').value) || 0;
    
    // Update hari
    if (tanggal) {
        document.getElementById('transaksiHari').value = getHariFromDate(tanggal);
    }
    
    // Update total
    let total = 0;
    document.querySelectorAll('.batch-item').forEach(item => {
        const jumlah = parseFloat(item.querySelector('.item-jumlah')?.value) || 0;
        const harga = parseFloat(item.querySelector('.item-harga')?.value) || 0;
        total += jumlah * harga;
    });
    
    document.getElementById('transaksiTotal').value = formatRupiah(total);
    updateBatchSummary();
    saveBatchToStorage();
}

/** updateBatchSummary - Update summary */
function updateBatchSummary() {
    const items = document.querySelectorAll('.batch-item');
    let total = 0;
    items.forEach(item => {
        const jumlah = parseFloat(item.querySelector('.item-jumlah')?.value) || 0;
        const harga = parseFloat(item.querySelector('.item-harga')?.value) || 0;
        total += jumlah * harga;
    });
    
    const dp = parseFloat(document.getElementById('transaksiDP').value) || 0;
    
    document.getElementById('summaryItemCount').textContent = items.length;
    document.getElementById('summaryTotal').textContent = formatRupiah(total);
    document.getElementById('summaryDP').textContent = formatRupiah(dp);
    document.getElementById('batchCount').textContent = items.length + ' item';
}

/** clearBatch - Clear batch */
function clearBatch() {
    if (!confirm('Hapus semua item?')) return;
    document.getElementById('batchItemsContainer').innerHTML = '';
    updateBatchTotal();
    saveBatchToStorage();
    showToast('Batch dibersihkan', 'info');
}

/** removeBatch - Remove item from batch */
function removeBatch(index) {
    const item = document.getElementById(`batchItem_${index}`);
    if (item) {
        item.remove();
        // Reindex
        document.querySelectorAll('.batch-item').forEach((el, i) => {
            el.id = `batchItem_${i}`;
            el.querySelector('.item-index').textContent = i + 1;
        });
        updateBatchTotal();
        saveBatchToStorage();
    }
}

/** renderBatchItemHTML - Render HTML batch item */
function renderBatchItemHTML(index, data = null) {
    const fishOptions = appState.fish.map(f => 
        `<option value="${f.nama}" ${data && data.jenisIkan === f.nama ? 'selected' : ''}>
            ${f.nama} (${formatRupiah(f.hargaDefault)})
        </option>`
    ).join('');
    
    return `
        <div class="batch-item" id="batchItem_${index}">
            <div class="row align-items-center">
                <div class="col-1">
                    <span class="item-index">${index + 1}</span>
                </div>
                <div class="col-12 col-md-4">
                    <select class="form-select form-select-sm item-jenis" data-index="${index}" 
                            onchange="calculateItemSubtotal(${index})">
                        <option value="">Pilih Ikan...</option>
                        ${fishOptions}
                    </select>
                </div>
                <div class="col-3 col-md-2">
                    <input type="number" class="form-control form-control-sm item-jumlah" 
                           data-index="${index}" value="${data?.jumlah || 1}" 
                           min="0.1" step="0.1" oninput="calculateItemSubtotal(${index})">
                </div>
                <div class="col-3 col-md-2">
                    <input type="number" class="form-control form-control-sm item-harga" 
                           data-index="${index}" value="${data?.harga || 0}" 
                           min="0" step="1000" oninput="calculateItemSubtotal(${index})">
                </div>
                <div class="col-4 col-md-2">
                    <span class="item-subtotal" id="itemSubtotal_${index}">
                        ${formatRupiah((data?.jumlah || 0) * (data?.harga || 0))}
                    </span>
                </div>
                <div class="col-1 text-end">
                    <button class="remove-btn" onclick="removeBatch(${index})">
                        <i class="bi bi-x-circle"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/** setupBatchEvents - Setup event batch */
function setupBatchEvents() {
    // Auto-save setiap perubahan
    document.querySelectorAll('#transaksiTanggal, #transaksiDP, #transaksiPembeli, #transaksiBongkaran, #transaksiMetode')
        .forEach(el => {
            el.addEventListener('change', saveBatchToStorage);
            el.addEventListener('input', saveBatchToStorage);
        });
}

/** renderBatchItem - Render item ke batch */
function renderBatchItem(data = null) {
    const container = document.getElementById('batchItemsContainer');
    const index = container.children.length;
    container.insertAdjacentHTML('beforeend', renderBatchItemHTML(index, data));
    return index;
}

/** calculateItemSubtotal - Hitung subtotal item */
function calculateItemSubtotal(index) {
    const item = document.getElementById(`batchItem_${index}`);
    if (!item) return;
    
    const jumlah = parseFloat(item.querySelector('.item-jumlah')?.value) || 0;
    const harga = parseFloat(item.querySelector('.item-harga')?.value) || 0;
    const subtotal = jumlah * harga;
    
    const subtotalEl = document.getElementById(`itemSubtotal_${index}`);
    if (subtotalEl) {
        subtotalEl.textContent = formatRupiah(subtotal);
    }
    
    updateBatchTotal();
}

/** addItemToBatch - Tambah item ke batch */
function addItemToBatch(data = null) {
    const container = document.getElementById('batchItemsContainer');
    if (container.children.length >= CONFIG.MAX_BATCH_ITEMS) {
        showToast('Maksimal ' + CONFIG.MAX_BATCH_ITEMS + ' item', 'warning');
        return;
    }
    renderBatchItem(data);
    updateBatchTotal();
    saveBatchToStorage();
    // Scroll to new item
    const lastItem = container.lastElementChild;
    if (lastItem) {
        lastItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/** removeItemFromBatch - Hapus item dari batch */
function removeItemFromBatch(index) {
    removeBatch(index);
}

/** reattachGlobalEvents - Reattach global events */
function reattachGlobalEvents() {
    // Untuk event yang mungkin hilang setelah DOM update
    document.querySelectorAll('.item-jenis, .item-jumlah, .item-harga').forEach(el => {
        el.removeEventListener('change', updateBatchTotal);
        el.removeEventListener('input', updateBatchTotal);
        el.addEventListener('change', updateBatchTotal);
        el.addEventListener('input', updateBatchTotal);
    });
}

// ==================== SAVE BATCH ====================

/** saveBatch - Simpan batch ke server */
async function saveBatch() {
    const tanggal = document.getElementById('transaksiTanggal').value;
    const pembeli = document.getElementById('transaksiPembeli').value;
    const bongkaran = document.getElementById('transaksiBongkaran').value;
    const metode = document.getElementById('transaksiMetode').value;
    const dp = parseFloat(document.getElementById('transaksiDP').value) || 0;
    
    // Validasi
    if (!validateTransaction(tanggal, pembeli)) {
        return;
    }
    
    // Collect items
    const items = [];
    let valid = true;
    document.querySelectorAll('.batch-item').forEach(item => {
        const jenisIkan = item.querySelector('.item-jenis')?.value;
        const jumlah = parseFloat(item.querySelector('.item-jumlah')?.value) || 0;
        const harga = parseFloat(item.querySelector('.item-harga')?.value) || 0;
        
        if (!jenisIkan) {
            valid = false;
            showToast('Pilih jenis ikan untuk semua item', 'error');
        }
        if (jumlah <= 0) {
            valid = false;
            showToast('Jumlah harus lebih dari 0', 'error');
        }
        if (harga <= 0) {
            valid = false;
            showToast('Harga harus lebih dari 0', 'error');
        }
        
        items.push({ jenisIkan, jumlah, harga, subtotal: jumlah * harga });
    });
    
    if (!valid || items.length === 0) {
        return;
    }
    
    const totalBelanja = items.reduce((sum, item) => sum + item.subtotal, 0);
    const hari = getHariFromDate(tanggal);
    
    const data = {
        action: 'saveBatch',
        tanggal,
        hari,
        pembeli,
        bongkaran: bongkaran || '-',
        metodePembayaran: metode || 'Non Kontan',
        dp,
        totalBelanja,
        items
    };
    
    showLoading('Menyimpan transaksi...');
    
    try {
        const result = await callAPI('POST', data);
        hideLoading();
        
        if (result && result.status === 'success') {
            showToast(result.message || 'Transaksi berhasil disimpan!', 'success');
            resetBatchForm();
            loadAllData();
            // Switch ke home
            const homeTab = document.getElementById('tab-home');
            if (homeTab) homeTab.click();
        } else {
            showToast(result?.message || 'Gagal menyimpan', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/** validateTransaction - Validasi transaksi */
function validateTransaction(tanggal, pembeli) {
    if (!tanggal) {
        showToast('Tanggal harus diisi', 'error');
        return false;
    }
    if (!pembeli) {
        showToast('Pembeli harus diisi', 'error');
        return false;
    }
    return true;
}

// ==================== API CALLS ====================

/** callAPI - Panggil API */
async function callAPI(method, data = null) {
    try {
        const options = {
            method: method,
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json',
            }
        };
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(CONFIG.API_URL, options);
        if (!response.ok) {
            throw new Error('HTTP Error: ' + response.status);
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== LOAD DATA ====================

/** loadAllData - Load semua data */
async function loadAllData() {
    if (appState.isLoading) return;
    
    showLoading('Memuat data...');
    appState.isLoading = true;
    
    try {
        const result = await callAPI('GET');
        hideLoading();
        
        if (result && result.status === 'success') {
            appState.transactions = result.rekap || [];
            appState.buyers = result.pembeli || [];
            appState.fish = result.ikan || [];
            appState.unloadings = result.bongkaran || [];
            appState.paymentMethods = result.metodePembayaran || ['Non Kontan', 'Kontan', 'Transfer', 'Tempo'];
            appState.lastUpdate = new Date();
            
            // Update UI
            displayRekapTable();
            displayPembeliList();
            displayIkanList();
            displayBongkaranList();
            updateSelectOptions();
            updateSummaryStats();
            updateLastUpdate();
            
            // Simpan ke cache
            saveToCache();
            
            showToast('Data berhasil dimuat', 'success');
        } else {
            showToast('Gagal memuat data', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
        // Coba dari cache
        loadFromCache();
    }
    
    appState.isLoading = false;
}

/** loadFromCache - Load dari cache */
function loadFromCache() {
    try {
        const cached = localStorage.getItem(CONFIG.CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            appState.transactions = data.transactions || [];
            appState.buyers = data.buyers || [];
            appState.fish = data.fish || [];
            appState.unloadings = data.unloadings || [];
            
            displayRekapTable();
            displayPembeliList();
            displayIkanList();
            displayBongkaranList();
            updateSelectOptions();
            updateSummaryStats();
            
            showToast('Memuat data dari cache (offline)', 'warning');
        }
    } catch (e) {
        console.warn('Cache load error:', e);
    }
}

/** saveToCache - Simpan ke cache */
function saveToCache() {
    try {
        const data = {
            transactions: appState.transactions,
            buyers: appState.buyers,
            fish: appState.fish,
            unloadings: appState.unloadings,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Cache save error:', e);
    }
}

// ==================== DISPLAY FUNCTIONS ====================

/** displayRekapTable - Tampilkan tabel rekap */
function displayRekapTable(data = null) {
    const tbody = document.getElementById('rekapBody');
    const transactions = data || appState.transactions;
    
    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Tidak ada data</td></tr>';
        return;
    }
    
    let html = '';
    transactions.forEach((t, index) => {
        const sisa = t.total - t.dp;
        const isKontan = t.metodePembayaran === 'Kontan';
        const rowClass = isKontan ? 'row-kontan' : '';
        
        html += `
            <tr class="${rowClass}">
                <td>${formatTanggalIndonesia(t.tanggal)}</td>
                <td><strong>${t.pembeli || '-'}</strong></td>
                <td>${t.jenisIkan || '-'}</td>
                <td>${t.jumlah || 0} kg</td>
                <td>${formatRupiah(t.harga)}</td>
                <td><strong>${formatRupiah(t.total)}</strong></td>
                <td>${formatRupiah(t.dp)}</td>
                <td class="${sisa > 0 ? 'text-danger' : 'text-success'}">
                    ${formatRupiah(sisa)}
                </td>
                <td>${t.bongkaran || '-'}</td>
                <td>
                    <span class="badge ${isKontan ? 'bg-danger' : 'bg-secondary'}">
                        ${t.metodePembayaran || 'Non Kontan'}
                    </span>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/** filterData - Filter data */
function filterData() {
    const keyword = document.getElementById('filterInput').value.toLowerCase().trim();
    const bongkaranFilter = document.getElementById('filterBongkaran').value;
    
    let filtered = appState.transactions;
    
    if (keyword) {
        filtered = filtered.filter(t => 
            (t.pembeli && t.pembeli.toLowerCase().includes(keyword)) ||
            (t.jenisIkan && t.jenisIkan.toLowerCase().includes(keyword)) ||
            (t.bongkaran && t.bongkaran.toLowerCase().includes(keyword))
        );
    }
    
    if (bongkaranFilter) {
        filtered = filtered.filter(t => t.bongkaran === bongkaranFilter);
    }
    
    displayRekapTable(filtered);
}

/** tampilkanRekapBongkaran - Tampilkan rekap per bongkaran */
function tampilkanRekapBongkaran() {
    const container = document.getElementById('rekapBongkaranContainer');
    
    // Group by bongkaran
    const grouped = {};
    appState.transactions.forEach(t => {
        const key = t.bongkaran || 'Tanpa Bongkaran';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
    });
    
    let html = '<h5 class="mb-3">📊 Rekap Per Bongkaran</h5>';
    
    for (const [bongkaran, transactions] of Object.entries(grouped)) {
        const total = transactions.reduce((sum, t) => sum + t.total, 0);
        const dp = transactions.reduce((sum, t) => sum + t.dp, 0);
        const sisa = total - dp;
        const count = transactions.length;
        
        html += `
            <div class="card mb-3">
                <div class="card-header bg-primary text-white d-flex justify-content-between">
                    <span><i class="bi bi-box"></i> ${bongkaran}</span>
                    <span class="badge bg-light text-dark">${count} transaksi</span>
                </div>
                <div class="card-body">
                    <div class="row text-center">
                        <div class="col-4">
                            <small class="text-muted">Total</small>
                            <h6>${formatRupiah(total)}</h6>
                        </div>
                        <div class="col-4">
                            <small class="text-muted">DP</small>
                            <h6>${formatRupiah(dp)}</h6>
                        </div>
                        <div class="col-4">
                            <small class="text-muted">Sisa</small>
                            <h6 class="${sisa > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(sisa)}</h6>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-outline-primary mt-2" onclick="cetakRekapBongkaran('${bongkaran}')">
                        <i class="bi bi-printer"></i> Cetak
                    </button>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html || '<p class="text-muted">Tidak ada data</p>';
}

/** cetakRekapBongkaran - Cetak rekap per bongkaran */
function cetakRekapBongkaran(bongkaran) {
    const transactions = appState.transactions.filter(t => (t.bongkaran || 'Tanpa Bongkaran') === bongkaran);
    if (transactions.length === 0) {
        showToast('Tidak ada data untuk dicetak', 'warning');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const total = transactions.reduce((sum, t) => sum + t.total, 0);
    const dp = transactions.reduce((sum, t) => sum + t.dp, 0);
    const sisa = total - dp;
    
    let rows = '';
    transactions.forEach(t => {
        rows += `
            <tr>
                <td>${formatTanggalIndonesia(t.tanggal)}</td>
                <td>${t.pembeli}</td>
                <td>${t.jenisIkan}</td>
                <td>${t.jumlah} kg</td>
                <td>${formatRupiah(t.total)}</td>
                <td>${formatRupiah(t.dp)}</td>
                <td>${formatRupiah(t.total - t.dp)}</td>
                <td>${t.metodePembayaran}</td>
            </tr>
        `;
    });
    
    printWindow.document.write(`
        <html>
        <head><title>Rekap Bongkaran - ${bongkaran}</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h2 { color: #2c7da0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #2c7da0; color: white; padding: 8px; text-align: left; }
            td { padding: 6px; border-bottom: 1px solid #ddd; }
            .total { font-weight: bold; font-size: 18px; margin-top: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
            @media print { .no-print { display: none; } }
        </style>
        </head>
        <body>
            <h2>📊 Rekap Bongkaran: ${bongkaran}</h2>
            <p>Tanggal Cetak: ${formatTanggalCetak(new Date())}</p>
            <table>
                <thead>
                    <tr>
                        <th>Tanggal</th>
                        <th>Pembeli</th>
                        <th>Ikan</th>
                        <th>Jumlah</th>
                        <th>Total</th>
                        <th>DP</th>
                        <th>Sisa</th>
                        <th>Metode</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="total">
                <p>Total: ${formatRupiah(total)}</p>
                <p>DP Total: ${formatRupiah(dp)}</p>
                <p>Sisa Total: ${formatRupiah(sisa)}</p>
                <p>Jumlah Transaksi: ${transactions.length}</p>
            </div>
            <div class="footer">Dicetak dari Ikan App - ${new Date().toLocaleString()}</div>
            <button class="no-print" onclick="window.print()">🖨️ Cetak</button>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/** displayPembeliList - Tampilkan list pembeli */
function displayPembeliList() {
    const container = document.getElementById('pembeliList');
    if (!container) return;
    
    if (appState.buyers.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Belum ada pembeli</p>';
        return;
    }
    
    let html = '';
    appState.buyers.forEach(b => {
        html += `
            <div class="list-item">
                <span><i class="bi bi-person"></i> ${b}</span>
                <button class="delete-btn" onclick="deletePembeli('${b}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

/** displayIkanList - Tampilkan list ikan */
function displayIkanList() {
    const container = document.getElementById('ikanList');
    if (!container) return;
    
    if (appState.fish.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Belum ada ikan</p>';
        return;
    }
    
    let html = '';
    appState.fish.forEach(f => {
        html += `
            <div class="list-item">
                <span><i class="bi bi-fish"></i> ${f.nama}</span>
                <span>
                    ${formatRupiah(f.hargaDefault)}
                    <button class="delete-btn" onclick="deleteIkan('${f.nama}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </span>
            </div>
        `;
    });
    container.innerHTML = html;
}

/** displayBongkaranList - Tampilkan list bongkaran */
function displayBongkaranList() {
    const container = document.getElementById('bongkaranList');
    if (!container) return;
    
    if (appState.unloadings.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Belum ada bongkaran</p>';
        return;
    }
    
    let html = '';
    appState.unloadings.forEach(b => {
        html += `
            <div class="list-item">
                <span><i class="bi bi-box"></i> ${b}</span>
                <button class="delete-btn" onclick="deleteBongkaran('${b}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

/** refreshMasterDisplay - Refresh semua master */
function refreshMasterDisplay() {
    displayPembeliList();
    displayIkanList();
    displayBongkaranList();
    updateSelectOptions();
}

// ==================== MASTER DATA OPERATIONS ====================

/** tambahPembeli - Tambah pembeli */
async function tambahPembeli() {
    const input = document.getElementById('inputPembeli');
    const nama = input.value.trim();
    if (!nama) {
        showToast('Nama pembeli harus diisi', 'error');
        return;
    }
    
    showLoading('Menambahkan pembeli...');
    try {
        const result = await callAPI('POST', { action: 'addPembeli', nama });
        hideLoading();
        if (result && result.status === 'success') {
            showToast('Pembeli berhasil ditambahkan', 'success');
            input.value = '';
            loadAllData();
        } else {
            showToast(result?.message || 'Gagal menambahkan', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/** tambahIkan - Tambah ikan */
async function tambahIkan() {
    const nama = document.getElementById('inputIkanNama').value.trim();
    const harga = parseFloat(document.getElementById('inputIkanHarga').value) || 0;
    
    if (!nama) {
        showToast('Nama ikan harus diisi', 'error');
        return;
    }
    if (harga <= 0) {
        showToast('Harga harus lebih dari 0', 'error');
        return;
    }
    
    showLoading('Menambahkan ikan...');
    try {
        const result = await callAPI('POST', { action: 'addIkan', nama, harga });
        hideLoading();
        if (result && result.status === 'success') {
            showToast('Ikan berhasil ditambahkan', 'success');
            document.getElementById('inputIkanNama').value = '';
            document.getElementById('inputIkanHarga').value = '';
            loadAllData();
        } else {
            showToast(result?.message || 'Gagal menambahkan', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/** updateHargaIkan - Update harga ikan */
async function updateHargaIkan(nama, hargaBaru) {
    if (hargaBaru <= 0) {
        showToast('Harga harus lebih dari 0', 'error');
        return;
    }
    
    showLoading('Update harga...');
    try {
        const result = await callAPI('POST', { action: 'updateHargaIkan', nama, harga: hargaBaru });
        hideLoading();
        if (result && result.status === 'success') {
            showToast('Harga berhasil diupdate', 'success');
            loadAllData();
        } else {
            showToast(result?.message || 'Gagal update', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/** deleteIkan - Hapus ikan */
async function deleteIkan(nama) {
    if (!confirm(`Hapus ikan "${nama}"?`)) return;
    
    showLoading('Menghapus ikan...');
    try {
        const result = await callAPI('POST', { action: 'deleteIkan', nama });
        hideLoading();
        if (result && result.status === 'success') {
            showToast('Ikan berhasil dihapus', 'success');
            loadAllData();
        } else {
            showToast(result?.message || 'Gagal menghapus', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/** tambahBongkaran - Tambah bongkaran */
async function tambahBongkaran() {
    const input = document.getElementById('inputBongkaran');
    const nama = input.value.trim();
    if (!nama) {
        showToast('Nama bongkaran harus diisi', 'error');
        return;
    }
    
    showLoading('Menambahkan bongkaran...');
    try {
        const result = await callAPI('POST', { action: 'addBongkaran', nama });
        hideLoading();
        if (result && result.status === 'success') {
            showToast('Bongkaran berhasil ditambahkan', 'success');
            input.value = '';
            loadAllData();
        } else {
            showToast(result?.message || 'Gagal menambahkan', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/** deleteBongkaran - Hapus bongkaran */
async function deleteBongkaran(nama) {
    if (!confirm(`Hapus bongkaran "${nama}"?`)) return;
    
    showLoading('Menghapus bongkaran...');
    try {
        const result = await callAPI('POST', { action: 'deleteBongkaran', nama });
        hideLoading();
        if (result && result.status === 'success') {
            showToast('Bongkaran berhasil dihapus', 'success');
            loadAllData();
        } else {
            showToast(result?.message || 'Gagal menghapus', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/** deletePembeli - Hapus pembeli (fungsi tambahan) */
async function deletePembeli(nama) {
    if (!confirm(`Hapus pembeli "${nama}"?`)) return;
    // Implementasi hapus pembeli di server
    showToast('Fitur hapus pembeli sedang dalam pengembangan', 'warning');
}

// ==================== CETAK REKAP ====================

/** cetakRekap - Cetak rekap */
function cetakRekap() {
    if (appState.transactions.length === 0) {
        showToast('Tidak ada data untuk dicetak', 'warning');
        return;
    }
    
    const total = appState.transactions.reduce((sum, t) => sum + t.total, 0);
    const dp = appState.transactions.reduce((sum, t) => sum + t.dp, 0);
    const sisa = total - dp;
    const kontan = appState.transactions
        .filter(t => t.metodePembayaran === 'Kontan')
        .reduce((sum, t) => sum + t.total, 0);
    
    let rows = '';
    appState.transactions.forEach(t => {
        rows += `
            <tr>
                <td>${formatTanggalIndonesia(t.tanggal)}</td>
                <td>${t.pembeli}</td>
                <td>${t.jenisIkan}</td>
                <td>${t.jumlah} kg</td>
                <td>${formatRupiah(t.total)}</td>
                <td>${formatRupiah(t.dp)}</td>
                <td>${formatRupiah(t.total - t.dp)}</td>
                <td>${t.bongkaran || '-'}</td>
                <td>${t.metodePembayaran}</td>
            </tr>
        `;
    });
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Rekap Penjualan Ikan</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { color: #2c7da0; text-align: center; }
                .header { text-align: center; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th { background: #2c7da0; color: white; padding: 8px; text-align: left; }
                td { padding: 6px; border-bottom: 1px solid #ddd; }
                .summary { margin: 20px 0; display: flex; flex-wrap: wrap; gap: 20px; }
                .summary-item { background: #f0f4f8; padding: 10px 20px; border-radius: 8px; }
                .footer { margin-top: 30px; font-size: 11px; color: #666; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>🐟 Rekap Penjualan Ikan</h2>
                <p>Tanggal Cetak: ${formatTanggalCetak(new Date())}</p>
                <p>Total Transaksi: ${appState.transactions.length}</p>
            </div>
            
            <div class="summary">
                <div class="summary-item"><strong>Total Pendapatan:</strong> ${formatRupiah(total)}</div>
                <div class="summary-item"><strong>Total DP:</strong> ${formatRupiah(dp)}</div>
                <div class="summary-item"><strong>Total Piutang:</strong> ${formatRupiah(sisa)}</div>
                <div class="summary-item"><strong>Kontan:</strong> ${formatRupiah(kontan)}</div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Tanggal</th>
                        <th>Pembeli</th>
                        <th>Ikan</th>
                        <th>Jumlah</th>
                        <th>Total</th>
                        <th>DP</th>
                        <th>Sisa</th>
                        <th>Bongkaran</th>
                        <th>Metode</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            
            <div class="footer">
                Dicetak dari Ikan App - ${new Date().toLocaleString()}
            </div>
            
            <button class="no-print" onclick="window.print()">🖨️ Cetak</button>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ==================== SHOW/HIDE LOADING ====================

/** showLoading - Tampilkan loading */
function showLoading(text = 'Memuat...') {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    if (overlay && textEl) {
        textEl.textContent = text;
        overlay.style.display = 'flex';
    }
}

/** hideLoading - Sembunyikan loading */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// ==================== SHOW TOAST ====================

/** showToast - Tampilkan notifikasi */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-custom ${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/** showSuccess - Tampilkan success */
function showSuccess(message) {
    showToast(message, 'success');
}

/** showError - Tampilkan error */
function showError(message) {
    showToast(message, 'error');
}

// ==================== SHOW/HIDE SECTIONS ====================

/** showMasterSection - Tampilkan section master */
function showMasterSection(section) {
    // Untuk navigasi di tab master
    const sections = ['pembeli', 'ikan', 'bongkaran'];
    sections.forEach(s => {
        const el = document.getElementById(`masterSection_${s}`);
        if (el) {
            el.style.display = s === section ? 'block' : 'none';
        }
    });
}

// ==================== SCROLL OTOMATIS HP ====================

/** scrollToTop - Scroll ke atas */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** scrollToElement - Scroll ke elemen */
function scrollToElement(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ==================== CONNECTION CHECKS ====================

/** checkInternetConnection - Cek koneksi internet */
function checkInternetConnection() {
    const status = navigator.onLine;
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        if (status) {
            statusEl.className = 'status-badge status-online';
            statusEl.innerHTML = '<i class="bi bi-wifi"></i> Online';
        } else {
            statusEl.className = 'status-badge status-offline';
            statusEl.innerHTML = '<i class="bi bi-wifi-off"></i> Offline';
        }
    }
    return status;
}

/** checkServerConnection - Cek koneksi server */
async function checkServerConnection() {
    try {
        const response = await fetch(CONFIG.API_URL, { method: 'HEAD', mode: 'cors' });
        return response.ok;
    } catch {
        return false;
    }
}

// ==================== AUTO SAVE & RESTORE ====================

/** autoSaveBatch - Auto save batch ke storage */
function autoSaveBatch() {
    saveBatchToStorage();
}

/** saveBatchToStorage - Simpan batch ke storage */
function saveBatchToStorage() {
    try {
        const batch = {
            tanggal: document.getElementById('transaksiTanggal')?.value || '',
            hari: document.getElementById('transaksiHari')?.value || '',
            pembeli: document.getElementById('transaksiPembeli')?.value || '',
            bongkaran: document.getElementById('transaksiBongkaran')?.value || '',
            metodePembayaran: document.getElementById('transaksiMetode')?.value || 'Non Kontan',
            dp: parseFloat(document.getElementById('transaksiDP')?.value) || 0,
            items: []
        };
        
        document.querySelectorAll('.batch-item').forEach(item => {
            const jenisIkan = item.querySelector('.item-jenis')?.value || '';
            const jumlah = parseFloat(item.querySelector('.item-jumlah')?.value) || 0;
            const harga = parseFloat(item.querySelector('.item-harga')?.value) || 0;
            batch.items.push({ jenisIkan, jumlah, harga });
        });
        
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(batch));
    } catch (e) {
        console.warn('Auto save error:', e);
    }
}

/** autoRestoreBatch - Restore batch dari storage */
function autoRestoreBatch() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!saved) return;
        
        const batch = JSON.parse(saved);
        
        // Restore form
        if (batch.tanggal) {
            document.getElementById('transaksiTanggal').value = batch.tanggal;
            document.getElementById('transaksiHari').value = batch.hari || getHariFromDate(batch.tanggal);
        }
        if (batch.pembeli) {
            document.getElementById('transaksiPembeli').value = batch.pembeli;
        }
        if (batch.bongkaran) {
            document.getElementById('transaksiBongkaran').value = batch.bongkaran;
        }
        if (batch.metodePembayaran) {
            document.getElementById('transaksiMetode').value = batch.metodePembayaran;
        }
        if (batch.dp) {
            document.getElementById('transaksiDP').value = batch.dp;
        }
        
        // Restore items
        if (batch.items && batch.items.length > 0) {
            document.getElementById('batchItemsContainer').innerHTML = '';
            batch.items.forEach(item => {
                addItemToBatch(item);
            });
        }
        
        updateBatchTotal();
    } catch (e) {
        console.warn('Auto restore error:', e);
    }
}

// ==================== EXPORT TO CSV ====================

/** exportToCSV - Export data ke CSV */
function exportToCSV() {
    if (appState.transactions.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }
    
    // Headers
    const headers = ['Tanggal', 'Hari', 'Pembeli', 'Jenis Ikan', 'Jumlah (kg)', 'Harga (Rp)', 'Total (Rp)', 'DP (Rp)', 'Sisa (Rp)', 'Bongkaran', 'Metode Pembayaran'];
    
    // Data rows
    const rows = appState.transactions.map(t => [
        t.tanggal,
        t.hari || '',
        t.pembeli,
        t.jenisIkan,
        t.jumlah,
        t.harga,
        t.total,
        t.dp,
        t.total - t.dp,
        t.bongkaran || '',
        t.metodePembayaran || 'Non Kontan'
    ]);
    
    // Combine
    const csv = [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
    
    // Download
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `rekap_ikan_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Export CSV berhasil', 'success');
}

// ==================== RESET ALL DATA ====================

/** resetAllData - Reset semua data */
function resetAllData() {
    if (!confirm('⚠️ PERINGATAN: Ini akan menghapus SEMUA data!\n\nYakin ingin melanjutkan?')) return;
    if (!confirm('Konfirmasi terakhir: Hapus semua data?')) return;
    
    showLoading('Menghapus data...');
    
    try {
        // Hapus cache dan storage
        localStorage.removeItem(CONFIG.CACHE_KEY);
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        
        // Reset state
        appState.transactions = [];
        appState.buyers = [];
        appState.fish = [];
        appState.unloadings = [];
        
        // Refresh UI
        displayRekapTable();
        displayPembeliList();
        displayIkanList();
        displayBongkaranList();
        updateSelectOptions();
        updateSummaryStats();
        
        hideLoading();
        showToast('Data berhasil direset', 'success');
        loadAllData();
    } catch (error) {
        hideLoading();
        showToast('Error reset: ' + error.message, 'error');
    }
}

// ==================== AUTO RELOAD ====================

let autoReloadInterval = null;

/** startAutoReload - Mulai auto reload */
function startAutoReload() {
    if (autoReloadInterval) {
        clearInterval(autoReloadInterval);
    }
    autoReloadInterval = setInterval(() => {
        if (navigator.onLine) {
            loadAllData();
        }
    }, CONFIG.AUTO_RELOAD_INTERVAL);
}

/** stopAutoReload - Stop auto reload */
function stopAutoReload() {
    if (autoReloadInterval) {
        clearInterval(autoReloadInterval);
        autoReloadInterval = null;
    }
}

// ==================== SHOW APP INFO ====================

/** showAppInfo - Tampilkan info aplikasi */
function showAppInfo() {
    const info = `
        🐟 Ikan App v1.0
        
        Aplikasi Manajemen Penjualan Ikan
        Dibuat dengan ❤️
        
        Fitur:
        ✅ Pencatatan Transaksi
        ✅ Rekap Penjualan
        ✅ Master Data (Pembeli, Ikan, Bongkaran)
        ✅ Laporan & Cetak
        ✅ Export CSV
        ✅ Offline Support
        
        Data terakhir: ${appState.lastUpdate ? formatTanggalCetak(appState.lastUpdate) : 'Belum dimuat'}
        Total Transaksi: ${appState.transactions.length}
        Total Pendapatan: ${formatRupiah(appState.transactions.reduce((sum, t) => sum + t.total, 0))}
    `;
    alert(info);
}

// ==================== UPDATE UI HELPERS ====================

/** updateSelectOptions - Update semua select options */
function updateSelectOptions() {
    // Update pembeli
    const pembeliSelect = document.getElementById('transaksiPembeli');
    if (pembeliSelect) {
        const currentValue = pembeliSelect.value;
        pembeliSelect.innerHTML = '<option value="">Pilih Pembeli...</option>';
        appState.buyers.forEach(b => {
            pembeliSelect.innerHTML += `<option value="${b}">${b}</option>`;
        });
        if (currentValue && appState.buyers.includes(currentValue)) {
            pembeliSelect.value = currentValue;
        }
    }
    
    // Update bongkaran
    const bongkaranSelect = document.getElementById('transaksiBongkaran');
    if (bongkaranSelect) {
        const currentValue = bongkaranSelect.value;
        bongkaranSelect.innerHTML = '<option value="">Pilih Bongkaran...</option>';
        appState.unloadings.forEach(b => {
            bongkaranSelect.innerHTML += `<option value="${b}">${b}</option>`;
        });
        if (currentValue && appState.unloadings.includes(currentValue)) {
            bongkaranSelect.value = currentValue;
        }
    }
    
    // Update filter bongkaran
    const filterSelect = document.getElementById('filterBongkaran');
    if (filterSelect) {
        const currentValue = filterSelect.value;
        filterSelect.innerHTML = '<option value="">Semua Bongkaran</option>';
        appState.unloadings.forEach(b => {
            filterSelect.innerHTML += `<option value="${b}">${b}</option>`;
        });
        if (currentValue && appState.unloadings.includes(currentValue)) {
            filterSelect.value = currentValue;
        }
    }
}

/** updateSummaryStats - Update statistik summary */
function updateSummaryStats() {
    const total = appState.transactions.length;
    const pendapatan = appState.transactions.reduce((sum, t) => sum + t.total, 0);
    const piutang = appState.transactions.reduce((sum, t) => sum + (t.total - t.dp), 0);
    const kontan = appState.transactions
        .filter(t => t.metodePembayaran === 'Kontan')
        .reduce((sum, t) => sum + t.total, 0);
    
    document.getElementById('totalTransaksi').textContent = total;
    document.getElementById('totalPendapatan').textContent = formatRupiah(pendapatan);
    document.getElementById('totalPiutang').textContent = formatRupiah(piutang);
    document.getElementById('totalKontan').textContent = formatRupiah(kontan);
}

/** updateLastUpdate - Update waktu terakhir update */
function updateLastUpdate() {
    const el = document.getElementById('lastUpdate');
    if (el && appState.lastUpdate) {
        el.textContent = `Terakhir: ${formatTanggalCetak(appState.lastUpdate)}`;
    }
}

// ==================== BATCH FORM RESET ====================

/** resetBatchForm - Reset form batch */
function resetBatchForm() {
    document.getElementById('transaksiTanggal').value = new Date().toISOString().split('T')[0];
    document.getElementById('transaksiHari').value = getHariFromDate(new Date().toISOString().split('T')[0]);
    document.getElementById('transaksiPembeli').value = '';
    document.getElementById('transaksiBongkaran').value = '';
    document.getElementById('transaksiMetode').value = 'Non Kontan';
    document.getElementById('transaksiDP').value = '0';
    document.getElementById('batchItemsContainer').innerHTML = '';
    document.getElementById('transaksiTotal').value = formatRupiah(0);
    updateBatchSummary();
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    
    // Tambah 1 item default
    addItemToBatch();
}

// ==================== INIT ====================

/** init - Inisialisasi aplikasi */
function init() {
    console.log('🐟 Ikan App v1.0 - Memulai...');
    
    // Set default date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('transaksiTanggal').value = today;
    document.getElementById('transaksiHari').value = getHariFromDate(today);
    
    // Setup events
    setupBatchEvents();
    
    // Restore batch
    autoRestoreBatch();
    
    // Jika tidak ada item, tambahkan default
    if (document.querySelectorAll('.batch-item').length === 0) {
        addItemToBatch();
    }
    
    // Load data
    loadAllData();
    
    // Connection check
    checkInternetConnection();
    window.addEventListener('online', () => {
        checkInternetConnection();
        loadAllData();
    });
    window.addEventListener('offline', checkInternetConnection);
    
    // Auto reload
    startAutoReload();
    
    // Scroll FAB
    window.addEventListener('scroll', () => {
        const fab = document.getElementById('fabScroll');
        if (fab) {
            fab.style.display = window.scrollY > 300 ? 'flex' : 'none';
        }
    });
    
    console.log('✅ Ikan App siap!');
}

// ==================== START ====================
document.addEventListener('DOMContentLoaded', init);

// ==================== EXPOSE GLOBAL FUNCTIONS ====================
// Pastikan semua fungsi tersedia secara global
window.formatRupiah = formatRupiah;
window.getHariFromDate = getHariFromDate;
window.formatTanggalIndonesia = formatTanggalIndonesia;
window.formatTanggalCetak = formatTanggalCetak;
window.convertUTCtoWIB = convertUTCtoWIB;
window.convertWIBtoUTC = convertWIBtoUTC;
window.normalizeDateForDisplay = normalizeDateForDisplay;
window.setupStartsWithSearch = setupStartsWithSearch;
window.setupSelect2Ikan = setupSelect2Ikan;
window.getBatch = getBatch;
window.updateBatchTotal = updateBatchTotal;
window.updateBatchSummary = updateBatchSummary;
window.clearBatch = clearBatch;
window.removeBatch = removeBatch;
window.renderBatchItemHTML = renderBatchItemHTML;
window.setupBatchEvents = setupBatchEvents;
window.renderBatchItem = renderBatchItem;
window.calculateItemSubtotal = calculateItemSubtotal;
window.addItemToBatch = addItemToBatch;
window.removeItemFromBatch = removeItemFromBatch;
window.reattachGlobalEvents = reattachGlobalEvents;
window.saveBatch = saveBatch;
window.validateTransaction = validateTransaction;
window.loadAllData = loadAllData;
window.filterData = filterData;
window.displayRekapTable = displayRekapTable;
window.tampilkanRekapBongkaran = tampilkanRekapBongkaran;
window.cetakRekapBongkaran = cetakRekapBongkaran;
window.displayPembeliList = displayPembeliList;
window.displayIkanList = displayIkanList;
window.displayBongkaranList = displayBongkaranList;
window.refreshMasterDisplay = refreshMasterDisplay;
window.tambahPembeli = tambahPembeli;
window.tambahIkan = tambahIkan;
window.updateHargaIkan = updateHargaIkan;
window.deleteIkan = deleteIkan;
window.tambahBongkaran = tambahBongkaran;
window.deleteBongkaran = deleteBongkaran;
window.cetakRekap = cetakRekap;
window.showMasterSection = showMasterSection;
window.scrollToTop = scrollToTop;
window.checkInternetConnection = checkInternetConnection;
window.checkServerConnection = checkServerConnection;
window.validateTransaction = validateTransaction;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showToast = showToast;
window.showSuccess = showSuccess;
window.showError = showError;
window.autoSaveBatch = autoSaveBatch;
window.autoRestoreBatch = autoRestoreBatch;
window.exportToCSV = exportToCSV;
window.resetAllData = resetAllData;
window.startAutoReload = startAutoReload;
window.showAppInfo = showAppInfo;