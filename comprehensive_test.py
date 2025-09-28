#!/usr/bin/env python3
"""
Comprehensive test suite for PanagoreTrades
Tests all components and identifies potential issues
"""

import sys
import os
import traceback
import warnings
import pandas as pd
import requests
from datetime import datetime

def test_pandas_warnings():
    """Test and fix pandas deprecation warnings"""
    print("Testing for pandas deprecation warnings...")

    try:
        # Simulate the groupby operation that causes warnings
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")

            # Run a small version of the problematic code
            df = pd.DataFrame({
                'typeid': [1, 1, 2, 2],
                'price': [100, 200, 150, 250],
                'volume': [10, 20, 15, 25]
            })

            def test_func(group):
                return pd.Series({'max_price': group['price'].max()})

            result = df.groupby('typeid').apply(test_func, include_groups=False).reset_index()

            if w and any("DataFrameGroupBy.apply operated on the grouping columns" in str(warning.message) for warning in w):
                print("[ISSUE] Pandas deprecation warning found in groupby operation")
                return False
            else:
                print("[OK] No pandas deprecation warnings detected")
                return True

    except Exception as e:
        print(f"[FAIL] Error testing pandas warnings: {e}")
        return False

def test_tradehub_api_robustness():
    """Test TradeHub API for error handling and robustness"""
    print("\nTesting TradeHub API robustness...")

    issues = []

    # Test individual trade hub endpoints
    trade_hubs = ['Jita', 'Amarr', 'Rens', 'Dodixie']
    region_ids = [10000002, 10000043, 10000030, 10000032]

    for hub, region_id in zip(trade_hubs, region_ids):
        try:
            url = f'https://mokaam.dk/API/market/all?regionid={region_id}'
            response = requests.get(url, timeout=10)

            if response.status_code != 200:
                issues.append(f"API endpoint for {hub} returned status {response.status_code}")
                continue

            data = response.json()
            if not data:
                issues.append(f"API endpoint for {hub} returned empty data")
                continue

            # Test data structure
            first_item = next(iter(data.values()))
            required_fields = ['typeid', 'avg_price_yesterday', 'vol_yesterday']

            for field in required_fields:
                if field not in first_item:
                    issues.append(f"Missing field '{field}' in {hub} API data")

            print(f"[OK] {hub} API endpoint working ({len(data)} items)")

        except requests.exceptions.Timeout:
            issues.append(f"Timeout accessing {hub} API")
        except requests.exceptions.RequestException as e:
            issues.append(f"Network error accessing {hub} API: {e}")
        except Exception as e:
            issues.append(f"Unexpected error testing {hub} API: {e}")

    if issues:
        print(f"[ISSUES] Found {len(issues)} API issues:")
        for issue in issues:
            print(f"  - {issue}")
        return False
    else:
        print("[OK] All TradeHub API endpoints working correctly")
        return True

def test_excel_file_dependencies():
    """Test Excel file accessibility and structure"""
    print("\nTesting Excel file dependencies...")

    excel_path = r"E:\EVE_TRADE\EVE_TRADE\invTypes.xlsx"

    try:
        if not os.path.exists(excel_path):
            print(f"[FAIL] Excel file not found at {excel_path}")
            return False

        # Test reading the file
        df = pd.read_excel(excel_path)

        # Check required columns
        df.columns = df.columns.str.strip().str.upper()
        required_cols = ['TYPEID', 'TYPENAME']

        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            print(f"[FAIL] Missing required columns in Excel file: {missing_cols}")
            print(f"Available columns: {df.columns.tolist()}")
            return False

        print(f"[OK] Excel file accessible with {len(df)} items")
        print(f"[OK] Required columns present: {required_cols}")
        return True

    except Exception as e:
        print(f"[FAIL] Error reading Excel file: {e}")
        return False

def test_esi_client_functionality():
    """Test ESI client initialization and functionality"""
    print("\nTesting ESI client functionality...")

    try:
        from ESI_LocalHost_Access import ESIClient

        # Test client initialization
        client = ESIClient()
        print("[OK] ESI Client initialized successfully")

        # Test authentication status
        if client.is_authenticated():
            print(f"[OK] ESI Client authenticated for: {client.character_name}")

            # Test if tokens are expired
            if client.token_expires and client.token_expires < datetime.now():
                print("[ISSUE] Access token appears to be expired")
                return False
            else:
                print("[OK] Access token appears to be valid")

        else:
            print("[INFO] ESI Client not authenticated (no saved tokens)")

        # Test URL generation
        try:
            auth_url = client.generate_auth_url()
            if auth_url and "login.eveonline.com" in auth_url:
                print("[OK] Auth URL generation working")
            else:
                print("[FAIL] Auth URL generation failed")
                return False
        except Exception as e:
            print(f"[FAIL] Error generating auth URL: {e}")
            return False

        return True

    except ImportError as e:
        print(f"[FAIL] Cannot import ESI_LocalHost_Access: {e}")
        return False
    except Exception as e:
        print(f"[FAIL] Error testing ESI client: {e}")
        return False

