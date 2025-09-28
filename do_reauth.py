#!/usr/bin/env python3
"""
Direct ESI re-authentication execution
"""

from ESI_LocalHost_Access import ESIClient
import os

def main():
    print("Starting ESI Re-authentication...")
    print("=" * 40)

    # Make sure we have a clean slate
    token_file = "esi_tokens.json"
    if os.path.exists(token_file):
        print("Removing existing tokens...")
        os.remove(token_file)

    print("Initializing ESI Client (this will trigger authentication)...")
    print("Please complete the authentication in your browser...")

    try:
        # Create ESI client (this won't authenticate automatically)
        esi = ESIClient()

        # Check if already authenticated
        if not esi.is_authenticated():
            print("No valid tokens found. Starting authentication flow...")
            esi.authenticate_user()  # This will trigger the OAuth flow
        else:
            print("Using existing valid tokens...")

        print(f"Authentication completed!")
        print(f"Character: {esi.character_name}")
        print(f"Corporation: {esi.corporation_name}")
        print(f"Corporation ID: {esi.corporation_id}")

        # Test wallet access immediately
        print("\nTesting corporation wallet access...")
        try:
            wallet = esi.get_corporation_wallets()
            print(f"SUCCESS: Corporation wallet = {wallet}")
        except Exception as e:
            print(f"Wallet access failed: {e}")

        return True

    except Exception as e:
        print(f"Authentication failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    if success:
        print("\nRe-authentication complete! You can now use the web application.")
    else:
        print("\nRe-authentication failed. Please try again.")