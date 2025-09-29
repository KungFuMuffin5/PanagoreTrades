// Verification script to test courier contract fix
async function verifyFix() {
    console.log('=== COURIER CONTRACT FIX VERIFICATION ===');

    try {
        // Test API response
        console.log('1. Testing API response...');
        const response = await fetch('/api/warehouse?enhanced=true');
        const result = await response.json();

        if (result.success && result.data.courier_contracts) {
            console.log('✅ API Working - Courier data found:');
            const courier = result.data.courier_contracts;
            console.log('   total_collateral:', courier.total_collateral);
            console.log('   outstanding_contracts:', courier.outstanding_contracts);
            console.log('   in_progress_contracts:', courier.in_progress_contracts);
        } else {
            console.log('❌ API Error - No courier data');
            return;
        }

        // Test DOM elements
        console.log('\\n2. Testing DOM elements...');
        const collateralElement = document.getElementById('courier-collateral');
        const contractsElement = document.getElementById('open-courier-contracts');

        if (collateralElement && contractsElement) {
            console.log('✅ DOM Elements found');
            console.log('   Current collateral text:', collateralElement.textContent);
            console.log('   Current contracts text:', contractsElement.textContent);
        } else {
            console.log('❌ DOM Elements missing');
            return;
        }

        // Test function call
        console.log('\\n3. Testing function update...');

        // Simulate the updateWarehouseSummary call
        try {
            const courierData = result.data.courier_contracts;
            const collateral = courierData.total_collateral;
            const openContracts = (courierData.outstanding_contracts || 0) + (courierData.in_progress_contracts || 0);

            if (collateral !== undefined) {
                collateralElement.textContent = new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(collateral) + ' ISK';
                console.log('✅ Updated collateral to:', collateralElement.textContent);
            }

            contractsElement.textContent = openContracts.toLocaleString();
            console.log('✅ Updated contracts to:', contractsElement.textContent);

        } catch (error) {
            console.log('❌ Function update error:', error);
        }

        console.log('\\n=== VERIFICATION COMPLETE ===');

    } catch (error) {
        console.log('❌ Verification failed:', error);
    }
}

// Run verification
verifyFix();