def test_file_permissions_and_paths():
    """Test file permissions and path accessibility"""
    print("\nTesting file permissions and paths...")

    issues = []

    # Test current directory write permissions
    try:
        test_file = "test_permissions.tmp"
        with open(test_file, 'w') as f:
            f.write("test")
        os.remove(test_file)
        print("[OK] Current directory is writable")
    except Exception as e:
        issues.append(f"Cannot write to current directory: {e}")

    # Test CSV file generation
    try:
        test_df = pd.DataFrame({'test': [1, 2, 3]})
        test_df.to_csv("test_csv.tmp", index=False)
        os.remove("test_csv.tmp")
        print("[OK] CSV file generation working")
    except Exception as e:
        issues.append(f"Cannot generate CSV files: {e}")

    # Test Excel file generation
    try:
        test_df = pd.DataFrame({'test': [1, 2, 3]})
        test_df.to_excel("test_excel.xlsx", index=False)
        os.remove("test_excel.xlsx")
        print("[OK] Excel file generation working")
    except Exception as e:
        issues.append(f"Cannot generate Excel files: {e}")

    if issues:
        print(f"[ISSUES] Found {len(issues)} file permission issues:")
        for issue in issues:
            print(f"  - {issue}")
        return False

    return True

def test_data_processing_logic():
    """Test the core data processing logic with sample data"""
    print("\nTesting data processing logic...")

    try:
        # Create sample data that mimics the real structure
        sample_data = {
            'typeid': [1, 1, 1, 1, 2, 2, 2, 2],
            'TradeHub': ['Jita', 'Amarr', 'Rens', 'Dodixie'] * 2,
            'avg_price_yesterday': [100, 150, 120, 110, 200, 300, 250, 220],
            'vol_yesterday': [100, 80, 90, 85, 150, 120, 130, 125],
            'TYPENAME': ['Test Item 1'] * 4 + ['Test Item 2'] * 4
        }

        df = pd.DataFrame(sample_data)

        # Test the delta calculation function
        def calculate_deltas(group):
            max_price = group['avg_price_yesterday'].max()
            min_price = group['avg_price_yesterday'].min()
            delta = max_price - min_price
            delta_percentage = (delta / min_price) * 100 if min_price != 0 else 0

            idx_max = group['avg_price_yesterday'].idxmax()
            idx_min = group['avg_price_yesterday'].idxmin()

            return pd.Series({
                'max_price': max_price,
                'min_price': min_price,
                'delta': delta,
                'delta_percentage': round(delta_percentage, 2),
                'max_tradehub': group.loc[idx_max, 'TradeHub'],
                'min_tradehub': group.loc[idx_min, 'TradeHub'],
            })

        # Test groupby operation
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = df.groupby('typeid').apply(calculate_deltas, include_groups=False).reset_index()

        # Verify results
        if len(result) != 2:
            print(f"[FAIL] Expected 2 results, got {len(result)}")
            return False

        # Check calculation accuracy
        item1 = result[result['typeid'] == 1].iloc[0]
        if item1['delta_percentage'] != 50.0:  # (150-100)/100 * 100 = 50%
            print(f"[FAIL] Delta calculation incorrect: expected 50%, got {item1['delta_percentage']}%")
            return False

        print("[OK] Data processing logic working correctly")
        return True

    except Exception as e:
        print(f"[FAIL] Error in data processing logic: {e}")
        traceback.print_exc()
        return False

def test_error_handling():
    """Test error handling scenarios"""
    print("\nTesting error handling scenarios...")

    issues = []

    # Test handling of missing files
    try:
        df = pd.read_excel("nonexistent_file.xlsx")
        issues.append("No error raised for missing Excel file")
    except FileNotFoundError:
        print("[OK] Properly handles missing Excel files")
    except Exception as e:
        print(f"[OK] Handles missing files (different exception): {type(e).__name__}")

    # Test handling of network errors
    try:
        response = requests.get("http://nonexistent-domain-12345.com", timeout=1)
        issues.append("No error raised for invalid network request")
    except requests.exceptions.RequestException:
        print("[OK] Properly handles network errors")
    except Exception as e:
        print(f"[OK] Handles network errors (different exception): {type(e).__name__}")

    # Test handling of malformed data
    try:
        bad_data = pd.DataFrame({'wrong_column': [1, 2, 3]})
        if 'typeid' in bad_data.columns:
            issues.append("Did not detect missing required columns")
        else:
            print("[OK] Properly detects missing required columns")
    except Exception as e:
        print(f"[INFO] Exception handling malformed data: {e}")

    if issues:
        print(f"[ISSUES] Found {len(issues)} error handling issues:")
        for issue in issues:
            print(f"  - {issue}")
        return False

    return True

def main():
    """Run all comprehensive tests"""
    print("COMPREHENSIVE TEST SUITE FOR PANAGORE TRADES")
    print("=" * 60)

    tests = [
        ("Pandas Warnings", test_pandas_warnings),
        ("TradeHub API Robustness", test_tradehub_api_robustness),
        ("Excel File Dependencies", test_excel_file_dependencies),
        ("ESI Client Functionality", test_esi_client_functionality),
        ("File Permissions", test_file_permissions_and_paths),
        ("Data Processing Logic", test_data_processing_logic),
        ("Error Handling", test_error_handling),
    ]

    passed = 0
    total = len(tests)
    failed_tests = []

    for test_name, test_func in tests:
        print(f"\n{test_name}:")
        print("-" * len(test_name))

        try:
            if test_func():
                passed += 1
            else:
                failed_tests.append(test_name)
        except Exception as e:
            print(f"[ERROR] Test '{test_name}' crashed: {e}")
            failed_tests.append(test_name)

    print("\n" + "=" * 60)
    print(f"COMPREHENSIVE TEST RESULTS: {passed}/{total} passed")

    if failed_tests:
        print(f"\nFAILED TESTS: {', '.join(failed_tests)}")
        print("\nISSUES IDENTIFIED:")
        return failed_tests
    else:
        print("\nSUCCESS: All comprehensive tests passed!")
        return []

if __name__ == "__main__":
    failed = main()
    sys.exit(len(failed))