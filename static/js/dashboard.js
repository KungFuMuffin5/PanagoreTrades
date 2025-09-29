/**
 * PanagoreTrades Dashboard JavaScript
 * Handles all interactive functionality for the web interface
 */

let profitChart = null;
let updateInterval = null;
let currentSort = { column: 'delta_percentage', direction: 'desc' };
let tradesData = [];
let warehouseData = null;
let selectedWarehouseHub = 'all';
let currentTab = 'trading';
let includeCharacterAssets = false; // Default to corporation assets only

// Change tracking variables
let lastProfitData = null;
let lastContractData = null;
let lastWarehouseData = null;
let nextCheckTime = null;
let countdownInterval = null;
let corporationOrdersData = null;
let lastOrdersData = null;

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Set initial N/A values for courier contract fields
    try {
        document.getElementById('courier-collateral').textContent = 'N/A';
        document.getElementById('open-courier-contracts').textContent = 'N/A';
    } catch (e) {
        console.warn('Could not set initial courier contract values:', e);
    }

    initializeDashboard();
    setupTableSorting();
    initializeAdvancedFilters();
    initializeTabs();
    loadWalletInfo();
    loadTradeHubs();
    loadProfitHistory();
    updateTrades();

    // Set up auto-refresh every 25 minutes with change detection
    nextCheckTime = new Date(Date.now() + 1500000); // 25 minutes from now
    updateInterval = setInterval(function() {
        performScheduledCheck();
        nextCheckTime = new Date(Date.now() + 1500000); // Reset for next check
    }, 1500000); // 25 minutes (25 * 60 * 1000)

    // Update countdown display every 30 seconds
    updateCountdownDisplay();
    countdownInterval = setInterval(updateCountdownDisplay, 30000);
});

/**
 * Initialize dashboard components
 */
function initializeDashboard() {
    console.log('Initializing PanagoreTrades Dashboard...');
}

/**
 * Perform scheduled 25-minute check for changes
 */
async function performScheduledCheck() {
    console.log('Performing scheduled check (25min interval)...');

    try {
        // Check for profit changes
        await checkProfitChanges();

        // Check for contract changes (if on warehouse tab)
        if (currentTab === 'warehouse') {
            await checkContractChanges();
            await checkWarehouseChanges();
            await checkOrderChanges();
        }

        // Always refresh wallet and trading data
        await loadWalletInfo();
        await updateTrades();

        console.log('Scheduled check completed successfully');

    } catch (error) {
        console.error('Error during scheduled check:', error);
        showNotification('Scheduled check encountered an error', 'error');
    }
}

/**
 * Check for profit changes and notify if significant
 */
async function checkProfitChanges() {
    try {
        const response = await fetch('/api/profit-history');
        const data = await response.json();

        if (data.success && lastProfitData) {
            const currentTotal = data.total_7_day_profit;
            const lastTotal = lastProfitData.total_7_day_profit;
            const change = currentTotal - lastTotal;

            if (Math.abs(change) > 100000) { // Significant change > 100k ISK
                const changeType = change > 0 ? 'increase' : 'decrease';
                const changeColor = change > 0 ? 'success' : 'error';
                showNotification(
                    `Profit ${changeType}: ${formatISK(Math.abs(change))} (7-day total: ${formatISK(currentTotal)})`,
                    changeColor
                );
            }
        }

        // Update profit display and store for next comparison
        if (data.success) {
            document.getElementById('week-profit').textContent = formatISK(data.total_7_day_profit);
            createProfitChart(data.daily_profits);
            lastProfitData = data;
        }

    } catch (error) {
        console.error('Error checking profit changes:', error);
    }
}

/**
 * Check for contract changes and notify
 */
async function checkContractChanges() {
    try {
        const response = await fetch('/api/warehouse');
        const result = await response.json();

        if (result.success && result.data.courier_contracts && lastContractData) {
            const current = result.data.courier_contracts;
            const last = lastContractData;

            // Check for new contracts
            if (current.outstanding_contracts > last.outstanding_contracts) {
                showNotification(
                    `New courier contracts: ${current.outstanding_contracts - last.outstanding_contracts}`,
                    'info'
                );
            }

            // Check for completed contracts
            if (current.outstanding_contracts < last.outstanding_contracts) {
                showNotification(
                    `Contracts completed: ${last.outstanding_contracts - current.outstanding_contracts}`,
                    'success'
                );
            }

            // Check for collateral changes
            const collateralChange = current.total_collateral - last.total_collateral;
            if (Math.abs(collateralChange) > 1000000) { // > 1M ISK change
                const changeType = collateralChange > 0 ? 'increased' : 'decreased';
                showNotification(
                    `Collateral ${changeType}: ${formatISK(Math.abs(collateralChange))}`,
                    collateralChange > 0 ? 'info' : 'success'
                );
            }
        }

        if (result.success) {
            lastContractData = result.data.courier_contracts;
        }

    } catch (error) {
        console.error('Error checking contract changes:', error);
    }
}

/**
 * Load corporation orders data
 */
async function loadCorporationOrders() {
    try {
        const response = await fetch('/api/orders');
        const result = await response.json();

        if (result.success) {
            corporationOrdersData = result.orders;

            // Initialize baseline for change tracking on first load
            if (!lastOrdersData) {
                lastOrdersData = result;
            }

            return result;
        } else {
            console.error('Orders API error:', result.error);
            return null;
        }

    } catch (error) {
        console.error('Error loading corporation orders:', error);
        return null;
    }
}

/**
 * Check for order changes and notify
 */
async function checkOrderChanges() {
    try {
        const response = await fetch('/api/orders');
        const result = await response.json();

        if (result.success && lastOrdersData) {
            const current = result.summary;
            const last = lastOrdersData.summary;

            // Check for new orders
            if (current.total_orders > last.total_orders) {
                const newOrders = current.total_orders - last.total_orders;
                showNotification(
                    `New market orders: ${newOrders} (${current.buy_orders}B / ${current.sell_orders}S)`,
                    'info'
                );
            }

            // Check for completed/cancelled orders
            if (current.total_orders < last.total_orders) {
                const completedOrders = last.total_orders - current.total_orders;
                showNotification(
                    `Orders completed/cancelled: ${completedOrders}`,
                    'success'
                );
            }

            // Check for ISK changes in buy orders
            const iskChange = current.total_isk_in_orders - last.total_isk_in_orders;
            if (Math.abs(iskChange) > 1000000) { // > 1M ISK change
                const changeType = iskChange > 0 ? 'increased' : 'decreased';
                showNotification(
                    `ISK in buy orders ${changeType}: ${formatISK(Math.abs(iskChange))}`,
                    iskChange > 0 ? 'info' : 'success'
                );
            }
        }

        if (result.success) {
            corporationOrdersData = result.orders;
            lastOrdersData = result;

            // Refresh warehouse display if we're on that tab
            if (currentTab === 'warehouse') {
                displayWarehouseItems();
            }
        }

    } catch (error) {
        console.error('Error checking order changes:', error);
    }
}

