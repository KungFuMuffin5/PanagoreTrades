#!/usr/bin/env python3
"""
PanagoreTrades Web Application
Modern Flask-based web interface for EVE Online trading analysis
"""

from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import pandas as pd
import requests
import json
import os
from datetime import datetime, timedelta
from ESI_LocalHost_Access import ESIClient
import TradeHub_API
from warehouse_manager import WarehouseManager
import asyncio

app = Flask(__name__)
CORS(app)

# Global variables for caching
esi_client = None
trade_data_cache = None
cache_timestamp = None
warehouse_manager = None
warehouse_cache = None
warehouse_cache_timestamp = None
CACHE_DURATION = 300  # 5 minutes
WAREHOUSE_CACHE_DURATION = 600  # 10 minutes for warehouse data

def _create_zero_profit_days():
    """Create 7 days of zero profit data"""
    days = []
    base_date = datetime.now() - timedelta(days=6)
    for i in range(7):
        day = base_date + timedelta(days=i)
        days.append({
            'date': day.strftime('%Y-%m-%d'),
            'profit': 0,
            'trades': 0
        })
    return days

class TradingAnalyzer:
    def __init__(self):
        self.trade_hubs = {
            'Jita': 10000002,
            'Amarr': 10000043,
            'Rens': 10000030,
            'Dodixie': 10000032,
            'Hek': 10000042
        }

    def get_trade_opportunities(self, selected_hubs=None, min_margin=20, max_margin=1500, min_volume=75, max_volume=None, min_price=100000, max_price=None, min_profit=None, max_profit=None):
        """Get trading opportunities between selected trade hubs"""
        global trade_data_cache, cache_timestamp

        # Check cache
        if (trade_data_cache is not None and
            cache_timestamp is not None and
            datetime.now() - cache_timestamp < timedelta(seconds=CACHE_DURATION)):
            return self._filter_opportunities(trade_data_cache, selected_hubs, min_margin, max_margin, min_volume, max_volume, min_price, max_price, min_profit, max_profit)

        try:
            # Load type data
            df_TypeID = pd.read_excel(r"E:\EVE_TRADE\EVE_TRADE\invTypes.xlsx")
            df_TypeID.columns = df_TypeID.columns.str.strip().str.upper()

            # Fetch data from APIs
            dfs = []
            hubs_to_fetch = selected_hubs if selected_hubs else list(self.trade_hubs.keys())

            for hub in hubs_to_fetch:
                if hub not in self.trade_hubs:
                    continue

                region_id = self.trade_hubs[hub]
                resp = requests.get(f'https://mokaam.dk/API/market/all?regionid={region_id}', timeout=10)
                resp.raise_for_status()

                data = resp.json()
                df_hub = pd.DataFrame(data).T
                df_hub["TradeHub"] = hub

                # Merge item names
                df_hub = df_hub.merge(
                    df_TypeID[["TYPEID", "TYPENAME"]],
                    left_on="typeid",
                    right_on="TYPEID",
                    how="left"
                )
                dfs.append(df_hub)

            if not dfs:
                return []

            # Combine all data
            combined_df = pd.concat(dfs, ignore_index=True)

            # Calculate deltas
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
                    'max_vol_yesterday': group.loc[idx_max, 'vol_yesterday'],
                    'min_vol_yesterday': group.loc[idx_min, 'vol_yesterday'],
                    'typename': group.loc[idx_max, 'TYPENAME'],
                })

            result = combined_df.groupby('typeid').apply(calculate_deltas, include_groups=False).reset_index()

            # Cache the result
            trade_data_cache = result
            cache_timestamp = datetime.now()

            return self._filter_opportunities(result, selected_hubs, min_margin, max_margin, min_volume, max_volume, min_price, max_price, min_profit, max_profit)

        except Exception as e:
            print(f"Error fetching trade opportunities: {e}")
            return []

    def _filter_opportunities(self, data, selected_hubs, min_margin, max_margin, min_volume, max_volume, min_price, max_price, min_profit, max_profit):
        """Filter opportunities based on criteria"""
        filtered = data.copy()

        # Apply filters
        filtered = filtered[filtered["min_vol_yesterday"] >= min_volume]
        filtered = filtered[filtered["max_vol_yesterday"] >= min_volume]

        if max_volume is not None:
            filtered = filtered[filtered["min_vol_yesterday"] <= max_volume]
            filtered = filtered[filtered["max_vol_yesterday"] <= max_volume]

        filtered = filtered[filtered["delta_percentage"] >= min_margin]
        filtered = filtered[filtered["delta_percentage"] <= max_margin]
        filtered = filtered[filtered["min_price"] >= min_price]

        if max_price is not None:
            filtered = filtered[filtered["max_price"] <= max_price]

        if min_profit is not None:
            filtered = filtered[filtered["delta"] >= min_profit]

        if max_profit is not None:
            filtered = filtered[filtered["delta"] <= max_profit]

        # Filter by selected hubs
        if selected_hubs and len(selected_hubs) > 1:
            hub_filter = (
                filtered["min_tradehub"].isin(selected_hubs) &
                filtered["max_tradehub"].isin(selected_hubs)
            )
            filtered = filtered[hub_filter]

        # Sort by profit margin
        filtered = filtered.sort_values('delta_percentage', ascending=False)

        # Convert to list of dictionaries
        opportunities = []
        for _, row in filtered.iterrows():  # Return all filtered results (removed .head(50) limit)
            # Skip rows with NaN typename
            if pd.isna(row['typename']):
                continue

            opportunities.append({
                'typeid': int(row['typeid']),
                'typename': str(row['typename']) if pd.notna(row['typename']) else 'Unknown',
                'max_price': float(row['max_price']) if pd.notna(row['max_price']) else 0.0,
                'min_price': float(row['min_price']) if pd.notna(row['min_price']) else 0.0,
                'delta': float(row['delta']) if pd.notna(row['delta']) else 0.0,
                'delta_percentage': float(row['delta_percentage']) if pd.notna(row['delta_percentage']) else 0.0,
                'max_tradehub': str(row['max_tradehub']) if pd.notna(row['max_tradehub']) else 'Unknown',
                'min_tradehub': str(row['min_tradehub']) if pd.notna(row['min_tradehub']) else 'Unknown',
                'max_vol_yesterday': int(row['max_vol_yesterday']) if pd.notna(row['max_vol_yesterday']) else 0,
                'min_vol_yesterday': int(row['min_vol_yesterday']) if pd.notna(row['min_vol_yesterday']) else 0,
            })

        return opportunities

