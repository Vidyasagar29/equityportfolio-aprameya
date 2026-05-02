# equityportfolio-aprameya

Generates a public JSON snapshot for Aprameya's ETF and equity holdings dashboard.

## Sheet columns

The source Google Sheet should include these headers:

- `Symbol`
- `Qty`
- `Buy Price`
- `Close Price`

## Publish flow

1. Set the repository secret `SHEET_CSV_URL`.
2. Run the `Update Equity Portfolio Data` GitHub Action manually or let the weekday schedule run.
3. The workflow updates `data/equity-portfolio.json`.

The published JSON can be consumed from GitHub Pages once Pages is enabled for the repository.