/**
 * Update countdown display for next check
 */
function updateCountdownDisplay() {
    if (!nextCheckTime) return;

    const now = new Date();
    const timeUntilCheck = nextCheckTime.getTime() - now.getTime();

    if (timeUntilCheck <= 0) {
        document.getElementById('next-check-time').textContent = 'Checking now...';
        return;
    }

    const minutes = Math.floor(timeUntilCheck / (1000 * 60));
    const seconds = Math.floor((timeUntilCheck % (1000 * 60)) / 1000);

    if (minutes > 0) {
        document.getElementById('next-check-time').textContent = `${minutes}m ${seconds}s`;
    } else {
        document.getElementById('next-check-time').textContent = `${seconds}s`;
    }
}

/**
 * Check for warehouse/stock changes
 */
async function checkWarehouseChanges() {
    try {
        const response = await fetch('/api/warehouse');
        const result = await response.json();

        if (result.success && lastWarehouseData) {
            // Check for significant value changes
            const currentValue = result.data.summary.total_theoretical_value;
            const lastValue = lastWarehouseData.summary.total_theoretical_value;
            const valueChange = currentValue - lastValue;

            if (Math.abs(valueChange) > 5000000) { // > 5M ISK change
                const changeType = valueChange > 0 ? 'increased' : 'decreased';
                showNotification(
                    `Warehouse value ${changeType}: ${formatISK(Math.abs(valueChange))}`,
                    valueChange > 0 ? 'success' : 'info'
                );
            }
        }

        if (result.success) {
            lastWarehouseData = result.data;
            // Refresh warehouse display if we're on that tab
            warehouseData = result.data;
            updateWarehouseSummary(result.data);
            updateWarehouseHubCounts();
            displayWarehouseItems();
        }

    } catch (error) {
        console.error('Error checking warehouse changes:', error);
    }
}

/**
 * Refresh all data on the page
 */