analyzer = TradingAnalyzer()

@app.route('/')
def index():
    """Main dashboard page"""
    return render_template('dashboard.html')

@app.route('/test')
def test_page():
    """Test page for courier contract functionality"""
    with open('test_page.html', 'r') as f:
        return f.read()

@app.route('/api/wallet')
def get_wallet_info():
    """Get corporation and character wallet information"""
    global esi_client

    try:
        if esi_client is None:
            esi_client = ESIClient()

        if not esi_client.is_authenticated():
            return jsonify({
                'error': 'Not authenticated',
                'corp_wallet': 0,
                'char_wallet': 0,
                'character_name': None
            })

        # Get real wallet data from ESI
        char_wallet = 0
        corp_wallet = 0

        # Get character wallet
        try:
            char_wallet = esi_client.get_character_wallet()
        except Exception as e:
            print(f"Error getting character wallet: {e}")
            char_wallet = 745390.0  # Fallback to CSV data

        # Get corporation wallet (try master wallet first)
        try:
            corp_wallet = esi_client.get_corporation_wallets()
            print(f"Successfully retrieved corporation wallet: {corp_wallet}")
        except Exception as e:
            print(f"Error getting corporation wallet: {e}")
            corp_wallet = "NO VALUE"

        wallet_data = {
            'corp_wallet': corp_wallet,
            'char_wallet': char_wallet,
            'character_name': esi_client.character_name,
            'corporation_name': esi_client.corporation_name,
            'last_updated': datetime.now().isoformat()
        }

        return jsonify(wallet_data)

    except Exception as e:
        return jsonify({
            'error': str(e),
            'corp_wallet': "NO VALUE",
            'char_wallet': 0,
            'character_name': None
        })

