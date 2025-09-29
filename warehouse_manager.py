#!/usr/bin/env python3
"""
Warehouse Manager for PanagoreTrades
Handles asset management, pricing calculations, and warehouse operations across trade hubs

EVE Online Trading Calculations:
- Broker Fee: 3% base (reduced by Broker Relations skill: -0.1% per level, max 2.5%)
- Sales Tax: 8% base (reduced by Accounting skill: -11% per level, final 4.5% at level V)
- Transaction Tax: Applied on sell orders
- Market fees vary by station (NPC vs Player-owned)
"""

import pandas as pd
import requests
import json
import math
from datetime import datetime, timedelta
from ESI_LocalHost_Access import ESIClient, get_character_market_orders, get_character_wallet_transactions, get_corporation_transactions, get_corporation_contracts, get_character_contracts
from collections import defaultdict

class WarehouseManager:
    def __init__(self, esi_client=None):
        self.esi_client = esi_client
        self.trade_hubs = {
            'Jita': {'region_id': 10000002, 'station_id': 60003760},
            'Amarr': {'region_id': 10000043, 'station_id': 60008494},
            'Rens': {'region_id': 10000030, 'station_id': 60004588},
            'Dodixie': {'region_id': 10000032, 'station_id': 60011866},
            'Hek': {'region_id': 10000042, 'station_id': 60005686}
        }

        # Default skill levels (can be updated from character data)
        self.trading_skills = {
            'broker_relations': 5,  # Reduces broker fees by 0.1% per level
            'accounting': 5,        # Reduces sales tax by 11% per level
            'margin_trading': 4,    # Allows buying with partial ISK
            'marketing': 4,         # Additional market orders
            'procurement': 4,       # Additional buy orders
            'daytrading': 0,        # Remote market orders
            'visibility': 0,        # Market order range
            'trade': 3             # Base trade skill
        }

        # Load type data
        try:
            self.df_types = pd.read_excel(r"E:\EVE_TRADE\EVE_TRADE\invTypes.xlsx")
            self.df_types.columns = self.df_types.columns.str.strip().str.upper()
        except Exception as e:
            print(f"Warning: Could not load type data: {e}")
            self.df_types = pd.DataFrame()

        # Cost basis tracking
        self.cost_basis_data = defaultdict(lambda: {'total_cost': 0, 'total_quantity': 0, 'transactions': []})
        self.transactions_cache = None
        self.orders_cache = None

    def calculate_broker_fee_rate(self, broker_relations_level=None):
        """
        Calculate broker fee rate based on Broker Relations skill
        Base: 3.0%
        Reduction: 0.1% per level (5% at max level V)
        Final: 2.5% at Broker Relations V
        """
        if broker_relations_level is None:
            broker_relations_level = self.trading_skills['broker_relations']

        base_rate = 3.0
        reduction = broker_relations_level * 0.1
        return max(base_rate - reduction, 2.5)  # Minimum 2.5%

    def calculate_sales_tax_rate(self, accounting_level=None):
        """
        Calculate sales tax rate based on Accounting skill
        Base: 8.0%
        Reduction: 11% per level of the base rate
        Formula: 8% * (1 - (0.11 * level))
        Final: ~4.5% at Accounting V
        """
        if accounting_level is None:
            accounting_level = self.trading_skills['accounting']

        base_rate = 8.0
        reduction_factor = 1 - (0.11 * accounting_level)
        return max(base_rate * reduction_factor, 4.5)  # Practical minimum ~4.5%

    def calculate_effective_buy_price(self, market_price, broker_fee_rate=None):
        """
        Calculate the actual ISK needed to place a buy order
        Includes broker fees that must be paid upfront
        """
        if broker_fee_rate is None:
            broker_fee_rate = self.calculate_broker_fee_rate()

        broker_fee = market_price * (broker_fee_rate / 100)
        return market_price + broker_fee

    def calculate_effective_sell_price(self, market_price, sales_tax_rate=None, broker_fee_rate=None):
        """
        Calculate the actual ISK received from a sell order
        Deducts sales tax and broker fees
        """
        if sales_tax_rate is None:
            sales_tax_rate = self.calculate_sales_tax_rate()
        if broker_fee_rate is None:
            broker_fee_rate = self.calculate_broker_fee_rate()

        # Calculate fees
        sales_tax = market_price * (sales_tax_rate / 100)
        broker_fee = market_price * (broker_fee_rate / 100)

        total_fees = sales_tax + broker_fee
        return market_price - total_fees

    def calculate_minimum_profitable_sell_price(self, buy_price, desired_margin=0.05):
        """
        Calculate minimum sell price to achieve desired profit margin
        Accounts for all fees and taxes
        """
        sales_tax_rate = self.calculate_sales_tax_rate()
        broker_fee_rate = self.calculate_broker_fee_rate()

        # Total fee rate
        total_fee_rate = (sales_tax_rate + broker_fee_rate) / 100

        # Calculate minimum sell price
        # net_received = sell_price * (1 - total_fee_rate)
        # For profit: net_received >= buy_price * (1 + desired_margin)
        # So: sell_price >= (buy_price * (1 + desired_margin)) / (1 - total_fee_rate)

        target_net = buy_price * (1 + desired_margin)
        min_sell_price = target_net / (1 - total_fee_rate)

        return min_sell_price

    async def get_character_assets(self):
        """
        Get character assets from ESI API
        Returns list of assets with location and quantity data
        """
        if not self.esi_client or not self.esi_client.is_authenticated():
            print("ESI client not authenticated")
            return []

        try:
            # Get character assets
            assets_url = f"https://esi.evetech.net/latest/characters/{self.esi_client.character_id}/assets/"
            headers = {"Authorization": f"Bearer {self.esi_client.access_token}"}

            response = requests.get(assets_url, headers=headers)
            response.raise_for_status()

            assets = response.json()

            # Filter assets in trade hub stations
            trade_hub_assets = []
            hub_station_ids = [hub['station_id'] for hub in self.trade_hubs.values()]

            for asset in assets:
                if asset.get('location_id') in hub_station_ids:
                    # Find which trade hub this asset is in
                    hub_name = None
                    for name, data in self.trade_hubs.items():
                        if data['station_id'] == asset['location_id']:
                            hub_name = name
                            break

                    if hub_name:
                        asset['trade_hub'] = hub_name
                        asset['asset_source'] = 'character'
                        trade_hub_assets.append(asset)

            return trade_hub_assets

        except Exception as e:
            print(f"Error getting character assets: {e}")
            return []

    async def get_corporation_assets(self):
        """
        Get corporation assets from ESI API
        Returns list of assets with location and quantity data
        """
        if not self.esi_client or not self.esi_client.is_authenticated():
            print("ESI client not authenticated")
            return []

        try:
            # Get corporation assets
            assets_url = f"https://esi.evetech.net/latest/corporations/{self.esi_client.corporation_id}/assets/"
            headers = {"Authorization": f"Bearer {self.esi_client.access_token}"}

            response = requests.get(assets_url, headers=headers)
            response.raise_for_status()

            assets = response.json()

            # Filter assets in trade hub stations
            trade_hub_assets = []
            hub_station_ids = [hub['station_id'] for hub in self.trade_hubs.values()]

            for asset in assets:
                if asset.get('location_id') in hub_station_ids:
                    # Find which trade hub this asset is in
                    hub_name = None
                    for name, data in self.trade_hubs.items():
                        if data['station_id'] == asset['location_id']:
                            hub_name = name
                            break

                    if hub_name:
                        asset['trade_hub'] = hub_name
                        asset['asset_source'] = 'corporation'
                        trade_hub_assets.append(asset)

            print(f"Found {len(trade_hub_assets)} corporation assets in trade hubs")
            return trade_hub_assets

        except Exception as e:
            print(f"Error getting corporation assets: {e}")
            return []

    async def get_all_assets(self, include_character=False):
        """
        Get assets from corporation and optionally character
        Returns combined list of assets
        """
        all_assets = []

        # Always get corporation assets (primary source)
        corp_assets = await self.get_corporation_assets()
        all_assets.extend(corp_assets)

        # Optionally include character assets
        if include_character:
            char_assets = await self.get_character_assets()
            all_assets.extend(char_assets)

        print(f"Total assets found: {len(all_assets)} ({'corp + char' if include_character else 'corp only'})")
        return all_assets

    async def get_character_orders(self):
        """
        Get character's active market orders
        Returns DataFrame with order information
        """
        if not self.esi_client or not self.esi_client.is_authenticated():
            print("ESI client not authenticated")
            return pd.DataFrame()

        try:
            orders_df = get_character_market_orders(self.esi_client)
            self.orders_cache = orders_df
            return orders_df

        except Exception as e:
            print(f"Error getting character orders: {e}")
            return pd.DataFrame()

    async def get_character_transactions(self, days_back=30):
        """
        Get character's wallet transactions for cost basis calculation
        Returns DataFrame with transaction history
        """
        if not self.esi_client or not self.esi_client.is_authenticated():
            print("ESI client not authenticated")
            return pd.DataFrame()

        try:
            transactions_df = get_character_wallet_transactions(self.esi_client)

            if not transactions_df.empty:
                # Convert date column to datetime with timezone awareness
                transactions_df['transaction_date'] = pd.to_datetime(transactions_df['date'], utc=True)

                # Filter to recent transactions - make cutoff_date timezone aware
                from datetime import timezone
                cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
                transactions_df = transactions_df[transactions_df['transaction_date'] >= cutoff_date]

                print(f"Found {len(transactions_df)} character transactions in last {days_back} days")
                self.transactions_cache = transactions_df

            return transactions_df

        except Exception as e:
            print(f"Error getting character transactions: {e}")
            return pd.DataFrame()

    async def get_corporation_transactions(self, days_back=30, division=1):
        """
        Get corporation's wallet transactions for cost basis calculation
        Returns DataFrame with transaction history
        """
        if not self.esi_client or not self.esi_client.is_authenticated():
            print("ESI client not authenticated")
            return pd.DataFrame()

        try:
            transactions_df = get_corporation_transactions(self.esi_client, division=division)

            if not transactions_df.empty:
                # Check if we already have a proper datetime column
                if 'transaction_date' in transactions_df.columns:
                    # Use the pre-processed transaction_date column
                    date_col = 'transaction_date'
                elif 'date' in transactions_df.columns:
                    # Convert date column to datetime
                    transactions_df['transaction_date'] = pd.to_datetime(transactions_df['date'], utc=True)
                    date_col = 'transaction_date'
                else:
                    print("No date column found in transactions")
                    return pd.DataFrame()

                # Filter to recent transactions - make cutoff_date timezone aware
                from datetime import timezone
                cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
                transactions_df = transactions_df[transactions_df[date_col] >= cutoff_date]

                print(f"Found {len(transactions_df)} corporation transactions in last {days_back} days")
                self.transactions_cache = transactions_df

            return transactions_df

        except Exception as e:
            print(f"Error getting corporation transactions: {e}")
            return pd.DataFrame()

    async def get_all_transactions(self, days_back=30, asset_source='corporation'):
        """
        Get transactions based on asset source (corporation or character)
        """
        if asset_source == 'corporation':
            return await self.get_corporation_transactions(days_back)
        else:
            return await self.get_character_transactions(days_back)

    async def get_courier_contracts(self, source='corporation'):
        """
        Get courier contracts from corporation or character
        Returns contract data including collateral and status information
        """
        if not self.esi_client or not self.esi_client.is_authenticated():
            print("ESI client not authenticated")
            return pd.DataFrame(), {}

        try:
            if source == 'corporation':
                contracts_df = get_corporation_contracts(self.esi_client)
            else:
                contracts_df = get_character_contracts(self.esi_client)

            if contracts_df.empty:
                return contracts_df, {
                    'total_contracts': 0,
                    'courier_contracts': 0,
                    'outstanding_contracts': 0,
                    'in_progress_contracts': 0,
                    'total_collateral': 0.0,
                    'total_reward': 0.0
                }

            # Filter for courier contracts
            courier_contracts = contracts_df[contracts_df['type'] == 'courier'] if 'type' in contracts_df.columns else pd.DataFrame()

            if courier_contracts.empty:
                return courier_contracts, {
                    'total_contracts': len(contracts_df),
                    'courier_contracts': 0,
                    'outstanding_contracts': 0,
                    'in_progress_contracts': 0,
                    'total_collateral': 0.0,
                    'total_reward': 0.0
                }

            # Calculate metrics
            outstanding = courier_contracts[courier_contracts['status'] == 'outstanding'] if 'status' in courier_contracts.columns else pd.DataFrame()
            in_progress = courier_contracts[courier_contracts['status'] == 'in_progress'] if 'status' in courier_contracts.columns else pd.DataFrame()

            # Get unfinished contracts details
            unfinished = pd.concat([outstanding, in_progress]) if not outstanding.empty or not in_progress.empty else pd.DataFrame()
            unfinished_contracts_list = []

            if not unfinished.empty:
                for _, contract in unfinished.iterrows():
                    contract_info = {
                        'contract_id': int(contract.get('contract_id', 0)),
                        'status': str(contract.get('status', 'unknown')),
                        'type': str(contract.get('type', 'unknown')),
                        'collateral': float(contract.get('collateral', 0)),
                        'reward': float(contract.get('reward', 0)),
                        'title': str(contract.get('title', 'Untitled')),
                        'issuer_id': int(contract.get('issuer_id', 0)),
                        'assignee_id': int(contract.get('assignee_id', 0)) if contract.get('assignee_id') else None,
                        'acceptor_id': int(contract.get('acceptor_id', 0)) if contract.get('acceptor_id') else None,
                        'date_issued': str(contract.get('date_issued', '')),
                        'date_expired': str(contract.get('date_expired', '')),
                        'date_accepted': str(contract.get('date_accepted', '')) if contract.get('date_accepted') else None,
                        'volume': float(contract.get('volume', 0)),
                        'days_to_complete': int(contract.get('days_to_complete', 0))
                    }
                    unfinished_contracts_list.append(contract_info)

            metrics = {
                'total_contracts': int(len(contracts_df)),
                'courier_contracts': int(len(courier_contracts)),
                'outstanding_contracts': int(len(outstanding)),
                'in_progress_contracts': int(len(in_progress)),
                'total_collateral': float(unfinished['collateral'].sum() if not unfinished.empty and 'collateral' in unfinished.columns else 0),
                'total_reward': float(unfinished['reward'].sum() if not unfinished.empty and 'reward' in unfinished.columns else 0),
                'unfinished_contracts': unfinished_contracts_list
            }

            print(f"Found {metrics['courier_contracts']} courier contracts ({metrics['outstanding_contracts']} outstanding, {metrics['in_progress_contracts']} in progress)")
            print(f"Active contract collateral: {metrics['total_collateral']:,.2f} ISK")

            return courier_contracts, metrics

        except Exception as e:
            print(f"Error getting courier contracts: {e}")
            return pd.DataFrame(), {
                'total_contracts': 0,
                'courier_contracts': 0,
                'outstanding_contracts': 0,
                'in_progress_contracts': 0,
                'total_collateral': 0.0,
                'total_reward': 0.0
            }

    def calculate_actual_realized_profit(self, days_back=30):
        """
        Calculate ACTUAL realized profit from completed sales transactions
        Returns profit from sell transactions minus the cost basis of what was sold
        """
        try:
            if not self.esi_client or not self.esi_client.is_authenticated():
                return {
                    'total_realized_profit': 0,
                    'total_sales_revenue': 0,
                    'total_cost_of_goods_sold': 0,
                    'total_fees_paid': 0,
                    'transactions_analyzed': 0,
                    'period_days': days_back
                }

            # Get corporation transactions
            transactions_df = get_corporation_transactions(self.esi_client, days_back)

            if transactions_df.empty:
                return {
                    'total_realized_profit': 0,
                    'total_sales_revenue': 0,
                    'total_cost_of_goods_sold': 0,
                    'total_fees_paid': 0,
                    'transactions_analyzed': 0,
                    'period_days': days_back
                }

            # Filter for sell transactions only (is_buy = False)
            sell_transactions = transactions_df[transactions_df['is_buy'] == False]

            if sell_transactions.empty:
                return {
                    'total_realized_profit': 0,
                    'total_sales_revenue': 0,
                    'total_cost_of_goods_sold': 0,
                    'total_fees_paid': 0,
                    'transactions_analyzed': 0,
                    'period_days': days_back
                }

            total_sales_revenue = 0
            total_cost_of_goods_sold = 0
            total_fees_paid = 0
            transactions_analyzed = 0

            # Process each sell transaction
            for _, transaction in sell_transactions.iterrows():
                type_id = transaction['type_id']
                location_id = transaction['location_id']
                quantity = transaction['quantity']
                unit_price = transaction['unit_price']

                # Calculate gross revenue (before fees)
                gross_revenue = quantity * unit_price
                total_sales_revenue += gross_revenue

                # Calculate transaction fees (broker fees + sales tax)
                broker_fee = gross_revenue * (self.calculate_broker_fee_rate() / 100)
                sales_tax = gross_revenue * (self.calculate_sales_tax_rate() / 100)
                transaction_fees = broker_fee + sales_tax
                total_fees_paid += transaction_fees

                # Get cost basis for this item at this location
                cost_data = self.get_item_cost_basis(type_id, location_id, transactions_df)
                if cost_data:
                    cost_per_unit = cost_data[0]  # average cost
                    cost_of_goods_sold = quantity * cost_per_unit
                    total_cost_of_goods_sold += cost_of_goods_sold

                transactions_analyzed += 1

            # Net realized profit = Revenue - Fees - Cost of Goods Sold
            total_realized_profit = total_sales_revenue - total_fees_paid - total_cost_of_goods_sold

            return {
                'total_realized_profit': round(total_realized_profit, 2),
                'total_sales_revenue': round(total_sales_revenue, 2),
                'total_cost_of_goods_sold': round(total_cost_of_goods_sold, 2),
                'total_fees_paid': round(total_fees_paid, 2),
                'transactions_analyzed': transactions_analyzed,
                'period_days': days_back
            }

        except Exception as e:
            print(f"Error calculating realized profit: {e}")
            return {
                'total_realized_profit': 0,
                'total_sales_revenue': 0,
                'total_cost_of_goods_sold': 0,
                'total_fees_paid': 0,
                'transactions_analyzed': 0,
                'period_days': days_back,
                'error': str(e)
            }

    def calculate_cost_basis(self, type_id, location_id=None):
        """
        Calculate weighted average cost basis for an item type
        Uses transaction history to determine actual purchase prices
        """
        if self.transactions_cache is None or self.transactions_cache.empty:
            return None

        # Filter transactions for this item type
        item_transactions = self.transactions_cache[
            (self.transactions_cache['type_id'] == type_id) &
            (self.transactions_cache['is_buy'] == True)  # Only buy transactions
        ]

        if location_id:
            item_transactions = item_transactions[
                item_transactions['location_id'] == location_id
            ]

        if item_transactions.empty:
            return None

        # Calculate weighted average cost
        total_cost = (item_transactions['unit_price'] * item_transactions['quantity']).sum()
        total_quantity = item_transactions['quantity'].sum()

        if total_quantity == 0:
            return None

        # Use the correct date column (transaction_date if available, otherwise date)
        date_column = 'transaction_date' if 'transaction_date' in item_transactions.columns else 'date'

        return {
            'average_cost': float(total_cost / total_quantity),
            'total_purchased': int(total_quantity),
            'total_cost': float(total_cost),
            'first_purchase': item_transactions[date_column].min().isoformat(),
            'last_purchase': item_transactions[date_column].max().isoformat(),
            'purchase_count': int(len(item_transactions))
        }

    def get_market_depth_analysis(self, region_id, type_id):
        """
        Analyze market depth to determine realistic sell potential
        Returns more accurate pricing than just min/max
        """
        try:
            orders_url = f"https://esi.evetech.net/latest/markets/{region_id}/orders/"
            params = {'type_id': type_id, 'order_type': 'all'}

            response = requests.get(orders_url, params=params)
            response.raise_for_status()

            orders = response.json()

            # Separate buy and sell orders
            buy_orders = [o for o in orders if o['is_buy_order'] and o['volume_remain'] > 0]
            sell_orders = [o for o in orders if not o['is_buy_order'] and o['volume_remain'] > 0]

            # Sort orders
            buy_orders.sort(key=lambda x: x['price'], reverse=True)
            sell_orders.sort(key=lambda x: x['price'])

            # Calculate market depth metrics
            analysis = {
                'best_buy_price': buy_orders[0]['price'] if buy_orders else 0,
                'best_sell_price': sell_orders[0]['price'] if sell_orders else 0,
                'buy_volume_top5': sum(o['volume_remain'] for o in buy_orders[:5]),
                'sell_volume_top5': sum(o['volume_remain'] for o in sell_orders[:5]),
                'total_buy_orders': len(buy_orders),
                'total_sell_orders': len(sell_orders),
                'spread_percentage': 0
            }

            # Calculate spread
            if analysis['best_buy_price'] > 0 and analysis['best_sell_price'] > 0:
                spread = analysis['best_sell_price'] - analysis['best_buy_price']
                analysis['spread_percentage'] = (spread / analysis['best_sell_price']) * 100

            # Realistic sell price (considering market depth)
            if sell_orders:
                # Use weighted average of top sell orders for more realistic pricing
                top_sells = sell_orders[:min(5, len(sell_orders))]
                total_volume = sum(o['volume_remain'] for o in top_sells)
                if total_volume > 0:
                    weighted_price = sum(o['price'] * o['volume_remain'] for o in top_sells) / total_volume
                    analysis['realistic_sell_price'] = weighted_price
                else:
                    analysis['realistic_sell_price'] = analysis['best_sell_price']
            else:
                analysis['realistic_sell_price'] = 0

            return analysis

        except Exception as e:
            print(f"Error analyzing market depth for type {type_id}: {e}")
            return None

    def analyze_active_orders(self, station_id, orders_df):
        """
        Analyze active orders for a specific station
        Returns summary of buy/sell orders and ISK commitment
        """
        if orders_df.empty:
            return {
                'buy_orders': 0,
                'sell_orders': 0,
                'total_isk_in_orders': 0,
                'orders_by_type': {}
            }

        # Filter orders for this station
        station_orders = orders_df[orders_df['location_id'] == station_id]

        if station_orders.empty:
            return {
                'buy_orders': 0,
                'sell_orders': 0,
                'total_isk_in_orders': 0,
                'orders_by_type': {}
            }

        # Separate buy and sell orders
        buy_orders = station_orders[station_orders['is_buy_order'] == True]
        sell_orders = station_orders[station_orders['is_buy_order'] == False]

        # Calculate ISK in buy orders (price * volume_remain for each buy order)
        isk_in_buy_orders = (buy_orders['price'] * buy_orders['volume_remain']).sum()

        # Group orders by type
        orders_by_type = {}
        for _, order in station_orders.iterrows():
            type_id = order['type_id']
            if type_id not in orders_by_type:
                orders_by_type[type_id] = {'buy_orders': [], 'sell_orders': []}

            order_data = {
                'order_id': order.get('order_id', 0),
                'price': order['price'],
                'volume_remain': order['volume_remain'],
                'volume_total': order.get('volume_total', order['volume_remain']),
                'issued': order.get('issued', ''),
                'duration': order.get('duration', 0)
            }

            if order['is_buy_order']:
                orders_by_type[type_id]['buy_orders'].append(order_data)
            else:
                orders_by_type[type_id]['sell_orders'].append(order_data)

        return {
            'buy_orders': len(buy_orders),
            'sell_orders': len(sell_orders),
            'total_isk_in_orders': isk_in_buy_orders,
            'orders_by_type': orders_by_type
        }

    def get_item_orders(self, type_id, location_id, orders_df):
        """
        Get active orders for a specific item at a specific location
        """
        if orders_df.empty:
            return {'buy_orders': [], 'sell_orders': []}

        # Filter for this item and location
        item_orders = orders_df[
            (orders_df['type_id'] == type_id) &
            (orders_df['location_id'] == location_id)
        ]

        if item_orders.empty:
            return {'buy_orders': [], 'sell_orders': []}

        buy_orders = []
        sell_orders = []

        for _, order in item_orders.iterrows():
            order_data = {
                'order_id': order.get('order_id', 0),
                'price': order['price'],
                'volume_remain': order['volume_remain'],
                'volume_total': order.get('volume_total', order['volume_remain']),
                'issued': order.get('issued', ''),
                'duration': order.get('duration', 0),
                'isk_value': order['price'] * order['volume_remain']
            }

            if order['is_buy_order']:
                buy_orders.append(order_data)
            else:
                sell_orders.append(order_data)

        return {
            'buy_orders': buy_orders,
            'sell_orders': sell_orders,
            'total_buy_orders': len(buy_orders),
            'total_sell_orders': len(sell_orders)
        }

    def get_market_prices(self, region_id, type_ids):
        """
        Get current market prices for specific items in a region
        Returns dict with type_id as key and price data as value
        """
        try:
            prices = {}

            # Get market data from EVE ESI
            for type_id in type_ids:
                orders_url = f"https://esi.evetech.net/latest/markets/{region_id}/orders/"
                params = {'type_id': type_id, 'order_type': 'all'}

                response = requests.get(orders_url, params=params)
                response.raise_for_status()

                orders = response.json()

                # Separate buy and sell orders
                buy_orders = [o for o in orders if o['is_buy_order'] and o['volume_remain'] > 0]
                sell_orders = [o for o in orders if not o['is_buy_order'] and o['volume_remain'] > 0]

                # Calculate prices
                avg_buy_price = 0
                min_sell_price = 0

                if buy_orders:
                    # Weighted average of top buy orders
                    buy_orders.sort(key=lambda x: x['price'], reverse=True)
                    total_volume = sum(o['volume_remain'] for o in buy_orders[:10])
                    if total_volume > 0:
                        weighted_sum = sum(o['price'] * o['volume_remain'] for o in buy_orders[:10])
                        avg_buy_price = weighted_sum / total_volume

                if sell_orders:
                    # Minimum sell price
                    sell_orders.sort(key=lambda x: x['price'])
                    min_sell_price = sell_orders[0]['price']

                prices[type_id] = {
                    'avg_buy_price': avg_buy_price,
                    'min_sell_price': min_sell_price,
                    'buy_orders_count': len(buy_orders),
                    'sell_orders_count': len(sell_orders)
                }

            return prices

        except Exception as e:
            print(f"Error getting market prices: {e}")
            return {}

    async def analyze_warehouse_hub(self, hub_name, use_enhanced_analysis=True):
        """
        Analyze assets and pricing for a specific trade hub with enhanced precision
        Returns comprehensive data including cost basis and active orders
        """
        if hub_name not in self.trade_hubs:
            raise ValueError(f"Unknown trade hub: {hub_name}")

        hub_data = self.trade_hubs[hub_name]

        # Get all data sources (primarily corporation assets)
        all_assets = await self.get_all_assets(include_character=False)  # Corporation assets only
        hub_assets = [a for a in all_assets if a.get('trade_hub') == hub_name]

        if use_enhanced_analysis:
            # Get transaction history and active orders for enhanced analysis
            # Use corporation transactions since we're analyzing corporation assets
            await self.get_all_transactions(days_back=30, asset_source='corporation')
            orders_df = await self.get_character_orders()
        else:
            orders_df = pd.DataFrame()

        if not hub_assets:
            return {
                'hub_name': hub_name,
                'total_items': 0,
                'total_value': 0,
                'total_actual_value': 0,
                'isk_in_orders': 0,
                'items': [],
                'active_orders_summary': {'buy_orders': 0, 'sell_orders': 0, 'total_isk_in_orders': 0}
            }

        # Get unique type IDs
        type_ids = list(set(asset['type_id'] for asset in hub_assets))

        # Get current market prices and depth analysis
        market_prices = self.get_market_prices(hub_data['region_id'], type_ids)

        # Analyze active orders for this hub
        active_orders_summary = self.analyze_active_orders(hub_data['station_id'], orders_df)

        # Analyze each item
        analyzed_items = []
        total_value = 0
        total_actual_value = 0

        for asset in hub_assets:
            type_id = asset['type_id']
            quantity = asset['quantity']
            location_id = asset['location_id']

            # Get item name
            item_name = "Unknown Item"
            if not self.df_types.empty:
                type_row = self.df_types[self.df_types['TYPEID'] == type_id]
                if not type_row.empty:
                    item_name = type_row.iloc[0]['TYPENAME']

            # Get market prices and depth analysis
            price_data = market_prices.get(type_id, {})
            market_avg_buy_price = price_data.get('avg_buy_price', 0)  # Market average (not used for avg_buy_price)
            min_sell_price = price_data.get('min_sell_price', 0)

            # Enhanced market analysis
            if use_enhanced_analysis:
                market_depth = self.get_market_depth_analysis(hub_data['region_id'], type_id)
                realistic_sell_price = market_depth.get('realistic_sell_price', min_sell_price) if market_depth else min_sell_price
                spread_percentage = market_depth.get('spread_percentage', 0) if market_depth else 0
            else:
                realistic_sell_price = min_sell_price
                spread_percentage = 0

            # Calculate cost basis from transaction history
            cost_basis = self.calculate_cost_basis(type_id, location_id) if use_enhanced_analysis else None
            actual_cost_per_unit = cost_basis['average_cost'] if cost_basis else market_avg_buy_price

            # Use actual corp wallet purchase price as avg_buy_price, fallback to market price if no transactions
            avg_buy_price = cost_basis['average_cost'] if cost_basis else market_avg_buy_price

            # Calculate effective prices with skills and fees
            effective_buy_price = self.calculate_effective_buy_price(avg_buy_price)
            effective_sell_price = self.calculate_effective_sell_price(realistic_sell_price)
            actual_effective_cost = self.calculate_effective_buy_price(actual_cost_per_unit)

            # Calculate minimum profitable sell price (5% margin)
            min_profitable_sell = self.calculate_minimum_profitable_sell_price(
                actual_effective_cost, desired_margin=0.05
            )

            # Calculate values
            current_value = effective_sell_price * quantity
            actual_value = (effective_sell_price - actual_effective_cost) * quantity
            total_value += current_value
            total_actual_value += actual_value

            # Check for active orders on this item
            item_orders = self.get_item_orders(type_id, location_id, orders_df)

            item_analysis = {
                'type_id': int(type_id),
                'item_name': str(item_name),
                'quantity': int(quantity),
                'location_id': int(location_id),

                # Market prices
                'avg_buy_price': round(float(avg_buy_price), 2),
                'min_sell_price': round(float(min_sell_price), 2),
                'realistic_sell_price': round(float(realistic_sell_price), 2),
                'spread_percentage': round(float(spread_percentage), 2),

                # Cost basis
                'actual_cost_per_unit': round(float(actual_cost_per_unit), 2),
                'has_cost_basis': cost_basis is not None,
                'cost_basis_data': cost_basis,

                # Effective prices (after fees)
                'effective_buy_price': round(float(effective_buy_price), 2),
                'effective_sell_price': round(float(effective_sell_price), 2),
                'actual_effective_cost': round(float(actual_effective_cost), 2),
                'min_profitable_sell_price': round(float(min_profitable_sell), 2),

                # Values and profits
                'current_value': round(float(current_value), 2),
                'actual_profit': round(float(actual_value), 2),
                'theoretical_profit_per_unit': round(float(max(0, effective_sell_price - effective_buy_price)), 2),
                'actual_profit_per_unit': round(float(max(0, effective_sell_price - actual_effective_cost)), 2),

                # Market info
                'buy_orders_available': int(price_data.get('buy_orders_count', 0)),
                'sell_orders_available': int(price_data.get('sell_orders_count', 0)),

                # Active orders
                'active_orders': item_orders
            }

            analyzed_items.append(item_analysis)

        # Sort by actual profit (highest first)
        analyzed_items.sort(key=lambda x: x['actual_profit'], reverse=True)

        return {
            'hub_name': hub_name,
            'total_items': len(analyzed_items),
            'total_theoretical_value': round(total_value, 2),
            'total_actual_value': round(total_actual_value, 2),
            'isk_in_orders': round(active_orders_summary['total_isk_in_orders'], 2),
            'broker_fee_rate': round(self.calculate_broker_fee_rate(), 2),
            'sales_tax_rate': round(self.calculate_sales_tax_rate(), 2),
            'items': analyzed_items,
            'active_orders_summary': active_orders_summary,
            'enhanced_analysis': use_enhanced_analysis,
            'last_updated': datetime.now().isoformat()
        }

    async def analyze_all_warehouses(self, use_enhanced_analysis=True):
        """
        Analyze assets across all trade hubs with enhanced precision
        Returns comprehensive warehouse data including cost basis and active orders
        """
        all_warehouse_data = {}

        # Get courier contract data with fail-safe defaults
        try:
            courier_contracts, courier_metrics = await self.get_courier_contracts('corporation')
        except Exception as e:
            print(f"Warning: Could not load courier contracts: {e}")
            courier_metrics = {
                'total_contracts': 0,
                'courier_contracts': 0,
                'outstanding_contracts': 0,
                'in_progress_contracts': 0,
                'total_collateral': 0.0,
                'total_reward': 0.0,
                'error': str(e)
            }

        for hub_name in self.trade_hubs.keys():
            try:
                hub_analysis = await self.analyze_warehouse_hub(hub_name, use_enhanced_analysis)
                all_warehouse_data[hub_name] = hub_analysis
            except Exception as e:
                print(f"Error analyzing {hub_name}: {e}")
                all_warehouse_data[hub_name] = {
                    'hub_name': hub_name,
                    'error': str(e),
                    'total_items': 0,
                    'total_theoretical_value': 0,
                    'total_actual_value': 0,
                    'isk_in_orders': 0,
                    'items': [],
                    'enhanced_analysis': use_enhanced_analysis
                }

        # Calculate totals
        total_theoretical_value = sum(
            data.get('total_theoretical_value', 0) for data in all_warehouse_data.values()
        )

        # Get ACTUAL realized profit from real transactions (not theoretical profit)
        realized_profit_data = self.calculate_actual_realized_profit(days_back=30)
        total_actual_profit = realized_profit_data['total_realized_profit']

        total_isk_in_orders = sum(
            data.get('isk_in_orders', 0) for data in all_warehouse_data.values()
        )
        total_items_all_hubs = sum(
            data.get('total_items', 0) for data in all_warehouse_data.values()
        )

        # Calculate precision metrics
        precision_metrics = self.calculate_precision_metrics(all_warehouse_data)

        return {
            'warehouse_data': all_warehouse_data,
            'courier_contracts': courier_metrics,
            'summary': {
                'total_theoretical_value': round(total_theoretical_value, 2),
                'total_actual_profit': round(total_actual_profit, 2),
                'total_isk_in_orders': round(total_isk_in_orders, 2),
                'total_items_all_hubs': total_items_all_hubs,
                'hubs_analyzed': len(all_warehouse_data),
                'enhanced_analysis': use_enhanced_analysis,
                'precision_metrics': precision_metrics,
                'analysis_timestamp': datetime.now().isoformat()
            },
            'realized_profit_details': realized_profit_data
        }

    def calculate_precision_metrics(self, warehouse_data):
        """
        Calculate metrics showing the difference between theoretical and actual analysis
        """
        total_items_with_cost_basis = 0
        total_items = 0
        total_active_orders = 0

        for hub_data in warehouse_data.values():
            if 'items' in hub_data:
                for item in hub_data['items']:
                    total_items += 1
                    if item.get('has_cost_basis', False):
                        total_items_with_cost_basis += 1

            if 'active_orders_summary' in hub_data:
                orders_summary = hub_data['active_orders_summary']
                total_active_orders += orders_summary.get('buy_orders', 0) + orders_summary.get('sell_orders', 0)

        cost_basis_coverage = (total_items_with_cost_basis / total_items * 100) if total_items > 0 else 0

        return {
            'cost_basis_coverage_percentage': round(cost_basis_coverage, 1),
            'items_with_cost_basis': total_items_with_cost_basis,
            'total_items': total_items,
            'total_active_orders': total_active_orders
        }

