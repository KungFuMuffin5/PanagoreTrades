/**
 * PanagoreTrades Dashboard JavaScript
 * Handles all interactive functionality for the web interface
 */

let profitChart = null;
let updateInterval = null;
let currentSort = { column: 'delta_percentage', direction: 'desc' };
let tradesData = [];

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupDarkMode();
    setupTableSorting();
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
 * Setup dark mode functionality
 */
function setupDarkMode() {
    const toggle = document.getElementById('dark-mode-toggle');
    const body = document.body;

    // Check for saved theme preference or default to light mode
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        body.classList.add('dark');
        toggle.checked = true;
    }

    // Toggle dark mode
    toggle.addEventListener('change', function() {
        if (this.checked) {
            body.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }

        // Update chart colors for dark mode
        if (profitChart) {
            updateChartTheme();
        }
    });
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
        document.getElementById('corp-wallet').textContent = formatISK(data.corp_wallet);
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

        // Build query parameters
        const params = new URLSearchParams();
        selectedHubs.forEach(hub => params.append('hubs', hub));
        params.append('min_margin', minMargin);
        params.append('max_margin', maxMargin);

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

        const marginClass = trade.delta_percentage >= 50 ? 'text-green-600' :
                           trade.delta_percentage >= 30 ? 'text-yellow-600' : 'text-gray-600';

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

    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? '#e5e5e5' : '#374151';
    const gridColor = isDark ? '#404040' : '#e5e7eb';

    profitChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Profit (Million ISK)',
                data: profits,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 6
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
 * Update chart theme for dark/light mode
 */
function updateChartTheme() {
    if (!profitChart) return;

    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? '#e5e5e5' : '#374151';
    const gridColor = isDark ? '#404040' : '#e5e7eb';

    profitChart.options.scales.x.ticks.color = textColor;
    profitChart.options.scales.x.grid.color = gridColor;
    profitChart.options.scales.y.ticks.color = textColor;
    profitChart.options.scales.y.grid.color = gridColor;

    profitChart.update();
}

/**
 * Format ISK amounts with proper separators
 */
function formatISK(amount) {
    if (amount === 0) return '0 ISK';
    if (amount < 1000) return amount.toFixed(2) + ' ISK';
    if (amount < 1000000) return (amount / 1000).toFixed(1) + 'K ISK';
    if (amount < 1000000000) return (amount / 1000000).toFixed(1) + 'M ISK';
    return (amount / 1000000000).toFixed(1) + 'B ISK';
}

/**
 * Cleanup when page is unloaded
 */
window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});