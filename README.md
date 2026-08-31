# GeM Portal Bid Details & Evaluation Scraper (to PDF/JSON/CSV)

This python tool scrapes bid evaluation details from the **Government e Marketplace (GeM) Portal** (`bidplus.gem.gov.in`), extracts structured data (Bid Details, Buyer Details, Technical Evaluation, Financial Evaluation), and exports formatted **PDF reports**, **JSON files**, and an Excel-compatible **CSV summary table**.

---

## 🌟 Key Features

1. **Complete Scraping**:
   - **Bid Details**: Bid/RA Number, Status, Quantity, Validity, Start Date/Time, End Date/Time, Opening Date/Time.
   - **Buyer Details**: Buyer Name, Ministry, Department, Organisation, Office, Address.
   - **Technical Evaluation**: S.No., Seller Name, Offered Item (Make & Model), Participation Date, MSE/MII Status, Qualification Status (Qualified / Disqualified).
   - **Financial Evaluation**: S.No., Seller Name, Category, Offered Item, Total Price (in ₹), Rank (L1, L2, L3, etc.).
2. **Beautiful PDF Generation**: Uses Playwright headless Chromium for clean typography, colored badges, grid cards, and clean page breaks.
3. **Multiple Input Methods**: Pass Bid Result View IDs (e.g. `5705747`), full URLs, local `.html` files, or a batch text file (`bids_input_sample.txt`).
4. **Master Merged PDF**: Automatically combines multiple individual bid PDFs into `ALL_BIDS_COMBINED_REPORT.pdf`.

---

## 🚀 Quick Start

### 1. Requirements
Ensure Python and required packages are installed:
```bash
pip install -r requirements.txt
playwright install chromium
```

### 2. Usage Examples

#### Option A: Pass Bid IDs directly via CLI
```bash
python gem_scraper.py 5705747 6000000 9689162
```

#### Option B: Pass Full GeM URLs
```bash
python gem_scraper.py https://bidplus.gem.gov.in/bidding/bid/getBidResultView/5705747
```

#### Option C: Batch process from a text file (List of IDs/URLs)
Edit `bids_input_sample.txt` and run:
```bash
python gem_scraper.py -f bids_input_sample.txt
```

#### Option D: Interactive Mode
Run the script without arguments and type/paste your IDs when prompted:
```bash
python gem_scraper.py
```

#### Option E: Process saved local `.html` files
```bash
python gem_scraper.py sample_bid.html sample_financial_bid.html
```

---

## 📁 Output Directory Structure (`scraped_output/`)

```
scraped_output/
├── pdfs/
│   ├── GEM_2023_B_4309262.pdf
│   ├── GEM_2024_B_4578631.pdf
│   └── GEM_2026_B_7859164.pdf
├── json/
│   ├── GEM_2023_B_4309262.json
│   ├── GEM_2024_B_4578631.json
│   └── GEM_2026_B_7859164.json
├── bids_summary.csv
└── ALL_BIDS_COMBINED_REPORT.pdf
```

- **`pdfs/`**: Beautiful, print-ready PDF reports per bid.
- **`json/`**: Structured JSON data per bid.
- **`bids_summary.csv`**: Overview table of all processed bids with L1 price, seller counts, buyer info, dates.
- **`ALL_BIDS_COMBINED_REPORT.pdf`**: Merged PDF report containing all processed bids in one document.
