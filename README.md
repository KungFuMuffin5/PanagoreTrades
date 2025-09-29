# PanagoreTrades - EVE Online Trading & Warehouse Management Platform

A comprehensive web-based trading analysis and warehouse management platform for EVE Online that helps identify profitable trading opportunities, track inventory across trade hubs, and manage corporation assets with precise cost basis calculations.

## 🌟 Core Features

### 🚀 Live Trading Dashboard
- **Real-time market data** from all major trade hubs (Jita, Amarr, Rens, Dodixie, Hek)
- **Interactive filtering** by trade hubs, profit margins, and volume
- **Live profit calculations** with comprehensive market analysis
- **Modern zkillboard-inspired dark UI** with responsive design
- **Copyable text fields** - no annoying tooltips blocking text selection
- **Customizable profit margin slider** (0% to 100% range)

### 🏭 Advanced Warehouse Management
- **Corporation asset tracking** across all trade hubs
- **Real-time cost basis calculations** using corporation wallet transactions
- **Asset source control** - toggle between corporation-only or combined corp+character assets
- **Enhanced precision analysis** with actual vs theoretical profit calculations
- **Active market orders integration** showing ISK commitments
- **Profit margin analysis** with EVE Online trading fees (broker fees, sales tax)
- **Location-based filtering** - analyze specific trade hubs individually

### 💰 Comprehensive Wallet Integration
- **Corporation ISK tracking** with proper ESI permissions
- **Corporation wallet transactions** for accurate cost basis
- **Personal wallet monitoring** with transaction history
- **7-day profit history** with interactive charts
- **Automatic token refresh** with persistent authentication
- **Multi-division wallet support** for corporations

### 📊 Advanced Analytics & Calculations
- **Actual cost basis tracking** - know exactly what you paid for each item
- **Weighted average cost calculations** from your transaction history
- **Market depth analysis** for realistic pricing
- **Enhanced profit calculations**:
  - Theoretical profit (market-based)
  - Actual profit (based on your purchase prices)
  - Effective pricing with skill-adjusted fees
- **Trading skill integration** (Broker Relations, Accounting, etc.)
- **Fee calculations** with current EVE Online rates:
  - Broker Fee: 2.5% (with max Broker Relations V)
  - Sales Tax: 4.5% (with max Accounting V)

### 🎯 Precision Trading Features
- **Cost basis vs market price comparison**
- **Minimum profitable sell price calculations**
- **Spread percentage analysis**
- **Volume-based liquidity filtering**
- **Purchase history tracking** (first/last purchase dates, transaction count)
- **Multi-location analysis** for optimal positioning

## 📋 API Endpoints

### Core Trading
- `GET /` - Main trading dashboard
- `GET /api/trades` - Trading opportunities with comprehensive filtering
- `GET /api/hubs` - Available trade hubs and regions

### Warehouse Management
- `GET /api/warehouse` - Complete warehouse analysis across all hubs
- `GET /api/warehouse/<hub_name>` - Detailed analysis for specific trade hub
- `GET /api/warehouse/skills` - Current trading skill configuration
- `POST /api/warehouse/skills` - Update trading skill levels

### Wallet & Authentication
- `GET /api/wallet` - Corporation and personal wallet data
- `GET /api/profit-history` - Historical profit tracking

### Query Parameters
- `enhanced=true/false` - Enable/disable enhanced analysis with cost basis
- `include_character=true/false` - Include character assets with corporation assets
- `hubs=Jita&hubs=Amarr` - Filter by specific trade hubs
- `min_margin=20&max_margin=1500` - Profit margin filtering
- `min_volume=75&max_volume=1000` - Volume-based filtering

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install flask flask-cors pandas requests openpyxl
```

### 2. Configure ESI Access
1. **Register your application** at https://developers.eveonline.com/
2. **Update ESI credentials** in `ESI_LocalHost_Access.py`:
   ```python
   CLIENT_ID = "your_client_id"
   CLIENT_SECRET = "your_client_secret"
   ```
3. **Required ESI scopes** (automatically configured):
   - `esi-markets.read_corporation_orders.v1`
   - `esi-wallet.read_corporation_wallet.v1`
   - `esi-assets.read_corporation_assets.v1`
   - `esi-wallet.read_character_wallet.v1`
   - And more for comprehensive access

### 3. Run the Application
```bash
python app.py
```

### 4. Authenticate & Access
1. **Open browser**: `http://localhost:5000`
2. **Complete ESI authentication** when prompted
3. **Grant corporation roles** for full warehouse management:
   - Accountant or Junior Accountant (for wallet transactions)
   - Hangar Access (for corporation assets)

## 🏗️ Architecture

### File Structure
```
PanagoreTrades/
├── app.py                     # Main Flask application with warehouse APIs
├── warehouse_manager.py       # Advanced warehouse analysis engine
├── ESI_LocalHost_Access.py    # EVE ESI API integration with auto-refresh
├── TradeHub_API.py           # Market data analysis and report generation
├── templates/
│   └── dashboard.html        # Modern web interface with warehouse management
├── static/
│   ├── css/                 # zkillboard-inspired dark theme
│   └── js/
│       └── dashboard.js     # Interactive frontend with warehouse controls
├── esi_tokens.json          # Persistent authentication (auto-generated)
└── README.md               # This comprehensive guide
```

