# PanagoreTrades - EVE Online Trading Platform

A modern web-based trading analysis platform for EVE Online that helps identify profitable trading opportunities between major trade hubs.

## Features

### 🚀 Live Trading Dashboard
- **Real-time market data** from Jita, Amarr, Rens, and Dodixie
- **Interactive filtering** by trade hubs and profit margins
- **Live profit calculations** with volume analysis
- **Modern responsive UI** with real-time updates

### 💰 Wallet Integration
- **Corporation ISK tracking** (with proper ESI permissions)
- **Personal wallet monitoring**
- **7-day profit history** with interactive charts
- **Automatic data refresh** every 5 minutes

### 📊 Advanced Analytics
- **Profit margin analysis** (20% to 1500% range)
- **Volume-based filtering** (minimum 75 units/day)
- **Multi-hub route optimization**
- **Historical trend analysis**

## Quick Start

1. **Install Dependencies**:
   ```bash
   pip install flask flask-cors pandas requests openpyxl
   ```

2. **Run the Application**:
   ```bash
   python main.py
   # or
   python app.py
   ```

3. **Access the Dashboard**:
   - Open your browser to: `http://localhost:5000`
   - The application will automatically load current market data

## API Endpoints

- `GET /` - Main dashboard
- `GET /api/wallet` - Wallet information (corp + personal)
- `GET /api/trades?hubs=Jita&hubs=Amarr&min_margin=20&max_margin=1500` - Trading opportunities
- `GET /api/profit-history` - 7-day profit history
- `GET /api/hubs` - Available trade hubs

## Configuration

### Trade Hub Settings
Currently supported trade hubs:
- **Jita** (The Forge) - Region ID: 10000002
- **Amarr** (Domain) - Region ID: 10000043
- **Rens** (Heimatar) - Region ID: 10000030
- **Dodixie** (Sinq Laison) - Region ID: 10000032

### Default Filters
- **Minimum Volume**: 75 units/day (both buy and sell hubs)
- **Minimum Profit Margin**: 20%
- **Maximum Profit Margin**: 1500%
- **Minimum Item Price**: 100,000 ISK

## File Structure

```
PanagoreTrades/
├── app.py                  # Main Flask application
├── main.py                 # Entry point
├── ESI_LocalHost_Access.py # EVE ESI API integration
├── TradeHub_API.py         # Market data analysis
├── templates/
│   └── dashboard.html      # Web interface
├── static/
│   └── js/
│       └── dashboard.js    # Frontend JavaScript
├── comprehensive_test.py   # Test suite
└── README.md              # This file
```

## ESI Integration (Optional)

For real wallet data and profit tracking:

1. **Register your application** at https://developers.eveonline.com/
2. **Configure ESI_LocalHost_Access.py** with your client credentials
3. **Authenticate** your character for wallet access
4. **Grant corporate roles** for corporation wallet data (Accountant/Junior Accountant)

## Trading Strategy

The platform identifies opportunities by:
1. **Fetching real-time prices** from all major trade hubs
2. **Calculating profit margins** between buy/sell locations
3. **Filtering by volume** to ensure liquidity
4. **Ranking by profit percentage** for optimal routes

## License

This project is for educational and personal use. Please respect CCP Games' Developer License Agreement when using EVE Online APIs.

---

**Fly safe, trade smart! o7**