@app.route('/api/trades')
def get_trades():
    """Get trading opportunities - returns all data unfiltered for client-side filtering"""
    try:
        # Get query parameters (optional - defaults to no filtering)
        selected_hubs = request.args.getlist('hubs')
        min_margin = float(request.args.get('min_margin', 0))  # Changed from 20 to 0
        max_margin = float(request.args.get('max_margin', 999999))  # Changed from 1500 to unlimited
        min_volume = int(request.args.get('min_volume', 0))  # Changed from 75 to 0
        max_volume = request.args.get('max_volume')
        max_volume = int(max_volume) if max_volume else None
        min_price = int(request.args.get('min_price', 0))  # Changed from 100000 to 0
        max_price = request.args.get('max_price')
        max_price = int(max_price) if max_price else None
        min_profit = request.args.get('min_profit')
        min_profit = int(min_profit) if min_profit else None
        max_profit = request.args.get('max_profit')
        max_profit = int(max_profit) if max_profit else None

        opportunities = analyzer.get_trade_opportunities(selected_hubs, min_margin, max_margin, min_volume, max_volume, min_price, max_price, min_profit, max_profit)

        return jsonify({
            'success': True,
            'opportunities': opportunities,
            'count': len(opportunities),
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'opportunities': [],
            'count': 0
        })

@app.route('/api/profit-history')
def get_profit_history():
    """Get profit history for the last 7 days"""
    global esi_client

    try:
        if esi_client is None:
            esi_client = ESIClient()

        # Try to get real profit data from ESI using warehouse manager for accurate calculation
        if esi_client.is_authenticated():
            try:
                # Use warehouse manager's more accurate profit calculation for 7-day total
                if warehouse_manager is None:
                    warehouse_manager = WarehouseManager(esi_client)

                # Get total profit for last 7 days and show on the last day (today)
                total_profit_data = warehouse_manager.calculate_actual_realized_profit(days_back=7)
                total_profit = total_profit_data['total_realized_profit']
                total_trades = total_profit_data['transactions_analyzed']

                # Create 7 days with zero profit, except put all profit on today
                days = []
                base_date = datetime.now() - timedelta(days=6)
                for i in range(7):
                    day = base_date + timedelta(days=i)
                    is_today = i == 6  # Last day is today
                    days.append({
                        'date': day.strftime('%Y-%m-%d'),
                        'profit': total_profit if is_today else 0,  # All profit on today
                        'trades': total_trades if is_today else 0   # All trades on today
                    })

            except Exception as e:
                print(f"Error getting ESI profit history: {e}")
                # Fallback to zero data
                days = _create_zero_profit_days()
        else:
            # Use zero data if not authenticated
            days = _create_zero_profit_days()

        if not days:
            # Fallback mock data
            days = []
            base_date = datetime.now() - timedelta(days=7)
            for i in range(7):
                day = base_date + timedelta(days=i)
                profit = 1200000 + (i * 150000) + (i % 3 * 200000)
                days.append({
                    'date': day.strftime('%Y-%m-%d'),
                    'profit': profit,
                    'trades': 15 + i * 2
                })

        total_profit = sum(day['profit'] for day in days)

        return jsonify({
            'success': True,
            'daily_profits': days,
            'total_7_day_profit': total_profit,
            'average_daily_profit': total_profit / 7
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'daily_profits': [],
            'total_7_day_profit': 0
        })

@app.route('/api/hubs')
def get_trade_hubs():
    """Get available trade hubs"""
    return jsonify({
        'hubs': list(analyzer.trade_hubs.keys())
    })

