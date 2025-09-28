import pandas as pd
import requests
import os

# Load the type ID DataFrame
df_TypeID = pd.read_excel(r"E:\EVE_TRADE\EVE_TRADE\invTypes.xlsx")

# Normalize column names in df_TypeID (strip spaces, unify case)
df_TypeID.columns = df_TypeID.columns.str.strip()
# For example, convert to uppercase so you know columns like TYPEID / TYPENAME exist
df_TypeID.columns = df_TypeID.columns.str.upper()

print("df_TypeID columns:", df_TypeID.columns.tolist())

# Check that required columns exist
if "TYPEID" not in df_TypeID.columns or "TYPENAME" not in df_TypeID.columns:
    raise KeyError("df_TypeID must contain columns 'TYPEID' and 'TYPENAME' (after normalization).")

# Fetch data from the APIs and create individual DataFrames
trade_hubs = ['Jita', 'Amarr', 'Rens', 'Dodixie', 'Hek']
region_ids = [10000002, 10000043, 10000030, 10000032, 10000042]
dfs = []

for hub, region_id in zip(trade_hubs, region_ids):
    resp = requests.get(f'https://mokaam.dk/API/market/all?regionid={region_id}')
    resp.raise_for_status()  # will raise if HTTP error
    data = resp.json()
    df_hub = pd.DataFrame(data).T  # transpose
    df_hub["TradeHub"] = hub

    # It’s good to inspect the columns in df_hub
    print(f"Columns for hub {hub}:", df_hub.columns.tolist())

    # Before merging, ensure df_hub has column “typeid” (case-sensitive)
    if "typeid" not in df_hub.columns:
        raise KeyError(f"df_hub for {hub} has no column named 'typeid'; columns: {df_hub.columns.tolist()}")

    # Merge item names
    # Note: Use df_TypeID[["TYPEID", "TYPENAME"]] because we normalized columns above
    df_hub = df_hub.merge(
        df_TypeID[["TYPEID", "TYPENAME"]],
        left_on="typeid",
        right_on="TYPEID",
        how="left"
    )

    dfs.append(df_hub)

# Combine all trade hub DataFrames into one
combined_df = pd.concat(dfs, ignore_index=True)

# Now define function to compute deltas
def calculate_deltas(group):
    max_price = group['avg_price_yesterday'].max()
    min_price = group['avg_price_yesterday'].min()
    delta = max_price - min_price
    delta_percentage = (delta / min_price) * 100 if min_price != 0 else 0
    delta_percentage = round(delta_percentage, 2)
    delta = round(delta, 2)

    idx_max = group['avg_price_yesterday'].idxmax()
    idx_min = group['avg_price_yesterday'].idxmin()

    max_tradehub = group.loc[idx_max, 'TradeHub']
    min_tradehub = group.loc[idx_min, 'TradeHub']
    max_vol_yesterday = group.loc[idx_max, 'vol_yesterday']
    min_vol_yesterday = group.loc[idx_min, 'vol_yesterday']
    
    return pd.Series({
        'max_price': max_price,
        'min_price': min_price,
        'delta': delta,
        'delta_percentage': delta_percentage,
        'max_tradehub': max_tradehub,
        'min_tradehub': min_tradehub,
        'max_vol_yesterday': max_vol_yesterday,
        'min_vol_yesterday': min_vol_yesterday,
    })

# Group by typeid (or relevant identifier) and apply function
# Ensure combined_df has typeid
if "typeid" not in combined_df.columns:
    raise KeyError(f"combined_df has no column 'typeid'; columns: {combined_df.columns.tolist()}")

result = combined_df.groupby('typeid').apply(calculate_deltas, include_groups=False).reset_index()

# Merge TYPENAME and TYPEID back in
RegionTrade = result.merge(
    df_TypeID[["TYPEID", "TYPENAME"]],
    left_on="typeid",
    right_on="TYPEID",
    how="left"
)

# Drop rows without a TYPENAME
RegionTrade = RegionTrade.dropna(subset=['TYPENAME'])

# Reorder columns
columns = [
    'typeid', 'TYPENAME',
    'max_price', 'min_price', 'delta', 'delta_percentage',
    'max_tradehub', 'min_tradehub',
    'max_vol_yesterday', 'min_vol_yesterday'
]
RegionTrade = RegionTrade[columns]

