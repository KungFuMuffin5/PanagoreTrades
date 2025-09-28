#!/usr/bin/env python3
"""
Manual re-authentication guide for ESI
"""

import os

def main():
    print("Manual ESI Re-authentication Guide")
    print("=" * 40)

    # Step 1: Remove tokens
    token_file = "esi_tokens.json"
    if os.path.exists(token_file):
        print(f"Step 1: Removing existing token file: {token_file}")
        os.remove(token_file)
        print("DONE: Tokens removed")
    else:
        print("Step 1: No existing tokens found")

    print()
    print("Step 2: Manual authentication required")
    print("You need to manually complete the following steps:")
    print()
    print("1. Restart your Flask web application")
    print("2. Navigate to http://localhost:5000 in your browser")
    print("3. When you see authentication errors, the ESI will automatically")
    print("   redirect you to EVE Online SSO for re-authentication")
    print("4. Log in and grant permissions for ALL requested scopes including:")
    print("   - esi-wallet.read_corporation_wallets.v1")
    print("5. Complete the authentication flow")
    print()
    print("The updated scopes have been added to the ESI configuration.")
    print("After authentication, test the corporation wallet functionality.")
    print()
    print("If you still get permission errors, ensure your character has")
    print("corporate roles (Accountant or Director) in EVE Online.")

if __name__ == "__main__":
    main()