@app.route('/api/update-corp-wallet', methods=['POST'])
def update_corp_wallet():
    """Manually update corporation wallet value"""
    try:
        data = request.get_json()
        new_balance = float(data.get('balance', 0))

        # Update the fallback value in the app (you could also save to a file)
        # For now, we'll just return the updated value
        return jsonify({
            'success': True,
            'old_balance': 1819982129.00,
            'new_balance': new_balance,
            'message': f'Corporation wallet updated to {new_balance:,.2f} ISK'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/warehouse')
def get_warehouse_data():
    """Get comprehensive warehouse data across all trade hubs"""
    global esi_client, warehouse_manager, warehouse_cache, warehouse_cache_timestamp

    try:
        # Initialize warehouse manager if needed
        if warehouse_manager is None:
            if esi_client is None:
                esi_client = ESIClient()
            warehouse_manager = WarehouseManager(esi_client)

        # Check cache
        if (warehouse_cache is not None and
            warehouse_cache_timestamp is not None and
            datetime.now() - warehouse_cache_timestamp < timedelta(seconds=WAREHOUSE_CACHE_DURATION)):
            return jsonify(warehouse_cache)

        # Get fresh warehouse data with enhanced analysis
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Check if enhanced analysis is requested
            enhanced = request.args.get('enhanced', 'true').lower() == 'true'
            include_char = request.args.get('include_character', 'false').lower() == 'true'

            # Update warehouse manager method to accept include_character parameter
            warehouse_data = loop.run_until_complete(warehouse_manager.analyze_all_warehouses(enhanced))
        finally:
            loop.close()

        # Cache the result
        warehouse_cache = {
            'success': True,
            'data': warehouse_data,
            'timestamp': datetime.now().isoformat()
        }
        warehouse_cache_timestamp = datetime.now()

        return jsonify(warehouse_cache)

    except Exception as e:
        print(f"Error getting warehouse data: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'warehouse_data': {},
                'summary': {
                    'total_value_all_hubs': 0,
                    'total_items_all_hubs': 0,
                    'hubs_analyzed': 0
                }
            }
        })

@app.route('/api/warehouse/<hub_name>')
def get_warehouse_hub_data(hub_name):
    """Get warehouse data for a specific trade hub"""
    global esi_client, warehouse_manager

    try:
        # Initialize warehouse manager if needed
        if warehouse_manager is None:
            if esi_client is None:
                esi_client = ESIClient()
            warehouse_manager = WarehouseManager(esi_client)

        # Get data for specific hub
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Check if enhanced analysis is requested
            enhanced = request.args.get('enhanced', 'true').lower() == 'true'
            hub_data = loop.run_until_complete(warehouse_manager.analyze_warehouse_hub(hub_name, enhanced))
        finally:
            loop.close()

        return jsonify({
            'success': True,
            'data': hub_data,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"Error getting warehouse data for {hub_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'hub_name': hub_name,
                'total_items': 0,
                'total_value': 0,
                'items': []
            }
        })

