/**
 * PanagoreTrades Dashboard JavaScript
 * Handles all interactive functionality for the web interface
 */

let profitChart = null;
let updateInterval = null;
let currentSort = { column: 'delta_percentage', direction: 'desc' };
let tradesData = [];
let tradesTable = null; // DataTables instance
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
    initializeTabs();
    loadWalletInfo();
    loadProfitHistory();
    loadTradeHubs();
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
    console.log('updateTrades called');
    const loadingElement = document.getElementById('loading-trades');
    const tradesContainer = document.getElementById('trades-container');

    // Show loading state
    loadingElement.classList.remove('hidden');
    tradesContainer.classList.add('hidden');

    try {
        console.log('Fetching trades from API...');
        const response = await fetch(`/api/trades`);
        console.log('Response status:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API response:', data.success, 'Count:', data.count);

        if (data.success) {
            tradesData = data.opportunities; // Store data
            console.log('Calling displayTradingOpportunities with', data.opportunities.length, 'items');
            displayTradingOpportunities(data.opportunities);
        } else {
            console.error('Trading API error:', data.error);
            displayError('Failed to load trading opportunities: ' + data.error);
        }

    } catch (error) {
        console.error('Error updating trades:', error, error.stack);
        displayError('Network error loading trading opportunities: ' + error.message);
    } finally {
        // Hide loading state
        loadingElement.classList.add('hidden');
        tradesContainer.classList.remove('hidden');
    }
}

/**
 * Display trading opportunities in DataTables
 */
function displayTradingOpportunities(opportunities) {
    console.log('displayTradingOpportunities called with', opportunities.length, 'opportunities');

    // Destroy existing DataTable if it exists
    if (tradesTable) {
        console.log('Destroying existing DataTable');
        tradesTable.destroy();
        tradesTable = null;
    }

    // Clear the table body
    $('#trades-tbody').empty();

    // Prepare data for DataTables
    const tableData = opportunities.map(trade => {
        const marginClass = trade.delta_percentage >= 50 ? 'margin-high' :
                           trade.delta_percentage >= 30 ? 'margin-medium' : 'margin-low';

        return [
            `<div style="color: var(--text-primary);">${trade.typename}</div><div style="color: var(--text-muted); font-size: 0.75rem;">ID: ${trade.typeid}</div>`,
            `<span class="${marginClass}">${trade.delta_percentage.toFixed(1)}%</span>`,
            `<span style="color: var(--accent-green);" class="isk-format">${formatISK(trade.delta)}</span>`,
            `<span style="color: var(--accent-blue);">${trade.min_tradehub}</span> → <span style="color: var(--accent-green);">${trade.max_tradehub}</span>`,
            trade.min_vol_yesterday.toLocaleString(),
            trade.max_vol_yesterday.toLocaleString(),
            formatISK(trade.min_price),
            formatISK(trade.max_price)
        ];
    });

    console.log('Prepared', tableData.length, 'rows for DataTable');

    // Initialize DataTable
    try {
        console.log('Initializing DataTable...');

        // Check if jQuery and DataTables are loaded
        if (typeof $ === 'undefined') {
            console.error('jQuery not loaded!');
            displayError('jQuery library not loaded');
            return;
        }

        if (typeof $.fn.DataTable === 'undefined') {
            console.error('DataTables not loaded!');
            displayError('DataTables library not loaded');
            return;
        }

        console.log('jQuery and DataTables are loaded');
        tradesTable = $('#trades-table').DataTable({
            data: tableData,
            pageLength: 25,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
            order: [[1, 'desc']], // Sort by margin % descending
            dom: 'lrtip', // Remove default search box (we have custom one)
            compact: true,
            initComplete: function () {
                console.log('DataTable initialized successfully');
            // Add text search to all columns in the second header row
            this.api().columns().every(function (index) {
                let column = this;
                let title = $(column.header()).text();

                // Get the second header row cell
                let cell = $('#column-filters th').eq(index);

                // Create text input for all columns
                let input = $('<input type="text" placeholder="Search..." style="font-size: 0.75rem; width: 100%;" />')
                    .appendTo(cell.empty())
                    .on('keyup change click', function (e) {
                        e.stopPropagation(); // Prevent sorting when clicking in input

                        // For Margin % column (index 1), use exact match
                        if (index === 1 && this.value) {
                            // Search for exact value: "^20\.0%$" matches only "20.0%"
                            let searchValue = this.value.trim();
                            // Match exactly this number with optional decimal
                            let regex = '^' + searchValue.replace('.', '\\.') + '(\\.0)?%$';
                            column.search(regex, true, false).draw();
                        } else {
                            // For other columns, use normal search
                            if (column.search() !== this.value) {
                                column.search(this.value, false, false).draw();
                            }
                        }
                    });
            });
            }
        });

        console.log('DataTable created successfully');

        // Connect global search to DataTable
        $('#global-search').on('keyup', function () {
            tradesTable.search(this.value).draw();
        });

        // Setup custom search function for soft filters and hub routes
        $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
            // Only apply to trades table
            if (settings.nTable.id !== 'trades-table') {
                return true;
            }

            // Get soft filter values
            const minMargin = parseFloat($('#soft-min-margin').val());
            const maxMargin = parseFloat($('#soft-max-margin').val());
            const minVolume = parseFloat($('#soft-min-volume').val());
            const minPrice = parseFloat($('#soft-min-price').val());

            // Get hub filters
            const buyHubs = Array.from(document.querySelectorAll('.buy-hub:checked')).map(cb => cb.value);
            const sellHubs = Array.from(document.querySelectorAll('.sell-hub:checked')).map(cb => cb.value);

            // Parse the table data (strip HTML)
            const marginHtml = data[1]; // Margin % column
            const marginText = $('<div>').html(marginHtml).text().trim();
            const margin = parseFloat(marginText.replace('%', '').trim());

            const routeHtml = data[3]; // Route column
            const routeText = $('<div>').html(routeHtml).text().trim();
            // Extract hub names from "BuyHub → SellHub" format
            const routeParts = routeText.split('→').map(s => s.trim());
            const rowBuyHub = routeParts[0];
            const rowSellHub = routeParts[1];

            const buyVolHtml = data[4]; // Buy Vol
            const buyVolText = $('<div>').html(buyVolHtml).text().trim();
            const buyVol = parseFloat(buyVolText.replace(/,/g, ''));

            const sellVolHtml = data[5]; // Sell Vol
            const sellVolText = $('<div>').html(sellVolHtml).text().trim();
            const sellVol = parseFloat(sellVolText.replace(/,/g, ''));

            const buyPriceHtml = data[6]; // Buy Price
            const buyPriceText = $('<div>').html(buyPriceHtml).text().trim();
            const buyPrice = parseFloat(buyPriceText.replace(/[^0-9.]/g, ''));

            // Apply hub route filter
            if (buyHubs.length > 0 && !buyHubs.includes(rowBuyHub)) return false;
            if (sellHubs.length > 0 && !sellHubs.includes(rowSellHub)) return false;

            // Apply soft filters
            if (!isNaN(minMargin) && margin < minMargin) return false;
            if (!isNaN(maxMargin) && margin > maxMargin) return false;
            if (!isNaN(minVolume) && (buyVol < minVolume || sellVol < minVolume)) return false;
            if (!isNaN(minPrice) && buyPrice < minPrice) return false;

            return true;
        });

        // Add event listeners to soft filters
        $('#soft-min-margin, #soft-max-margin, #soft-min-volume, #soft-min-price').on('keyup change', function () {
            console.log('Soft filter changed, redrawing table');
            tradesTable.draw();
        });

    } catch (error) {
        console.error('Error initializing DataTable:', error);
        displayError('Failed to initialize table: ' + error.message);
    }
}