function refreshAllData() {
    console.log('Refreshing all data...');

    // Add spinning animation to refresh button
    const refreshBtn = document.querySelector('button[onclick="refreshAllData()"] i');
    if (refreshBtn) {
        refreshBtn.classList.add('refresh-spin');
    }

    // Refresh all data sources
    Promise.all([
        loadWalletInfo(),
        loadProfitHistory(),
        updateTrades()
    ]).then(() => {
        console.log('All data refreshed successfully');

        // Remove spinning animation
        if (refreshBtn) {
            refreshBtn.classList.remove('refresh-spin');
        }

        // Show success feedback
        showNotification('Data refreshed successfully!', 'success');
    }).catch(error => {
        console.error('Error refreshing data:', error);

        // Remove spinning animation
        if (refreshBtn) {
            refreshBtn.classList.remove('refresh-spin');
        }

        // Show error feedback
        showNotification('Error refreshing data', 'error');
    });
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 transition-all duration-300 ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        'bg-blue-500 text-white'
    }`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}


/**
 * Setup table sorting functionality
 */
function setupTableSorting() {
    const headers = document.querySelectorAll('.sortable');

    headers.forEach(header => {
        header.addEventListener('click', function() {
            const column = this.getAttribute('data-sort');

            // Update sort direction
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'desc';
            }

            // Update sort icons
            updateSortIcons();

            // Sort and display data
            sortAndDisplayTrades();
        });
    });
}

/**
 * Update sort icons to show current sorting
 */
function updateSortIcons() {
    const headers = document.querySelectorAll('.sortable');

    headers.forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const column = header.getAttribute('data-sort');

        icon.classList.remove('sort-active', 'fa-sort-up', 'fa-sort-down');
        icon.classList.add('fa-sort');

        if (column === currentSort.column) {
            icon.classList.add('sort-active');
            icon.classList.remove('fa-sort');
            icon.classList.add(currentSort.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
        }
    });
}

/**
 * Sort and display trades data
 */
function sortAndDisplayTrades() {
    if (!tradesData.length) return;

    const sortedData = [...tradesData].sort((a, b) => {
        let aVal, bVal;

        switch (currentSort.column) {
            case 'typename':
                aVal = a.typename.toLowerCase();
                bVal = b.typename.toLowerCase();
                break;
            case 'delta_percentage':
                aVal = a.delta_percentage;
                bVal = b.delta_percentage;
                break;
            case 'delta':
                aVal = a.delta;
                bVal = b.delta;
                break;
            case 'route':
                aVal = `${a.min_tradehub}-${a.max_tradehub}`;
                bVal = `${b.min_tradehub}-${b.max_tradehub}`;
                break;
            case 'min_vol_yesterday':
                aVal = a.min_vol_yesterday;
                bVal = b.min_vol_yesterday;
                break;
            case 'min_price':
                aVal = a.min_price;
                bVal = b.min_price;
                break;
            default:
                aVal = a.delta_percentage;
                bVal = b.delta_percentage;
        }

        if (typeof aVal === 'string') {
            return currentSort.direction === 'asc' ?
                aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        } else {
            return currentSort.direction === 'asc' ?
                aVal - bVal : bVal - aVal;
        }
    });

    displayTradingOpportunities(sortedData);
}

/**
 * Load wallet information
 */
async function loadWalletInfo() {
    try {
        const response = await fetch('/api/wallet');
        const data = await response.json();

        if (data.error) {
            console.error('Wallet API error:', data.error);
            document.getElementById('character-name').textContent = 'Not authenticated';
            document.getElementById('corp-wallet').textContent = 'N/A';
            document.getElementById('char-wallet').textContent = 'N/A';
            return;
        }

        // Update character name
        document.getElementById('character-name').textContent = data.character_name || 'Unknown';

        // Update corporation name in the Corp ISK field
        document.getElementById('corp-name').textContent =
            data.corporation_name ? `${data.corporation_name} ISK` : 'Corporation ISK';

        // Update wallet amounts with ISK formatting
        document.getElementById('corp-wallet').textContent =
            data.corp_wallet === "NO VALUE" ? "NO VALUE" : formatISK(data.corp_wallet);
        document.getElementById('char-wallet').textContent = formatISK(data.char_wallet);

    } catch (error) {
        console.error('Error loading wallet info:', error);
        document.getElementById('character-name').textContent = 'Error';
        document.getElementById('corp-wallet').textContent = 'Error';
        document.getElementById('char-wallet').textContent = 'Error';
    }
}

/**
 * Load available trade hubs
 */
async function loadTradeHubs() {
    try {
        const response = await fetch('/api/hubs');
        const data = await response.json();

        const container = document.getElementById('hub-checkboxes');
        container.innerHTML = '';

        data.hubs.forEach(hub => {
            const div = document.createElement('div');
            div.className = 'flex items-center';
            div.innerHTML = `
                <input type="checkbox" id="hub-${hub}" value="${hub}"
                       checked class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                <label for="hub-${hub}" class="ml-2 text-sm text-gray-700">${hub}</label>
            `;
            container.appendChild(div);
        });

    } catch (error) {
        console.error('Error loading trade hubs:', error);
    }
}

/**
 * Load profit history and create chart
 */
async function loadProfitHistory() {
    try {
        const response = await fetch('/api/profit-history');
        const data = await response.json();

        if (data.success) {
            // Initialize baseline for change tracking on first load
            if (!lastProfitData) {
                lastProfitData = data;
            }

            // Update 7-day profit total
            document.getElementById('week-profit').textContent = formatISK(data.total_7_day_profit);

            // Create profit chart
            createProfitChart(data.daily_profits);
        }

    } catch (error) {
        console.error('Error loading profit history:', error);
        document.getElementById('week-profit').textContent = 'Error';
    }
}

/**
 * Update trading opportunities
 */
async function updateTrades() {
    const loadingElement = document.getElementById('loading-trades');
    const tradesContainer = document.getElementById('trades-container');

    // Show loading state
    loadingElement.classList.remove('hidden');
    tradesContainer.classList.add('hidden');

    try {
        // Get selected parameters
        const selectedHubs = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        const minMargin = document.getElementById('min-margin').value;
        const maxMargin = document.getElementById('max-margin').value;
        const minVolume = document.getElementById('min-volume').value;
        const maxVolume = document.getElementById('max-volume').value;
        const minPrice = document.getElementById('min-price').value;
        const maxPrice = document.getElementById('max-price').value;
        const minProfit = document.getElementById('min-profit').value;
        const maxProfit = document.getElementById('max-profit').value;

        // Build query parameters
        const params = new URLSearchParams();
        selectedHubs.forEach(hub => params.append('hubs', hub));
        params.append('min_margin', minMargin);
        params.append('max_margin', maxMargin);

        if (minVolume) params.append('min_volume', minVolume);
        if (maxVolume) params.append('max_volume', maxVolume);
        if (minPrice) params.append('min_price', minPrice);
        if (maxPrice) params.append('max_price', maxPrice);
        if (minProfit) params.append('min_profit', minProfit);
        if (maxProfit) params.append('max_profit', maxProfit);

        const response = await fetch(`/api/trades?${params}`);
        const data = await response.json();

        if (data.success) {
            tradesData = data.opportunities; // Store data for sorting
            displayTradingOpportunities(data.opportunities);
            document.getElementById('opportunity-count').textContent = data.count;
            updateSortIcons(); // Update sort indicators
        } else {
            console.error('Trading API error:', data.error);
            displayError('Failed to load trading opportunities: ' + data.error);
        }

    } catch (error) {
        console.error('Error updating trades:', error);
        displayError('Network error loading trading opportunities');
    } finally {
        // Hide loading state
        loadingElement.classList.add('hidden');
        tradesContainer.classList.remove('hidden');
    }
}

/**
 * Display trading opportunities in table
 */
function displayTradingOpportunities(opportunities) {
    const tbody = document.getElementById('trades-tbody');
    tbody.innerHTML = '';

    if (opportunities.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                No trading opportunities found with current filters
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    opportunities.forEach(trade => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 cursor-pointer trade-hub-card';

        // Dynamic margin colors that work with dark mode
        const marginClass = trade.delta_percentage >= 50 ? 'margin-high' :
                           trade.delta_percentage >= 30 ? 'margin-medium' : 'margin-low';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${trade.typename}</div>
                <div class="text-sm text-gray-500">ID: ${trade.typeid}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-lg font-bold ${marginClass}">${trade.delta_percentage.toFixed(1)}%</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-lg font-bold text-green-600 isk-format">${formatISK(trade.delta)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                        ${trade.min_tradehub}
                    </span>
                    <i class="fas fa-arrow-right mx-2 text-gray-400"></i>
                    <span class="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded">
                        ${trade.max_tradehub}
                    </span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <div>Buy: ${trade.min_vol_yesterday.toLocaleString()}</div>
                <div>Sell: ${trade.max_vol_yesterday.toLocaleString()}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <div class="isk-format">Buy: ${formatISK(trade.min_price)}</div>
                <div class="isk-format">Sell: ${formatISK(trade.max_price)}</div>
            </td>
        `;

        // Add click handler for trade details
        row.addEventListener('click', () => showTradeDetails(trade));

        tbody.appendChild(row);
    });
}

/**
 * Display error message
 */