### Core Components

#### WarehouseManager Class
- **Asset Management**: Corporation and character asset tracking
- **Cost Basis Engine**: Weighted average cost calculations from transaction history
- **Market Analysis**: Real-time pricing with depth analysis
- **Profit Calculations**: Actual vs theoretical profit with fee adjustments
- **Trading Skills**: Skill-based fee calculations for accurate projections

#### ESI Integration
- **Auto-refreshing tokens** with persistent storage
- **Comprehensive scopes** for full corporation access
- **Error handling** with fallback mechanisms
- **Rate limiting** compliance with ESI guidelines

## 🎮 Trading Hub Coverage

### Supported Trade Hubs
| Hub | Region | Region ID | Primary Use |
|-----|---------|-----------|-------------|
| **Jita** | The Forge | 10000002 | Primary trading hub - highest volume |
| **Amarr** | Domain | 10000043 | Secondary hub - Amarr space |
| **Rens** | Heimatar | 10000030 | Minmatar regional hub |
| **Dodixie** | Sinq Laison | 10000032 | Gallente regional hub |
| **Hek** | Metropolis | 10000042 | Secondary Minmatar hub |

### Station IDs (for precise asset tracking)
- Jita IV - Moon 4 - Caldari Navy Assembly Plant: 60003760
- Amarr VIII (Oris) - Emperor Family Academy: 60008494
- Rens VI - Moon 8 - Brutor Tribe Treasury: 60004588
- Dodixie IX - Moon 20 - Federation Navy Assembly Plant: 60011866
- Hek VIII - Moon 12 - Boundless Creation Factory: 60005686

## 📈 Default Configuration

### Trading Filters
- **Minimum Volume**: 75 units/day (ensures liquidity)
- **Minimum Profit Margin**: 20% (profitable opportunities)
- **Maximum Profit Margin**: 1500% (removes outliers)
- **Minimum Item Price**: 100,000 ISK (meaningful trades)

### Skill Defaults (Configurable)
- **Broker Relations**: Level V (2.5% broker fees)
- **Accounting**: Level V (4.5% sales tax)
- **Margin Trading**: Level IV (partial ISK requirements)
- **Marketing/Procurement**: Level IV (additional order slots)

### Caching
- **Trading Opportunities**: 5 minutes
- **Warehouse Data**: 10 minutes
- **Market Prices**: Real-time with ESI rate limiting
- **Transaction History**: 30 days default

## 🛠️ Advanced Usage

### Corporation Setup
1. **Join a player corporation** with appropriate roles
2. **Request wallet access** (Junior Accountant minimum)
3. **Request hangar access** for asset management
4. **Configure asset source** in warehouse interface

### Cost Basis Accuracy
The system calculates cost basis using:
- **Weighted average** of all purchase transactions
- **Location-specific** calculations for precise tracking
- **Time-based filtering** (configurable days back)
- **Transaction validation** to ensure data integrity

### Profit Analysis
- **Theoretical Profit**: Based on current market prices
- **Actual Profit**: Based on your actual purchase prices
- **Effective Pricing**: Includes all trading fees and taxes
- **Minimum Profitable Price**: Break-even calculations with desired margin

## 🔒 Security & Privacy

- **Local token storage** in `esi_tokens.json`
- **Automatic token refresh** prevents expired sessions
- **Secure ESI integration** following CCP's best practices
- **No external data transmission** - all processing local
- **Respect for EVE's EULA** and ESI terms of service

## 🎯 Trading Strategy Integration

### Opportunity Analysis
1. **Real-time market scanning** across all trade hubs
2. **Profit margin calculations** with actual fees
3. **Volume verification** for sustainable trading
4. **Route optimization** for maximum efficiency

### Risk Management
- **Market depth analysis** prevents thin markets
- **Historical cost tracking** for informed decisions
- **Spread analysis** for realistic expectations
- **Active order monitoring** for ISK management

## 📊 Reporting & Analytics

### Generated Reports
- **TradeHub_Report_[timestamp].xlsx** with multiple sheets:
  - Trading Opportunities (main analysis)
  - Summary Statistics (overview)
  - Filter Criteria (configuration used)

### Warehouse Analytics
- **Cost basis coverage** percentage
- **Asset distribution** across trade hubs
- **Profit potential** analysis
- **Transaction history** insights

## 🤝 Contributing

This is a personal trading tool, but contributions for:
- Additional trade hub coverage
- Enhanced analytics features
- UI/UX improvements
- Performance optimizations

Are welcome through pull requests.

## ⚖️ Legal & Compliance

- **Educational and personal use only**
- **Respects CCP Games' Developer License Agreement**
- **Complies with ESI rate limits and guidelines**
- **No automation of in-game actions**
- **Data remains local and private**

## 🆘 Troubleshooting

### Common Issues
- **Authentication failed**: Check ESI credentials and scopes
- **No corporation data**: Verify corporate roles and permissions
- **Market data missing**: Check internet connection and API status
- **Cost basis not calculating**: Ensure corporation wallet access

### ESI Permission Requirements
- Corporation members need specific roles for full functionality
- NPC corporations (starter corps) don't provide required access
- Player corporations must grant appropriate permissions

---

**Fly safe, trade smart, and maximize those profits! o7**

*"In space, no one can hear you trade."*