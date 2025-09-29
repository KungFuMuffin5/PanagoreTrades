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
let warehouseProfitMargin = 5; // Default 5% profit margin

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupTableSorting();
    initializeAdvancedFilters();
    initializeTabs();
    loadWalletInfo();
    loadTradeHubs();
    loadProfitHistory();
    updateTrades();

    // Set up auto-refresh every 5 minutes
    updateInterval = setInterval(function() {
        loadWalletInfo();
        updateTrades();
    }, 300000); // 5 minutes
});

/**
 * Initialize dashboard components
 */
function initializeDashboard() {
    console.log('Initializing PanagoreTrades Dashboard...');
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
async function loadWarehouseData(enhanced = true) {
    try {
        showWarehouseLoading(true);

        const response = await fetch(`/api/warehouse?enhanced=${enhanced}`);
        const result = await response.json();

        if (result.success) {
            warehouseData = result.data;
            updateWarehouseSummary(result.data.summary);
            updateWarehouseHubCounts();
            displayWarehouseItems();
            loadTradingSkills();
        } else {
            console.error('Warehouse API error:', result.error);
            displayWarehouseError(result.error);
        }

    } catch (error) {
        console.error('Error loading warehouse data:', error);
        displayWarehouseError('Failed to load warehouse data');
    } finally {
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
function updateWarehouseSummary(summary) {
    if (!summary) return;

    // Update main metrics
    document.getElementById('total-warehouse-value').textContent =
        formatISK(summary.total_theoretical_value || summary.total_value_all_hubs || 0);

    document.getElementById('total-actual-profit').textContent =
        formatISK(summary.total_actual_value || 0);

    document.getElementById('isk-in-orders').textContent =
        formatISK(summary.total_isk_in_orders || 0);

    document.getElementById('total-warehouse-items').textContent =
        (summary.total_items_all_hubs || 0).toLocaleString();

    // Update enhanced analysis metrics if available
    if (summary.enhanced_analysis && summary.precision_metrics) {
        const metrics = summary.precision_metrics;
        document.getElementById('precision-metrics').style.display = 'block';

        document.getElementById('cost-basis-coverage').textContent =
            metrics.cost_basis_coverage_percentage + '%';

        document.getElementById('items-with-history').textContent =
            `${metrics.items_with_cost_basis}/${metrics.total_items}`;

        document.getElementById('total-active-orders').textContent =
            metrics.total_active_orders.toLocaleString();
    } else {
        document.getElementById('precision-metrics').style.display = 'none';
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
            <td colspan="7" class="px-6 py-4 text-center" style="color: var(--text-muted);">
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

        // Enhanced data fields
        const actualCost = item.actual_cost_per_unit || item.effective_buy_price || 0;
        const avgBuyPrice = item.avg_buy_price || 0;
        const minSellPrice = item.min_sell_price || 0;
        const actualProfit = item.actual_profit || 0;
        const hasCostBasis = item.has_cost_basis || false;
        const activeOrders = item.active_orders || { buy_orders: [], sell_orders: [] };

        // Calculate minimum sell price for current profit margin
        const minProfitableSellPrice = calculateMinSellPrice(actualCost, warehouseProfitMargin);

        // Create cost basis display
        const costBasisHtml = hasCostBasis ?
            `<div class="text-sm font-medium" style="color: var(--accent-green);">${formatISK(actualCost)}</div>
             <div class="text-xs" style="color: var(--text-muted);">✓ Transaction history</div>` :
            `<div class="text-sm font-medium" style="color: var(--text-muted);">${formatISK(actualCost)}</div>
             <div class="text-xs" style="color: var(--text-muted);">Market estimate</div>`;

        // Create orders display
        const totalOrders = activeOrders.total_buy_orders + activeOrders.total_sell_orders;
        const ordersHtml = totalOrders > 0 ?
            `<div class="text-sm font-medium" style="color: var(--accent-blue);">${totalOrders} orders</div>
             <div class="text-xs" style="color: var(--text-muted);">${activeOrders.total_buy_orders}B / ${activeOrders.total_sell_orders}S</div>` :
            `<div class="text-sm" style="color: var(--text-muted);">No orders</div>`;

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
                ${costBasisHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium isk-format" style="color: var(--text-primary);">${formatISK(avgBuyPrice)}</div>
                <div class="text-xs" style="color: var(--text-muted);">Market average</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium isk-format" style="color: var(--accent-green);">${formatISK(minProfitableSellPrice)}</div>
                <div class="text-xs" style="color: var(--text-muted);">For ${warehouseProfitMargin}% margin</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-lg font-bold isk-format ${actualProfit > 0 ? 'profit-positive' : 'profit-negative'}">${formatISK(actualProfit)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${ordersHtml}
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Calculate minimum sell price for given profit margin
 */
function calculateMinSellPrice(costBasis, profitMarginPercent) {
    // Apply broker fee and sales tax (typical EVE Online rates)
    const brokerFeeRate = 2.5; // Broker Relations V
    const salesTaxRate = 4.5;  // Accounting V
    const totalFeeRate = (brokerFeeRate + salesTaxRate) / 100;

    // Calculate minimum sell price: cost * (1 + margin) / (1 - fees)
    const targetNet = costBasis * (1 + profitMarginPercent / 100);
    return targetNet / (1 - totalFeeRate);
}

/**
 * Update profit margin from slider
 */
function updateProfitMargin(value) {
    warehouseProfitMargin = parseFloat(value);
    document.getElementById('profit-margin-display').textContent = warehouseProfitMargin + '%';

    // Refresh the warehouse display with new calculations
    displayWarehouseItems();
}

/**
 * Display warehouse error
 */
function displayWarehouseError(message) {
    const tbody = document.getElementById('warehouse-tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="px-6 py-4 text-center" style="color: var(--accent-red);">
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
            updateWarehouseSummary();
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
 * Cleanup when page is unloaded
 */
window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});