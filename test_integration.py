#!/usr/bin/env python3
"""
Integration test for PanagoreTrades components
"""

import sys
import os

def test_imports():
    """Test that all modules can be imported successfully"""
    print("Testing module imports...")

    try:
        import pandas as pd
        print("[OK] pandas imported successfully")
    except ImportError as e:
        print(f"[FAIL] pandas import failed: {e}")
        return False

    try:
        import requests
        print("[OK] requests imported successfully")
    except ImportError as e:
        print(f"[FAIL] requests import failed: {e}")
        return False

    try:
        import ESI_LocalHost_Access
        print("[OK] ESI_LocalHost_Access imported successfully")
    except ImportError as e:
        print(f"[FAIL] ESI_LocalHost_Access import failed: {e}")
        return False

    return True

def test_tradehub_api():
    """Test the TradeHub API functionality"""
    print("\nTesting TradeHub API...")

    try:
        # Test API endpoint accessibility
        import requests

        # Test one of the trade hub APIs
        test_url = "https://mokaam.dk/API/market/all?regionid=10000002"
        response = requests.get(test_url, timeout=10)

        if response.status_code == 200:
            print("[OK] TradeHub API is accessible")
            data = response.json()
            print(f"[OK] API returned {len(data)} items")
            return True
        else:
            print(f"[FAIL] TradeHub API returned status {response.status_code}")
            return False

    except Exception as e:
        print(f"[FAIL] TradeHub API test failed: {e}")
        return False

def test_file_dependencies():
    """Test that required files exist"""
    print("\nTesting file dependencies...")

    excel_path = r"E:\EVE_TRADE\EVE_TRADE\invTypes.xlsx"
    if os.path.exists(excel_path):
        print("[OK] invTypes.xlsx found")
        return True
    else:
        print(f"[FAIL] invTypes.xlsx not found at {excel_path}")
        return False

def test_esi_client():
    """Test ESI client initialization"""
    print("\nTesting ESI Client...")

    try:
        from ESI_LocalHost_Access import ESIClient
        client = ESIClient()
        print("[OK] ESI Client initialized successfully")

        # Check if tokens are loaded
        if client.is_authenticated():
            print(f"[OK] ESI Client is authenticated for character: {client.character_name}")
        else:
            print("[INFO] ESI Client is not authenticated (no saved tokens)")

        return True

    except Exception as e:
        print(f"[FAIL] ESI Client test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("PanagoreTrades Integration Test")
    print("=" * 40)

    tests = [
        test_imports,
        test_file_dependencies,
        test_tradehub_api,
        test_esi_client,
    ]

    passed = 0
    total = len(tests)

    for test in tests:
        if test():
            passed += 1
        print()  # Add spacing between tests

    print("=" * 40)
    print(f"Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("SUCCESS: All tests passed! The code is working correctly.")
        return 0
    else:
        print("WARNING: Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())