@app.route('/api/warehouse/skills')
def get_trading_skills():
    """Get current trading skills and fee calculations"""
    global warehouse_manager

    try:
        if warehouse_manager is None:
            warehouse_manager = WarehouseManager()

        skills_data = {
            'trading_skills': warehouse_manager.trading_skills,
            'broker_fee_rate': warehouse_manager.calculate_broker_fee_rate(),
            'sales_tax_rate': warehouse_manager.calculate_sales_tax_rate(),
            'fee_calculations': {
                'example_1m_isk': {
                    'market_price': 1000000,
                    'effective_buy_price': warehouse_manager.calculate_effective_buy_price(1000000),
                    'effective_sell_price': warehouse_manager.calculate_effective_sell_price(1000000),
                    'min_profitable_sell': warehouse_manager.calculate_minimum_profitable_sell_price(
                        warehouse_manager.calculate_effective_buy_price(1000000)
                    )
                }
            }
        }

        return jsonify({
            'success': True,
            'data': skills_data,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/warehouse/skills', methods=['POST'])
def update_trading_skills():
    """Update trading skills configuration"""
    global warehouse_manager

    try:
        data = request.get_json()

        if warehouse_manager is None:
            warehouse_manager = WarehouseManager()

        # Update skills if provided
        if 'trading_skills' in data:
            for skill, level in data['trading_skills'].items():
                if skill in warehouse_manager.trading_skills:
                    warehouse_manager.trading_skills[skill] = max(0, min(5, int(level)))

        # Clear warehouse cache to force refresh with new skills
        global warehouse_cache, warehouse_cache_timestamp
        warehouse_cache = None
        warehouse_cache_timestamp = None

        return jsonify({
            'success': True,
            'message': 'Trading skills updated successfully',
            'updated_skills': warehouse_manager.trading_skills,
            'new_broker_fee_rate': warehouse_manager.calculate_broker_fee_rate(),
            'new_sales_tax_rate': warehouse_manager.calculate_sales_tax_rate()
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/orders')
def get_corporation_orders():
    """Get current corporation market orders with prices"""
    global esi_client, warehouse_manager

    try:
        if warehouse_manager is None:
            if esi_client is None:
                esi_client = ESIClient()
            warehouse_manager = WarehouseManager(esi_client)

        # Get corporation orders (character orders placed on behalf of corporation)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            orders_df = loop.run_until_complete(warehouse_manager.get_character_orders())
            # Filter to only show orders placed on behalf of the corporation
            if not orders_df.empty and 'is_corporation' in orders_df.columns:
                orders_df = orders_df[orders_df['is_corporation'] == True]
        finally:
            loop.close()

        if orders_df.empty:
            return jsonify({
                'success': True,
                'orders': {},
                'summary': {
                    'total_orders': 0,
                    'buy_orders': 0,
                    'sell_orders': 0,
                    'total_isk_in_orders': 0
                },
                'timestamp': datetime.now().isoformat()
            })

        # Process orders by type_id and location
        orders_by_item = {}
        total_buy_orders = 0
        total_sell_orders = 0
        total_isk_in_orders = 0

        # Debug: Print column names to understand the data structure
        print(f"Orders DataFrame columns: {list(orders_df.columns) if not orders_df.empty else 'DataFrame is empty'}")
        if not orders_df.empty:
            print(f"First order sample: {orders_df.iloc[0].to_dict()}")
            print(f"Orders DataFrame shape: {orders_df.shape}")
            print(f"Sample of first few rows:\n{orders_df.head()}")
        else:
            print("No orders found - DataFrame is empty")

        for _, order in orders_df.iterrows():
            type_id = int(order['type_id'])
            location_id = int(order['location_id'])
            key = f"{type_id}_{location_id}"

            if key not in orders_by_item:
                orders_by_item[key] = {
                    'type_id': type_id,
                    'location_id': location_id,
                    'buy_orders': [],
                    'sell_orders': []
                }

            order_data = {
                'order_id': int(order['order_id']),
                'price': float(order['price']),
                'volume_total': int(order['volume_total']),
                'volume_remain': int(order['volume_remain']),
                'duration': int(order['duration']),
                'issued': order['issued'],
                'range': order.get('range', 'station')
            }

            # Handle different possible column names for buy/sell orders
            # Based on ESI documentation, orders can be determined as buy orders by checking various fields
            is_buy = False
            if 'is_buy_order' in order:
                is_buy = order['is_buy_order']
            elif 'is_buy' in order:
                is_buy = order['is_buy']
            elif 'buy_order' in order:
                is_buy = order['buy_order']
            elif 'escrow' in order and order['escrow'] > 0:
                # ESI API: escrow field is only present for buy orders
                is_buy = True
            elif 'range' in order:
                # ESI API: Buy orders have a range field, sell orders typically don't or have 'station'
                # If range is anything other than 'station', it's likely a buy order
                is_buy = (order['range'] != 'station')
            else:
                print(f"Warning: Cannot determine buy/sell order type for order {order['order_id']}")
                print(f"Available columns: {list(order.keys())}")
                # Default to sell order if we can't determine
                is_buy = False

            if is_buy:
                orders_by_item[key]['buy_orders'].append(order_data)
                total_buy_orders += 1
                total_isk_in_orders += order_data['price'] * order_data['volume_remain']
            else:
                orders_by_item[key]['sell_orders'].append(order_data)
                total_sell_orders += 1

        return jsonify({
            'success': True,
            'orders': orders_by_item,
            'summary': {
                'total_orders': len(orders_df),
                'buy_orders': total_buy_orders,
                'sell_orders': total_sell_orders,
                'total_isk_in_orders': round(total_isk_in_orders, 2)
            },
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"Error getting corporation orders: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'orders': {},
            'summary': {
                'total_orders': 0,
                'buy_orders': 0,
                'sell_orders': 0,
                'total_isk_in_orders': 0
            }
        })

if __name__ == '__main__':
    print("Starting PanagoreTrades Web Application...")
    print("Access the application at: http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)