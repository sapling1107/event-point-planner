"use strict";

const STORAGE_KEY = "eventPointPlanner.activity";
const STORAGE_VERSION = 3;
const GAMES_STORAGE_KEY = "eventPointPlanner.games";
const GAMES_STORAGE_VERSION = 1;
const BACKUP_VERSION = 1;
const BACKUP_APP_NAME = "Event Point Planner";
const MAX_BACKUP_FILE_SIZE = 5 * 1024 * 1024;
const MILLISECONDS_PER_DAY = 86_400_000;

const form = document.querySelector("#activity-form");
const activityFieldset = document.querySelector("#activity-fieldset");
const activityEditorDialog = document.querySelector("#activity-editor-dialog");
const activityEditorSheet = document.querySelector(".activity-editor-sheet");
const newActivityButton = document.querySelector("#new-activity-button");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const manageGamesButton = document.querySelector("#manage-games-button");
const gamesDialog = document.querySelector("#games-dialog");
const gamesSheet = document.querySelector(".games-sheet");
const gamesStatus = document.querySelector("#games-status");
const gamesList = document.querySelector("#games-list");
const gamesListEmpty = document.querySelector("#games-list-empty");
const gamesForm = document.querySelector("#games-form");
const newGameName = document.querySelector("#new-game-name");
const newGameNameError = document.querySelector("#new-game-name-error");
const gamesCloseButton = document.querySelector("#games-close-button");
const backupDataButton = document.querySelector("#backup-data-button");
const backupDialog = document.querySelector("#backup-dialog");
const backupSheet = document.querySelector(".backup-sheet");
const backupStatus = document.querySelector("#backup-status");
const backupError = document.querySelector("#backup-error");
const exportBackupButton = document.querySelector("#export-backup-button");
const backupFileInput = document.querySelector("#backup-file-input");
const backupFileName = document.querySelector("#backup-file-name");
const backupSummary = document.querySelector("#backup-summary");
const backupSummaryTime = document.querySelector("#backup-summary-time");
const backupSummaryActivities = document.querySelector("#backup-summary-activities");
const backupSummaryGames = document.querySelector("#backup-summary-games");
const backupSummaryVersion = document.querySelector("#backup-summary-version");
const importBackupButton = document.querySelector("#import-backup-button");
const backupCloseButton = document.querySelector("#backup-close-button");
const useCustomPlanPeriod = document.querySelector("#use-custom-plan-period");
const customPlanPeriodFields = document.querySelector("#custom-plan-period-fields");
const errorSummary = document.querySelector("#error-summary");
const saveStatus = document.querySelector("#save-status");
const activityListStatus = document.querySelector("#activity-list-status");
const editorModeLabel = document.querySelector("#editor-mode-label");
const activityList = document.querySelector("#activity-list");
const activityListEmpty = document.querySelector("#activity-list-empty");
const scheduleEmpty = document.querySelector("#schedule-empty");
const scheduleTableWrap = document.querySelector("#schedule-table-wrap");
const scheduleBody = document.querySelector("#schedule-body");
const backToActivitiesButton = document.querySelector("#back-to-activities-button");
const quickProgressButton = document.querySelector("#quick-progress-button");
const quickProgressDialog = document.querySelector("#quick-progress-dialog");
const quickProgressSheet = document.querySelector(".quick-progress-sheet");
const quickProgressForm = document.querySelector("#quick-progress-form");
const quickProgressActivity = document.querySelector("#quick-progress-activity");
const quickProgressDate = document.querySelector("#quick-progress-date");
const quickCurrentPoint = document.querySelector("#quick-current-point");
const quickProgressError = document.querySelector("#quick-progress-error");
const quickProgressDateError = document.querySelector("#quick-progress-date-error");
const quickCurrentPointError = document.querySelector("#quick-current-point-error");
const quickProgressCancel = document.querySelector("#quick-progress-cancel");

const fields = {
  gameName: document.querySelector("#game-name"),
  activityName: document.querySelector("#activity-name"),
  activityStartDate: document.querySelector("#activity-start-date"),
  activityEndDate: document.querySelector("#activity-end-date"),
  planStartDate: document.querySelector("#plan-start-date"),
  planEndDate: document.querySelector("#plan-end-date"),
  targetPoint: document.querySelector("#target-point"),
  progressDate: document.querySelector("#progress-date"),
  currentPoint: document.querySelector("#current-point"),
};

const output = {
  scheduleCaption: document.querySelector("#schedule-caption"),
};

const state = {
  activities: [],
  games: [],
  selectedActivityId: null,
  editorMode: "create",
  hasSubmitted: false,
  isDirty: false,
};

let baselineDraft;
let editorReturnActivityId = null;
let gamesDialogReturnFocus = null;
let pendingBackupRecord = null;
let backupDialogReturnFocus = null;
let backupFileReadToken = 0;
let quickProgressBaseline = null;
let quickProgressDirty = false;
let quickProgressHasSubmitted = false;

