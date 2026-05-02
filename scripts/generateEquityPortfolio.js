import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, "../data/equity-portfolio.json");
const SHEET_URL = process.env.SHEET_CSV_URL;
const OUTPUT_DECIMALS = 6;

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsv(csvText) {
  const rows = [];
  let currentValue = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));

  return rows.slice(1).flatMap((values) => {
    if (values.every((value) => String(value ?? "").trim() === "")) {
      return [];
    }

    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    return [record];
  });
}

function toNumber(value) {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) {
    return NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function roundNumber(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(OUTPUT_DECIMALS));
}

function buildHolding(row) {
  const symbol = String(row.symbol ?? "").trim();
  const quantity = toNumber(row.qty);
  const buyPrice = toNumber(row.buyprice);
  const currentPrice = toNumber(row.closeprice);

  if (
    !symbol ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(buyPrice) ||
    !Number.isFinite(currentPrice) ||
    quantity <= 0
  ) {
    return null;
  }

  const invested = quantity * buyPrice;
  const currentValue = quantity * currentPrice;
  const pnl = currentValue - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  return {
    symbol,
    quantity: roundNumber(quantity),
    buyPrice: roundNumber(buyPrice),
    currentPrice: roundNumber(currentPrice),
    invested: roundNumber(invested),
    currentValue: roundNumber(currentValue),
    pnl: roundNumber(pnl),
    pnlPct: roundNumber(pnlPct),
  };
}

async function main() {
  if (!SHEET_URL) {
    console.error("SHEET_CSV_URL is not set.");
    process.exitCode = 1;
    return;
  }

  const response = await fetch(SHEET_URL, {
    headers: {
      Accept: "text/csv",
    },
  });

  if (!response.ok) {
    console.error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    process.exitCode = 1;
    return;
  }

  const csvText = await response.text();
  const holdings = parseCsv(csvText)
    .map((row) => buildHolding(row))
    .filter((holding) => holding !== null);

  const totalInvestment = holdings.reduce((sum, holding) => sum + holding.invested, 0);
  const currentValue = holdings.reduce((sum, holding) => sum + holding.currentValue, 0);
  const pnl = currentValue - totalInvestment;
  const pnlPct = totalInvestment > 0 ? (pnl / totalInvestment) * 100 : 0;

  const output = {
    lastUpdated: new Date().toISOString(),
    summary: {
      totalInvestment: roundNumber(totalInvestment),
      currentValue: roundNumber(currentValue),
      pnl: roundNumber(pnl),
      pnlPct: roundNumber(pnlPct),
      positions: holdings.length,
    },
    holdings,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Updated equity portfolio JSON for ${holdings.length} holdings.`);
}

main().catch((error) => {
  console.error("Equity portfolio generation failed:", error);
  process.exitCode = 1;
});
