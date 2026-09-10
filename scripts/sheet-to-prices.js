#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SHEET_ID = process.env.SHEET_ID || "1xzuzm212lU10DwUxVl5E0jEIEjVFWkYBJLiR-6S3sCI";
const SHEET_NAME = "Лист1";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const OUTPUT_PATH = resolve("data/prices.json");
const EXPECTED_HEADER = ["Категория", "Название", "Фасовка", "Цена"];
const CATEGORIES = [
  { id: "sandwiches", title: "Сэндвичи" },
  { id: "snacks", title: "Сладости и снеки" },
  { id: "drinks", title: "Напитки" }
];
const MIN_ITEMS = 5;
const MAX_PRICE = 100000;

const csvText = process.env.CSV_FILE
  ? readFileSync(process.env.CSV_FILE, "utf8")
  : await fetchCsv(CSV_URL);

const rows = parseCsv(csvText);
const errors = [];
const itemsByCategory = new Map(CATEGORIES.map(({ id }) => [id, []]));

validateHeader(rows[0]);
rows.slice(1).forEach((row, index) => {
  const rowNumber = index + 2;
  if (row.every((cell) => !cell.trim())) return;

  const [category, name, details, price] = row.map((cell) => cell.trim().replace(/\s+/g, " "));
  const known = CATEGORIES.find(({ title }) => title === category);
  if (!known) {
    errors.push(`строка ${rowNumber}: неизвестная категория «${category}» (допустимы: ${CATEGORIES.map(({ title }) => title).join(", ")})`);
    return;
  }
  if (!name) {
    errors.push(`строка ${rowNumber}: пустое название`);
    return;
  }
  const parsedPrice = parsePrice(price);
  if (parsedPrice === null) {
    errors.push(`строка ${rowNumber}: цена «${price}» не число или вне диапазона 1–${MAX_PRICE}`);
    return;
  }
  itemsByCategory.get(known.id).push({ name, ...(details ? { details } : {}), price: parsedPrice });
});

const totalItems = [...itemsByCategory.values()].reduce((sum, items) => sum + items.length, 0);
if (totalItems < MIN_ITEMS && errors.length === 0) {
  errors.push(`всего ${totalItems} позиций — меньше минимума (${MIN_ITEMS}); похоже, таблица очищена по ошибке`);
}
if (errors.length) {
  console.error("Прайс НЕ обновлён, ошибки в таблице:");
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

const current = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
const next = {
  title: current.title,
  updatedAt: moscowDate(),
  currency: "RUB",
  source: {
    spreadsheetId: SHEET_ID,
    sheet: SHEET_NAME,
    columns: EXPECTED_HEADER.join(" | ")
  },
  categories: CATEGORIES
    .map(({ id, title }) => ({ id, title, items: itemsByCategory.get(id) }))
    .filter(({ items }) => items.length)
};

if (sameExceptDate(current, next)) {
  console.log("Изменений нет, data/prices.json не тронут.");
  process.exit(0);
}

writeFileSync(OUTPUT_PATH, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Записан ${OUTPUT_PATH}: ${totalItems} позиций, ${next.categories.length} категорий.`);

async function fetchCsv(url) {
  const response = await fetch(url, { redirect: "follow" });
  const body = await response.text();
  if (!response.ok || body.trimStart().startsWith("<")) {
    console.error(`Не удалось скачать таблицу как CSV (HTTP ${response.status}).`);
    console.error("Проверьте, что в таблице включён доступ «Все, у кого есть ссылка — Читатель».");
    process.exit(1);
  }
  return body;
}

function parseCsv(text) {
  const result = [[]];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") { result.at(-1).push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      result.at(-1).push(field); field = "";
      result.push([]);
    } else field += char;
  }
  result.at(-1).push(field);
  return result.filter((row) => row.length > 1 || row[0] !== "");
}

function validateHeader(header) {
  const actual = (header ?? []).map((cell) => cell.trim());
  if (EXPECTED_HEADER.some((title, index) => actual[index] !== title)) {
    console.error(`Первая строка таблицы должна быть: ${EXPECTED_HEADER.join(", ")}`);
    console.error(`Сейчас там: ${actual.join(", ") || "(пусто)"}`);
    process.exit(1);
  }
}

function parsePrice(value) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const price = Number(normalized);
  if (!(price >= 1 && price <= MAX_PRICE)) return null;
  return Number.isInteger(price) ? price : Math.round(price * 100) / 100;
}

function moscowDate() {
  const moscow = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return moscow.toISOString().slice(0, 10);
}

function sameExceptDate(a, b) {
  return JSON.stringify({ ...a, updatedAt: null }) === JSON.stringify({ ...b, updatedAt: null });
}