/**
 * Load and display trade hubs for route selection
 */
async function loadTradeHubs() {
    const tradeHubs = ['Jita', 'Amarr', 'Dodixie', 'Rens', 'Hek'];

    const buyHubsContainer = document.getElementById('buy-hubs');
    const sellHubsContainer = document.getElementById('sell-hubs');

    tradeHubs.forEach((hub, index) => {
        // Create buy hub checkbox
        const buyLabel = document.createElement('label');
        buyLabel.className = 'hub-checkbox-label';
        buyLabel.innerHTML = `
            <input type="checkbox" class="hub-checkbox buy-hub" value="${hub}" onchange="updateRouteConnections()">
            <span>${hub}</span>
        `;
        buyHubsContainer.appendChild(buyLabel);

        // Create sell hub checkbox
        const sellLabel = document.createElement('label');
        sellLabel.className = 'hub-checkbox-label';
        sellLabel.innerHTML = `
            <input type="checkbox" class="hub-checkbox sell-hub" value="${hub}" onchange="updateRouteConnections()">
            <span>${hub}</span>
        `;
        sellHubsContainer.appendChild(sellLabel);
    });
}

/**
 * Update animated route connections
 */
function updateRouteConnections() {
    const svg = document.getElementById('route-svg');
    svg.innerHTML = svg.querySelector('defs').outerHTML; // Keep gradient def

    const buyHubs = Array.from(document.querySelectorAll('.buy-hub:checked'));
    const sellHubs = Array.from(document.querySelectorAll('.sell-hub:checked'));

    // Update label styling
    document.querySelectorAll('.hub-checkbox').forEach(checkbox => {
        const label = checkbox.parentElement;
        if (checkbox.checked) {
            label.classList.add('selected');
        } else {
            label.classList.remove('selected');
        }
    });

    // Draw connections with proper alignment
    buyHubs.forEach((buyHub, buyIndex) => {
        const buyLabel = buyHub.parentElement;
        const buyRect = buyLabel.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const svgContainer = svg.parentElement.getBoundingClientRect();

        sellHubs.forEach((sellHub, sellIndex) => {
            const sellLabel = sellHub.parentElement;
            const sellRect = sellLabel.getBoundingClientRect();

            // Calculate connection points relative to SVG container, not viewport
            const x1 = buyRect.right - svgContainer.left;
            const y1 = (buyRect.top + buyRect.bottom) / 2 - svgContainer.top;
            const x2 = sellRect.left - svgContainer.left;
            const y2 = (sellRect.top + sellRect.bottom) / 2 - svgContainer.top;

            // Create organic curved path with multiple control points
            const dx = x2 - x1;
            const dy = y2 - y1;
            const midX = x1 + dx * 0.5;
            const midY = y1 + dy * 0.5;

            // Add some wave/curve variation
            const curve1X = x1 + dx * 0.25;
            const curve1Y = y1 + dy * 0.25 + (Math.sin(buyIndex + sellIndex) * 20);
            const curve2X = x1 + dx * 0.75;
            const curve2Y = y1 + dy * 0.75 - (Math.cos(buyIndex + sellIndex) * 20);

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // Use cubic bezier for more organic curves
            path.setAttribute('d', `M ${x1} ${y1} C ${curve1X} ${curve1Y}, ${curve2X} ${curve2Y}, ${x2} ${y2}`);
            path.classList.add('active');
            path.style.animationDelay = `${(buyIndex + sellIndex) * 0.15}s`;

            svg.appendChild(path);

            // Add hauler ships traveling along the path
            const numHaulers = 2;
            for (let i = 0; i < numHaulers; i++) {
                const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                foreignObject.setAttribute('width', '60');
                foreignObject.setAttribute('height', '60');
                foreignObject.setAttribute('x', '-30');
                foreignObject.setAttribute('y', '-30');

                const haulerDiv = document.createElement('div');
                haulerDiv.className = 'hauler-ship';
                haulerDiv.innerHTML = `
                    <img src="https://images.evetech.net/types/648/render?size=128" alt="Badger" />
                `;

                foreignObject.appendChild(haulerDiv);

                // Animate hauler along path with rotation - start after line animation (2.5s)
                const animateMotion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
                animateMotion.setAttribute('dur', '5s');
                animateMotion.setAttribute('repeatCount', 'indefinite');
                animateMotion.setAttribute('begin', `${2.5 + (buyIndex + sellIndex) * 0.15 + i * 2.5}s`);
                animateMotion.setAttribute('rotate', 'auto'); // Auto-rotate to follow path direction
                animateMotion.setAttribute('path', path.getAttribute('d'));

                // Hide ship initially, show after line animation completes
                foreignObject.style.opacity = '0';
                setTimeout(() => {
                    foreignObject.style.opacity = '1';
                    foreignObject.style.transition = 'opacity 0.5s ease-in';
                }, 2500 + (buyIndex + sellIndex) * 150);

                foreignObject.appendChild(animateMotion);

                // Set path ID
                path.setAttribute('id', `path-${buyIndex}-${sellIndex}`);

                svg.appendChild(foreignObject);
            }
        });
    });

    // Apply hub filter to table
    applyHubFilter();
}