function displayError(message) {
    const tbody = document.getElementById('trades-tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-4 text-center text-red-500">
                <i class="fas fa-exclamation-triangle mr-2"></i>${message}
            </td>
        </tr>
    `;
}

/**
 * Show trade details modal (placeholder for future implementation)
 */
function showTradeDetails(trade) {
    alert(`Trade Details:\n\nItem: ${trade.typename}\nProfit: ${formatISK(trade.delta)} (${trade.delta_percentage.toFixed(1)}%)\nRoute: ${trade.min_tradehub} → ${trade.max_tradehub}\n\nBuy Price: ${formatISK(trade.min_price)}\nSell Price: ${formatISK(trade.max_price)}\n\nDaily Volume:\nBuy Hub: ${trade.min_vol_yesterday.toLocaleString()}\nSell Hub: ${trade.max_vol_yesterday.toLocaleString()}`);
}

/**
 * Create profit chart using Chart.js
 */
function createProfitChart(profitData) {
    const ctx = document.getElementById('profitChart').getContext('2d');

    // Destroy existing chart if it exists
    if (profitChart) {
        profitChart.destroy();
    }

    const labels = profitData.map(day => {
        const date = new Date(day.date);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    });

    const profits = profitData.map(day => day.profit / 1000000); // Convert to millions

    // zkillboard-inspired dark theme chart colors
    const textColor = '#ffffff';
    const gridColor = '#333333';
    const lineColor = '#007acc';

    profitChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Profit (Million ISK)',
                data: profits,
                borderColor: lineColor,
                backgroundColor: 'rgba(0, 122, 204, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: lineColor,
                pointBorderColor: '#000000',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: lineColor,
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: textColor,
                        callback: function(value) {
                            return value.toFixed(1) + 'M ISK';
                        }
                    },
                    grid: {
                        color: gridColor
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Profit: ${formatISK(context.raw * 1000000)}`;
                        }
                    }
                }
            }
        }
    });
}


/**
 * Format ISK amounts with backtick separators (e.g., "1`819`982`129 ISK")
 */
function formatISK(amount) {
    if (amount === 0) return '0 ISK';

    // Convert to integer to avoid decimal places
    const intAmount = Math.floor(amount);

    // Convert to string and add backtick separators every 3 digits from right
    const amountStr = intAmount.toString();
    const formatted = amountStr.replace(/\B(?=(\d{3})+(?!\d))/g, '`');

    return formatted + ' ISK';
}

/**
 * Toggle advanced filters visibility
 */
function toggleAdvancedFilters() {
    const content = document.getElementById('advanced-filters-content');
    const icon = document.getElementById('advanced-filters-icon');

    if (content.classList.contains('collapsed')) {
        // Expand
        content.classList.remove('collapsed');
        icon.classList.add('rotated');

        // Save state to localStorage
        localStorage.setItem('advancedFiltersExpanded', 'true');

        // Show notification
        showNotification('Advanced filters expanded', 'info');
    } else {
        // Collapse
        content.classList.add('collapsed');
        icon.classList.remove('rotated');

        // Save state to localStorage
        localStorage.setItem('advancedFiltersExpanded', 'false');

        // Show notification
        showNotification('Advanced filters collapsed', 'info');
    }
}

/**
 * Initialize advanced filters state from localStorage
 */
function initializeAdvancedFilters() {
    const content = document.getElementById('advanced-filters-content');
    const icon = document.getElementById('advanced-filters-icon');
    const isExpanded = localStorage.getItem('advancedFiltersExpanded') === 'true';

    if (isExpanded) {
        content.classList.remove('collapsed');
        icon.classList.add('rotated');
    } else {
        content.classList.add('collapsed');
        icon.classList.remove('rotated');
    }
}

/**
 * Clear all filters to default values
 */
