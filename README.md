# Прайс-лист микромаркета

Статический мобильный прайс-лист для публикации через GitHub Pages.

Публичный адрес для QR-кода: `https://price.rostavending.ru/`.

## Обновление цен (через Google-таблицу)

Источник цен — Google-таблица «Прайс-лист микромаркета — источник»
(id `1xzuzm212lU10DwUxVl5E0jEIEjVFWkYBJLiR-6S3sCI`), колонки:
`Категория | Название | Фасовка | Цена`.

Правила для заполняющего:

- «Категория» — строго одно из: `Сэндвичи`, `Сладости и снеки`, `Напитки`.
- «Цена» — число в рублях (`240` или `240,00`). «Фасовка» — необязательна (`150 г`, `0,5 л`).
- Первую строку (заголовки) не менять и не удалять.
- Порядок строк внутри категории = порядок на сайте.

Workflow `update-prices.yml` раз в сутки (07:00 МСК) скачивает таблицу,
валидирует и, если данные корректны и изменились, коммитит `data/prices.json`
и передеплоивает сайт. При ошибках в таблице публикация не происходит —
на сайте остаются прежние цены, а в Actions виден список ошибок по строкам.

Обновить сайт немедленно: Actions → `Update prices from Google Sheet` → Run workflow.

Проверить таблицу локально без публикации:

```bash
node scripts/sheet-to-prices.js          # скачает таблицу и обновит data/prices.json
CSV_FILE=path/to/file.csv node scripts/sheet-to-prices.js  # проверка локального CSV
```

Требование к таблице: доступ «Все, у кого есть ссылка — Читатель»
(иначе workflow не сможет её скачать и упадёт с подсказкой).

## Локальный просмотр

```bash
npm run serve
```

Откройте `http://localhost:4173`.

## Публикация на GitHub Pages

1. Загрузите репозиторий на GitHub.
2. Откройте `Settings -> Pages`.
3. В `Build and deployment -> Source` выберите `GitHub Actions`.
4. Дождитесь выполнения workflow `Deploy price list to GitHub Pages`.
5. В `Settings -> Pages -> Custom domain` укажите `price.rostavending.ru`.
6. Включите `Enforce HTTPS`, когда GitHub закончит проверку сертификата.

## DNS для короткой ссылки

У DNS-провайдера домена `rostavending.ru` создайте запись:

```text
type: CNAME
name: price
value: rkalko.github.io
```

Если GitHub Pages будет опубликован не из аккаунта `rkalko`, замените значение на Pages-домен нужного аккаунта: `USER.github.io`.

## Генерация QR-кода

Когда GitHub Pages URL будет известен:

```bash
npm run qr -- https://price.rostavending.ru/
```

Скрипт создаст:

- `qr/qr-price-list.svg` для печати;
- `qr/qr-price-list.png` для макетов и быстрой проверки.
- `qr/qr-price-list-sign.svg` как готовую табличку для размещения на микромаркете.

Если нужно сохранить QR под другим именем:

```bash
npm run qr -- https://USER.github.io/REPO/ qr/price-list-github-pages
```

Файл `*-sign.svg` можно распечатать как вертикальную табличку. Перед печатью обязательно отсканируйте QR-код телефоном и проверьте, что он открывает опубликованный прайс.

Если в репозитории уже настроен `origin` на GitHub, можно сгенерировать финальные QR-файлы без ручного ввода URL:

```bash
npm run finalize
```

Скрипт вычислит адрес GitHub Pages из `origin`, создаст QR-файлы и сохранит ссылку в `qr/pages-url.txt`.

Для текущего короткого домена можно запускать явно:

```bash
npm run finalize -- https://price.rostavending.ru/
```
