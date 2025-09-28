#!/usr/bin/env python3
"""
PanagoreTrades Main Entry Point
Launches the web application for EVE Online trading analysis
"""

if __name__ == "__main__":
    print("PanagoreTrades - EVE Online Trading Platform")
    print("=" * 50)
    print("Starting web application...")
    print("Access at: http://localhost:5000")
    print("=" * 50)

    # Import and run the Flask app
    from app import app
    app.run(debug=True, host='0.0.0.0', port=5000)