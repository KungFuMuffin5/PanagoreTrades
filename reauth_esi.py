#!/usr/bin/env python3
"""
Re-authentication script for ESI with updated scopes
This will force a new authentication flow with the corporation wallet scope
"""

import os
from ESI_LocalHost_Access import ESIClient

def main():
    print("ESI Re-authentication Script")
    print("=" * 40)
    print("This will re-authenticate your ESI access with updated scopes including:")
    print("- esi-wallet.read_corporation_wallets.v1")
    print()

    # Remove existing token file to force re-auth
    token_file = "esi_tokens.json"
    if os.path.exists(token_file):
        print(f"Removing existing token file: {token_file}")
        os.remove(token_file)
        print("DONE: Existing tokens removed")
    else:
        print("No existing token file found")

    print()
    print("Starting authentication flow...")
    print("Your browser will open automatically.")
    print("Please log in with your EVE Online account and grant permissions.")
    print()

    try:
        # Create new ESI client - this will trigger the auth flow
        esi = ESIClient()

        print()
        print("SUCCESS: Authentication successful!")
        print(f"Character: {esi.character_name}")
        print(f"Corporation: {esi.corporation_name}")

        # Test the new token scopes
        print()
        print("Testing corporation wallet access...")
        try:
            wallet_result = esi.get_corporation_wallets()
            print(f"SUCCESS: Corporation wallet access working!")
            print(f"Wallet data: {wallet_result}")
        except Exception as e:
            print(f"ISSUE: Still having issues: {e}")
            print("You may need corporate roles (Accountant/Director) to access wallet data.")

        print()
        print("Re-authentication complete!")
        print("You can now use the web application with the updated scopes.")

    except Exception as e:
        print(f"ERROR: Authentication failed: {e}")
        print("Please check your EVE Online login credentials and try again.")

if __name__ == "__main__":
    main()