# Filtering thresholds
Vol_DAY_min = 75
Vol_DAY_max = 75
DeltaPercentage_min = 20
DeltaPercentage_max = 1500
MinPrice_Item = 100000

RegionTrade = RegionTrade[RegionTrade["min_vol_yesterday"] > Vol_DAY_min]
RegionTrade = RegionTrade[RegionTrade["max_vol_yesterday"] > Vol_DAY_max]
RegionTrade = RegionTrade[RegionTrade["delta_percentage"] > DeltaPercentage_min]
RegionTrade = RegionTrade[RegionTrade["delta_percentage"] < DeltaPercentage_max]
RegionTrade = RegionTrade[RegionTrade["min_price"] > MinPrice_Item]

# Sort by delta percentage (highest profit margins first)
RegionTrade = RegionTrade.sort_values('delta_percentage', ascending=False)

# Create summary statistics
summary_stats = {
    'Total_Opportunities': len(RegionTrade),
    'Avg_Delta_Percentage': RegionTrade['delta_percentage'].mean(),
    'Max_Delta_Percentage': RegionTrade['delta_percentage'].max(),
    'Min_Delta_Percentage': RegionTrade['delta_percentage'].min(),
    'Avg_Min_Price': RegionTrade['min_price'].mean(),
    'Avg_Max_Price': RegionTrade['max_price'].mean(),
    'Total_Potential_Profit': RegionTrade['delta'].sum()
}

# Format the summary as a DataFrame for easy viewing
summary_df = pd.DataFrame([summary_stats])

# Create Excel report with multiple sheets
from datetime import datetime
import glob
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
filename = f"TradeHub_Report_{timestamp}.xlsx"

# Clean up old reports - keep only the latest one
def cleanup_old_reports():
    """Remove old TradeHub_Report files, keep only the latest"""
    report_files = glob.glob("TradeHub_Report_*.xlsx")
    if len(report_files) > 1:
        # Sort files by timestamp in filename (newest first)
        report_files.sort(reverse=True)
        # Remove all but the newest
        for old_file in report_files[1:]:
            try:
                os.remove(old_file)
                print(f"Removed old report: {old_file}")
            except Exception as e:
                print(f"Could not remove {old_file}: {e}")

cleanup_old_reports()

with pd.ExcelWriter(filename, engine='openpyxl') as writer:
    # Main trading opportunities sheet
    RegionTrade.to_excel(writer, sheet_name='Trading_Opportunities', index=False)

    # Summary statistics sheet
    summary_df.to_excel(writer, sheet_name='Summary_Statistics', index=False)

    # Filter criteria sheet
    filter_criteria = pd.DataFrame([{
        'Min_Volume_Yesterday': Vol_DAY_min,
        'Max_Volume_Yesterday': Vol_DAY_max,
        'Min_Delta_Percentage': DeltaPercentage_min,
        'Max_Delta_Percentage': DeltaPercentage_max,
        'Min_Price_Item': MinPrice_Item,
        'Report_Generated': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }])
    filter_criteria.to_excel(writer, sheet_name='Filter_Criteria', index=False)

print(f"\n=== TRADEHUB ANALYSIS REPORT ===")
print(f"Report generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Total trading opportunities found: {len(RegionTrade)}")
print(f"Average profit margin: {RegionTrade['delta_percentage'].mean():.2f}%")
print(f"Best opportunity: {RegionTrade['delta_percentage'].max():.2f}% margin")
print(f"Report saved as: {filename}")
print(f"\nTop 10 Trading Opportunities:")
print("=" * 80)

# Display top 10 opportunities
top_10 = RegionTrade.head(10)[['TYPENAME', 'delta_percentage', 'delta', 'min_tradehub', 'max_tradehub', 'min_price', 'max_price']]
for idx, row in top_10.iterrows():
    print(f"{row['TYPENAME'][:30]:30} | {row['delta_percentage']:6.1f}% | "
          f"{row['delta']:10,.0f} ISK | {row['min_tradehub']:8} -> {row['max_tradehub']:8}")

print(f"\nFull report available in: {filename}")
