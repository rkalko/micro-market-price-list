# Прайс-лист микромаркета

Статический мобильный прайс-лист для публикации через GitHub Pages.

Публичный адрес для QR-кода: `https://price.rostavending.ru/`.

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