function clearFilters() {
    // Reset filter inputs to default values
    document.getElementById('min-margin').value = 20;
    document.getElementById('max-margin').value = 1500;
    document.getElementById('min-volume').value = 75;
    document.getElementById('max-volume').value = '';
    document.getElementById('min-price').value = 100000;
    document.getElementById('max-price').value = '';
    document.getElementById('min-profit').value = '';
    document.getElementById('max-profit').value = '';

    // Check all trade hub checkboxes
    const hubCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    hubCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
    });

    // Show notification
    showNotification('Filters cleared to defaults', 'info');

    // Automatically update trades with cleared filters
    updateTrades();
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-content`).classList.add('active');

    currentTab = tabName;

    // Load data for the selected tab
    if (tabName === 'warehouse') {
        loadWarehouseData();
        loadMarketOrders();
    }

    // Save tab preference
    localStorage.setItem('activeTab', tabName);
}

/**
 * Initialize tab based on saved preference
 */
function initializeTabs() {
    const savedTab = localStorage.getItem('activeTab') || 'trading';
    switchTab(savedTab);
}

/**
 * Load warehouse data
 */
function loadWarehouseData(enhanced = true) {
    try {
        showWarehouseLoading(true);

        fetch(`/api/warehouse?enhanced=${enhanced}&include_character=${includeCharacterAssets}`)
        .then(response => response.json())
        .then(result => {
                if (result.success) {
                    warehouseData = result.data;

                    // Initialize baseline data for change tracking on first load
                    if (!lastWarehouseData) {
                        lastWarehouseData = result.data;
                    }
                    if (!lastContractData && result.data.courier_contracts) {
                        lastContractData = result.data.courier_contracts;
                    }

                    updateWarehouseSummary(result.data);  // Pass full data object instead of just summary
                    updateWarehouseHubCounts();

                    // Load corporation orders for price display, then display items
                    loadCorporationOrders().then(() => {
                        displayWarehouseItems();
                    }).catch(err => {
                        console.warn('Failed to load corporation orders:', err);
                        displayWarehouseItems(); // Display without order prices if failed
                    });

                    loadTradingSkills();
                } else {
                    console.error('Warehouse API error:', result.error);
                    displayWarehouseError(result.error);
                }
            })
            .catch(error => {
                console.error('Error loading warehouse data:', error);
                displayWarehouseError('Failed to load warehouse data');
            })
            .finally(() => {
                showWarehouseLoading(false);
            });

    } catch (error) {
        console.error('Unexpected error in loadWarehouseData:', error);
        displayWarehouseError('Failed to load warehouse data');
        showWarehouseLoading(false);
    }
}

/**
 * Show/hide warehouse loading state
 */
function showWarehouseLoading(show) {
    const loadingElement = document.getElementById('loading-warehouse');
    const containerElement = document.getElementById('warehouse-container');

    if (show) {
        loadingElement.classList.remove('hidden');
        containerElement.classList.add('hidden');
    } else {
        loadingElement.classList.add('hidden');
        containerElement.classList.remove('hidden');
    }
}

/**
 * Update warehouse summary cards
 */
function updateWarehouseSummary(data) {
    if (!data) return;

    const summary = data.summary || {};

    // Update main metrics
    document.getElementById('total-warehouse-value').textContent =
        formatISK(summary.total_theoretical_value || summary.total_value_all_hubs || 0);
    // Update realized profit with details
    const profitElement = document.getElementById('total-actual-profit');
    profitElement.textContent = formatISK(summary.total_actual_profit || 0);

    // Add click handler to show profit breakdown if details are available
    if (data.realized_profit_details) {
        const details = data.realized_profit_details;
        const tooltip = `Profit Breakdown (${details.period_days} days):\n` +
                       `• Sales Revenue: ${formatISK(details.total_sales_revenue)}\n` +
                       `• Cost of Goods Sold: ${formatISK(details.total_cost_of_goods_sold)}\n` +
                       `• Fees Paid: ${formatISK(details.total_fees_paid)}\n` +
                       `• Net Profit: ${formatISK(details.total_realized_profit)}\n` +
                       `• Transactions: ${details.transactions_analyzed}`;

        profitElement.style.cursor = 'pointer';
        profitElement.title = 'Click for profit breakdown';
        profitElement.onclick = function() {
            alert(tooltip);
        };

        // Show 0 ISK if no sales have been made
        if (details.transactions_analyzed === 0) {
            profitElement.textContent = '0 ISK';
            profitElement.title = 'No sales transactions found in the last 30 days';
        }
    }
    document.getElementById('isk-in-orders').textContent =
        formatISK(summary.total_isk_in_orders || 0);

    // Update courier contract data with error handling and N/A fallbacks
    try {
        const courierData = data.courier_contracts || {};

        // Handle courier collateral with N/A fallback
        const collateral = courierData.total_collateral;
        if (collateral !== undefined && collateral !== null && !isNaN(collateral)) {
            document.getElementById('courier-collateral').textContent = formatISK(collateral);
            console.log('Updated courier collateral:', formatISK(collateral));
        } else {
            document.getElementById('courier-collateral').textContent = 'N/A';
            console.log('Set courier collateral to N/A');
        }

        // Handle open contracts count with N/A fallback
        const outstanding = courierData.outstanding_contracts || 0;
        const inProgress = courierData.in_progress_contracts || 0;

        if (outstanding !== undefined && inProgress !== undefined) {
            const openContracts = outstanding + inProgress;
            document.getElementById('open-courier-contracts').textContent = openContracts.toLocaleString();
            console.log('Updated open contracts:', openContracts);
        } else {
            document.getElementById('open-courier-contracts').textContent = 'N/A';
            console.log('Set open contracts to N/A');
        }

        // Update unfinished contracts list
        updateUnfinishedContracts(courierData.unfinished_contracts || []);
    } catch (error) {
        console.warn('Error updating courier contract data:', error);
        // Set N/A fallbacks on error
        document.getElementById('courier-collateral').textContent = 'N/A';
        document.getElementById('open-courier-contracts').textContent = 'N/A';
        updateUnfinishedContracts([]);
    }

}

/**
 * Update warehouse hub item counts
 */
function updateWarehouseHubCounts() {
    if (!warehouseData || !warehouseData.warehouse_data) return;

    const hubData = warehouseData.warehouse_data;
    let totalItems = 0;

    Object.keys(hubData).forEach(hubName => {
        const hub = hubData[hubName];
        const count = hub.total_items || 0;
        totalItems += count;

        const elementId = `${hubName.toLowerCase()}-items-count`;
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = `${count} items`;
        }
    });

    // Update "all hubs" count
    document.getElementById('all-items-count').textContent = `${totalItems} items`;
}

/**
 * Load and display trading skills
 */
async function loadTradingSkills() {
    try {
        const response = await fetch('/api/warehouse/skills');
        const result = await response.json();

        if (result.success) {
            const data = result.data;
            document.getElementById('broker-fee-rate').textContent =
                data.broker_fee_rate.toFixed(2);
            document.getElementById('sales-tax-rate').textContent =
                data.sales_tax_rate.toFixed(2);
        }

    } catch (error) {
        console.error('Error loading trading skills:', error);
    }
}

/**
 * Select warehouse hub
 */
function selectWarehouseHub(hubName) {
    selectedWarehouseHub = hubName;

    // Update UI
    document.querySelectorAll('.warehouse-hub-card').forEach(card => {
        card.classList.remove('selected');
    });

    const selectedCard = document.getElementById(`hub-${hubName}`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }

    // Update header
    const hubDisplayName = hubName === 'all' ? 'All Hubs' : hubName;
    document.getElementById('selected-hub-name').textContent = hubDisplayName;

    // Display items for selected hub
    displayWarehouseItems();
}

/**
 * Display warehouse items
 */
function displayWarehouseItems() {
    const tbody = document.getElementById('warehouse-tbody');
    tbody.innerHTML = '';

    if (!warehouseData || !warehouseData.warehouse_data) {
        displayWarehouseError('No warehouse data available');
        return;
    }

    let allItems = [];

    // Collect items from selected hub(s)
    if (selectedWarehouseHub === 'all') {
        Object.values(warehouseData.warehouse_data).forEach(hubData => {
            if (hubData.items) {
                hubData.items.forEach(item => {
                    item.hub_name = hubData.hub_name;
                    allItems.push(item);
                });
            }
        });
    } else {
        const hubData = warehouseData.warehouse_data[selectedWarehouseHub];
        if (hubData && hubData.items) {
            allItems = hubData.items.map(item => ({
                ...item,
                hub_name: selectedWarehouseHub
            }));
        }
    }

    // Update item count
    document.getElementById('warehouse-items-count').textContent = allItems.length;

    if (allItems.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="8" class="px-6 py-4 text-center" style="color: var(--text-muted);">
                No items found in ${selectedWarehouseHub === 'all' ? 'any hub' : selectedWarehouseHub}
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    // Sort items by actual profit (highest first)
    allItems.sort((a, b) => (b.actual_profit || b.current_value || 0) - (a.actual_profit || a.current_value || 0));

    // Display items
    allItems.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'warehouse-item-row';

        // Extract data fields according to new specification
        const avgBuyPrice = item.avg_buy_price || 0;  // From transaction history
        const livePrice = item.realistic_sell_price || item.min_sell_price || 0;  // Current market price
        const possibleProfit = livePrice - avgBuyPrice;  // Potential profit per unit
        const hasCostBasis = item.has_cost_basis || false;
        const activeOrders = item.active_orders || { buy_orders: [], sell_orders: [] };

        // Create Avg. Buy Price display with source indication
        const avgBuyPriceHtml = hasCostBasis ?
            `<div class="text-sm font-medium" style="color: var(--accent-green);">${formatISK(avgBuyPrice)}</div>
             <div class="text-xs" style="color: var(--text-muted);">✓ From transactions</div>` :
            `<div class="text-sm font-medium" style="color: var(--text-muted);">${formatISK(avgBuyPrice)}</div>
             <div class="text-xs" style="color: var(--text-muted);">Market estimate</div>`;

        // Create Live Price display
        const livePriceHtml = livePrice > 0 ?
            `<div class="text-sm font-medium" style="color: var(--accent-blue);">${formatISK(livePrice)}</div>
             <div class="text-xs" style="color: var(--text-muted);">Current ${item.hub_name}</div>` :
            `<div class="text-sm font-medium" style="color: var(--text-muted);">N/A</div>
             <div class="text-xs" style="color: var(--text-muted);">No market data</div>`;

        // Create Possible Profit display
        const profitColor = possibleProfit > 0 ? 'var(--accent-green)' : possibleProfit < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
        const possibleProfitHtml = avgBuyPrice > 0 && livePrice > 0 ?
            `<div class="text-sm font-medium" style="color: ${profitColor};">${formatISK(possibleProfit)}</div>
             <div class="text-xs" style="color: var(--text-muted);">Per unit</div>` :
            `<div class="text-sm font-medium" style="color: var(--text-muted);">N/A</div>
             <div class="text-xs" style="color: var(--text-muted);">Missing data</div>`;

        // Create detailed Orders display with remaining/starting quantities
        const buyOrders = activeOrders.buy_orders || [];
        const sellOrders = activeOrders.sell_orders || [];

        let ordersHtml = '';

        if (buyOrders.length > 0 || sellOrders.length > 0) {
            const orderDetails = [];

            // Process buy orders
            if (buyOrders.length > 0) {
                let totalBuyRemaining = 0;
                let totalBuyOriginal = 0;

                buyOrders.forEach(order => {
                    totalBuyRemaining += order.volume_remain || 0;
                    totalBuyOriginal += order.volume_total || order.volume_remain || 0;
                });

                const buyProgress = totalBuyOriginal > 0 ? ((totalBuyOriginal - totalBuyRemaining) / totalBuyOriginal * 100) : 0;
                orderDetails.push({
                    type: 'BUY',
                    count: buyOrders.length,
                    remaining: totalBuyRemaining,
                    original: totalBuyOriginal,
                    progress: buyProgress,
                    color: 'var(--accent-orange)'
                });
            }

            // Process sell orders
            if (sellOrders.length > 0) {
                let totalSellRemaining = 0;
                let totalSellOriginal = 0;

                sellOrders.forEach(order => {
                    totalSellRemaining += order.volume_remain || 0;
                    totalSellOriginal += order.volume_total || order.volume_remain || 0;
                });

                const sellProgress = totalSellOriginal > 0 ? ((totalSellOriginal - totalSellRemaining) / totalSellOriginal * 100) : 0;
                orderDetails.push({
                    type: 'SELL',
                    count: sellOrders.length,
                    remaining: totalSellRemaining,
                    original: totalSellOriginal,
                    progress: sellProgress,
                    color: 'var(--accent-green)'
                });
            }

            // Build HTML for orders
            const totalRemaining = orderDetails.reduce((sum, detail) => sum + detail.remaining, 0);
            const orderSummaries = orderDetails.map(detail =>
                `<span style="color: ${detail.color};">${detail.remaining}/${detail.original} ${detail.type}</span>`
            ).join(' • ');

            const progressSummary = orderDetails.map(detail =>
                `${detail.type}: ${detail.progress.toFixed(0)}% sold`
            ).join(', ');

            ordersHtml = `
                <div class="text-sm font-medium" style="color: var(--accent-blue);">
                    ${orderSummaries}
                </div>
                <div class="text-xs" style="color: var(--text-muted);">
                    ${progressSummary}
                </div>
            `;
        } else {
            // Only show "No orders" for items with significant quantity
            if (item.quantity > 10) {
                ordersHtml = `
                    <div class="text-sm font-medium" style="color: var(--text-muted);">—</div>
                    <div class="text-xs" style="color: var(--text-muted);">No active orders</div>
                `;
            } else {
                ordersHtml = `
                    <div class="text-sm font-medium" style="color: var(--text-muted);">—</div>
                    <div class="text-xs" style="color: var(--text-muted);">Low stock</div>
                `;
            }
        }

        // Create Order Prices display
        let orderPricesHtml = '';
        if (corporationOrdersData) {
            const orderKey = `${item.type_id}_${item.location_id}`;
            const itemOrders = corporationOrdersData[orderKey];

            if (itemOrders && (itemOrders.buy_orders.length > 0 || itemOrders.sell_orders.length > 0)) {
                const priceDetails = [];

                // Show buy order prices
                if (itemOrders.buy_orders.length > 0) {
                    const highestBuyPrice = Math.max(...itemOrders.buy_orders.map(o => o.price));
                    const buyOrderCount = itemOrders.buy_orders.length;
                    priceDetails.push(`<span style="color: var(--accent-orange);">Buy: ${formatISK(highestBuyPrice)}</span>`);
                }

                // Show sell order prices with margin calculation
                if (itemOrders.sell_orders.length > 0) {
                    const lowestSellPrice = Math.min(...itemOrders.sell_orders.map(o => o.price));
                    const sellOrderCount = itemOrders.sell_orders.length;

                    // Calculate margin % if we have cost basis
                    let marginText = '';
                    if (avgBuyPrice > 0) {
                        const marginPercent = ((lowestSellPrice - avgBuyPrice) / avgBuyPrice) * 100;
                        const marginColor = marginPercent > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                        marginText = ` <span style="color: ${marginColor};">(${marginPercent >= 0 ? '+' : ''}${marginPercent.toFixed(1)}%)</span>`;
                    }

                    priceDetails.push(`<span style="color: var(--accent-green);">Sell: ${formatISK(lowestSellPrice)}${marginText}</span>`);
                }

                const totalOrders = itemOrders.buy_orders.length + itemOrders.sell_orders.length;
                orderPricesHtml = `
                    <div class="text-sm font-medium">
                        ${priceDetails.join(' • ')}
                    </div>
                    <div class="text-xs" style="color: var(--text-muted);">
                        ${totalOrders} active order${totalOrders > 1 ? 's' : ''}
                    </div>
                `;
            } else {
                orderPricesHtml = `
                    <div class="text-sm font-medium" style="color: var(--text-muted);">—</div>
                    <div class="text-xs" style="color: var(--text-muted);">No orders</div>
                `;
            }
        } else {
            orderPricesHtml = `
                <div class="text-sm font-medium" style="color: var(--text-muted);">—</div>
                <div class="text-xs" style="color: var(--text-muted);">Loading...</div>
            `;
        }

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium" style="color: var(--text-primary);">${item.item_name}</div>
                <div class="text-sm" style="color: var(--text-muted);">
                    ID: ${item.type_id}
                    ${selectedWarehouseHub === 'all' ? ` • ${item.hub_name}` : ''}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--text-primary);">
                ${item.quantity.toLocaleString()}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${avgBuyPriceHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${livePriceHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${possibleProfitHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${ordersHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${orderPricesHtml}
            </td>
        `;

        tbody.appendChild(row);
    });
}


