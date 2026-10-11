import type { Translated } from "./locale.ts";

/**
 * Interface dictionary: groups by place on the page, each with a label in every language. A
 * language missing from any entry does not compile. Text with parameters is a function in each
 * language; plural forms are `PluralWords`. Page content (guides, project cards, recordings) is
 * not part of it.
 */
export const UI_TEXT = {
  /** Sidebar menu. */
  menu: {
    label: { en: "Menu", ru: "Меню" },
    home: {
      en: (name: string) => `${name} — floor`,
      ru: (name: string) => `${name} — цех`,
    },
    floor: { en: "Floor", ru: "Цех" },
    records: { en: "Builds", ru: "Записи" },
    journal: { en: "Log", ru: "Журнал" },
    project: { en: "Project", ru: "Проект" },
    guides: { en: "Guides", ru: "Гайды" },
    about: { en: "About", ru: "О заводе" },
    code: { en: "Code", ru: "Код" },
    // The tile's visible label is the language code ("RU"); it is part of the accessible name
    // (WCAG 2.5.3).
    language: {
      en: (code: string, name: string) => `${code} — ${name}`,
      ru: (code: string, name: string) => `${code} — ${name}`,
    },
  },
  /** Titles and buttons of the slide-out panels. */
  panels: {
    records: { en: "Build recordings", ru: "Записи сборок" },
    journal: { en: "Build log", ru: "Журнал сборки" },
    guides: { en: "Guides", ru: "Гайды" },
    about: { en: "About", ru: "О заводе" },
    close: { en: "Close", ru: "Закрыть" },
  },
  /** Factory floor HUD: build counters. */
  hud: {
    label: { en: "Build", ru: "Сборка" },
    time: { en: "Time", ru: "Время" },
    tokens: { en: "Tokens", ru: "Токены" },
    prompts: { en: "Prompts", ru: "Промпты" },
    reworks: { en: "Reworks", ru: "Возвраты" },
    interventions: { en: "Interventions", ru: "Вмешательства" },
  },
  /** Playback controls. */
  playback: {
    play: { en: "Play", ru: "Смотреть" },
    pause: { en: "Pause", ru: "Пауза" },
    scrubber: { en: "Build moment", ru: "Момент сборки" },
    elapsed: { en: "Time since build start", ru: "Время от начала сборки" },
    length: { en: "Build length", ru: "Длина сборки" },
    speed: { en: "Speed", ru: "Скорость" },
    speedLabel: { en: "Playback speed", ru: "Скорость проигрывания" },
  },
  /** Speech bubbles and the speech shelf: labels and expanding. */
  speech: {
    more: { en: "more", ru: "подробнее" },
    less: { en: "less", ru: "свернуть" },
    human: { en: "human", ru: "человек" },
    agent: { en: "agent", ru: "агент" },
    humanTo: {
      en: (recipient: string) => `human → ${recipient}`,
      ru: (recipient: string) => `человек → ${recipient}`,
    },
  },
  /** Build journal. */
  journal: {
    timelineHeading: { en: "Build log", ru: "Ход сборки" },
    empty: {
      en: "This build has no prompts, interventions or messages.",
      ru: "В этой сборке нет промптов, вмешательств и реплик.",
    },
    showOnFloor: { en: "show on floor", ru: "показать в цехе" },
    showOnFloorLabel: {
      en: (clock: string, route: string) => `Show on floor: ${clock}, ${route}`,
      ru: (clock: string, route: string) => `Показать в цехе: ${clock}, ${route}`,
    },
  },
  /** Lists of recordings and guides. */
  lists: {
    noRecordings: { en: "No builds yet.", ru: "Записей пока нет." },
    noGuides: { en: "No guides yet.", ru: "Гайдов пока нет." },
    otherBuilds: {
      en: "Below are the projects the floor built from scratch. Analytics shows where the process stalls across their builds.",
      ru: "Ниже — проекты, которые цех собрал с нуля. Аналитика показывает, где процесс буксует в их сборках.",
    },
    tokens: {
      en: { one: "token", other: "tokens" },
      ru: { one: "токен", few: "токена", many: "токенов" },
    },
    prompts: {
      en: { one: "prompt", other: "prompts" },
      ru: { one: "промпт", few: "промпта", many: "промптов" },
    },
    builds: {
      en: { one: "build", other: "builds" },
      ru: { one: "сборка", few: "сборки", many: "сборок" },
    },
  },
  /** Project card. */
  project: {
    repo: { en: "Repository", ru: "Репозиторий" },
    website: { en: "Website", ru: "Сайт" },
  },
  /** Page titles and texts. */
  pages: {
    floor: { en: "Floor", ru: "Цех" },
    homeHeading: {
      en: (name: string) => `${name} — a floor of AI agents`,
      ru: (name: string) => `${name} — цех ИИ-агентов`,
    },
    noBuilds: { en: "No builds yet.", ru: "Сборок пока нет." },
    projectTitle: {
      en: (name: string) => `Project “${name}”`,
      ru: (name: string) => `Проект «${name}»`,
    },
    sharedRecordingTitle: { en: "Recording from a gallery", ru: "Запись из галереи" },
    sharedRecordingDescription: {
      en: "A build recording shared from the Cyberzavod CLI: the floor of AI agents plays it back.",
      ru: "Запись сборки, опубликованная из CLI Киберзавода: её проигрывает цех ИИ-агентов.",
    },
    galleriesTitle: { en: "Galleries", ru: "Галереи" },
    galleriesDescription: {
      en: "A Cyberzavod user's gallery: build recordings of their projects on the floor of AI agents, opened by the author's link.",
      ru: "Галерея пользователя Киберзавода: записи сборок его проектов в цехе ИИ-агентов, открывается по ссылке автора.",
    },
    statsTitle: { en: "Analytics", ru: "Аналитика" },
    cabinetTitle: { en: "Your account", ru: "Личный кабинет" },
    cabinetDescription: {
      en: "Your Cyberzavod gallery: open or close it, see your build recordings and remove the ones you no longer need.",
      ru: "Ваша галерея Киберзавода: открыть или закрыть её, посмотреть записи сборок и удалить лишние.",
    },
    statsDescription: {
      en: "Where the process stalls: reworks by stage, human interventions, tokens and build outcomes of the projects the floor built from scratch.",
      ru: "Где процесс буксует: возвраты по этапам, вмешательства человека, токены и исходы сборок проектов, которые цех собрал с нуля.",
    },
    recordingDescription: {
      en: (title: string) =>
        `How AI agents built “${title}”: the human's prompts, the foreman's and stations' messages, time and tokens.`,
      ru: (title: string) =>
        `Как ИИ-агенты собирали «${title}»: промпты человека, реплики мастера и станций, время и токены.`,
    },
    comparisonTitle: {
      en: (title: string) => `Comparison: “${title}”`,
      ru: (title: string) => `Сравнение: «${title}»`,
    },
    comparisonDescription: {
      en: (title: string) =>
        `One task, one process, different models: “${title}” — models by stage, reworks, tokens, time and outcome side by side.`,
      ru: (title: string) =>
        `Одна задача, один процесс, разные модели: «${title}» — модели по этапам, возвраты, токены, время и итог рядом.`,
    },
  },
  /** Duration units: "1 h 05 min", «1 ч 05 мин». */
  duration: {
    hour: { en: "h", ru: "ч" },
    minute: { en: "min", ru: "мин" },
    second: { en: "s", ru: "с" },
  },
  /** What Cyberzavod is: a short note above the floor on the home page. */
  intro: {
    product: {
      en: "Cyberzavod gives AI coding agents a repeatable development process.",
      ru: "Киберзавод даёт ИИ-агентам для кода повторяемый процесс разработки.",
    },
    floor: {
      en: "The floor below replays real builds that went through it.",
      ru: "Цех ниже проигрывает настоящие сборки, прошедшие через него.",
    },
    stagesLabel: { en: "Workflow stages", ru: "Этапы процесса" },
    gettingStarted: { en: "Get started in 3 minutes", ru: "Начать за 3 минуты" },
    close: { en: "Hide the introduction", ru: "Скрыть описание" },
  },
  /** The "not found" page. */
  notFound: {
    title: { en: "Page not found", ru: "Страница не найдена" },
    label: { en: "404", ru: "404" },
    heading: { en: "There is no such machine on this floor", ru: "Такого станка в цехе нет" },
    text: {
      en: "The page may have moved or the address has a typo. The floor is still running — head back to it.",
      ru: "Возможно, страница переехала или в адресе опечатка. Цех работает как прежде — возвращайтесь в него.",
    },
    toFloor: { en: "Back to the floor", ru: "Вернуться в цех" },
  },
  /** Build recording: it is not translated, and its original language is labeled. */
  recording: {
    language: {
      en: (language: string) => `recorded in ${language}`,
      ru: (language: string) => `язык записи: ${language}`,
    },
  },
  /** Gallery recording by secret link: why it cannot be shown yet. */
  sharedRecording: {
    loading: { en: "Loading the recording…", ru: "Загружаем запись…" },
    missing: {
      en: "There is no such recording: the link has a typo or the author has removed it.",
      ru: "Такой записи нет: в ссылке опечатка или автор её убрал.",
    },
    broken: {
      en: "The recording did not pass the check — this floor cannot play it.",
      ru: "Запись не прошла проверку — этот цех не может её проиграть.",
    },
    failed: {
      en: "Could not load the recording — try reloading the page.",
      ru: "Не удалось загрузить запись — попробуйте обновить страницу.",
    },
    report: { en: "Report this recording", ru: "Пожаловаться на запись" },
    // A gallery recording has no project card: the author and project id, like a GitHub repository.
    project: {
      en: (owner: string, project: string) => `${owner} / ${project}`,
      ru: (owner: string, project: string) => `${owner} / ${project}`,
    },
  },
  /** API data on the gallery page: why it cannot be shown yet. */
  remote: {
    loading: { en: "Loading…", ru: "Загружаем…" },
    broken: {
      en: "The server's answer did not pass the check.",
      ru: "Ответ сервера не прошёл проверку.",
    },
    failed: {
      en: "Could not load the data — try reloading the page.",
      ru: "Не удалось загрузить данные — попробуйте обновить страницу.",
    },
  },
  /** Galleries: the page without a link to an author, and an author's gallery with a badge. */
  gallery: {
    intro: {
      en: "A gallery opens by its author's link — for example, from the badge in their project's README. There is no shared list of galleries.",
      ru: "Галерея открывается по ссылке автора — например, с бейджа в README его проекта. Общего списка галерей нет.",
    },
    authorHeading: {
      en: (login: string) => `${login}'s gallery`,
      ru: (login: string) => `Галерея ${login}`,
    },
    noRecordings: { en: "No recordings in this gallery yet.", ru: "В галерее пока нет записей." },
    missing: {
      en: "This gallery is private or does not exist.",
      ru: "Эта галерея закрыта или её нет.",
    },
    report: { en: "Report this gallery", ru: "Пожаловаться на галерею" },
    badgeHeading: { en: "Badge for README", ru: "Бейдж для README" },
    badgeHint: {
      en: "Paste this line into your project's README: the badge shows the number of builds and links to this gallery.",
      ru: "Вставьте строку в README проекта: бейдж показывает число сборок и ведёт в эту галерею.",
    },
    badgeAlt: {
      en: (login: string) => `Cyberzavod badge: builds of ${login}`,
      ru: (login: string) => `Бейдж Киберзавода: сборки ${login}`,
    },
    copyLabels: {
      en: { idle: "Copy Markdown", copied: "Copied", failed: "Could not copy" },
      ru: { idle: "Копировать Markdown", copied: "Скопировано", failed: "Не удалось скопировать" },
    },
  },
  /** Sign-in with GitHub: the button in the menu and recordings panel, the failed sign-in message. */
  account: {
    signIn: { en: "Sign in with GitHub", ru: "Войти через GitHub" },
    // Menu tile label: the full one does not fit a narrow tile, so it goes in the accessible name
    // and `title`.
    signInShort: { en: "Sign in", ru: "Войти" },
    // The visible label is the login; it is part of the accessible name (WCAG 2.5.3).
    cabinetLabel: {
      en: (login: string) => `${login} — your account`,
      ru: (login: string) => `${login} — личный кабинет`,
    },
    ownGallery: {
      en: "Your own gallery is managed in your account on the site.",
      ru: "Своей галереей управляют в личном кабинете на сайте.",
    },
    signInFailed: {
      en: "Could not sign in with GitHub — please try again.",
      ru: "Не удалось войти через GitHub, попробуйте ещё раз.",
    },
  },
  /** Account page: your own gallery, recordings and a CLI hint. */
  cabinet: {
    heading: { en: "Your account", ru: "Личный кабинет" },
    guestIntro: {
      en: "Sign in with GitHub to manage your gallery: open or close it, see your recordings and remove the ones you no longer need.",
      ru: "Войдите через GitHub, чтобы управлять своей галереей: открыть или закрыть её, посмотреть записи и удалить лишние.",
    },
    signOut: { en: "Sign out", ru: "Выйти" },
    galleryHeading: { en: "Gallery", ru: "Галерея" },
    visibilityLabel: { en: "Gallery visibility", ru: "Видимость галереи" },
    private: { en: "Private", ru: "Закрыта" },
    public: { en: "Public", ru: "Открыта" },
    privateHint: {
      en: "Only those who have a link can see your recordings.",
      ru: "Записи видят только те, у кого есть ссылка.",
    },
    publicHint: {
      en: "The gallery has its own page: anyone with its link can see it, for example from the README badge.",
      ru: "У галереи есть своя страница: её видит любой, у кого есть ссылка, например с бейджа в README.",
    },
    galleryPage: { en: "Gallery page", ru: "Страница галереи" },
    recordingsHeading: { en: "Recordings", ru: "Записи" },
    usage: {
      en: (count: number, limit: number) => `${count} of ${limit}`,
      ru: (count: number, limit: number) => `${count} из ${limit}`,
    },
    noRecordings: { en: "No recordings in your gallery yet.", ru: "В галерее пока нет записей." },
    delete: { en: "Delete", ru: "Удалить" },
    deleteLabel: {
      en: (title: string) => `Delete “${title}”`,
      ru: (title: string) => `Удалить «${title}»`,
    },
    deleteQuestion: {
      en: "Delete this recording? Its link will stop working.",
      ru: "Удалить запись? Ссылка на неё перестанет работать.",
    },
    cancel: { en: "Cancel", ru: "Отмена" },
    changeFailed: {
      en: "Could not save the change — please try again.",
      ru: "Не удалось сохранить изменение, попробуйте ещё раз.",
    },
    cliHeading: { en: "Recordings from your project", ru: "Записи из проекта" },
    shareHint: {
      en: "Recordings are uploaded from the project with this command; id is the file name in sessions/ of the journal:",
      ru: "Записи загружаются из проекта командой; id — имя файла в sessions/ журнала:",
    },
    loginHint: {
      en: "Before that, sign in to the CLI:",
      ru: "Перед этим войдите в CLI:",
    },
  },
  /** Analytics on the site's build recordings. */
  stats: {
    heading: { en: "Build analytics", ru: "Аналитика сборок" },
    intro: {
      en: "Builds of the projects the floor built from scratch: where the process stalls, how many tokens it takes and when a human is called.",
      ru: "Сборки проектов, которые цех собрал с нуля: где процесс буксует, сколько уходит токенов и когда зовут человека.",
    },
    empty: {
      en: "No builds yet — nothing to count.",
      ru: "Сборок пока нет — считать нечего.",
    },
    builds: { en: "Builds", ru: "Сборки" },
    projects: { en: "Projects", ru: "Проекты" },
    averageCost: { en: "Average build cost", ru: "Средняя стоимость сборки" },
    // "по 3 из 7 сборок": `builds` is the count with its word in the genitive (`coveredBuilds`).
    costCoverage: {
      en: (withCost: string, builds: string) => `over ${withCost} of ${builds}`,
      ru: (withCost: string, builds: string) => `по ${withCost} из ${builds}`,
    },
    coveredBuilds: {
      en: { one: "build", other: "builds" },
      ru: { one: "сборки", few: "сборок", many: "сборок" },
    },
    returnsHeading: { en: "Reworks by stage", ru: "Возвраты по этапам" },
    interventionsHeading: { en: "Interventions by reason", ru: "Вмешательства по причинам" },
    outcomesHeading: { en: "Build outcomes", ru: "Исходы сборок" },
    succeeded: { en: "succeeded", ru: "успешно" },
    failed: { en: "failed", ru: "с ошибкой" },
    none: { en: "None so far.", ru: "Пока не было." },
  },
  /** The "Project" panel: project build totals and the builds themselves in task order. */
  projectPanel: {
    totalsHeading: { en: "Totals", ru: "Итоги" },
    buildsHeading: { en: "Builds in task order", ru: "Сборки по порядку задач" },
    builds: { en: "Builds", ru: "Сборки" },
    duration: { en: "Total time", ru: "Общее время" },
    durationPerBuild: { en: "Per build on average", ru: "В среднем на сборку" },
    tokens: { en: "Total tokens", ru: "Токены всего" },
    reworks: { en: "Reworks", ru: "Возвраты" },
    human: { en: "Human input", ru: "Участие человека" },
    interventions: {
      en: { one: "intervention", other: "interventions" },
      ru: { one: "вмешательство", few: "вмешательства", many: "вмешательств" },
    },
  },
  /**
   * What the process caught: the reworks on the recording page, and the share of builds that passed
   * on the first try in the project totals and on the analytics page.
   */
  reworks: {
    caughtHeading: { en: "What the process caught", ru: "Что поймал процесс" },
    firstTry: {
      en: "No stage sent the work back: the task passed on the first try.",
      ru: "Ни один этап не вернул работу: задача прошла с первого раза.",
    },
    label: {
      en: (stage: string) => `rework · ${stage}`,
      ru: (stage: string) => `возврат · ${stage}`,
    },
    firstPass: { en: "First try", ru: "С первого раза" },
    firstPassOf: {
      en: (clean: number, builds: number) => `${clean} of ${builds}`,
      ru: (clean: number, builds: number) => `${clean} из ${builds}`,
    },
  },
  /**
   * Cost of a recording in dollars at API prices: the block on the recording page and the amounts
   * everywhere. A subscription is billed differently, so the texts do not say the human paid it.
   */
  cost: {
    heading: { en: "Cost", ru: "Стоимость" },
    total: { en: "Total", ru: "Итого" },
    beforeStages: { en: "Before the first stage", ru: "До первого этапа" },
    note: {
      en: (date: string) => `At API prices as of ${date}; a subscription is billed differently.`,
      ru: (date: string) => `По ценам API на ${date}; подписка оплачивается иначе.`,
    },
    underCent: {
      en: (amount: string) => `< ${amount}`,
      ru: (amount: string) => `< ${amount}`,
    },
  },
  /** Comparison of runs of one task: the page and the link to it from a recording. */
  comparison: {
    heading: { en: "One task, different models", ru: "Одна задача, разные модели" },
    intro: {
      en: "The same task went through the same process; only the agent and the models changed.",
      ru: "Одна и та же задача прошла один и тот же процесс; менялись только агент и модели.",
    },
    process: {
      en: (workflow: string, harness: string) => `process ${workflow} · harness ${harness}`,
      ru: (workflow: string, harness: string) => `процесс ${workflow} · harness ${harness}`,
    },
    agent: { en: "Agent", ru: "Агент" },
    manual: { en: "by hand", ru: "вручную" },
    stagesHeading: { en: "Models by stage", ru: "Модели по этапам" },
    unknownModel: { en: "model unknown", ru: "модель неизвестна" },
    cost: { en: "Cost", ru: "Стоимость" },
    unknownCost: { en: "unknown", ru: "неизвестна" },
    outcome: { en: "Outcome", ru: "Итог" },
    passed: { en: "checks passed", ru: "проверки прошли" },
    failed: { en: "checks failed", ru: "проверки не прошли" },
    link: { en: "Compare runs of this task", ru: "Сравнить прогоны этой задачи" },
  },
  /** Factory floor island. */
  factory: {
    canvasLabel: {
      en: (title: string) => `The floor is playing the build “${title}”`,
      ru: (title: string) => `Цех проигрывает сборку «${title}»`,
    },
    starting: { en: "The floor is starting…", ru: "Цех запускается…" },
    failed: {
      en: "The floor failed to start — try reloading the page.",
      ru: "Цех не запустился — попробуйте обновить страницу.",
    },
  },
  /** Build series on the home and project pages: the build's place in the HUD and its journal. */
  series: {
    buildOf: {
      en: (number: number, count: number) => `build ${number} of ${count}`,
      ru: (number: number, count: number) => `сборка ${number} из ${count}`,
    },
    journalLoading: { en: "Loading the build log…", ru: "Загружаем журнал сборки…" },
    journalMissing: {
      en: "The log of this build was not found — try reloading the page.",
      ru: "Журнал этой сборки не нашёлся — попробуйте обновить страницу.",
    },
    journalBroken: {
      en: "The log of this build did not pass the check.",
      ru: "Журнал этой сборки не прошёл проверку.",
    },
    journalFailed: {
      en: "Could not load the build log — try reloading the page.",
      ru: "Не удалось загрузить журнал сборки — попробуйте обновить страницу.",
    },
  },
  /** The factory floor of `cyberzavod view`: the project's own recordings and drafts. */
  viewer: {
    title: { en: "Your builds on the factory floor", ru: "Ваши сборки в цехе" },
    drafts: { en: "Drafts", ru: "Черновики" },
    recordings: { en: "Recordings", ru: "Записи" },
    draft: { en: "draft", ru: "черновик" },
    loading: { en: "Loading your recordings…", ru: "Загружаем ваши записи…" },
    empty: {
      en: "There are no recordings or drafts in this project yet.",
      ru: "В этом проекте пока нет ни записей, ни черновиков.",
    },
    broken: {
      en: "A recording did not pass the check — this floor cannot play it.",
      ru: "Запись не прошла проверку — этот цех не может её проиграть.",
    },
    failed: {
      en: "Could not read the recordings — look at the terminal where the command runs.",
      ru: "Не удалось прочитать записи — загляните в терминал, где запущена команда.",
    },
  },
  /** The copy button on code blocks: labels per state. */
  copy: {
    labels: {
      en: { idle: "Copy code", copied: "Copied", failed: "Could not copy" },
      ru: { idle: "Копировать код", copied: "Скопировано", failed: "Не удалось скопировать" },
    },
  },
  /** The "About" panel. */
  about: {
    how: {
      en: "The agent adapter (Claude Code is the first one) writes the session log, and the log becomes a record: stages, prompts, messages, time and tokens. The floor plays it back — each machine is a stage, workers hand the part over from hand to hand, and the foreman in the office hands out tasks and accepts reports.",
      ru: "Адаптер агента (первый — Claude Code) пишет журнал сессии, из него собирается запись: этапы, промпты, реплики, время и токены. Цех проигрывает её — каждый станок это этап, рабочие передают деталь из рук в руки, а мастер в своём кабинете раздаёт задания и принимает отчёты.",
    },
    code: { en: "Project code on GitHub", ru: "Код проекта на GitHub" },
    madeBy: { en: "Made by", ru: "Сделал" },
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Translated<unknown>>>>>;