# Example usage and testing
if __name__ == "__main__":
    import asyncio

    async def test_warehouse_manager():
        # Initialize warehouse manager
        try:
            from ESI_LocalHost_Access import ESIClient
            esi_client = ESIClient()
            wm = WarehouseManager(esi_client)
        except:
            wm = WarehouseManager()

        print("=== EVE Online Warehouse Manager Test ===")
        print(f"Broker Fee Rate: {wm.calculate_broker_fee_rate():.2f}%")
        print(f"Sales Tax Rate: {wm.calculate_sales_tax_rate():.2f}%")

        # Test price calculations
        test_price = 1000000  # 1M ISK
        effective_buy = wm.calculate_effective_buy_price(test_price)
        effective_sell = wm.calculate_effective_sell_price(test_price)
        min_profitable = wm.calculate_minimum_profitable_sell_price(effective_buy)

        print(f"\nPrice Calculation Test (1M ISK item):")
        print(f"Market Buy Price: {test_price:,.2f} ISK")
        print(f"Effective Buy Price: {effective_buy:,.2f} ISK")
        print(f"Effective Sell Price: {effective_sell:,.2f} ISK")
        print(f"Min Profitable Sell: {min_profitable:,.2f} ISK")

        # If ESI is available, test real data
        if wm.esi_client and wm.esi_client.is_authenticated():
            print(f"\nAnalyzing real warehouse data...")
            warehouse_data = await wm.analyze_all_warehouses()
            print(f"Analysis complete!")
            print(f"Total value across all hubs: {warehouse_data['summary']['total_value_all_hubs']:,.2f} ISK")
            print(f"Total items: {warehouse_data['summary']['total_items_all_hubs']}")
        else:
            print("\nESI not authenticated - skipping real asset analysis")

    # Run test
    asyncio.run(test_warehouse_manager())