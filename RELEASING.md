# Выпуск `cyberzavod` в npm

Версия одна на всё: `version` в `packages/cli/package.json` = `HARNESS_VERSION` в `packages/cli/src/installation/installation.ts` (это проверяет тест) = версия harness в `.cyberzavod/project.json` (её пишет `sync`, расхождение ловит `make check-web`) = тег `vX.Y.Z` (это проверяет выпуск). Сайт версию не показывает. Руками в npm ничего не публикуют: публикует только CI по тегу.

## Шаги

1. Сверить `MODEL_PRICES` (`packages/core/src/model-prices.ts`) с официальными страницами цен и обновить `PRICES_AS_OF`; цена существующего id изменилась — добавить строки с датой начала, а не править (правило — в `packages/core/AGENTS.md`).
2. Поднять версию в `packages/cli/package.json` и `HARNESS_VERSION` — минорную, если менялись harness, шаблоны адаптера или поведение команд, иначе патч.
3. `pnpm cyberzavod sync` — перегенерировать `CLAUDE.md`, `.claude/` и хуки этого репозитория под новую версию.
4. `make check-web check-api` и `pnpm smoke` — проверки и путь человека на настоящем архиве `npm pack`.
5. Коммит `chore(cli): версия X.Y.Z`, push в `main`, дождаться зелёного CI: в нём job `package` гоняет ту же дымовую проверку на Linux, macOS и Windows с Node 22 и 24.
6. Тег на этот коммит:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   `.github/workflows/release.yml` проверяет, что тег совпадает с версией, гоняет `make check-web` и `pnpm smoke`, публикует пакет через npm Trusted Publishing (OIDC, без токена; npm сам подписывает происхождение — provenance) и ждёт до 10 минут, пока npm отдаёт новую версию как `latest`. Если этот последний шаг упал, а остальные зелёные, пакет уже опубликован: проверьте `npm view cyberzavod dist-tags.latest` и не перезапускайте выпуск — повторная публикация той же версии упадёт.

7. Проверить руками одно: `npx cyberzavod@latest --version` в любом каталоге печатает `X.Y.Z`.

## Если выпуск упал

- Тег не совпал с версией — удалить тег (`git push origin :refs/tags/vX.Y.Z`, `git tag -d vX.Y.Z`), исправить версию, начать с шага 4.
- Упали проверки или дымовая проверка — пакет не опубликован; исправить в `main` и поставить новый патч-тег.
- Опубликованную версию npm не даёт перезаписать: ошибку в выпуске исправляет следующая версия.

## Настройки вне репозитория (один раз)

- На npmjs.com у пакета `cyberzavod` настроен Trusted Publisher: GitHub Actions, репозиторий `bysavelii/cyberzavod`, workflow `release.yml`. Уже сделано: у 0.8.0 есть provenance.
- Рекомендуется там же, в Settings → Publishing access, включить «Require two-factor authentication and disallow tokens»: тогда публиковать может только CI по тегу.
