#!/usr/bin/env python3
"""
Test script for corporation wallet functionality
"""

from ESI_LocalHost_Access import ESIClient
import requests

def test_corporation_wallet():
    """Test the corporation wallet API calls"""
    print("Testing Corporation Wallet Access...")
    print("=" * 50)

    try:
        # Initialize ESI client
        esi = ESIClient()

        print(f"Character: {esi.character_name}")
        print(f"Corporation: {esi.corporation_name}")
        print(f"Corporation ID: {esi.corporation_id}")
        print()

        # Test the wallet method
        print("Testing get_corporation_wallets method...")
        try:
            wallet_result = esi.get_corporation_wallets()
            print(f"SUCCESS: Corporation wallet = {wallet_result}")
            return wallet_result
        except Exception as e:
            print(f"FAILED: {type(e).__name__}: {e}")

        print()
        print("Testing individual API endpoints manually...")

        # Test each endpoint manually
        headers = {
            'Authorization': f'Bearer {esi.access_token}',
            'User-Agent': 'PanagoreTrades/1.0'
        }

        # Test master wallet (division 1000)
        print("1. Testing master wallet (division 1000)...")
        try:
            url = f"https://esi.evetech.net/latest/corporations/{esi.corporation_id}/wallets/1000/"
            response = requests.get(url, headers=headers)
            print(f"   Status: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"   SUCCESS: {result}")
                return result
            else:
                print(f"   Error: {response.text}")
        except Exception as e:
            print(f"   Exception: {e}")

        # Test main corp wallet (division 1)
        print("\n2. Testing main corp wallet (division 1)...")
        try:
            url = f"https://esi.evetech.net/latest/corporations/{esi.corporation_id}/wallets/1/"
            response = requests.get(url, headers=headers)
            print(f"   Status: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"   SUCCESS: {result}")
                return result
            else:
                print(f"   Error: {response.text}")
        except Exception as e:
            print(f"   Exception: {e}")

        # Test general wallets endpoint
        print("\n3. Testing general wallets endpoint...")
        try:
            url = f"https://esi.evetech.net/latest/corporations/{esi.corporation_id}/wallets/"
            response = requests.get(url, headers=headers)
            print(f"   Status: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"   SUCCESS: {result}")
                # Find division 1
                main_wallet = next((w for w in result if w['division'] == 1), None)
                if main_wallet:
                    print(f"   Main wallet balance: {main_wallet['balance']}")
                    return main_wallet['balance']
            else:
                print(f"   Error: {response.text}")
        except Exception as e:
            print(f"   Exception: {e}")

        print("\nAll methods failed")
        return None

    except Exception as e:
        print(f"FATAL ERROR: {type(e).__name__}: {e}")
        return None

if __name__ == "__main__":
    test_corporation_wallet()