/**
 * Toggle between corporation and corporation+character assets
 */
function toggleAssetSource() {
    includeCharacterAssets = !includeCharacterAssets;

    const button = document.getElementById('asset-source-toggle');
    const icon = button.querySelector('i');

    if (includeCharacterAssets) {
        button.innerHTML = '<i class="fas fa-users mr-2"></i>Corp + Character';
        console.log('Switched to: Corporation + Character assets');
    } else {
        button.innerHTML = '<i class="fas fa-building mr-2"></i>Corp Assets';
        console.log('Switched to: Corporation assets only');
    }

    // Refresh warehouse data with new asset source
    loadWarehouseData();
}

/**
 * Display warehouse error
 */
function displayWarehouseError(message) {
    const tbody = document.getElementById('warehouse-tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="px-6 py-4 text-center" style="color: var(--accent-red);">
                <i class="fas fa-exclamation-triangle mr-2"></i>${message}
            </td>
        </tr>
    `;
    document.getElementById('warehouse-items-count').textContent = '0';
}

/**
 * Refresh warehouse data
 */
async function refreshWarehouseData() {
    console.log('Refreshing warehouse data...');

    // Add spinning animation to refresh button
    const refreshBtn = document.querySelector('button[onclick="refreshWarehouseData()"] i');
    if (refreshBtn) {
        refreshBtn.classList.add('refresh-spin');
    }

    try {
        // Force refresh by adding cache-busting parameter
        const response = await fetch(`/api/warehouse?refresh=${Date.now()}`);
        const result = await response.json();

        if (result.success) {
            warehouseData = result.data;
            updateWarehouseSummary(result.data);  // Pass full data object
            updateWarehouseHubCounts();
            displayWarehouseItems();
            showNotification('Warehouse data refreshed successfully!', 'success');
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('Error refreshing warehouse data:', error);
        showNotification('Error refreshing warehouse data', 'error');
    } finally {
        // Remove spinning animation
        if (refreshBtn) {
            refreshBtn.classList.remove('refresh-spin');
        }
    }
}

/**
 * Show skills modal (placeholder for future implementation)
 */
function showSkillsModal() {
    alert('Skills configuration modal will be implemented in a future update.\n\nCurrent skills are set to level V for Broker Relations and Accounting.\n\nThis results in:\n• Broker Fee: 2.5%\n• Sales Tax: ~4.5%');
}

/**
 * Update unfinished courier contracts display
 */
function updateUnfinishedContracts(contracts) {
    const card = document.getElementById('unfinished-contracts-card');
    const countElement = document.getElementById('unfinished-contracts-count');

    if (!card || !countElement) return;

    if (!contracts || contracts.length === 0) {
        card.style.display = 'none';
        return;
    }

    // Show card and update count
    card.style.display = 'block';
    countElement.textContent = contracts.length.toLocaleString();

    // Add click handler for details (tooltip or modal)
    card.style.cursor = 'pointer';
    card.title = `${contracts.length} unfinished contract${contracts.length > 1 ? 's' : ''}: ${contracts.map(c => c.title || 'Untitled').join(', ')}`;

    // Optional: Add click event for detailed view
    card.onclick = function() {
        showUnfinishedContractsModal(contracts);
    };
}

/**
 * Show detailed unfinished contracts modal
 */
function showUnfinishedContractsModal(contracts) {
    if (!contracts || contracts.length === 0) {
        alert('No unfinished contracts to display.');
        return;
    }

    const contractsList = contracts.map(contract => {
        const statusBadge = contract.status === 'outstanding' ? '🟠 Outstanding' : '🔵 In Progress';
        const issued = new Date(contract.date_issued).toLocaleDateString();
        const expires = new Date(contract.date_expired).toLocaleDateString();
        const accepted = contract.date_accepted ? new Date(contract.date_accepted).toLocaleDateString() : 'Not accepted';

        return `• ${contract.title || 'Untitled'} (${statusBadge})
  Collateral: ${formatISK(contract.collateral)} | Reward: ${formatISK(contract.reward)}
  Volume: ${contract.volume.toLocaleString()} m³ | Issued: ${issued} | Expires: ${expires}`;
    }).join('\n\n');

    alert(`Unfinished Courier Contracts (${contracts.length}):\n\n${contractsList}`);
}

/**
 * Load and display market orders
 */
let marketOrdersData = [];
let completedOrdersData = [];

function loadMarketOrders() {
    return fetch('/api/orders')
        .then(response => response.json())
        .then(data => {
            console.log('Market orders loaded:', data);
            if (data.success) {
                marketOrdersData = Object.values(data.orders || {});
                displayMarketOrders();

                // Update counts
                const activeCount = marketOrdersData.filter(order =>
                    order.buy_orders.some(o => o.volume_remain > 0) ||
                    order.sell_orders.some(o => o.volume_remain > 0)
                ).length;
                const completedCount = completedOrdersData.length;

                document.getElementById('active-orders-count').textContent = activeCount;
                document.getElementById('completed-orders-count').textContent = completedCount;
            } else {
                console.error('Failed to load market orders:', data.error);
                showMarketOrdersError();
            }
        })
        .catch(error => {
            console.error('Error loading market orders:', error);
            showMarketOrdersError();
        });
}

function displayMarketOrders() {
    const loading = document.getElementById('market-orders-loading');
    const container = document.getElementById('market-orders-container');
    const empty = document.getElementById('market-orders-empty');
    const tableBody = document.getElementById('market-orders-table-body');

    loading.classList.add('hidden');

    if (marketOrdersData.length === 0 && completedOrdersData.length === 0) {
        container.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    empty.classList.add('hidden');

    // Clear existing content
    tableBody.innerHTML = '';

    // Group all orders by type for display
    const allOrders = [];

    // Add active orders
    marketOrdersData.forEach(orderGroup => {
        [...orderGroup.buy_orders, ...orderGroup.sell_orders].forEach(order => {
            allOrders.push({
                ...order,
                type_id: orderGroup.type_id,
                location_id: orderGroup.location_id,
                status: 'active'
            });
        });
    });

    // Add completed orders
    completedOrdersData.forEach(order => {
        allOrders.push({
            ...order,
            status: 'completed'
        });
    });

    // Sort by issued date (newest first)
    allOrders.sort((a, b) => new Date(b.issued) - new Date(a.issued));

    allOrders.forEach(order => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--border-color)';

        const isBuyOrder = order.range && order.range !== 'station';
        const isCompleted = order.volume_remain === 0 || order.status === 'completed';
        const progress = order.volume_total > 0 ? ((order.volume_total - order.volume_remain) / order.volume_total) * 100 : 0;

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium" style="color: var(--text-primary);">
                    ${getItemName(order.type_id) || `Item ${order.type_id}`}
                </div>
                <div class="text-sm" style="color: var(--text-muted);">ID: ${order.type_id}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    isBuyOrder
                        ? 'text-orange-300 bg-orange-900 bg-opacity-50'
                        : 'text-green-300 bg-green-900 bg-opacity-50'
                }">
                    ${isBuyOrder ? 'Buy' : 'Sell'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--text-primary);">
                ${formatISK(order.price)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--text-primary);">
                <div>${order.volume_remain.toLocaleString()} / ${order.volume_total.toLocaleString()}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="w-full bg-gray-700 rounded-full h-2.5">
                    <div class="h-2.5 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}"
                         style="width: ${progress}%"></div>
                </div>
                <div class="text-xs mt-1" style="color: var(--text-muted);">${progress.toFixed(1)}%</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--text-primary);">
                ${getLocationName(order.location_id)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--text-primary);">
                ${formatDate(order.issued)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                ${isCompleted ?
                    `<button onclick="clearOrder('${order.order_id}')" class="text-red-400 hover:text-red-300 text-xs">
                        <i class="fas fa-trash mr-1"></i>Clear Order
                    </button>` :
                    `<span style="color: var(--text-muted);">Active</span>`
                }
            </td>
        `;

        tableBody.appendChild(row);
    });
}

