"""
Canonical sector/industry taxonomy for diversification analysis.

Single source of truth for the 13 sector categories used across stock/watchlist
storage, valuation rules (stock_info.py), and MCP exposure. Industry taxonomy
is a static snapshot of Yahoo Finance's own sector->industry hierarchy.
"""

# The 11 GICS-equivalent sectors as returned by yfinance `.info['sector']`.
# stock_info.py's SECTOR_RULES and SECTOR_PE_BENCHMARKS must use exactly these keys.
SECTOR_KEYS = (
    "Technology",
    "Financial Services",
    "Utilities",
    "Energy",
    "Real Estate",
    "Healthcare",
    "Consumer Cyclical",
    "Consumer Defensive",
    "Industrials",
    "Basic Materials",
    "Communication Services",
)

# Full canonical sector list for DB storage / <Select> options: GICS sectors
# plus two non-GICS buckets for instruments that don't have a GICS sector.
SECTOR_CHOICES = SECTOR_KEYS + ("ETF/Fund", "Cryptocurrency")

# Static snapshot of Yahoo Finance's own sector -> industry hierarchy (yfinance
# `.info['industry']`). Not invented — this is Yahoo's real, stable classification.
# A yfinance value that isn't found here is a rare edge case (see
# ai_stock_metadata.py's soft-validation fallback), not the expected path.
INDUSTRY_TAXONOMY: dict[str, list[str]] = {
    "Technology": [
        "Information Technology Services",
        "Software - Application",
        "Software - Infrastructure",
        "Communication Equipment",
        "Computer Hardware",
        "Consumer Electronics",
        "Electronic Components",
        "Electronics & Computer Distribution",
        "Scientific & Technical Instruments",
        "Semiconductor Equipment & Materials",
        "Semiconductors",
        "Solar",
        "Technology Distributors",
    ],
    "Financial Services": [
        "Asset Management",
        "Banks - Diversified",
        "Banks - Regional",
        "Capital Markets",
        "Credit Services",
        "Financial Conglomerates",
        "Financial Data & Stock Exchanges",
        "Insurance - Diversified",
        "Insurance - Life",
        "Insurance - Property & Casualty",
        "Insurance - Reinsurance",
        "Insurance - Specialty",
        "Insurance Brokers",
        "Mortgage Finance",
        "Shell Companies",
    ],
    "Utilities": [
        "Utilities - Diversified",
        "Utilities - Independent Power Producers",
        "Utilities - Regulated Electric",
        "Utilities - Regulated Gas",
        "Utilities - Regulated Water",
        "Utilities - Renewable",
    ],
    "Energy": [
        "Oil & Gas Drilling",
        "Oil & Gas E&P",
        "Oil & Gas Equipment & Services",
        "Oil & Gas Integrated",
        "Oil & Gas Midstream",
        "Oil & Gas Refining & Marketing",
        "Thermal Coal",
        "Uranium",
    ],
    "Real Estate": [
        "Real Estate - Development",
        "Real Estate - Diversified",
        "Real Estate Services",
        "REIT - Diversified",
        "REIT - Healthcare Facilities",
        "REIT - Hotel & Motel",
        "REIT - Industrial",
        "REIT - Mortgage",
        "REIT - Office",
        "REIT - Residential",
        "REIT - Retail",
        "REIT - Specialty",
    ],
    "Healthcare": [
        "Biotechnology",
        "Diagnostics & Research",
        "Drug Manufacturers - General",
        "Drug Manufacturers - Specialty & Generic",
        "Health Information Services",
        "Healthcare Plans",
        "Medical Care Facilities",
        "Medical Devices",
        "Medical Distribution",
        "Medical Instruments & Supplies",
        "Pharmaceutical Retailers",
    ],
    "Consumer Cyclical": [
        "Apparel Manufacturing",
        "Apparel Retail",
        "Auto & Truck Dealerships",
        "Auto Manufacturers",
        "Auto Parts",
        "Department Stores",
        "Footwear & Accessories",
        "Furnishings, Fixtures & Appliances",
        "Gambling",
        "Home Improvement Retail",
        "Internet Retail",
        "Leisure",
        "Lodging",
        "Luxury Goods",
        "Packaging & Containers",
        "Personal Services",
        "Recreational Vehicles",
        "Residential Construction",
        "Resorts & Casinos",
        "Restaurants",
        "Specialty Retail",
        "Textile Manufacturing",
        "Travel Services",
    ],
    "Consumer Defensive": [
        "Beverages - Brewers",
        "Beverages - Non-Alcoholic",
        "Beverages - Wineries & Distilleries",
        "Confectioners",
        "Discount Stores",
        "Education & Training Services",
        "Farm Products",
        "Food Distribution",
        "Grocery Stores",
        "Household & Personal Products",
        "Packaged Foods",
        "Tobacco",
    ],
    "Industrials": [
        "Aerospace & Defense",
        "Agricultural - Machinery",
        "Airlines",
        "Airports & Air Services",
        "Building Products & Equipment",
        "Business Equipment & Supplies",
        "Conglomerates",
        "Consulting Services",
        "Electrical Equipment & Parts",
        "Engineering & Construction",
        "Farm & Heavy Construction Machinery",
        "Industrial Distribution",
        "Infrastructure Operations",
        "Integrated Freight & Logistics",
        "Marine Shipping",
        "Metal Fabrication",
        "Pollution & Treatment Controls",
        "Railroads",
        "Rental & Leasing Services",
        "Security & Protection Services",
        "Specialty Business Services",
        "Specialty Industrial Machinery",
        "Staffing & Employment Services",
        "Tools & Accessories",
        "Trucking",
        "Waste Management",
    ],
    "Basic Materials": [
        "Agricultural Inputs",
        "Aluminum",
        "Building Materials",
        "Chemicals",
        "Coking Coal",
        "Copper",
        "Gold",
        "Lumber & Wood Production",
        "Other Industrial Metals & Mining",
        "Other Precious Metals & Mining",
        "Paper & Paper Products",
        "Silver",
        "Specialty Chemicals",
        "Steel",
    ],
    "Communication Services": [
        "Advertising Agencies",
        "Broadcasting",
        "Electronic Gaming & Multimedia",
        "Entertainment",
        "Internet Content & Information",
        "Publishing",
        "Telecom Services",
    ],
    "ETF/Fund": [
        "Equity ETF",
        "Bond ETF",
        "Commodity ETF",
        "Sector ETF",
        "REIT ETF",
    ],
    "Cryptocurrency": [
        "Bitcoin",
        "Ethereum",
        "Stablecoin",
        "Altcoin",
    ],
}

ALL_INDUSTRIES: frozenset[str] = frozenset(
    industry for industries in INDUSTRY_TAXONOMY.values() for industry in industries
)

# Per-ticker overrides for cases where yfinance's raw sector/industry is technically
# valid (within our taxonomy) but a poor fit for diversification purposes — corrected
# to match the precedent yfinance itself sets for directly comparable peer companies.
# Both the one-off DB backfill and ai_stock_metadata.py's auto-fill apply these, so
# re-running auto-fill on the same ticker later still gets the corrected value.
SECTOR_OVERRIDES: dict[str, tuple[str, str]] = {
    # Payments/fintech companies yfinance puts under Technology; matches how
    # yfinance itself classifies the directly comparable PYPL/SOFI (Financial
    # Services / Credit Services).
    "DLO": ("Financial Services", "Credit Services"),
    "PGY": ("Financial Services", "Credit Services"),
    "EEFT": ("Financial Services", "Credit Services"),
    # IREN pivoted from bitcoin mining to AI/GPU cloud compute — matches CRWV
    # (CoreWeave), a direct business-model peer already classified as
    # Technology / Software - Infrastructure by yfinance.
    "IREN": ("Technology", "Software - Infrastructure"),
}
