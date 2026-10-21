# Хранилище (packages/storage)

Диск для модели ядра: конфиг проекта, журнал и harness. Через этот пакет файлы Cyberzavod читают и пишут CLI, адаптеры агентов и сайт — другого кода, который знает раскладку файлов, нет.

## Правила

- **Проект** (`project.ts`): маркер — `.cyberzavod/project.json` (`PROJECT_CONFIG_FILE`). `findProjectRoot` поднимается от каталога до ближайшего маркера, `readProjectConfig` читает и проверяет конфиг через `parseProjectConfig` ядра; битый файл — `ProjectFileError`, отсутствие — `undefined`. `writeProjectConfig` пишет JSON с отступом в два пробела и переводом строки в конце; первое поле — `schemaVersion` (`PROJECT_CONFIG_SCHEMA_VERSION` ядра, версия формата файла, не CLI и не harness).
- **Журнал** (`journal.ts`): `DirectoryRecordStore` — реализация `RecordStore` ядра: каждая запись — файл `<коллекция>/<id>.json`, коллекции — `RECORD_COLLECTIONS` по типу записи. Один и тот же код хранит журнал в репозитории проекта (по умолчанию `.cyberzavod/journal`, `DEFAULT_JOURNAL`) и в каталоге рядом с ним (`../<проект>.cyberzavod`): отличается только путь `journal` в конфиге, его разрешает `journalDirectory`. Файл, не прошедший `parseRecord`, — `JournalError` с путём, а не пропуск. `capture/` (`CAPTURE_DIRECTORY`) — рабочие файлы адаптеров, не записи.
- **Harness** (`harness.ts`): `readHarnessFiles` читает файлы каталога harness (скиллы `skills/` и процессы `workflows/`), `loadHarness` разбирает их `parseHarness` ядра; `workflowOf` выбирает процесс по имени или бросает `HarnessError`.
- Пути — только через `node:path` (`join`, `resolve`, `relative`): пакет работает на macOS, Linux и Windows. Пути внутри конфига и журнала хранятся через `/`.
- Ошибки чтения, кроме «файла нет», не глотаются: либо своя ошибка с путём, либо исходная.
- Тесты — на временном каталоге из `temporaryDirectory()` (`fixtures.ts`), он удаляется после теста; данные — фабриками `validConfig`, `validSession`, `validDecision`.
- Наружу — только то, что экспортирует `src/index.ts`.