/**
 * Apply hub filter to DataTable
 */
function applyHubFilter() {
    if (!tradesTable) return;

    const buyHubs = Array.from(document.querySelectorAll('.buy-hub:checked')).map(cb => cb.value);
    const sellHubs = Array.from(document.querySelectorAll('.sell-hub:checked')).map(cb => cb.value);

    console.log('Hub filter:', { buyHubs, sellHubs });
    tradesTable.draw();
}

/**
 * Clear all hub selections
 */
function clearHubSelection() {
    document.querySelectorAll('.hub-checkbox').forEach(cb => {
        cb.checked = false;
    });
    updateRouteConnections();
}

/**
 * Display error message
 */
function displayError(message) {
    const tbody = document.getElementById('trades-tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="px-6 py-4 text-center" style="color: var(--accent-red);">
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

        // Check if there's an error in the orders data
        if (activeOrders.error) {
            // Show error message
            ordersHtml = `
                <div class="text-sm font-medium" style="color: var(--accent-red);">⚠️ Error</div>
                <div class="text-xs" style="color: var(--text-muted);">Failed to load</div>
            `;
        } else if (buyOrders.length > 0 || sellOrders.length > 0) {
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
            // No orders found - check if item has significant quantity
            if (item.quantity > 10) {
                ordersHtml = `
                    <div class="text-sm font-medium" style="color: var(--text-muted);">—</div>
                    <div class="text-xs" style="color: var(--text-muted);">Sold Out</div>
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