function showMarketOrdersError() {
    const loading = document.getElementById('market-orders-loading');
    const container = document.getElementById('market-orders-container');
    const empty = document.getElementById('market-orders-empty');

    loading.classList.add('hidden');
    container.classList.add('hidden');
    empty.classList.remove('hidden');

    empty.innerHTML = `
        <i class="fas fa-exclamation-triangle text-4xl mb-4" style="color: var(--accent-red);"></i>
        <p class="text-lg font-medium mb-2" style="color: var(--text-primary);">Error Loading Orders</p>
        <p style="color: var(--text-muted);">Failed to load market orders. Please try refreshing.</p>
    `;
}

function clearOrder(orderId) {
    // Remove from completed orders
    completedOrdersData = completedOrdersData.filter(order => order.order_id != orderId);

    // Also remove from active orders if it's there
    marketOrdersData = marketOrdersData.map(orderGroup => {
        return {
            ...orderGroup,
            buy_orders: orderGroup.buy_orders.filter(order => order.order_id != orderId),
            sell_orders: orderGroup.sell_orders.filter(order => order.order_id != orderId)
        };
    }).filter(orderGroup => orderGroup.buy_orders.length > 0 || orderGroup.sell_orders.length > 0);

    displayMarketOrders();
    showNotification(`Order ${orderId} cleared`, 'success');
}

