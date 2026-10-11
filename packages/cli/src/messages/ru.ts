// Russian CLI texts.

import { CLI_COMMAND } from "@cyberzavod/adapter-kit";
import { AGENT_NAMES, DEFAULT_AGENT_NAME } from "../agents/agent-adapter.ts";
import { API_URL_VARIABLE, DEFAULT_API_URL } from "../sharing/services.ts";
import { VIEWER_PACKAGE_NAME, VIEWER_PACKAGE_VARIABLE } from "../viewer/viewer-package.ts";
import type { CliMessages } from "./cli-messages.ts";
import { ALL_HOOK_NAMES } from "./hook-names.ts";

/** CLI texts in Russian. */
export const ru: CliMessages = {
  help: {
    title: "Cyberzavod — локальный harness разработки с ИИ-агентами.",
    quickStart: `Старт: ${CLI_COMMAND} init [--agent codex], /setup, /feature (Codex: $имя).`,
    sections: {
      start: "Начало",
      journal: "Журнал",
      gallery: "Галерея",
      maintenance: "Обслуживание",
    },
    parametersTitle: "Параметры:",
    footer: (languages) =>
      `Подробнее о команде: ${CLI_COMMAND} <команда> --help · язык: --lang ${languages}`,
  },
  commands: {
    init: {
      usage: "init [options]",
      summary: "подключить проект: конфиг, AGENTS.md, файлы агента",
      parameters: [
        { name: "--yes, -y", description: "не спрашивать подтверждение" },
        {
          name: "--agent <agent>",
          description: `агент: ${AGENT_NAMES.join(", ")}; по умолчанию ${DEFAULT_AGENT_NAME}`,
        },
        { name: "--id <id>", description: "id проекта; по умолчанию — имя пакета или каталога" },
        {
          name: "--check <command>",
          description: "команда проверки, можно несколько; заменяет найденные",
        },
        { name: "--journal <path>", description: "каталог журнала от корня проекта" },
      ],
    },
    sync: {
      usage: "sync [--check | --diff] [--json] [--force]",
      summary: "заново распознать стек и пересобрать файлы агента",
      parameters: [
        { name: "--check", description: "только показать, что изменится; выход 1, если что-то" },
        { name: "--diff", description: "только показать, что изменится; выход 0" },
        { name: "--json", description: "с --check или --diff: вывод в JSON для скриптов" },
        {
          name: "--force",
          description: "перезаписать ваши файлы и сгенерированные, исправленные руками",
        },
      ],
    },
    doctor: {
      usage: "doctor [--run-checks] [--json]",
      summary: "проверить подключение и подсказать, как починить",
      parameters: [
        {
          name: "--run-checks",
          description: "запустить команды проверок, а не только искать их",
        },
        { name: "--json", description: "вывод в JSON для скриптов" },
      ],
    },
    disconnect: {
      usage: "disconnect [--yes]",
      summary: "убрать Cyberzavod из проекта; код, AGENTS.md и журнал остаются",
      parameters: [{ name: "--yes, -y", description: "не спрашивать подтверждения" }],
    },
    status: {
      usage: "status [--json]",
      summary: "проект, процесс, агенты этапов, проверки и журнал",
      parameters: [{ name: "--json", description: "вывод в JSON для скриптов" }],
    },
    decision: {
      usage: 'decision "<что решили>" [--why "<почему>"]',
      summary: "записать решение в журнал",
      parameters: [
        { name: '"<что решили>"', description: "текст решения" },
        { name: "--why", description: "причина, она сохраняется вместе с решением" },
      ],
    },
    note: {
      usage: 'note "<текст>"',
      summary: "записать заметку в журнал",
      parameters: [{ name: '"<текст>"', description: "текст заметки" }],
    },
    view: {
      usage: "view [--no-open]",
      summary: "показать ваши записи и черновики в цехе",
      parameters: [
        { name: "--no-open", description: "не открывать браузер, только напечатать адрес" },
        {
          name: VIEWER_PACKAGE_VARIABLE,
          description: `спецификация ${VIEWER_PACKAGE_NAME} или путь к архиву`,
        },
      ],
    },
    draft: {
      usage: "draft [<сырой журнал сессии>]",
      summary: "собрать черновик записи из журнала сессии агента",
      parameters: [
        {
          name: "<сырой журнал сессии>",
          description: "путь к журналу; без него — самый свежий сырой журнал",
        },
      ],
    },
    publish: {
      usage: "publish [--draft <черновик>] [--build <id сборки>]",
      summary: "опубликовать отредактированный черновик записями в журнал",
      parameters: [
        { name: "--draft", description: "путь к черновику; без него — самый свежий" },
        { name: "--build", description: "сборка черновика; без неё — все" },
      ],
    },
    login: {
      usage: "login",
      summary: "войти через GitHub, чтобы публиковать записи в галерею",
      parameters: [
        {
          name: API_URL_VARIABLE,
          description: `адрес сервера; по умолчанию ${DEFAULT_API_URL}`,
        },
      ],
    },
    logout: {
      usage: "logout",
      summary: "забыть сохранённый токен GitHub",
      parameters: [],
    },
    share: {
      usage: "share <id записи>",
      summary: "отправить запись из журнала в вашу галерею",
      parameters: [{ name: "<id записи>", description: "id записи сессии" }],
    },
    unshare: {
      usage: "unshare <id записи>",
      summary: "убрать запись из вашей галереи",
      parameters: [{ name: "<id записи>", description: "id записи в галерее" }],
    },
    gallery: {
      usage: "gallery [--public | --private]",
      summary: "ваша галерея: записи, лимит, ссылки; открыть или закрыть",
      parameters: [
        { name: "--public", description: "открыть галерею" },
        { name: "--private", description: "закрыть галерею" },
      ],
    },
    hook: {
      usage: `hook <${ALL_HOOK_NAMES.join("|")}> [--agent <agent>]`,
      summary: "хук агента: его вызывает файл хуков агента, а не человек",
      parameters: [
        { name: "<имя хука>", description: "событие приходит на stdin" },
        {
          name: "--agent <agent>",
          description: `агент, чей это хук: ${AGENT_NAMES.join(", ")}; по умолчанию ${DEFAULT_AGENT_NAME}`,
        },
      ],
    },
  },
  init: {
    summaryTitle: "Cyberzavod подключит этот проект:",
    projectId: (id) => `Id проекта: ${id}`,
    checks: (commands) => `Проверки: ${commands}`,
    checksMissing: ({ file, terms }) =>
      `Проверки: не найдены — ${terms.skill("setup")} или правка ${file}`,
    rulesStarter: (file) => `Правила для агентов: ${file} — заготовка, допишите её`,
    rulesMoved: ({ from, to }) => `Правила для агентов: ваш ${from} станет ${to}`,
    rulesKept: (file) => `Правила для агентов: ${file} уже есть, не изменится`,
    journal: (path) => `Журнал сессий: ${path}`,
    files: (paths) => `Появятся: ${paths}`,
    trustProject: (file) => `Доверие: проект будет помечен доверенным в ${file}`,
    trustHooks: (file) => `Доверие: хуки проекта будут одобрены в ${file}`,
    overrideHint: `Поменять: --id, --check, --journal — подробнее: ${CLI_COMMAND} init --help`,
    confirm: "Продолжить? [Y/n]",
    cancelled: "Отменено: ничего не записано",
    done: "Готово: проект подключён.",
    commit: (paths) => `Закоммитьте: ${paths}`,
    nextSteps: (terms) =>
      `Дальше: откройте ${terms.product} и запустите ${terms.skill("setup")}, затем ${terms.skill("feature")} <задача>.`,
    alreadyConnected: "Cyberzavod уже подключён к этому проекту.",
    configValid: "✓ Конфиг в порядке",
    filesCurrent: "✓ Сгенерированные файлы актуальны",
    filesOutdated: "✗ Сгенерированные файлы устарели",
    nothingToDo: "Делать нечего.",
    runSync: `Запустите:\n  ${CLI_COMMAND} sync`,
  },
  sync: {
    added: "Добавлены",
    updated: "Обновлены",
    removed: "Удалены",
    willAdd: "Появятся",
    willUpdate: "Обновятся",
    willRemove: "Удалятся",
    yours: "НЕ тронет (ваши файлы на месте сгенерированных)",
    edited: "НЕ тронет (сгенерированные файлы, исправленные руками)",
    neverTouched: (terms) =>
      `Не трогает никогда: AGENTS.md, ваши настройки и хуки ${terms.product}, журнал, ваш код.`,
    trustRefreshed: (file) => `Одобрение хуков в ${file} перенесено на новые хуки.`,
    upToDate: "Всё актуально: менять нечего.",
    harnessMismatch: ({ file, configVersion, cliVersion }) =>
      `${file}: harness ${configVersion}, а CLI — ${cliVersion}`,
    filesOutdated: `Файлы устарели. Запустите:\n  ${CLI_COMMAND} sync`,
    blocked: `sync остановится на файлах выше и ничего не изменит. Как починить: перенесите правки в AGENTS.md и удалите эти файлы или перезапишите их:\n  ${CLI_COMMAND} sync --force`,
  },
  doctor: {
    fix: (text) => `Как починить: ${text}`,
    hint: (text) => `Подсказка: ${text}`,
    allPassed: "Всё в порядке.",
    problems: (count) => `Проблем: ${count}.`,
    node: {
      passed: (version) => `Node.js ${version}`,
      tooOld: ({ version, minimum }) =>
        `Node.js ${version} слишком старый: нужен ${minimum} или новее`,
      install: (minimum) => `установите Node.js ${minimum} или новее`,
    },
    git: {
      passed: "git установлен",
      missing: "git не найден в PATH",
      install: "установите git и убедитесь, что он в PATH",
    },
    claudeCode: {
      passed: "Claude Code установлен",
      missing:
        "Claude Code (claude) не найден в PATH: это нормально, если вы работаете в приложении или расширении IDE",
      install: "установите Claude Code: https://claude.com/claude-code",
    },
    codex: {
      passed: "Codex установлен",
      missing:
        "Codex (codex) не найден в PATH: это нормально, если вы работаете в приложении или расширении IDE",
      install: "установите Codex: https://developers.openai.com/codex/cli",
    },
    gallery: {
      signedIn: "галерея: вход выполнен",
      notSignedIn: "галерея: вход не выполнен (нужен только для публикации записей)",
      signIn: `чтобы публиковать записи, выполните ${CLI_COMMAND} login`,
      corrupt: "галерея: файл с сохранённым входом повреждён",
      signInAgain: `выполните ${CLI_COMMAND} login заново`,
    },
    config: {
      passed: ({ file, projectId, harness }) => `${file}: проект ${projectId}, harness ${harness}`,
      notFound: (directory) => `проект Cyberzavod не найден от ${directory}`,
      init: `выполните ${CLI_COMMAND} init в корне проекта`,
      invalid: (reason) => `конфиг проекта не годится: ${reason}`,
      repair: (file) => `исправьте ${file} по сообщению выше`,
      agents: (reason) => `агенты в конфиге проекта не годятся: ${reason}`,
      fixAgents: (file) => `исправьте agents в ${file}`,
    },
    hooks: {
      passed: (version) => `хуки агента установлены для ${version}`,
      missing: (file) => `хуки агента не установлены в ${file}`,
      otherVersion: ({ file, found, configVersion }) =>
        `хуки агента в ${file} — для ${found}, а в конфиге ${configVersion}`,
      incomplete: (events) => `хуки агента неполные: нет обработчиков у ${events}`,
      unreadable: (reason) => `хуки агента не проверить: ${reason}`,
      sync: `выполните ${CLI_COMMAND} sync`,
      repairSettings: (file) => `исправьте JSON в ${file}, затем выполните ${CLI_COMMAND} sync`,
    },
    trust: {
      passed: (file) => `проект и его хуки доверены в ${file}`,
      projectUntrusted: ({ file, terms }) =>
        `проект не доверен в ${file}: ${terms.product} не запускает его хуки`,
      trustProject: ({ file, projectKey, terms }) =>
        `откройте ${terms.product} в проекте и доверьте его или допишите в ${file} [projects.${JSON.stringify(projectKey)}] trust_level = "trusted"`,
      hooksUntrusted: ({ events, terms }) => `${terms.product} не одобрил хуки проекта: ${events}`,
      approveHooks: (terms) => `откройте ${terms.product} и одобрите хуки командой /hooks`,
      unreadable: (reason) => `доверие не проверить: ${reason}`,
      repairConfig: `исправьте файл из сообщения выше и запустите ${CLI_COMMAND} doctor`,
    },
    files: {
      upToDate: "файлы агента актуальны",
      versionsDiffer: ({ file, configVersion, cliVersion }) =>
        `в ${file} harness ${configVersion}, а этот CLI ${cliVersion}: файлы агента не сравнить`,
      matchVersion: (configVersion) =>
        `выполните ${CLI_COMMAND} sync или запустите ${CLI_COMMAND}@${configVersion} doctor`,
      outdated: (count) => `файлы агента устарели или лишние: ${count}`,
      sync: `выполните ${CLI_COMMAND} sync (список файлов — ${CLI_COMMAND} sync --check)`,
      writtenByHuman: (files) => `файлы агента ваши или исправлены руками: ${files}`,
      moveToRules: (rulesFile) =>
        `перенесите правки в ${rulesFile} и выполните ${CLI_COMMAND} sync --force`,
      cannotCheck: (reason) => `файлы агента не проверить: ${reason}`,
      fixCause: `устраните причину выше и выполните ${CLI_COMMAND} sync --check`,
    },
    rules: {
      passed: (file) => `${file} заполнен`,
      missing: (file) => `${file} не найден`,
      create: (terms) => `создайте его или запустите ${terms.skill("setup")} в ${terms.product}`,
      unfilled: (file) => `в ${file} остались заглушки заготовки`,
      fill: (terms) => `запустите ${terms.skill("setup")} в ${terms.product}`,
    },
    commands: {
      noneSet: (file) => `команды проверок не заданы в ${file}`,
      setUp: ({ file, terms }) =>
        `запустите ${terms.skill("setup")} в ${terms.product} или впишите команды в ${file}`,
      programsFound: (programs) =>
        `программы ${programs} найдены; команды не запускались — ${CLI_COMMAND} doctor --run-checks`,
      programsMissing: (programs) => `программы проверок не найдены: ${programs}`,
      fixPrograms: (file) =>
        `установите программы или поправьте команды в ${file}; команда, начатая со встроенной команды оболочки (cd web && …), не распознаётся: оберните её в make-цель или скрипт либо запустите ${CLI_COMMAND} doctor --run-checks`,
      allPassed: (count) => `команды проверок проходят: ${count}`,
      quoted: (command) => `«${command}»`,
      exited: ({ command, code }) => `«${command}» (код выхода ${code})`,
      notStarted: ({ command, reason }) => `«${command}» (не запустилась: ${reason})`,
      failed: (commands) => `команды проверок не прошли: ${commands}`,
      runYourself: (commands) => `запустите ${commands} сами и посмотрите ошибку`,
    },
    gitignore: {
      passed: (entry) => `.gitignore игнорирует ${entry}`,
      nothingToIgnore: "журнал вне проекта: игнорировать нечего",
      missing: (entry) =>
        `в .gitignore нет строки ${entry}: сырые журналы сессий могут попасть в коммит`,
      add: ({ entry, file }) => `допишите строку ${entry} в ${file}`,
    },
  },
  disconnect: {
    willRemove: "Cyberzavod удалит:",
    willKeep: "Останется:",
    settingsUpdated: (file) => `хуки и запреты Cyberzavod в ${file} (остальное в файле останется)`,
    settingsRemoved: (file) => `${file} (в нём только хуки и запреты Cyberzavod)`,
    keepSource: "код проекта",
    keepJournal: (path) => `журнал: ${path} (сессии, решения, заметки)`,
    keepIgnoreEntry: (entry) =>
      `строка ${entry} в .gitignore (сырые журналы сессий не попадут в git)`,
    keepSettings: (terms) => `ваши настройки, хуки и запреты ${terms.product}`,
    untrustProject: (file) => `доверие проекту, которое выдал Cyberzavod, в ${file}`,
    untrustHooks: (file) => `одобрение хуков проекта в ${file}`,
    keepProjectTrust: (file) => `доверие проекту, которое вы выдали сами, в ${file}`,
    editedFile: (file) => `${file} (сгенерирован, но вы исправили его руками)`,
    confirm: "Продолжить? [Y/n]",
    cancelled: "Отменено: ничего не изменено.",
    needsConfirmation: `Ничего не изменено: спросить негде, терминала нет. Чтобы удалить без вопроса, запустите:\n  ${CLI_COMMAND} disconnect --yes`,
    done: ({ rulesFile, terms, agentRulesFile }) => {
      const removed = "Готово: Cyberzavod убран из проекта. Просмотрите и закоммитьте изменения.";

      if (agentRulesFile === undefined) return removed;

      return `${removed}\n${terms.product} читает ${agentRulesFile}: чтобы правила ${rulesFile} остались в ${terms.product}, создайте ${agentRulesFile} с одной строкой @${rulesFile}.`;
    },
  },
  status: {
    recordTypes: { session: "сессии", decision: "решения", note: "заметки" },
    foreman: "ведущий",
    checksNone: "не заданы",
    project: ({ id, root }) => `Проект: ${id} (${root})`,
    harness: (version) => `Harness: ${version}`,
    harnessOutdated: ({ version, cliVersion }) =>
      `Harness: ${version} (CLI — ${cliVersion}, запустите ${CLI_COMMAND} sync)`,
    workflow: (name) => `Процесс: ${name}`,
    checks: (commands) => `Проверки: ${commands}`,
    journal: ({ path, counts }) => `Журнал: ${path} — ${counts}`,
    latestRecord: ({ timestamp, type }) => `Последняя запись: ${timestamp} (${type})`,
  },
  journal: {
    recorded: (path) => `записано: ${path}`,
  },
  view: {
    preparing: (spec) =>
      `Получаю цех (${spec}): при первом запуске он скачивается, потом сеть не нужна`,
    address: (url) => `цех: ${url}`,
    stopHint: "Остановить: Ctrl+C.",
    openFailed: "не удалось открыть браузер: откройте адрес выше сами",
    requestFailed: (reason) => `не удалось ответить браузеру: ${reason}`,
  },
  login: {
    openVerification: ({ url, code }) => `Откройте ${url} и введите код ${code}`,
    waiting: "Жду подтверждения…",
    loggedIn: (login) => `вход выполнен: ${login}`,
    loggedOut: "вы вышли: токен удалён",
    wasNotLoggedIn: "входа и не было",
  },
  share: {
    sent: (id) => `запись ${id} отправлена`,
    replaced: (id) => `запись ${id} заменена`,
    link: (url) => `ссылка: ${url}`,
    galleryClosed: "галерея закрыта: запись видна только по этой ссылке",
    openGalleryHint: `открыть галерею: ${CLI_COMMAND} gallery --public`,
    removed: (id) => `запись ${id} удалена из галереи`,
    galleryRecordings: ({ count, limit }) => `Записи в галерее (${count} из ${limit}):`,
    freeUpSpace: `Освободите место командой ${CLI_COMMAND} unshare <id>`,
  },
  gallery: {
    closed: (login) => `Галерея ${login}: закрыта, записи видны только по ссылкам`,
    open: (login) => `Галерея ${login}: открыта`,
    recordings: ({ count, limit }) => `Записи: ${count} из ${limit}`,
    openHint: `Открыть галерею: ${CLI_COMMAND} gallery --public`,
    closeHint: `Закрыть галерею: ${CLI_COMMAND} gallery --private`,
    page: (url) => `Страница галереи: ${url}`,
    badge: (markdown) => `Бейдж для README: ${markdown}`,
  },
  errors: {
    missingDecisionText: "нужен текст решения",
    missingNoteText: "нужен текст заметки",
    missingRecordId: "нужен id записи",
    unknownHook: (name) => `нет хука ${name}`,
    unknownAgent: ({ agent, supported }) =>
      `неизвестный агент «${agent}» в --agent: доступны ${supported}`,
    agentDiffers: ({ configured, requested }) =>
      `проект уже подключён к агенту ${configured}, а не ${requested}: сначала выполните ${CLI_COMMAND} disconnect, затем init --agent ${requested}`,
    unsupportedAgent: ({ agent, supported }) =>
      `агент «${agent}» не поддерживается: доступны ${supported}`,
    mixedAgents: ({ agents, file }) =>
      `в ${file} указано несколько агентов (${agents}): проект ведёт один агент`,
    unknownCommand: (name) => `неизвестная команда «${name}»: все команды — ${CLI_COMMAND} --help`,
    unknownCommandWithSuggestion: ({ name, suggestion }) =>
      `неизвестная команда «${name}»: может быть, ${CLI_COMMAND} ${suggestion}? Все команды: ${CLI_COMMAND} --help`,
    languageFlagWithoutValue: "у --lang нет значения: укажите язык, например --lang ru",
    unsupportedLanguage: ({ value, supported }) =>
      `язык «${value}» не поддерживается: доступны ${supported}`,
    projectNotFound: (directory) =>
      `${directory} не в проекте Cyberzavod: сначала ${CLI_COMMAND} init`,
    viewerUnavailable: (spec) =>
      `не удалось получить пакет цеха ${spec}: при первом запуске нужна сеть, чтобы скачать его`,
    viewerBroken: (directory) => `пакет цеха неполный: в ${directory} нет index.html`,
    unexpected: (reason) => `неожиданная ошибка: ${reason}`,
    debugHint: (variable) =>
      `Проверьте подключение: ${CLI_COMMAND} doctor. Полная трасса — при запуске с ${variable}=1; сообщите о ней: https://github.com/bysavelii/cyberzavod/issues`,
    packageJsonInvalid: ({ file, reason }) =>
      `${file} — не JSON (${reason}). Ничего не изменено. Исправьте ${file} и запустите команду снова`,
    jsonNeedsPreview: `--json работает только с --check или --diff: ${CLI_COMMAND} sync --check --json`,
    initBlocked: ({ files, rulesFile }) =>
      `проект не подключён.\n\nЭти файлы уже есть, и Cyberzavod ими не управляет: ${files}\n\nНичего не изменено.\n\nКак починить: перенесите их содержимое в ${rulesFile}, удалите их и запустите снова:\n  ${CLI_COMMAND} init`,
    blankOption: (option) => `${option} пуст: укажите значение`,
    journalIsProjectRoot: (path) =>
      `--journal ${path} — это корень проекта: укажите каталог журнала, например .cyberzavod/journal`,
    absoluteJournal: (path) => `--journal — путь от корня проекта, а не абсолютный: ${path}`,
    invalidRecordId: (id) => `${id} не похож на id записи: только буквы, цифры, «_» и «-»`,
    recordMissing: ({ id, file }) => `в журнале нет записи ${id}: файла ${file} не существует`,
    recordInvalid: ({ id, reason }) => `запись ${id} не прошла проверку: ${reason}`,
    recordNotSession: ({ id, type }) =>
      `запись ${id} не прошла проверку: тип ${type}, нужна сессия`,
    galleryAccessConflict: "--public и --private вместе не работают: выберите одно",
    notLoggedIn: `нет входа: войдите командой ${CLI_COMMAND} login`,
    tokenRejected: `сервер не принял токен: войдите командой ${CLI_COMMAND} login`,
    limitReached: "в галерее уже максимум записей",
    credentialsCorrupt: (file) =>
      `файл ${file} повреждён: войдите заново командой ${CLI_COMMAND} login`,
    loginCodeExpired: `код входа истёк: запустите ${CLI_COMMAND} login заново`,
    loginDenied: "вход отклонён на странице GitHub",
    noConnection: ({ origin, reason }) => `нет связи с ${origin}: ${reason}`,
    githubUnexpectedField: (name) => `GitHub вернул неожиданный ответ: нет поля ${name}`,
    githubNoDeviceCode: "GitHub не выдал код устройства",
    githubNoToken: "GitHub не выдал токен",
    githubRejected: (reason) => `GitHub отклонил вход: ${reason}`,
    serverUnexpectedResponse: (field) =>
      `сервер вернул неожиданный ответ: нет корректного поля ${field}`,
    serverStatus: (status) => `сервер ответил ${status}`,
  },
};
