// Russian texts the adapters share.

import { CLI_COMMAND } from "../cli-command.ts";
import type { KitMessages } from "./kit-messages.ts";
import { formatUsd } from "./money.ts";

/** Shared adapter texts in Russian. */
export const ru: KitMessages = {
  stop: {
    configUnreadable: ({ file, reason }) =>
      `Конфиг ${file} не читается — проверки пропущены, агент отпущен. ${reason}`,
    gitUnavailable: (reason) =>
      `Хук остановки не запустил git — проверки пропущены, агент отпущен. ${reason}`,
    counterNotSaved: (file) =>
      `Хук остановки не смог записать счётчик попыток (${file}) — проверки красные, агент отпущен без повторов.`,
    checksFailing: ({ command, attempt, maxAttempts, output }) =>
      `${command} не проходит — закончить работу нельзя (попытка ${attempt} из ${maxAttempts}). Исправь:\n${output}\n`,
    humanCalled: (maxAttempts) =>
      `Проверки красные после ${maxAttempts} попыток исправить — агент остановлен, нужен человек.`,
    markerNotSaved: "Отметка для записи не сохранена.",
  },
  record: {
    sessionNotRecorded: (reason) => `сессия не записана: ${reason}`,
    markerNotClaimed: ({ file, reason }) => `отметка ${file} не забрана: ${reason}`,
  },
  draft: {
    configNotRead: (reason) => `конфиг проекта не прочитан: ${reason}`,
    transcriptNotRead: ({ file, reason }) => `транскрипт ${file} не прочитан: ${reason}`,
    transcriptsMissing: (count) => `транскриптов не найдено: ${count}, их токены не посчитаны`,
    transcriptCompressed: (file) =>
      `транскрипт ${file} сжат агентом и не прочитан: его токенов и текстов в черновике не будет`,
    sessionTranscriptNotRead: (reason) =>
      `транскрипт сессии не прочитан, моделей промптов и реплик сессии не будет: ${reason}`,
    stationTranscriptsMissing: (count) =>
      `транскриптов станций не найдено: ${count}, их отчётов и токенов этих запусков не будет`,
    intervention: ({ reason, text }) => `вмешательство (${reason}): ${text}`,
    editNotCarried: (title) => `редактура «${title}» не перенесена: такого события в журнале нет`,
    assignmentNotFound: "задание не найдено",
    draftFile: (file) => `черновик: ${file}`,
    counts: ({ prompts, messages, interventions }) =>
      `промптов: ${prompts}, реплик: ${messages}, вмешательств: ${interventions}`,
    build: ({ id, project, harness, workflow, runs, events }) =>
      `сборка ${id}: проект ${project}, harness ${harness}, процесс ${workflow}, ` +
      `запусков: ${runs}, событий: ${events}`,
    unfilledHeader: ({ buildId, fields }) => `не заполнено: сборка ${buildId}: ${fields}`,
    projectWithoutBuild: (project) =>
      `команды проекта ${project} без сборки: достанутся сборке по времени`,
    directoryOutsideProject: (directory) =>
      `каталог ${directory} не принадлежит проекту Cyberzavod: его этапы и проверки не попали в черновик`,
    waiting: (count) => `ждут редактуры: ${count}`,
    unassignedRuns: (count) => `запуски станций без сборки (достанутся первой): ${count}`,
    unassignedRun: ({ agent, run, clock, line }) => `${agent} ${run} ${clock}: ${line}`,
    orphanedRun: (run) => `запуск ${run} указан в сборке, но в журнале его нет`,
    reroutedMessage: ({ line, from, to }) =>
      `у реплики «${line}» поменялся маршрут: ${from} → ${to}, перечитайте строку`,
  },
  publish: {
    published: (file) => `опубликовано: ${file}`,
    notReady: ({ file, problems }) => `${file} не готов к публикации:\n${problems}`,
    buildProblem: ({ buildId, reason }) => `сборка ${buildId}: ${reason}`,
    cost: ({ usd, pricesAsOf }) =>
      `стоимость по ценам API: ${formatUsd(usd)} (цены на ${pricesAsOf})`,
    costUnknown: (reason) => {
      switch (reason.type) {
        case "no_usage":
          return "стоимость неизвестна: в записи нет расхода токенов";
        case "no_breakdown":
          return "стоимость неизвестна: токены не разбиты по видам";
        case "no_model":
          return "стоимость неизвестна: не записано, какая модель потратила токены";
        case "unpriced_model":
          return `стоимость неизвестна: нет цены модели ${reason.model}`;
      }
    },
  },
  errors: {
    fileConflicts: (files) =>
      `ничего не изменено: эти файлы ваши (написаны не генератором или исправлены руками после генерации): ${files}. Перенесите правки в AGENTS.md и удалите файлы или перезапишите их командой ${CLI_COMMAND} sync --force`,
    settingsNotObject: (file) => `${file} не разобран: настройки должны быть объектом`,
    settingsNotParsed: ({ file, reason }) => `${file} не разобран: ${reason}`,
    manifestNotParsed: ({ file, reason }) =>
      `${file} не разобран: ${reason}. Верните его из git или удалите и запустите ${CLI_COMMAND} sync`,
    unknownPlaceholder: (placeholder) => `в шаблоне неизвестная подстановка ${placeholder}`,
    projectNotFound: (directory) =>
      `${directory} не в проекте Cyberzavod: сначала ${CLI_COMMAND} init`,
    noDrafts: `черновиков ещё нет: сначала ${CLI_COMMAND} draft`,
    noRawLogs: (directory) => `журналов сессий ещё нет: хуки пишут их в ${directory}`,
    earlierDraftNotParsed: (file) =>
      `прошлый черновик ${file} не разобран — исправьте или удалите его`,
    noBuild: (buildId) => `в черновике нет сборки ${buildId}`,
    buildHasNoEvents: (buildId) => `в сборке ${buildId} нет событий`,
    leaksFound: ({ buildId, leaks }) =>
      `в тексте для публикации сборки ${buildId} есть то, что нельзя показывать: ${leaks}`,
    leakIn: ({ kind, text }) => `${kind} в «${text}»`,
  },
  leakKinds: {
    "ip-address": "IP-адрес",
    "ipv6-address": "IPv6-адрес",
    email: "почта или адрес вида user@host",
    "server-login": "вход на сервер",
    token: "токен",
    "url-password": "пароль в адресе",
    "private-key": "закрытый ключ",
    "user-path": "путь с именем пользователя",
  },
  headerFields: {
    title: "заголовок",
    language: "язык",
    project: "проект",
    harness: "версия harness",
    workflow: "процесс",
  },
};