function clearCompletedOrders() {
    const completedCount = completedOrdersData.length;

    // Move completed orders from active to completed list and clear them
    const newCompleted = [];
    marketOrdersData = marketOrdersData.map(orderGroup => {
        const activeBuyOrders = [];
        const activeSellOrders = [];

        orderGroup.buy_orders.forEach(order => {
            if (order.volume_remain === 0) {
                newCompleted.push({...order, type_id: orderGroup.type_id, location_id: orderGroup.location_id});
            } else {
                activeBuyOrders.push(order);
            }
        });

        orderGroup.sell_orders.forEach(order => {
            if (order.volume_remain === 0) {
                newCompleted.push({...order, type_id: orderGroup.type_id, location_id: orderGroup.location_id});
            } else {
                activeSellOrders.push(order);
            }
        });

        return {
            ...orderGroup,
            buy_orders: activeBuyOrders,
            sell_orders: activeSellOrders
        };
    }).filter(orderGroup => orderGroup.buy_orders.length > 0 || orderGroup.sell_orders.length > 0);

    // Clear all completed orders
    completedOrdersData = [];

    const totalCleared = completedCount + newCompleted.length;
    displayMarketOrders();

    if (totalCleared > 0) {
        showNotification(`${totalCleared} completed order${totalCleared > 1 ? 's' : ''} cleared`, 'success');
    } else {
        showNotification('No completed orders to clear', 'info');
    }
}

function getItemName(typeId) {
    // Try to get item name from warehouse data first
    if (typeof warehouseData !== 'undefined' && warehouseData.items) {
        const item = warehouseData.items.find(item => item.type_id == typeId);
        if (item) return item.item_name;
    }

    // Return a placeholder for now
    return null;
}

function getLocationName(locationId) {
    // Map common location IDs to names
    const locations = {
        60003760: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        60008494: 'Amarr VIII (Oris) - Emperor Family Academy',
        60004588: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
        60011866: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
        60005686: 'Hek VIII - Moon 12 - Boundless Creation Factory'
    };

    return locations[locationId] || `Location ${locationId}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
}

/**
 * Cleanup when page is unloaded
 */
window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});