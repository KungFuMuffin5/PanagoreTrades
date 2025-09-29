#!/usr/bin/env python3
"""
Trigger ESI Re-authentication for Courier Contract Scopes
This script will force re-authentication with the new courier contract scopes.
"""

from ESI_LocalHost_Access import ESIClient

def main():
    print("PanagoreTrades - Courier Contract Setup")
    print("=" * 50)
    print()

    # Initialize ESI client (will not find existing tokens)
    esi = ESIClient()

    print("New scopes being requested:")
    print("   - Corporation courier contracts")
    print("   - Character courier contracts")
    print("   - All existing warehouse and trading scopes")
    print()

    try:
        # This will trigger the full authentication flow
        if esi.ensure_authenticated():
            print("SUCCESS! Authentication completed!")
            print(f"   Character: {esi.character_name}")
            print(f"   Corporation: {esi.corporation_name}")
            print()
            print("Courier contract tracking is now enabled!")
            print("   - Open your browser to: http://localhost:5000")
            print("   - You should now see:")
            print("     Courier Collateral: X.XX ISK")
            print("     Open Contracts: X")
            print()

            # Test courier contract access
            print("Testing courier contract access...")
            try:
                from warehouse_manager import WarehouseManager
                import asyncio

                wm = WarehouseManager(esi)

                async def test_courier():
                    contracts_df, metrics = await wm.get_courier_contracts('corporation')
                    print(f"   Corporation courier contracts: {metrics['courier_contracts']}")
                    print(f"   Total collateral: {metrics['total_collateral']:,.2f} ISK")
                    print(f"   Open contracts: {metrics['outstanding_contracts'] + metrics['in_progress_contracts']}")

                asyncio.run(test_courier())

            except Exception as e:
                print(f"   Courier contract test: {e}")
                print("   (This is normal if you don't have corp contract permissions)")

        else:
            print("Authentication failed. Please try again.")

    except Exception as e:
        print(f"Error during authentication: {e}")
        print("Please check your internet connection and try again.")

if __name__ == "__main__":
    main()