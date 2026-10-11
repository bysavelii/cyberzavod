# Выпуск `cyberzavod` и `@cyberzavod/viewer` в npm

Версия одна на всё и у двух пакетов: `version` в `packages/cli/package.json` = `version` в `packages/viewer/package.json` (это проверяет тест пакета цеха) = `HARNESS_VERSION` в `packages/cli/src/installation/installation.ts` (это проверяет тест) = версия harness в `.cyberzavod/project.json` (её пишет `sync`, расхождение ловит `make check-web`) = тег `vX.Y.Z` (это проверяет выпуск). Сайт версию не показывает. Руками в npm ничего не публикуют: публикует только CI по тегу. Единственное исключение — первая версия `@cyberzavod/viewer`, см. «Первая публикация `@cyberzavod/viewer`» ниже.

## Шаги

1. Сверить `MODEL_PRICES` (`packages/core/src/model-prices.ts`) с официальными страницами цен и обновить `PRICES_AS_OF`; цена существующего id изменилась — добавить строки с датой начала, а не править (правило — в `packages/core/AGENTS.md`).
2. Поднять версию в `packages/cli/package.json`, `packages/viewer/package.json` и `HARNESS_VERSION` — минорную, если менялись harness, шаблоны адаптера или поведение команд, иначе патч.
3. `pnpm cyberzavod sync` — перегенерировать `CLAUDE.md`, `.claude/` и хуки этого репозитория под новую версию.
4. `make check-web check-api` и `pnpm smoke` — проверки и путь человека на настоящих архивах `npm pack`: CLI не больше своего предела размера, цех без зависимостей, `view` из архива цеха, в том числе без сети.
5. Коммит `chore(cli): версия X.Y.Z`, push в `main`, дождаться зелёного CI: в нём job `package` гоняет ту же дымовую проверку на Linux, macOS и Windows с Node 22 и 24.
6. Тег на этот коммит:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   `.github/workflows/release.yml` проверяет, что тег совпадает с версиями обоих пакетов, гоняет `make check-web` и `pnpm smoke`, публикует через npm Trusted Publishing (OIDC, без токена; npm сам подписывает происхождение — provenance) сначала `@cyberzavod/viewer`, потом `cyberzavod` и ждёт до 10 минут на пакет, пока npm отдаёт новую версию как `latest`. Версию, которая уже есть в npm, публикация пропускает, так что выпуск после частичного сбоя (например, упало ожидание `latest`) можно перезапустить.

7. Проверить руками в любом проекте, подключённом к Cyberzavod:
   - `npx cyberzavod@X.Y.Z --version` печатает `X.Y.Z`;
   - `npx cyberzavod@X.Y.Z view` печатает `factory floor: http://127.0.0.1:<порт>/?lang=…`, открывает браузер, слева «Записи», любая запись проигрывается; остановить Ctrl+C;
   - то же без сети: `npm_config_offline=true npx cyberzavod@X.Y.Z view --no-open` (PowerShell: `$env:npm_config_offline = "true"`) печатает адрес, по нему открывается цех. Это значит, что пакет цеха лежит в кэше npx после первого запуска.

## Если выпуск упал

- Тег не совпал с версией — удалить тег (`git push origin :refs/tags/vX.Y.Z`, `git tag -d vX.Y.Z`), исправить версию, начать с шага 4.
- Упали проверки или дымовая проверка — пакеты не опубликованы; исправить в `main` и поставить новый патч-тег.
- Упала публикация `cyberzavod` после публикации цеха — цех этой версии уже в npm, а `cyberzavod` нет: исправить причину и перезапустить выпуск (job пропустит цех); если для исправления нужен коммит, ставится новый патч-тег, версия цеха при этом тоже растёт.
- Опубликованную версию npm не даёт перезаписать: ошибку в выпуске исправляет следующая версия.

## Настройки вне репозитория (один раз)

- На npmjs.com создана организация `cyberzavod` (бесплатная, для публичных пакетов) от аккаунта владельца: без неё нет имени `@cyberzavod/viewer`. На аккаунте включена двухфакторная аутентификация.
- У пакета `cyberzavod` настроен Trusted Publisher: GitHub Actions, репозиторий `bysavelii/cyberzavod`, workflow `release.yml`. Уже сделано: у 0.8.0 есть provenance.
- У пакета `@cyberzavod/viewer` то же самое — после первой публикации, см. ниже.
- Рекомендуется у обоих пакетов, в Settings → Publishing access, включить «Require two-factor authentication and disallow tokens»: тогда публиковать может только CI по тегу.

### Первая публикация `@cyberzavod/viewer`

npm настраивает Trusted Publisher только у существующего пакета, поэтому первую версию (0.14.0) человек публикует руками с 2FA: это единственное исключение из правила «руками ничего не публикуют». Порядок:

1. Организация `cyberzavod` создана на npmjs.com (см. выше), вы в ней с правом публикации.
2. Шаги 1–5 выпуска выполнены, версия 0.14.0 лежит в `main`, тег ещё не поставлен.
3. Чистая копия `main` на коммите версии, зависимости и вход в npm (`git status --short` ничего не печатает). В блоках ниже нет комментариев `#`: интерактивный zsh не считает `#` комментарием и передаёт его команде аргументом:

   ```bash
   git switch main && git pull --ff-only
   git status --short
   pnpm install --frozen-lockfile
   npm login
   ```

4. Собрать цех и проверить архив до публикации:

   ```bash
   pnpm --filter @cyberzavod/viewer build
   cd packages/viewer
   npm pack --dry-run
   ```

   В списке должны быть `LICENSE`, `README.md`, `package.json`, `bin/cyberzavod-viewer.mjs`, `dist/index.html`, `dist/THIRD_PARTY_LICENSES` и файлы `dist/assets/`; без `dist/` пакет бесполезен. `npm publish` и сам собирает цех в `prepack`, сборка выше нужна, чтобы увидеть сбой до публикации.

5. Опубликовать с тем же манифестом, что и CI (без `devDependencies`), и вернуть файл; `npm publish` запросит одноразовый код 2FA:

   ```bash
   npm pkg delete devDependencies
   npm publish --access public
   git checkout package.json
   ```

6. Проверить: `npm view @cyberzavod/viewer version` печатает `0.14.0`.
7. На npmjs.com → `@cyberzavod/viewer` → Settings → Trusted Publisher → GitHub Actions: Organization or user `bysavelii`, Repository `cyberzavod`, Workflow filename `release.yml`, Environment пустое. Ниже, в Publishing access, включить «Require two-factor authentication and disallow tokens».
8. Поставить тег `v0.14.0` (шаг 6 выпуска): выпуск увидит, что цех этой версии уже в npm, пропустит его, опубликует `cyberzavod` и дождётся `latest` у обоих пакетов.

Начиная со следующей версии цех публикует CI, как и `cyberzavod`.