const integerFormatter = new Intl.NumberFormat("zh-HK", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("zh-HK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function getLocalTodayString() {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseCalendarDate(value) {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(0);
  utcDate.setUTCHours(0, 0, 0, 0);
  utcDate.setUTCFullYear(year, month - 1, day);

  if (
    !Number.isFinite(utcDate.getTime()) ||
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.trunc(utcDate.getTime() / MILLISECONDS_PER_DAY);
}

function formatCalendarDay(dayNumber) {
  const utcDate = new Date(dayNumber * MILLISECONDS_PER_DAY);
  return [
    String(utcDate.getUTCFullYear()).padStart(4, "0"),
    String(utcDate.getUTCMonth() + 1).padStart(2, "0"),
    String(utcDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parsePoint(value, mustBePositive) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const point = Number(value);
  if (!Number.isSafeInteger(point) || (mustBePositive ? point <= 0 : point < 0)) {
    return null;
  }

  return point;
}

function createActivityId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

function isValidTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeGameName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim();
  return name && name.length <= 100 ? name : null;
}

function normalizeGamesRecord(record) {
  if (
    !record
    || typeof record !== "object"
    || record.version !== GAMES_STORAGE_VERSION
    || !Array.isArray(record.games)
  ) {
    return null;
  }

  const games = [];
  const seenNames = new Set();
  let invalidCount = 0;
  for (const value of record.games) {
    const name = normalizeGameName(value);
    if (!name) {
      invalidCount += 1;
      continue;
    }
    if (seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    games.push(name);
  }

  return { games, invalidCount };
}

function collectActivityGameNames() {
  const games = [];
  const seenNames = new Set();
  for (const activity of state.activities) {
    const name = normalizeGameName(activity.gameName);
    if (!name || seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    games.push(name);
  }
  return games;
}

function buildGamesStore(games) {
  return {
    version: GAMES_STORAGE_VERSION,
    games,
  };
}

function writeGamesStore(nextGames) {
  try {
    const serialized = JSON.stringify(buildGamesStore(nextGames));
    localStorage.setItem(GAMES_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function loadGamesStore() {
  let rawRecord;
  try {
    rawRecord = localStorage.getItem(GAMES_STORAGE_KEY);
  } catch {
    state.games = collectActivityGameNames();
    return "無法讀取手遊清單，已暫時從活動建立可選名稱";
  }

  if (rawRecord === null) {
    state.games = collectActivityGameNames();
    return writeGamesStore(state.games)
      ? ""
      : "已從活動建立手遊清單，但無法保存至本機";
  }

  let record;
  try {
    record = JSON.parse(rawRecord);
  } catch {
    state.games = collectActivityGameNames();
    return "手遊清單資料損壞，已暫時從活動建立可選名稱，原資料未被覆寫";
  }

  const normalizedStore = normalizeGamesRecord(record);
  if (!normalizedStore) {
    state.games = collectActivityGameNames();
    return "手遊清單資料不合法，已暫時從活動建立可選名稱，原資料未被覆寫";
  }

  state.games = normalizedStore.games;
  return normalizedStore.invalidCount > 0
    ? `已忽略 ${integerFormatter.format(normalizedStore.invalidCount)} 個不合法手遊名稱`
    : "";
}

function renderGameNameOptions(currentGameName = "") {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "請選擇手遊";
  placeholder.disabled = true;

  const fragment = document.createDocumentFragment();
  fragment.append(placeholder);
  for (const name of state.games) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    fragment.append(option);
  }

  if (currentGameName && !state.games.includes(currentGameName)) {
    const legacyOption = document.createElement("option");
    legacyOption.value = currentGameName;
    legacyOption.textContent = `${currentGameName}（已從清單移除）`;
    fragment.append(legacyOption);
  }

  fields.gameName.replaceChildren(fragment);
  fields.gameName.value = currentGameName;
}

function createEmptyDraft() {
  return {
    gameName: "",
    activityName: "",
    activityStartDate: "",
    activityEndDate: "",
    useCustomPlanPeriod: false,
    planStartDate: "",
    planEndDate: "",
    targetPointText: "",
    progressDate: getLocalTodayString(),
    currentPointText: "0",
  };
}

function activityToDraft(activity) {
  return {
    gameName: activity.gameName,
    activityName: activity.activityName,
    activityStartDate: activity.activityStartDate,
    activityEndDate: activity.activityEndDate,
    useCustomPlanPeriod: activity.useCustomPlanPeriod,
    planStartDate: activity.planStartDate,
    planEndDate: activity.planEndDate,
    targetPointText: String(activity.targetPoint),
    progressDate: activity.progressDate,
    currentPointText: String(activity.currentPoint),
  };
}

function readInput() {
  return {
    gameName: fields.gameName.value,
    activityName: fields.activityName.value,
    activityStartDate: fields.activityStartDate.value,
    activityEndDate: fields.activityEndDate.value,
    useCustomPlanPeriod: useCustomPlanPeriod.checked,
    planStartDate: fields.planStartDate.value,
    planEndDate: fields.planEndDate.value,
    targetPointText: fields.targetPoint.value.trim(),
    progressDate: fields.progressDate.value,
    currentPointText: fields.currentPoint.value.trim(),
  };
}

function renderCustomPlanPeriodFields() {
  const isCustom = useCustomPlanPeriod.checked;
  customPlanPeriodFields.hidden = !isCustom;
  fields.planStartDate.disabled = !isCustom;
  fields.planEndDate.disabled = !isCustom;
}

function syncPlanPeriodWithActivityPeriod() {
  fields.planStartDate.value = fields.activityStartDate.value;
  fields.planEndDate.value = fields.activityEndDate.value;
}

function setFormDraft(draft) {
  renderGameNameOptions(draft.gameName);
  fields.gameName.value = draft.gameName;
  fields.activityName.value = draft.activityName;
  fields.activityStartDate.value = draft.activityStartDate;
  fields.activityEndDate.value = draft.activityEndDate;
  useCustomPlanPeriod.checked = draft.useCustomPlanPeriod;
  fields.planStartDate.value = draft.planStartDate;
  fields.planEndDate.value = draft.planEndDate;
  renderCustomPlanPeriodFields();
  fields.targetPoint.value = draft.targetPointText;
  fields.progressDate.value = draft.progressDate;
  fields.currentPoint.value = draft.currentPointText;
  baselineDraft = { ...draft };
  state.isDirty = false;
}

function draftsAreEqual(first, second) {
  return Object.keys(first).every((key) => first[key] === second[key]);
}

function updateDirtyState() {
  if (state.editorMode === "view") {
    state.isDirty = false;
    return;
  }
  state.isDirty = !draftsAreEqual(readInput(), baselineDraft);
}

function validateInput(input, { requireGameName = true } = {}) {
  const errors = {};
  const gameName = input.gameName.trim();
  const activityName = input.activityName.trim();
  const useCustomPeriod = input.useCustomPlanPeriod === true;
  const activityStartDay = parseCalendarDate(input.activityStartDate);
  const activityEndDay = parseCalendarDate(input.activityEndDate);
  const planStartDate = useCustomPeriod ? input.planStartDate : input.activityStartDate;
  const planEndDate = useCustomPeriod ? input.planEndDate : input.activityEndDate;
  const planStartDay = parseCalendarDate(planStartDate);
  const planEndDay = parseCalendarDate(planEndDate);
  const progressDay = parseCalendarDate(input.progressDate);
  const targetPoint = parsePoint(input.targetPointText, true);
  const currentPoint = parsePoint(input.currentPointText, false);

  if (requireGameName && !gameName) {
    errors.gameName = "請選擇一款手遊。";
  }
  if (!activityName) {
    errors.activityName = "請輸入活動名稱。";
  }
  if (activityStartDay === null) {
    errors.activityStartDate = "請選擇有效的活動開始日期。";
  }
  if (activityEndDay === null) {
    errors.activityEndDate = "請選擇有效的活動結束日期。";
  } else if (activityStartDay !== null && activityEndDay < activityStartDay) {
    errors.activityEndDate = "活動結束日期不可早於活動開始日期。";
  }
  if (useCustomPeriod) {
    if (planStartDay === null) {
      errors.planStartDate = "請選擇有效的開始刷取日期。";
    } else if (activityStartDay !== null && planStartDay < activityStartDay) {
      errors.planStartDate = "開始刷取日期不可早於活動開始日期。";
    }
    if (planEndDay === null) {
      errors.planEndDate = "請選擇有效的希望完成日期。";
    } else if (planStartDay !== null && planEndDay < planStartDay) {
      errors.planEndDate = "希望完成日期不可早於開始刷取日期。";
    } else if (activityEndDay !== null && planEndDay > activityEndDay) {
      errors.planEndDate = "希望完成日期不可晚於活動結束日期。";
    }
  }
  if (targetPoint === null) {
    errors.targetPoint = "請輸入大於 0 的整數，且不可使用小數或科學記號。";
  }
  if (progressDay === null) {
    errors.progressDate = "請選擇有效的進度截至日期。";
  } else if (activityEndDay !== null && progressDay > activityEndDay) {
    errors.progressDate = "進度截至日期不可晚於活動結束日期。";
  }
  if (currentPoint === null) {
    errors.currentPoint = "請輸入 0 或正整數，且不可使用小數或科學記號。";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: {
      gameName,
      activityName,
      activityStartDate: input.activityStartDate,
      activityEndDate: input.activityEndDate,
      useCustomPlanPeriod: useCustomPeriod,
      planStartDate,
      planEndDate,
      targetPoint,
      progressDate: input.progressDate,
      currentPoint,
      activityStartDay,
      activityEndDay,
      planStartDay,
      planEndDay,
      progressDay,
    },
  };
}

function clearValidation() {
  for (const field of Object.values(fields)) {
    field.setAttribute("aria-invalid", "false");
    field.setAttribute("aria-describedby", `${field.id}-error`);
    document.querySelector(`#${field.id}-error`).textContent = "";
  }
  errorSummary.hidden = true;
  errorSummary.textContent = "";
}

function showValidation(validation, focusSummary = false) {
  for (const [name, field] of Object.entries(fields)) {
    const message = validation.errors[name] || "";
    field.setAttribute("aria-invalid", message ? "true" : "false");
    field.setAttribute("aria-describedby", `${field.id}-error`);
    document.querySelector(`#${field.id}-error`).textContent = message;
  }

  const messages = Object.values(validation.errors);
  errorSummary.hidden = messages.length === 0;
  errorSummary.textContent = messages.length
    ? `請修正 ${messages.length} 項資料：${messages.join(" ")}`
    : "";

  if (messages.length && focusSummary) {
    errorSummary.focus();
  }
}

function buildSchedule(data) {
  const totalDays = data.planEndDay - data.planStartDay + 1;
  const basePoint = Math.floor(data.targetPoint / totalDays);
  const remainder = data.targetPoint % totalDays;
  const schedule = [];
  let cumulative = 0;
  let remainderAccumulator = 0;

  for (let index = 0; index < totalDays; index += 1) {
    let dailyPoint = basePoint;
    remainderAccumulator += remainder;

    if (remainderAccumulator >= totalDays) {
      dailyPoint += 1;
      remainderAccumulator -= totalDays;
    }

    cumulative += dailyPoint;
    schedule.push({
      dayNumber: data.planStartDay + index,
      dayIndex: index + 1,
      dailyPoint,
      cumulative,
    });
  }

  return schedule;
}

function calculatePlan(data) {
  const schedule = buildSchedule(data);
  const totalDays = schedule.length;
  const isPlanOverdue = data.progressDay > data.planEndDay;
  const remainingDays = data.progressDay < data.planStartDay
    ? totalDays
    : isPlanOverdue ? 0 : data.planEndDay - data.progressDay;
  const outstandingPoint = Math.max(data.targetPoint - data.currentPoint, 0);
  const dailyMinimum = remainingDays > 0
    ? Math.ceil(outstandingPoint / remainingDays)
    : outstandingPoint === 0 ? 0 : null;
  const progressPercent = (data.currentPoint / data.targetPoint) * 100;

  let plannedCumulative = null;
  let difference = null;
  if (isPlanOverdue) {
    plannedCumulative = data.targetPoint;
    difference = data.currentPoint - data.targetPoint;
  } else if (data.progressDay >= data.planStartDay) {
    const planIndex = data.progressDay - data.planStartDay;
    plannedCumulative = schedule[planIndex].cumulative;
    difference = data.currentPoint - plannedCumulative;
  }

  return {
    schedule,
    totalDays,
    remainingDays,
    outstandingPoint,
    dailyMinimum,
    progressPercent,
    plannedCumulative,
    difference,
    isPlanOverdue,
  };
}

function renderSchedule(data, plan) {
  const fragment = document.createDocumentFragment();
  const hasFixedDailyPoint = plan.schedule.every((row) => (
    row.dailyPoint === plan.schedule[0].dailyPoint
  ));
  scheduleBody.replaceChildren();

  for (const row of plan.schedule) {
    const tableRow = document.createElement("tr");
    const dateCell = document.createElement("td");
    const cumulativeCell = document.createElement("td");
    const dateString = formatCalendarDay(row.dayNumber);

    dateCell.textContent = `${integerFormatter.format(row.dayIndex)}　${dateString}`;
    dateCell.className = "schedule-date-cell";
    cumulativeCell.className = "numeric schedule-cumulative-cell";
    appendTextElement(cumulativeCell, "schedule-mobile-label", "累計");
    appendTextElement(cumulativeCell, "schedule-point-value", integerFormatter.format(row.cumulative));

    if (row.dayNumber === data.progressDay) {
      tableRow.className = "progress-date-row";
      tableRow.setAttribute("aria-current", "date");
      const marker = document.createElement("span");
      marker.className = "date-marker";
      marker.textContent = "進度日";
      dateCell.append(marker);
    }

    tableRow.append(dateCell);
    tableRow.append(cumulativeCell);
    fragment.append(tableRow);
  }

  scheduleBody.append(fragment);
  scheduleEmpty.hidden = true;
  scheduleTableWrap.hidden = false;
  output.scheduleCaption.textContent = hasFixedDailyPoint
    ? `每日固定 ${integerFormatter.format(plan.schedule[0].dailyPoint)} Point`
    : `每日分配 ${integerFormatter.format(Math.floor(data.targetPoint / plan.totalDays))}～${integerFormatter.format(Math.ceil(data.targetPoint / plan.totalDays))} Point`;
}

function renderEmpty() {
  scheduleEmpty.hidden = false;
  scheduleTableWrap.hidden = true;
  scheduleBody.replaceChildren();
  output.scheduleCaption.textContent = "";
}

function getSelectedActivity() {
  return state.activities.find((activity) => activity.id === state.selectedActivityId) || null;
}

function setActivityListStatus(message) {
  activityListStatus.textContent = message;
}

function getPreviewValidation(input, validation) {
  const selectedActivity = getSelectedActivity();
  const mayPreviewLegacyActivity = state.editorMode !== "create"
    && selectedActivity?.gameName === ""
    && input.gameName.trim() === "";

  if (!mayPreviewLegacyActivity || !validation.errors.gameName) {
    return validation;
  }

  const errors = { ...validation.errors };
  delete errors.gameName;
  return {
    ...validation,
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function updatePreview() {
  const input = readInput();
  const validation = validateInput(input);

  if (state.hasSubmitted) {
    showValidation(validation);
  } else {
    clearValidation();
  }

  const previewValidation = getPreviewValidation(input, validation);
  if (!previewValidation.isValid) {
    renderEmpty();
    return;
  }

  const plan = calculatePlan(previewValidation.data);
  renderSchedule(previewValidation.data, plan);
}

function renderEditorMode() {
  const isCreating = state.editorMode === "create";
  const isViewing = state.editorMode === "view";
  const isEditing = state.editorMode === "edit";
  activityFieldset.disabled = isViewing;
  submitButton.hidden = isViewing;
  submitButton.textContent = isEditing ? "儲存變更" : "新增活動";
  cancelEditButton.hidden = isViewing;
  cancelEditButton.textContent = isEditing ? "取消修改" : "取消新增";
  quickProgressButton.hidden = !isViewing || !state.selectedActivityId;
  document.body.classList.toggle("has-quick-progress", !quickProgressButton.hidden);
  editorModeLabel.textContent = isCreating
    ? "新增模式"
    : isViewing ? "查看模式" : "修改模式";
  editorModeLabel.className = `status-badge ${isEditing ? "status-warning" : isViewing ? "status-active" : "status-neutral"}`;
}

function appendTextElement(parent, className, text) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function formatDailyMinimum(plan) {
  return plan.dailyMinimum === null
    ? "無剩餘日"
    : `${integerFormatter.format(plan.dailyMinimum)} Point`;
}

function getPlanDifferenceDisplay(data, plan) {
  if (plan.isPlanOverdue) {
    return plan.outstandingPoint > 0
      ? {
        text: `計畫完成日已過，尚欠 ${integerFormatter.format(plan.outstandingPoint)} Point`,
        className: "text-behind",
      }
      : { text: "已達成目標", className: "text-ahead" };
  }
  if (plan.difference === null) {
    return { text: "計畫尚未開始，不比較", className: "" };
  }
  if (plan.difference > 0) {
    return {
      text: `超前 ${integerFormatter.format(plan.difference)} Point`,
      className: "text-ahead",
    };
  }
  if (plan.difference < 0) {
    return {
      text: `落後 ${integerFormatter.format(Math.abs(plan.difference))} Point`,
      className: "text-behind",
    };
  }
  return { text: "符合計畫", className: "text-ahead" };
}

function createActivityIcon(action) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("class", "activity-card-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const paths = action === "edit"
    ? ["M4 20h4L19 9l-4-4L4 16v4Z", "m13.5 6.5 4 4"]
    : ["M3 6h18", "M8 6V4h8v2", "m19 6-1 14H6L5 6", "M10 10v6", "M14 10v6"];
  for (const pathData of paths) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  return svg;
}

function createActivityActionButton(action, activityId, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `activity-card-icon-button${action === "delete" ? " activity-card-icon-button-delete" : ""}`;
  button.dataset.activityAction = action;
  button.dataset.activityId = activityId;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(createActivityIcon(action));
  return button;
}

function setGamesDialogStatus(message) {
  gamesStatus.textContent = message;
}

function clearNewGameValidation() {
  newGameName.setAttribute("aria-invalid", "false");
  newGameName.setAttribute("aria-describedby", "new-game-name-error");
  newGameNameError.textContent = "";
}

function validateNewGameName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  let error = "";
  if (!name) {
    error = "請輸入手遊名稱。";
  } else if (name.length > 100) {
    error = "手遊名稱不可超過 100 字。";
  } else if (state.games.includes(name)) {
    error = "這款手遊已存在於清單中。";
  }
  return { isValid: !error, name, error };
}

function renderGamesList() {
  gamesList.replaceChildren();
  gamesListEmpty.hidden = state.games.length > 0;
  gamesList.hidden = state.games.length === 0;

  const fragment = document.createDocumentFragment();
  for (const name of state.games) {
    const item = document.createElement("li");
    const nameOutput = document.createElement("span");
    const deleteButton = document.createElement("button");
    const label = `從手遊清單移除${name}`;
    item.className = "games-list-item";
    nameOutput.className = "games-list-name";
    nameOutput.textContent = name;
    deleteButton.type = "button";
    deleteButton.className = "games-delete-button";
    deleteButton.dataset.gameAction = "delete";
    deleteButton.dataset.gameName = name;
    deleteButton.setAttribute("aria-label", label);
    deleteButton.title = label;
    deleteButton.append(createActivityIcon("delete"));
    item.append(nameOutput, deleteButton);
    fragment.append(item);
  }
  gamesList.append(fragment);
}

function addGame(event) {
  event.preventDefault();
  const validation = validateNewGameName(newGameName.value);
  newGameName.setAttribute("aria-invalid", validation.error ? "true" : "false");
  newGameNameError.textContent = validation.error;
  if (!validation.isValid) {
    setGamesDialogStatus("");
    newGameName.focus();
    return;
  }

  const nextGames = [...state.games, validation.name];
  if (!writeGamesStore(nextGames)) {
    newGameName.setAttribute("aria-invalid", "true");
    newGameNameError.textContent = "無法儲存手遊名稱，請檢查瀏覽器本機儲存空間。";
    setGamesDialogStatus("");
    newGameName.focus();
    return;
  }

  state.games = nextGames;
  renderGamesList();
  renderGameNameOptions(fields.gameName.value);
  newGameName.value = "";
  clearNewGameValidation();
  setGamesDialogStatus(`已新增「${validation.name}」`);
  newGameName.focus();
}

function deleteGame(name) {
  if (!state.games.includes(name)) {
    return;
  }
  if (!window.confirm(`確定要從手遊清單移除「${name}」嗎？既有活動不會被刪除。`)) {
    return;
  }

  const nextGames = state.games.filter((game) => game !== name);
  if (!writeGamesStore(nextGames)) {
    setGamesDialogStatus("無法移除手遊名稱，請檢查瀏覽器本機儲存空間");
    return;
  }

  state.games = nextGames;
  renderGamesList();
  renderGameNameOptions(fields.gameName.value);
  setGamesDialogStatus(`已從清單移除「${name}」；既有活動未受影響`);
}

function hasPendingGameNameInput() {
  return newGameName.value.trim().length > 0;
}

function closeGamesDialog({ restoreFocus = true } = {}) {
  if (!gamesDialog.open) {
    return;
  }

  gamesDialog.close();
  newGameName.value = "";
  clearNewGameValidation();
  setGamesDialogStatus("");
  const returnFocus = gamesDialogReturnFocus;
  gamesDialogReturnFocus = null;
  if (restoreFocus) {
    window.requestAnimationFrame(() => returnFocus?.focus());
  }
}

function requestCloseGamesDialog({ restoreFocus = true } = {}) {
  if (!gamesDialog.open) {
    return true;
  }
  if (hasPendingGameNameInput() && !window.confirm("尚有未新增的手遊名稱，確定要捨棄嗎？")) {
    return false;
  }

  closeGamesDialog({ restoreFocus });
  return true;
}

function openGamesDialog(message = "") {
  if (gamesDialog.open) {
    setGamesDialogStatus(message);
    return true;
  }
  if (!requestCloseActivityEditorDialog({ restoreFocus: false })) {
    return false;
  }
  if (!requestCloseQuickProgressDialog({ restoreFocus: false })) {
    return false;
  }
  if (!requestCloseBackupDialog({ restoreFocus: false })) {
    return false;
  }

  gamesDialogReturnFocus = document.activeElement;
  newGameName.value = "";
  clearNewGameValidation();
  renderGamesList();
  setGamesDialogStatus(message);
  gamesDialog.showModal();
  window.requestAnimationFrame(() => newGameName.focus());
  return true;
}

function appendExpandedStat(parent, label, value, className = "") {
  const stat = document.createElement("div");
  stat.className = "activity-card-expanded-stat";
  appendTextElement(stat, "activity-card-expanded-label", label);
  appendTextElement(stat, `activity-card-expanded-value${className ? ` ${className}` : ""}`, value);
  parent.append(stat);
}

function appendActivityDetail(parent, label, value) {
  const item = document.createElement("div");
  item.className = "activity-card-detail-item";
  appendTextElement(item, "activity-card-detail-label", label);
  appendTextElement(item, "activity-card-detail-value", value);
  parent.append(item);
}

function scrollToSection(target) {
  if (!target) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

function storedActivityToCalculationData(activity) {
  const validation = validateInput(activityToDraft(activity), { requireGameName: false });
  return validation.isValid ? validation.data : null;
}

function renderActivityList() {
  activityList.replaceChildren();
  activityListEmpty.hidden = state.activities.length > 0;
  activityList.hidden = state.activities.length === 0;

  const fragment = document.createDocumentFragment();
  for (const activity of state.activities) {
    const data = storedActivityToCalculationData(activity);
    if (!data) {
      continue;
    }

    const plan = calculatePlan(data);
    const isSelected = activity.id === state.selectedActivityId;
    const card = document.createElement("article");
    const header = document.createElement("div");
    const selectButton = document.createElement("button");
    const titleGroup = document.createElement("span");
    const actions = document.createElement("div");
    const stats = document.createElement("div");
    const progressStat = document.createElement("div");
    const dailyStat = document.createElement("div");

    card.setAttribute("role", "listitem");
    card.className = `activity-card${isSelected ? " activity-card-selected" : ""}`;
    header.className = "activity-card-header";
    selectButton.type = "button";
    selectButton.className = "activity-card-select";
    selectButton.dataset.activityAction = "select";
    selectButton.dataset.activityId = activity.id;
    selectButton.setAttribute("aria-pressed", isSelected ? "true" : "false");
    selectButton.setAttribute("aria-expanded", isSelected ? "true" : "false");
    titleGroup.className = "activity-card-title";
    actions.className = "activity-card-actions";
    stats.className = "activity-card-compact-stats";

    appendTextElement(titleGroup, "activity-card-game", activity.gameName || "未設定遊戲名稱");
    appendTextElement(titleGroup, "activity-card-name", activity.activityName);
    selectButton.append(titleGroup);
    appendTextElement(selectButton, "activity-card-meta", `結束日期 ${activity.activityEndDate}`);
    actions.append(
      createActivityActionButton("edit", activity.id, "修改完整資料"),
      createActivityActionButton("delete", activity.id, "刪除此活動"),
    );
    header.append(selectButton, actions);

    appendTextElement(progressStat, "activity-card-stat-label", "目前進度");
    appendTextElement(progressStat, "activity-card-stat-value", `${percentFormatter.format(plan.progressPercent)}%`);
    appendTextElement(dailyStat, "activity-card-stat-label", "每日最低需求");
    appendTextElement(dailyStat, "activity-card-stat-value", formatDailyMinimum(plan));
    stats.append(progressStat, dailyStat);
    card.append(header, stats);

    if (isSelected) {
      const expanded = document.createElement("div");
      const detailGrid = document.createElement("div");
      const expandedStats = document.createElement("div");
      const scheduleLink = document.createElement("button");
      const difference = getPlanDifferenceDisplay(data, plan);
      expanded.className = "activity-card-expanded";
      detailGrid.className = "activity-card-detail-grid";
      expandedStats.className = "activity-card-expanded-stats";
      appendActivityDetail(
        detailGrid,
        "活動期間",
        `${activity.activityStartDate} ～ ${activity.activityEndDate}`,
      );
      if (
        activity.useCustomPlanPeriod
        && (
          activity.planStartDate !== activity.activityStartDate
          || activity.planEndDate !== activity.activityEndDate
        )
      ) {
        appendActivityDetail(detailGrid, "刷取期間", `${activity.planStartDate} ～ ${activity.planEndDate}`);
      }
      appendActivityDetail(detailGrid, "剩餘日數", `${integerFormatter.format(plan.remainingDays)} 日`);
      appendActivityDetail(detailGrid, "目前累計", `${integerFormatter.format(data.currentPoint)} Point`);
      appendActivityDetail(detailGrid, "目標 Point", integerFormatter.format(data.targetPoint));
      appendExpandedStat(expandedStats, "尚欠 Point", integerFormatter.format(plan.outstandingPoint));
      appendExpandedStat(expandedStats, "相對計畫", difference.text, difference.className);
      scheduleLink.type = "button";
      scheduleLink.className = "activity-card-schedule-link";
      scheduleLink.textContent = "查看每日計畫 ↓";
      scheduleLink.addEventListener("click", () => scrollToSection(document.querySelector("#schedule-heading")));
      expanded.append(detailGrid, expandedStats, scheduleLink);
      card.append(expanded);
    }

    fragment.append(card);
  }

  activityList.append(fragment);
}

function resetValidationState() {
  state.hasSubmitted = false;
  clearValidation();
}

function renderSelectedActivitySchedule() {
  const activity = getSelectedActivity();
  if (!activity) {
    renderEmpty();
    return;
  }

  const data = storedActivityToCalculationData(activity);
  if (!data) {
    renderEmpty();
    return;
  }

  renderSchedule(data, calculatePlan(data));
}

function enterEmptyView() {
  state.editorMode = "view";
  state.selectedActivityId = null;
  setFormDraft(createEmptyDraft());
  resetValidationState();
  renderEditorMode();
  renderActivityList();
  renderEmpty();
  saveStatus.textContent = "";
  return true;
}

function closeActivityEditorDialog() {
  if (activityEditorDialog.open) {
    activityEditorDialog.close();
  }
  state.isDirty = false;
  resetValidationState();
}

function confirmDiscardActivityEditorIfNeeded() {
  return !state.isDirty
    || window.confirm("有未儲存的修改，確定要捨棄嗎？");
}

function focusActivityAction(activityId, action = "select") {
  window.requestAnimationFrame(() => {
    const button = [...activityList.querySelectorAll(`button[data-activity-action="${action}"]`)]
      .find((item) => item.dataset.activityId === activityId);
    button?.focus();
  });
}

function cancelActivityEditor({ restoreFocus = true } = {}) {
  if (state.editorMode === "view" && !activityEditorDialog.open) {
    return;
  }

  const cancelledMode = state.editorMode;
  const returnActivityId = cancelledMode === "create"
    ? editorReturnActivityId
    : state.selectedActivityId;
  closeActivityEditorDialog();
  editorReturnActivityId = null;

  if (returnActivityId && state.activities.some((activity) => activity.id === returnActivityId)) {
    enterViewMode(returnActivityId);
    setActivityListStatus(cancelledMode === "create" ? "已取消新增活動" : "已取消修改");
    if (restoreFocus) {
      focusActivityAction(returnActivityId, cancelledMode === "edit" ? "edit" : "select");
    }
    return;
  }

  enterEmptyView();
  setActivityListStatus(cancelledMode === "create" ? "已取消新增活動" : "已取消修改");
  if (restoreFocus) {
    window.requestAnimationFrame(() => newActivityButton.focus());
  }
}

function requestCloseActivityEditorDialog({ restoreFocus = true } = {}) {
  if (!activityEditorDialog.open) {
    return true;
  }
  if (!confirmDiscardActivityEditorIfNeeded()) {
    return false;
  }

  cancelActivityEditor({ restoreFocus });
  return true;
}

function openActivityEditorDialog(mode, activityId = null) {
  if (!requestCloseActivityEditorDialog({ restoreFocus: false })) {
    return false;
  }
  if (!requestCloseQuickProgressDialog({ restoreFocus: false })) {
    return false;
  }
  if (!requestCloseGamesDialog({ restoreFocus: false })) {
    return false;
  }
  if (!requestCloseBackupDialog({ restoreFocus: false })) {
    return false;
  }

  if (mode === "edit") {
    const activity = state.activities.find((item) => item.id === activityId);
    if (!activity) {
      return false;
    }
    state.selectedActivityId = activity.id;
    editorReturnActivityId = activity.id;
    state.editorMode = "edit";
    setFormDraft(activityToDraft(activity));
    if (!writeStore(state.activities, activity.id)) {
      setActivityListStatus("已開啟修改，但無法保存選取狀態");
    } else {
      setActivityListStatus("");
    }
  } else {
    editorReturnActivityId = state.selectedActivityId;
    state.editorMode = "create";
    state.selectedActivityId = null;
    setFormDraft(createEmptyDraft());
    setActivityListStatus("");
  }

  resetValidationState();
  renderEditorMode();
  renderActivityList();
  updatePreview();
  saveStatus.textContent = "";
  activityEditorDialog.showModal();
  window.requestAnimationFrame(() => fields.gameName.focus());
  return true;
}

function enterCreateMode() {
  return openActivityEditorDialog("create");
}

function enterViewMode(activityId) {
  if (!requestCloseQuickProgressDialog({ restoreFocus: false })) {
    return false;
  }
  const activity = state.activities.find((item) => item.id === activityId);
  if (!activity) {
    return enterEmptyView();
  }

  state.editorMode = "view";
  state.selectedActivityId = activity.id;
  setFormDraft(activityToDraft(activity));
  resetValidationState();
  renderEditorMode();
  renderActivityList();
  renderSelectedActivitySchedule();
  saveStatus.textContent = "";
  return true;
}

function startEditingActivity(activityId) {
  openActivityEditorDialog("edit", activityId);
}

function readQuickProgressInput() {
  return {
    progressDate: quickProgressDate.value,
    currentPointText: quickCurrentPoint.value.trim(),
  };
}

function updateQuickProgressDirty() {
  if (!quickProgressBaseline) {
    quickProgressDirty = false;
    return;
  }

  const input = readQuickProgressInput();
  quickProgressDirty = input.progressDate !== quickProgressBaseline.progressDate
    || input.currentPointText !== quickProgressBaseline.currentPointText;
}

function clearQuickProgressValidation() {
  quickProgressDate.setAttribute("aria-invalid", "false");
  quickCurrentPoint.setAttribute("aria-invalid", "false");
  quickProgressDateError.textContent = "";
  quickCurrentPointError.textContent = "";
  quickProgressError.hidden = true;
  quickProgressError.textContent = "";
}

function validateQuickProgress(input, activity) {
  const errors = {};
  const progressDay = parseCalendarDate(input.progressDate);
  const endDay = parseCalendarDate(activity.activityEndDate);
  const currentPoint = parsePoint(input.currentPointText, false);

  if (!input.progressDate) {
    errors.progressDate = "請選擇進度截至日期。";
  } else if (progressDay === null) {
    errors.progressDate = "請選擇有效的進度截至日期。";
  } else if (endDay !== null && progressDay > endDay) {
    errors.progressDate = "進度截至日期不可晚於活動結束日期。";
  }

  if (currentPoint === null) {
    errors.currentPoint = "請輸入 0 或正整數，且不可使用負數、小數或科學記號。";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: {
      progressDate: input.progressDate,
      currentPoint,
    },
  };
}

function showQuickProgressValidation(validation, message = "") {
  quickProgressDateError.textContent = validation.errors.progressDate || "";
  quickCurrentPointError.textContent = validation.errors.currentPoint || "";
  quickProgressDate.setAttribute("aria-invalid", validation.errors.progressDate ? "true" : "false");
  quickCurrentPoint.setAttribute("aria-invalid", validation.errors.currentPoint ? "true" : "false");

  const messages = Object.values(validation.errors);
  quickProgressError.textContent = message || (messages.length
    ? `請修正 ${messages.length} 項資料：${messages.join(" ")}`
    : "");
  quickProgressError.hidden = !quickProgressError.textContent;
}

function openQuickProgressDialog() {
  const activity = getSelectedActivity();
  if (!activity || state.editorMode !== "view" || quickProgressDialog.open) {
    return;
  }
  if (!requestCloseGamesDialog({ restoreFocus: false })) {
    return;
  }
  if (!requestCloseBackupDialog({ restoreFocus: false })) {
    return;
  }

  quickProgressActivity.textContent = activity.gameName
    ? `${activity.gameName}｜${activity.activityName}`
    : `未設定遊戲名稱｜${activity.activityName}`;
  quickProgressDate.value = activity.progressDate;
  quickCurrentPoint.value = String(activity.currentPoint);
  quickProgressBaseline = readQuickProgressInput();
  quickProgressDirty = false;
  quickProgressHasSubmitted = false;
  clearQuickProgressValidation();
  quickProgressDialog.showModal();
  window.requestAnimationFrame(() => {
    quickCurrentPoint.focus();
    quickCurrentPoint.select();
  });
}

function confirmDiscardQuickProgressIfNeeded() {
  return !quickProgressDirty
    || window.confirm("有未儲存的進度修改，確定要捨棄嗎？");
}

function closeQuickProgressDialog({ restoreFocus = true } = {}) {
  if (!quickProgressDialog.open) {
    return;
  }

  quickProgressDirty = false;
  quickProgressBaseline = null;
  quickProgressHasSubmitted = false;
  quickProgressDialog.close();
  clearQuickProgressValidation();
  if (restoreFocus) {
    window.requestAnimationFrame(() => {
      if (!quickProgressButton.hidden) {
        quickProgressButton.focus();
      }
    });
  }
}

function requestCloseQuickProgressDialog({ restoreFocus = true } = {}) {
  if (!quickProgressDialog.open) {
    return true;
  }
  if (!confirmDiscardQuickProgressIfNeeded()) {
    return false;
  }

  closeQuickProgressDialog({ restoreFocus });
  return true;
}

function saveQuickProgress(event) {
  event.preventDefault();
  const activity = getSelectedActivity();
  if (!activity || state.editorMode !== "view") {
    showQuickProgressValidation({ errors: {} }, "找不到目前選取的活動。");
    return;
  }

  quickProgressHasSubmitted = true;
  const validation = validateQuickProgress(readQuickProgressInput(), activity);
  showQuickProgressValidation(validation);
  if (!validation.isValid) {
    quickProgressError.focus();
    return;
  }

  const updatedActivity = {
    ...activity,
    progressDate: validation.data.progressDate,
    currentPoint: validation.data.currentPoint,
    updatedAt: new Date().toISOString(),
  };
  const nextActivities = state.activities.map((item) => (
    item.id === updatedActivity.id ? updatedActivity : item
  ));

  if (!writeStore(nextActivities, state.selectedActivityId)) {
    showQuickProgressValidation(validation, "無法儲存進度，請檢查瀏覽器本機儲存空間。");
    quickProgressError.focus();
    return;
  }

  state.activities = nextActivities;
  quickProgressDirty = false;
  closeQuickProgressDialog({ restoreFocus: false });
  enterViewMode(updatedActivity.id);
  setActivityListStatus("已更新進度");
  window.requestAnimationFrame(() => quickProgressButton.focus());
}

function buildStore(activities, selectedActivityId) {
  return {
    version: STORAGE_VERSION,
    selectedActivityId,
    activities,
  };
}

function writeStore(activities, selectedActivityId) {
  try {
    const serialized = JSON.stringify(buildStore(activities, selectedActivityId));
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isValidIsoTimestamp(value) {
  if (typeof value !== "string" || !isValidTimestamp(value)) {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function normalizeBackupActivityStore(store) {
  if (!isPlainObject(store)) {
    return { isValid: false, error: "活動資料包含損壞、重複或不一致的項目。" };
  }
  if (store.version !== STORAGE_VERSION) {
    return { isValid: false, error: "不支援此活動資料版本。" };
  }
  if (!Array.isArray(store.activities)) {
    return { isValid: false, error: "活動資料包含損壞、重複或不一致的項目。" };
  }

  if (store.activities.length === 0) {
    if (store.selectedActivityId !== null) {
      return { isValid: false, error: "備份中的選取活動不存在。" };
    }
  } else if (
    typeof store.selectedActivityId !== "string"
    || !store.selectedActivityId
    || !store.activities.some((activity) => activity?.id === store.selectedActivityId)
  ) {
    return { isValid: false, error: "備份中的選取活動不存在。" };
  }

  const normalized = normalizeV3Store(store);
  if (
    !normalized
    || normalized.invalidCount !== 0
    || normalized.activities.length !== store.activities.length
    || normalized.selectedActivityId !== store.selectedActivityId
  ) {
    return { isValid: false, error: "活動資料包含損壞、重複或不一致的項目。" };
  }

  const activityFields = [
    "id",
    "gameName",
    "activityName",
    "activityStartDate",
    "activityEndDate",
    "useCustomPlanPeriod",
    "planStartDate",
    "planEndDate",
    "targetPoint",
    "progressDate",
    "currentPoint",
    "createdAt",
    "updatedAt",
  ];
  for (let index = 0; index < store.activities.length; index += 1) {
    const original = store.activities[index];
    const normalizedActivity = normalized.activities[index];
    if (
      !isPlainObject(original)
      || Object.keys(original).length !== activityFields.length
      || !activityFields.every((field) => (
        Object.prototype.hasOwnProperty.call(original, field)
        && Object.is(original[field], normalizedActivity[field])
      ))
    ) {
      return { isValid: false, error: "活動資料包含損壞、重複或不一致的項目。" };
    }
  }

  return {
    isValid: true,
    store: buildStore(normalized.activities, normalized.selectedActivityId),
  };
}

function normalizeBackupGamesStore(store) {
  if (!isPlainObject(store)) {
    return { isValid: false, error: "手遊清單包含不合法、重複或未正規化的名稱。" };
  }
  if (store.version !== GAMES_STORAGE_VERSION) {
    return { isValid: false, error: "不支援此手遊清單版本。" };
  }
  if (!Array.isArray(store.games)) {
    return { isValid: false, error: "手遊清單包含不合法、重複或未正規化的名稱。" };
  }

  const normalized = normalizeGamesRecord(store);
  if (
    !normalized
    || normalized.invalidCount !== 0
    || normalized.games.length !== store.games.length
    || !store.games.every((name, index) => (
      typeof name === "string"
      && name === name.trim()
      && name.length > 0
      && name.length <= 100
      && name === normalized.games[index]
    ))
  ) {
    return { isValid: false, error: "手遊清單包含不合法、重複或未正規化的名稱。" };
  }

  return { isValid: true, store: buildGamesStore(normalized.games) };
}

function validateBackupRecord(record) {
  if (!isPlainObject(record) || record.app !== BACKUP_APP_NAME) {
    return { isValid: false, error: "這不是 Event Point Planner 備份。" };
  }
  if (record.backupVersion !== BACKUP_VERSION) {
    return { isValid: false, error: "不支援此備份版本。" };
  }
  if (!isValidIsoTimestamp(record.exportedAt)) {
    return { isValid: false, error: "備份時間格式不合法。" };
  }
  if (!Object.prototype.hasOwnProperty.call(record, "activityStore")) {
    return { isValid: false, error: "備份缺少活動資料。" };
  }
  if (!Object.prototype.hasOwnProperty.call(record, "gamesStore")) {
    return { isValid: false, error: "備份缺少手遊清單。" };
  }

  const activityResult = normalizeBackupActivityStore(record.activityStore);
  if (!activityResult.isValid) {
    return activityResult;
  }
  const gamesResult = normalizeBackupGamesStore(record.gamesStore);
  if (!gamesResult.isValid) {
    return gamesResult;
  }

  return {
    isValid: true,
    record: {
      backupVersion: BACKUP_VERSION,
      app: BACKUP_APP_NAME,
      exportedAt: record.exportedAt,
      activityStore: activityResult.store,
      gamesStore: gamesResult.store,
    },
  };
}

function buildBackupRecord(activityStore, gamesStore) {
  return {
    backupVersion: BACKUP_VERSION,
    app: BACKUP_APP_NAME,
    exportedAt: new Date().toISOString(),
    activityStore,
    gamesStore,
  };
}

function createBackupFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    "event-point-planner-backup-",
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`,
  ].join("");
}

function recordsMatch(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function readPersistedStoresForBackup() {
  let activityRaw;
  let gamesRaw;
  try {
    activityRaw = localStorage.getItem(STORAGE_KEY);
    gamesRaw = localStorage.getItem(GAMES_STORAGE_KEY);
  } catch {
    return { isValid: false, error: "無法讀取已儲存資料。" };
  }

  let activityStore;
  if (activityRaw === null) {
    if (state.activities.length > 0 || state.selectedActivityId !== null) {
      return { isValid: false, error: "目前資料尚未成功保存，無法建立可靠備份。" };
    }
    activityStore = buildStore([], null);
  } else {
    try {
      activityStore = JSON.parse(activityRaw);
    } catch {
      return { isValid: false, error: "無法讀取已儲存資料。" };
    }
  }

  let gamesStore;
  if (gamesRaw === null) {
    if (state.games.length > 0) {
      return { isValid: false, error: "目前資料尚未成功保存，無法建立可靠備份。" };
    }
    gamesStore = buildGamesStore([]);
  } else {
    try {
      gamesStore = JSON.parse(gamesRaw);
    } catch {
      return { isValid: false, error: "無法讀取已儲存資料。" };
    }
  }

  const activityResult = normalizeBackupActivityStore(activityStore);
  const gamesResult = normalizeBackupGamesStore(gamesStore);
  if (!activityResult.isValid || !gamesResult.isValid) {
    return { isValid: false, error: "目前資料尚未成功保存，無法建立可靠備份。" };
  }
  if (
    !recordsMatch(activityResult.store, buildStore(state.activities, state.selectedActivityId))
    || !recordsMatch(gamesResult.store, buildGamesStore(state.games))
  ) {
    return { isValid: false, error: "目前資料尚未成功保存，無法建立可靠備份。" };
  }

  return {
    isValid: true,
    activityStore: activityResult.store,
    gamesStore: gamesResult.store,
  };
}

function setBackupStatus(message) {
  backupStatus.textContent = message;
}

function setBackupError(message) {
  backupError.textContent = message;
  backupError.hidden = !message;
}

function exportBackup() {
  setBackupStatus("");
  setBackupError("");
  const persisted = readPersistedStoresForBackup();
  if (!persisted.isValid) {
    setBackupError(persisted.error);
    backupError.focus();
    return;
  }

  let link = null;
  let objectUrl = null;
  try {
    const backupRecord = buildBackupRecord(persisted.activityStore, persisted.gamesStore);
    const json = JSON.stringify(backupRecord, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    objectUrl = URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = objectUrl;
    link.download = createBackupFilename();
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    link = null;
    const urlToRevoke = objectUrl;
    objectUrl = null;
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(urlToRevoke);
      } catch {
        // The temporary link has already been removed; there is no further recovery action.
      }
    }, 0);
    setBackupStatus("已下載備份。");
  } catch {
    link?.remove();
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Preserve the user-facing export error even if URL cleanup also fails.
      }
    }
    setBackupError("無法建立或下載備份檔。");
    backupError.focus();
  }
}

function clearBackupImportResult() {
  pendingBackupRecord = null;
  backupSummary.hidden = true;
  backupSummaryTime.textContent = "";
  backupSummaryActivities.textContent = "";
  backupSummaryGames.textContent = "";
  backupSummaryVersion.textContent = "";
  importBackupButton.disabled = true;
}

function clearBackupDialogState() {
  backupFileReadToken += 1;
  backupFileInput.value = "";
  backupFileName.textContent = "";
  clearBackupImportResult();
  setBackupStatus("");
  setBackupError("");
}

function renderBackupSummary(record) {
  const timeFormatter = new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  backupSummaryTime.textContent = timeFormatter.format(new Date(record.exportedAt));
  backupSummaryActivities.textContent = `${integerFormatter.format(record.activityStore.activities.length)} 個`;
  backupSummaryGames.textContent = `${integerFormatter.format(record.gamesStore.games.length)} 款`;
  backupSummaryVersion.textContent = `v${record.backupVersion}`;
  backupSummary.hidden = false;
}

async function parseBackupFile(file) {
  const readToken = ++backupFileReadToken;
  clearBackupImportResult();
  setBackupStatus("");
  setBackupError("");
  backupFileName.textContent = file?.name || "";

  if (!file) {
    setBackupError("未選擇檔案。");
    return;
  }
  if (file.size === 0) {
    setBackupError("檔案是空的。");
    return;
  }
  if (file.size > MAX_BACKUP_FILE_SIZE) {
    setBackupError("檔案超過 5 MiB。");
    return;
  }

  let textContent;
  try {
    textContent = await file.text();
  } catch {
    if (readToken === backupFileReadToken) {
      setBackupError("無法讀取檔案。");
    }
    return;
  }
  if (readToken !== backupFileReadToken) {
    return;
  }
  if (!textContent.trim()) {
    setBackupError("檔案是空的。");
    return;
  }

  let record;
  try {
    record = JSON.parse(textContent);
  } catch {
    setBackupError("這不是合法的 JSON 檔案。");
    return;
  }

  const validation = validateBackupRecord(record);
  if (!validation.isValid) {
    setBackupError(validation.error);
    return;
  }

  pendingBackupRecord = validation.record;
  renderBackupSummary(validation.record);
  importBackupButton.disabled = false;
  setBackupStatus("備份檔已通過驗證。");
}

function restoreStorageKey(key, previousRawValue) {
  try {
    if (previousRawValue === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, previousRawValue);
    }
    return true;
  } catch {
    return false;
  }
}

function rollbackImportedStores(previousStores) {
  return restoreStorageKey(STORAGE_KEY, previousStores.activity);
}

function writeImportedStores(record) {
  let activityJson;
  let gamesJson;
  try {
    activityJson = JSON.stringify(record.activityStore);
    gamesJson = JSON.stringify(record.gamesStore);
  } catch {
    return { isValid: false, error: "匯入失敗，未修改現有資料。" };
  }

  const previousStores = {
    activity: null,
    games: null,
  };
  try {
    previousStores.activity = localStorage.getItem(STORAGE_KEY);
    previousStores.games = localStorage.getItem(GAMES_STORAGE_KEY);
  } catch {
    return { isValid: false, error: "匯入失敗，未修改現有資料。" };
  }

  try {
    localStorage.setItem(STORAGE_KEY, activityJson);
  } catch {
    return { isValid: false, error: "匯入失敗，未修改現有資料。" };
  }

  try {
    localStorage.setItem(GAMES_STORAGE_KEY, gamesJson);
  } catch {
    if (rollbackImportedStores(previousStores)) {
      return { isValid: false, error: "匯入失敗，原資料已恢復。" };
    }
    return {
      isValid: false,
      isSevere: true,
      error: "匯入未完成且無法完全還原，資料可能不一致。請立即重新載入並檢查資料。",
    };
  }

  return { isValid: true };
}

function importBackup() {
  setBackupError("");
  if (!pendingBackupRecord || importBackupButton.disabled) {
    setBackupError("請先選擇並驗證備份檔。");
    backupError.focus();
    return;
  }
  if (!window.confirm("匯入會覆蓋目前所有活動與手遊清單，且無法復原。是否繼續？")) {
    setBackupStatus("已取消匯入");
    return;
  }

  importBackupButton.disabled = true;
  const result = writeImportedStores(pendingBackupRecord);
  if (!result.isValid) {
    setBackupError(result.error);
    if (!result.isSevere) {
      importBackupButton.disabled = false;
    }
    backupError.focus();
    return;
  }

  setBackupStatus("匯入成功，正在重新載入。");
  window.setTimeout(() => window.location.reload(), 0);
}

function closeBackupDialog({ restoreFocus = true } = {}) {
  if (!backupDialog.open) {
    return;
  }
  backupDialog.close();
  clearBackupDialogState();
  const returnFocus = backupDialogReturnFocus;
  backupDialogReturnFocus = null;
  if (restoreFocus) {
    window.requestAnimationFrame(() => returnFocus?.focus());
  }
}

function requestCloseBackupDialog({ restoreFocus = true } = {}) {
  if (!backupDialog.open) {
    return true;
  }
  closeBackupDialog({ restoreFocus });
  return true;
}

function openBackupDialog() {
  if (backupDialog.open) {
    return true;
  }
  const returnFocus = document.activeElement;
  if (!requestCloseActivityEditorDialog({ restoreFocus: false })) {
    return false;
  }
  if (!requestCloseGamesDialog({ restoreFocus: false })) {
    return false;
  }
  if (!requestCloseQuickProgressDialog({ restoreFocus: false })) {
    return false;
  }

  backupDialogReturnFocus = returnFocus;
  clearBackupDialogState();
  backupDialog.showModal();
  window.requestAnimationFrame(() => exportBackupButton.focus());
  return true;
}

function activityFromValidation(validation, identity) {
  return {
    id: identity.id,
    gameName: validation.data.gameName,
    activityName: validation.data.activityName,
    activityStartDate: validation.data.activityStartDate,
    activityEndDate: validation.data.activityEndDate,
    useCustomPlanPeriod: validation.data.useCustomPlanPeriod,
    planStartDate: validation.data.planStartDate,
    planEndDate: validation.data.planEndDate,
    targetPoint: validation.data.targetPoint,
    progressDate: validation.data.progressDate,
    currentPoint: validation.data.currentPoint,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}

function saveActivity(event) {
  event.preventDefault();
  if (state.editorMode === "view") {
    return;
  }
  state.hasSubmitted = true;
  const validation = validateInput(readInput());
  showValidation(validation, true);

  if (!validation.isValid) {
    renderEmpty();
    saveStatus.textContent = "尚未儲存，請修正表單資料";
    return;
  }

  const now = new Date().toISOString();
  if (state.editorMode === "create") {
    const activity = activityFromValidation(validation, {
      id: createActivityId(),
      createdAt: now,
      updatedAt: now,
    });
    const nextActivities = [...state.activities, activity];

    if (!writeStore(nextActivities, activity.id)) {
      saveStatus.textContent = "無法儲存新活動，請檢查瀏覽器本機儲存空間";
      return;
    }

    state.activities = nextActivities;
    closeActivityEditorDialog();
    editorReturnActivityId = null;
    enterViewMode(activity.id);
    setActivityListStatus("已新增並儲存在本機");
    focusActivityAction(activity.id);
    return;
  }

  const activityIndex = state.activities.findIndex((activity) => activity.id === state.selectedActivityId);
  if (activityIndex < 0) {
    saveStatus.textContent = "找不到目前選取的活動";
    return;
  }

  const existingActivity = state.activities[activityIndex];
  const updatedActivity = activityFromValidation(validation, {
    id: existingActivity.id,
    createdAt: existingActivity.createdAt,
    updatedAt: now,
  });
  const nextActivities = state.activities.map((activity) => (
    activity.id === updatedActivity.id ? updatedActivity : activity
  ));

  if (!writeStore(nextActivities, updatedActivity.id)) {
    saveStatus.textContent = "無法儲存變更，請檢查瀏覽器本機儲存空間";
    return;
  }

  state.activities = nextActivities;
  closeActivityEditorDialog();
  editorReturnActivityId = null;
  enterViewMode(updatedActivity.id);
  setActivityListStatus("已儲存變更");
  focusActivityAction(updatedActivity.id, "edit");
}

function hasValidStoredActivityIdentity(record) {
  return Boolean(
    record
    && typeof record === "object"
    && typeof record.id === "string"
    && record.id
    && typeof record.gameName === "string"
    && typeof record.activityName === "string"
    && typeof record.targetPoint === "number"
    && typeof record.currentPoint === "number"
    && isValidTimestamp(record.createdAt)
    && isValidTimestamp(record.updatedAt)
  );
}

function validateStoredV3Activity(record) {
  if (
    !hasValidStoredActivityIdentity(record)
    || typeof record.useCustomPlanPeriod !== "boolean"
    || typeof record.activityStartDate !== "string"
    || typeof record.activityEndDate !== "string"
    || typeof record.planStartDate !== "string"
    || typeof record.planEndDate !== "string"
  ) {
    return false;
  }

  return validateInput(activityToDraft(record), { requireGameName: false }).isValid;
}

function normalizeV3Store(record) {
  if (!record || typeof record !== "object" || record.version !== STORAGE_VERSION || !Array.isArray(record.activities)) {
    return null;
  }

  const activities = [];
  const seenIds = new Set();
  let invalidCount = 0;

  for (const activity of record.activities) {
    if (!validateStoredV3Activity(activity) || seenIds.has(activity.id)) {
      invalidCount += 1;
      continue;
    }

    seenIds.add(activity.id);
    const validation = validateInput(activityToDraft(activity), { requireGameName: false });
    activities.push(activityFromValidation(validation, {
      id: activity.id,
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
    }));
  }

  const selectedActivityId = typeof record.selectedActivityId === "string"
    && activities.some((activity) => activity.id === record.selectedActivityId)
    ? record.selectedActivityId
    : activities[0]?.id || null;

  return { activities, selectedActivityId, invalidCount };
}

function validateStoredV2Activity(record) {
  if (
    !hasValidStoredActivityIdentity(record)
    || typeof record.startDate !== "string"
    || typeof record.endDate !== "string"
  ) {
    return false;
  }

  return validateInput({
    gameName: record.gameName,
    activityName: record.activityName,
    activityStartDate: record.startDate,
    activityEndDate: record.endDate,
    useCustomPlanPeriod: false,
    planStartDate: record.startDate,
    planEndDate: record.endDate,
    targetPointText: String(record.targetPoint),
    progressDate: record.progressDate,
    currentPointText: String(record.currentPoint),
  }, { requireGameName: false }).isValid;
}

function migrateV2Store(record) {
  if (!record || typeof record !== "object" || record.version !== 2 || !Array.isArray(record.activities)) {
    return null;
  }

  const activities = [];
  const seenIds = new Set();
  let invalidCount = 0;
  for (const activity of record.activities) {
    if (!validateStoredV2Activity(activity) || seenIds.has(activity.id)) {
      invalidCount += 1;
      continue;
    }
    seenIds.add(activity.id);
    activities.push({
      id: activity.id,
      gameName: activity.gameName.trim(),
      activityName: activity.activityName.trim(),
      activityStartDate: activity.startDate,
      activityEndDate: activity.endDate,
      useCustomPlanPeriod: false,
      planStartDate: activity.startDate,
      planEndDate: activity.endDate,
      targetPoint: activity.targetPoint,
      progressDate: activity.progressDate,
      currentPoint: activity.currentPoint,
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
    });
  }

  const selectedActivityId = typeof record.selectedActivityId === "string"
    && activities.some((activity) => activity.id === record.selectedActivityId)
    ? record.selectedActivityId
    : activities[0]?.id || null;
  return { activities, selectedActivityId, invalidCount };
}

function validateV1Record(record) {
  if (
    !record
    || typeof record !== "object"
    || record.version !== 1
    || typeof record.name !== "string"
    || typeof record.targetPoint !== "number"
    || typeof record.currentPoint !== "number"
  ) {
    return false;
  }

  const validation = validateInput({
    gameName: "",
    activityName: record.name,
    activityStartDate: typeof record.startDate === "string" ? record.startDate : "",
    activityEndDate: typeof record.endDate === "string" ? record.endDate : "",
    useCustomPlanPeriod: false,
    planStartDate: typeof record.startDate === "string" ? record.startDate : "",
    planEndDate: typeof record.endDate === "string" ? record.endDate : "",
    targetPointText: String(record.targetPoint),
    progressDate: typeof record.progressDate === "string" ? record.progressDate : "",
    currentPointText: String(record.currentPoint),
  }, { requireGameName: false });

  return validation.isValid;
}

function migrateV1Record(record) {
  const migratedAt = new Date().toISOString();
  const originalTimestamp = isValidTimestamp(record.updatedAt) ? record.updatedAt : migratedAt;
  const activity = {
    id: createActivityId(),
    gameName: "",
    activityName: record.name.trim(),
    activityStartDate: record.startDate,
    activityEndDate: record.endDate,
    useCustomPlanPeriod: false,
    planStartDate: record.startDate,
    planEndDate: record.endDate,
    targetPoint: record.targetPoint,
    progressDate: record.progressDate,
    currentPoint: record.currentPoint,
    createdAt: originalTimestamp,
    updatedAt: originalTimestamp,
  };

  return buildStore([activity], activity.id);
}

function applyLoadedStore(store, statusMessage) {
  state.activities = store.activities;
  const gamesStatusMessage = loadGamesStore();
  if (store.selectedActivityId) {
    enterViewMode(store.selectedActivityId);
  } else {
    enterEmptyView();
  }
  setActivityListStatus([statusMessage, gamesStatusMessage].filter(Boolean).join("；"));
}

function loadStore() {
  let rawRecord;
  try {
    rawRecord = localStorage.getItem(STORAGE_KEY);
  } catch {
    applyLoadedStore(buildStore([], null), "無法存取瀏覽器本機儲存空間");
    return;
  }

  if (!rawRecord) {
    applyLoadedStore(buildStore([], null), "");
    return;
  }

  let record;
  try {
    record = JSON.parse(rawRecord);
  } catch {
    applyLoadedStore(buildStore([], null), "已忽略損壞的本機資料");
    return;
  }

  if (record?.version === 1) {
    if (!validateV1Record(record)) {
      applyLoadedStore(buildStore([], null), "已忽略不合法的舊版資料");
      return;
    }

    const migratedStore = migrateV1Record(record);
    const migrationSaved = writeStore(migratedStore.activities, migratedStore.selectedActivityId);
    applyLoadedStore(
      migratedStore,
      migrationSaved
        ? "已保留並升級舊版活動資料"
        : "已載入舊版活動，但無法保存升級結果",
    );
    return;
  }

  if (record?.version === 2) {
    const migratedStore = migrateV2Store(record);
    if (!migratedStore) {
      applyLoadedStore(buildStore([], null), "已忽略不合法的 v2 本機資料");
      return;
    }

    const migrationSaved = writeStore(migratedStore.activities, migratedStore.selectedActivityId);
    const migrationMessage = migratedStore.invalidCount > 0
      ? `已忽略 ${integerFormatter.format(migratedStore.invalidCount)} 筆不合法 v2 活動，其餘資料已升級至 v3`
      : "已保留並升級 v2 活動資料至 v3";
    applyLoadedStore(
      migratedStore,
      migrationSaved ? migrationMessage : `${migrationMessage}，但無法保存升級結果`,
    );
    return;
  }

  const normalizedStore = normalizeV3Store(record);
  if (!normalizedStore) {
    applyLoadedStore(buildStore([], null), "已忽略不合法的本機資料");
    return;
  }

  const statusMessage = normalizedStore.invalidCount > 0
    ? `已忽略 ${integerFormatter.format(normalizedStore.invalidCount)} 筆不合法活動，其餘資料已載入`
    : "已載入本機活動";
  applyLoadedStore(normalizedStore, statusMessage);
}

function selectActivity(activityId) {
  if (state.editorMode === "view" && state.selectedActivityId === activityId) {
    return;
  }
  if (!requestCloseActivityEditorDialog({ restoreFocus: false })) {
    return;
  }

  const activity = state.activities.find((item) => item.id === activityId);
  if (!activity) {
    return;
  }

  if (!enterViewMode(activity.id)) {
    return;
  }
  if (writeStore(state.activities, state.selectedActivityId)) {
    setActivityListStatus("");
  } else {
    setActivityListStatus("已切換活動，但無法保存選取狀態");
  }
}

function startNewActivity() {
  if (state.games.length === 0) {
    openGamesDialog("請先新增至少一款手遊");
    return;
  }
  if (!enterCreateMode()) {
    return;
  }
  saveStatus.textContent = "請輸入新活動資料";
}

function deleteActivity(activityId) {
  if (!requestCloseActivityEditorDialog({ restoreFocus: false })) {
    return;
  }
  if (!requestCloseQuickProgressDialog({ restoreFocus: false })) {
    return;
  }

  const activityIndex = state.activities.findIndex((activity) => activity.id === activityId);
  if (activityIndex < 0) {
    return;
  }

  const activity = state.activities[activityIndex];
  const displayName = activity.gameName
    ? `${activity.gameName}｜${activity.activityName}`
    : activity.activityName;
  if (!window.confirm(`確定要刪除「${displayName}」嗎？`)) {
    return;
  }

  const nextActivities = state.activities.filter((item) => item.id !== activity.id);
  let nextSelectedActivityId = state.selectedActivityId;
  if (activity.id === state.selectedActivityId) {
    const nextSelectedActivity = nextActivities[activityIndex] || nextActivities[activityIndex - 1] || null;
    nextSelectedActivityId = nextSelectedActivity?.id || null;
  } else if (!nextActivities.some((item) => item.id === nextSelectedActivityId)) {
    nextSelectedActivityId = null;
  }

  if (!writeStore(nextActivities, nextSelectedActivityId)) {
    setActivityListStatus("無法刪除此活動，請檢查瀏覽器本機儲存空間");
    return;
  }

  state.activities = nextActivities;
  if (nextSelectedActivityId) {
    enterViewMode(nextSelectedActivityId);
  } else {
    enterEmptyView();
  }
  setActivityListStatus(`已刪除「${displayName}」`);
}

form.addEventListener("submit", saveActivity);
form.addEventListener("input", (event) => {
  if (state.editorMode === "view") {
    return;
  }
  if (event.target === useCustomPlanPeriod) {
    if (!useCustomPlanPeriod.checked) {
      syncPlanPeriodWithActivityPeriod();
    }
    renderCustomPlanPeriodFields();
  } else if (
    !useCustomPlanPeriod.checked
    && (event.target === fields.activityStartDate || event.target === fields.activityEndDate)
  ) {
    syncPlanPeriodWithActivityPeriod();
  }
  updateDirtyState();
  saveStatus.textContent = state.isDirty ? "有未儲存變更" : "沒有未儲存變更";
  updatePreview();
});
newActivityButton.addEventListener("click", startNewActivity);
manageGamesButton.addEventListener("click", () => openGamesDialog());
backupDataButton.addEventListener("click", openBackupDialog);
backToActivitiesButton.addEventListener("click", () => scrollToSection(document.querySelector("#activities-heading")));
cancelEditButton.addEventListener("click", () => cancelActivityEditor());
gamesForm.addEventListener("submit", addGame);
gamesForm.addEventListener("input", () => {
  if (newGameName.getAttribute("aria-invalid") === "true") {
    const validation = validateNewGameName(newGameName.value);
    newGameName.setAttribute("aria-invalid", validation.error ? "true" : "false");
    newGameNameError.textContent = validation.error;
  }
  setGamesDialogStatus("");
});
gamesList.addEventListener("click", (event) => {
  const button = event.target.closest('button[data-game-action="delete"][data-game-name]');
  if (!button || !gamesList.contains(button)) {
    return;
  }
  deleteGame(button.dataset.gameName);
});
gamesCloseButton.addEventListener("click", () => requestCloseGamesDialog());
gamesDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseGamesDialog();
});
gamesDialog.addEventListener("click", (event) => {
  if (event.target !== gamesDialog) {
    return;
  }

  const sheetBounds = gamesSheet.getBoundingClientRect();
  const isInsideSheet = event.clientX >= sheetBounds.left
    && event.clientX <= sheetBounds.right
    && event.clientY >= sheetBounds.top
    && event.clientY <= sheetBounds.bottom;
  if (!isInsideSheet) {
    requestCloseGamesDialog();
  }
});
exportBackupButton.addEventListener("click", exportBackup);
backupFileInput.addEventListener("change", () => {
  parseBackupFile(backupFileInput.files?.[0] || null);
});
importBackupButton.addEventListener("click", importBackup);
backupCloseButton.addEventListener("click", () => requestCloseBackupDialog());
backupDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseBackupDialog();
});
backupDialog.addEventListener("click", (event) => {
  if (event.target !== backupDialog) {
    return;
  }

  const sheetBounds = backupSheet.getBoundingClientRect();
  const isInsideSheet = event.clientX >= sheetBounds.left
    && event.clientX <= sheetBounds.right
    && event.clientY >= sheetBounds.top
    && event.clientY <= sheetBounds.bottom;
  if (!isInsideSheet) {
    requestCloseBackupDialog();
  }
});
activityList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-activity-action][data-activity-id]");
  if (!button || !activityList.contains(button)) {
    return;
  }

  const { activityAction, activityId } = button.dataset;
  if (activityAction === "select") {
    selectActivity(activityId);
  } else if (activityAction === "edit") {
    startEditingActivity(activityId);
  } else if (activityAction === "delete") {
    deleteActivity(activityId);
  }
});
activityEditorDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseActivityEditorDialog();
});
activityEditorDialog.addEventListener("click", (event) => {
  if (event.target !== activityEditorDialog) {
    return;
  }

  const sheetBounds = activityEditorSheet.getBoundingClientRect();
  const isInsideSheet = event.clientX >= sheetBounds.left
    && event.clientX <= sheetBounds.right
    && event.clientY >= sheetBounds.top
    && event.clientY <= sheetBounds.bottom;
  if (!isInsideSheet) {
    requestCloseActivityEditorDialog();
  }
});
quickProgressButton.addEventListener("click", openQuickProgressDialog);
quickProgressForm.addEventListener("submit", saveQuickProgress);
quickProgressForm.addEventListener("input", () => {
  updateQuickProgressDirty();
  if (quickProgressHasSubmitted) {
    const activity = getSelectedActivity();
    if (activity) {
      showQuickProgressValidation(validateQuickProgress(readQuickProgressInput(), activity));
    }
  }
});
quickProgressCancel.addEventListener("click", () => requestCloseQuickProgressDialog());
quickProgressDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseQuickProgressDialog();
});
quickProgressDialog.addEventListener("click", (event) => {
  if (event.target !== quickProgressDialog) {
    return;
  }

  const sheetBounds = quickProgressSheet.getBoundingClientRect();
  const isInsideSheet = event.clientX >= sheetBounds.left
    && event.clientX <= sheetBounds.right
    && event.clientY >= sheetBounds.top
    && event.clientY <= sheetBounds.bottom;
  if (!isInsideSheet) {
    requestCloseQuickProgressDialog();
  }
});

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {
    // PWA support is optional; registration failure must not affect the local planner.
  });
}

loadStore();
registerServiceWorker();
