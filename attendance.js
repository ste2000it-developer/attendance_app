import {
  auth,
  db,
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  where,
  serverTimestamp,
  onAuthStateChanged,
  signOut
} from "./firebase.js";

const currentTimeEl = document.getElementById("currentTime");
const currentDateEl = document.getElementById("currentDate");
const checkInDisplayEl = document.getElementById("checkInDisplay");
const checkOutDisplayEl = document.getElementById("checkOutDisplay");
const siteDisplayEl = document.getElementById("siteDisplay");
const statusTextEl = document.getElementById("statusText");
const subStatusTextEl = document.getElementById("subStatusText");
const mainActionBtn = document.getElementById("mainActionBtn");

const homeSection = document.getElementById("homeSection");
const profileSection = document.getElementById("profileSection");
const leaveSection = document.getElementById("leaveSection");

const homeTabBtn = document.getElementById("homeTabBtn");
const profileTabBtn = document.getElementById("profileTabBtn");
const leaveTabBtn = document.getElementById("leaveTabBtn");

const profileEmailEl = document.getElementById("profileEmail");
const profileUidEl = document.getElementById("profileUid");
const logoutBtn = document.getElementById("logoutBtn");

const popupOverlay = document.getElementById("popupOverlay");
const popupTitle = document.getElementById("popupTitle");
const popupMessage = document.getElementById("popupMessage");
const popupActions = document.getElementById("popupActions");
const popupCancelBtn = document.getElementById("popupCancelBtn");
const popupConfirmBtn = document.getElementById("popupConfirmBtn");

const appLoadingOverlay = document.getElementById("appLoadingOverlay");
const appLoadingText = document.getElementById("appLoadingText");

const leaveEmployeeNameEl = document.getElementById("leaveEmployeeName");
const leaveEmployeeCodeEl = document.getElementById("leaveEmployeeCode");
const leaveEmployeeDepartmentEl = document.getElementById("leaveEmployeeDepartment");
const leaveEmployeePositionEl = document.getElementById("leaveEmployeePosition");

const leaveForm = document.getElementById("leaveForm");
const leaveTypeSelect = document.getElementById("leaveTypeSelect");
const leaveStartDate = document.getElementById("leaveStartDate");
const leaveEndDate = document.getElementById("leaveEndDate");
const leaveNote = document.getElementById("leaveNote");
const leaveNoteHint = document.getElementById("leaveNoteHint");
const leaveAttachment = document.getElementById("leaveAttachment");
const leaveAttachmentName = document.getElementById("leaveAttachmentName");
const leaveRuleHint = document.getElementById("leaveRuleHint");
const leaveTotalDays = document.getElementById("leaveTotalDays");
const submitLeaveBtn = document.getElementById("submitLeaveBtn");
const leaveHistoryLoading = document.getElementById("leaveHistoryLoading");
const leaveHistoryList = document.getElementById("leaveHistoryList");
const holidayListEl = document.getElementById("holidayList");

const ADMIN_PIN = "1234";
const LEAVE_ATTACHMENT_MAX_MB = 2;

const LEAVE_TYPES = {
  annual: {
    label: "ลาพักร้อนประจำปี",
    requiresAdvance: true,
    requiresNote: false
  },
  sick: {
    label: "ลาป่วย",
    requiresAdvance: false,
    requiresNote: false
  },
  training: {
    label: "ลาเพื่อฝึกอบรม/พัฒนาความรู้",
    requiresAdvance: true,
    requiresNote: false
  },
  military: {
    label: "ลารับราชการทหาร",
    requiresAdvance: true,
    requiresNote: false
  },
  ordination: {
    label: "ลาอุปสมบท",
    requiresAdvance: true,
    requiresNote: false
  },
  maternity: {
    label: "ลาคลอด",
    requiresAdvance: true,
    requiresNote: false
  },
  sterilization: {
    label: "ลาเพื่อทำหมัน",
    requiresAdvance: true,
    requiresNote: false
  },
  unpaid_personal: {
    label: "ลากิจโดยไม่รับค่าจ้าง",
    requiresAdvance: true,
    requiresNote: false
  },
  emergency: {
    label: "ลาฉุกเฉิน",
    requiresAdvance: false,
    requiresNote: true
  },
  other: {
    label: "อื่นๆ",
    requiresAdvance: false,
    requiresNote: true
  }
};

/* =========================
   🔹 วันหยุดไทยแบบวันที่คงที่ทุกปี
========================= */
const FIXED_THAI_HOLIDAYS = {
  "01-01": "วันขึ้นปีใหม่",
  "04-06": "วันจักรี",
  "04-13": "วันสงกรานต์",
  "04-14": "วันสงกรานต์",
  "04-15": "วันสงกรานต์",
  "05-01": "วันแรงงาน",
  "05-04": "วันฉัตรมงคล",
  "06-03": "วันเฉลิมพระชนมพรรษาพระราชินี",
  "07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "08-12": "วันแม่",
  "10-13": "วันนวมินทรมหาราช",
  "10-23": "วันปิยมหาราช",
  "12-05": "วันพ่อ",
  "12-10": "วันรัฐธรรมนูญ",
  "12-31": "วันสิ้นปี"
};

let currentRecord = null;
let currentEmployeeCode = null;
let currentEmployeeName = null;
let currentEmployeeDepartment = null;
let currentEmployeePosition = null;
let currentUserProfile = null;
let pageTimer = null;

let currentLiveLocation = null;
let currentLiveSiteName = "กำลังตรวจตำแหน่ง...";
let watchId = null;

let cachedSites = [];
let sitesLoaded = false;
let cachedCompanyHolidays = [];
let companyHolidaysLoaded = false;

let isActionRunning = false;
let isAppReady = false;
let isAutoCheckoutRunning = false;
let isWorkdaySyncRunning = false;
let isLeaveSubmitting = false;

let locationLoadingInterval = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDeviceId() {
  let deviceId = localStorage.getItem("deviceId");

  if (!deviceId) {
    deviceId =
      "dev-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10);
    localStorage.setItem("deviceId", deviceId);
  }

  return deviceId;
}

async function getUserDocByUid(uid) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("uid", "==", uid));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  return snapshot.docs[0];
}

async function validateDeviceForCurrentUser(user) {
  const userDoc = await getUserDocByUid(user.uid);
  const userData = userDoc.data();
  const currentDeviceId = getDeviceId();

  if (!userData.deviceId) {
    await setDoc(
      doc(db, "users", userDoc.id),
      {
        deviceId: currentDeviceId,
        deviceBoundAt: new Date().toISOString(),
        deviceLabel: navigator.userAgent
      },
      { merge: true }
    );
    return;
  }

  if (userData.deviceId !== currentDeviceId) {
    throw new Error("DEVICE_NOT_ALLOWED");
  }
}

function setAppLoading(message) {
  appLoadingText.textContent = message;
  appLoadingOverlay.classList.remove("hidden");
  mainActionBtn.disabled = true;
}

function hideAppLoading() {
  appLoadingOverlay.classList.add("hidden");
  isAppReady = true;
  updateAttendanceUI();
}

function startLocationLoadingAnimation() {
  stopLocationLoadingAnimation();

  let dotCount = 0;
  siteDisplayEl.classList.add("loading");

  locationLoadingInterval = setInterval(() => {
    if (currentLiveSiteName !== "กำลังตรวจตำแหน่ง...") {
      stopLocationLoadingAnimation();
      return;
    }

    dotCount = (dotCount + 1) % 4;
    siteDisplayEl.textContent = "กำลังตรวจตำแหน่ง" + ".".repeat(dotCount);
  }, 350);
}

function stopLocationLoadingAnimation() {
  if (locationLoadingInterval) {
    clearInterval(locationLoadingInterval);
    locationLoadingInterval = null;
  }
  siteDisplayEl.classList.remove("loading");
}

function setButtonLoading(text) {
  mainActionBtn.classList.add("loading");
  mainActionBtn.disabled = true;
  mainActionBtn.textContent = text;
}

function clearButtonLoading() {
  mainActionBtn.classList.remove("loading");
}

function getNow() {
  return new Date();
}

function getTodayLocalDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseYmdToLocalDate(ymd) {
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatThaiDate(ymd) {
  const date = parseYmdToLocalDate(ymd);
  if (!date) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getInclusiveDays(startYmd, endYmd) {
  const start = parseYmdToLocalDate(startYmd);
  const end = parseYmdToLocalDate(endYmd);

  if (!start || !end || end < start) {
    return 0;
  }

  const diffMs = end - start;
  return Math.floor(diffMs / 86400000) + 1;
}

function getWorkdayBaseDate(date) {
  const base = new Date(date);

  // 🔥 วันใหม่ = 00:00 จริง
  base.setHours(0, 0, 0, 0);

  return base;
}

function getWorkdayKey(date) {
  const baseDate = getWorkdayBaseDate(date);
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, "0");
  const day = String(baseDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNoonMoment(date) {
  const noon = new Date(date);
  noon.setHours(12, 0, 0, 0);
  return noon;
}

function isAfterCountdownStart(date) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  return hour > 6 || (hour === 6 && minute >= 1);
}

function formatTime(date) {
  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCurrentTime(date) {
  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatCurrentDate(date) {
  return date.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatDateTimeThai(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getCheckInStatus(date) {
  const hour = date.getHours();
  const minute = date.getMinutes();

  if (hour < 8 || (hour === 8 && minute === 0)) {
    return "ปกติ";
  }

  return "สาย";
}

function getCheckoutStatus(date) {
  const hour = date.getHours();

  if (hour >= 18) {
    return "OT";
  }

  if (hour >= 17) {
    return "ปกติ";
  }

  return "ก่อนเวลา";
}

function updateClockUI() {
  const now = getNow();
  currentTimeEl.textContent = formatCurrentTime(now);
  currentDateEl.textContent = formatCurrentDate(now);
}

function setButtonState(type, text, disabled) {
  mainActionBtn.classList.remove(
    "state-checkin",
    "state-countdown",
    "state-checkout",
    "state-complete"
  );

  mainActionBtn.classList.add(type);
  mainActionBtn.textContent = text;
  mainActionBtn.disabled = disabled;
}

function buildCountdownButtonText(now, noon) {
  const diffMs = noon - now;

  if (diffMs <= 0) {
    return "เลิกงาน";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function setEmptyRecord(workdayKey) {
  currentRecord = {
    workdayKey,
    checkInTime: null,
    checkOutTime: null,
    checkInLabel: "--:--",
    checkOutLabel: "--:--",
    checkInType: null,
    checkOutType: null,
    checkInStatus: null,
    checkOutStatus: null,
    siteIn: null,
    siteOut: null,
    locationIn: null,
    locationOut: null,
    checkoutOutside: false,
    autoCheckedOut: false
  };
}

function updateLiveSiteDisplay() {
  if (currentLiveSiteName === "กำลังตรวจตำแหน่ง...") {
    startLocationLoadingAnimation();
    return;
  }

  stopLocationLoadingAnimation();
  siteDisplayEl.textContent = currentLiveSiteName;
}

function normalizeLiveSiteName() {
  if (currentLiveSiteName === "กำลังตรวจตำแหน่ง...") {
    if (currentLiveLocation) {
      const siteName = detectSiteByLocation(currentLiveLocation.lat, currentLiveLocation.lng);
      currentLiveSiteName = siteName || "นอกพื้นที่";
    } else {
      currentLiveSiteName = "ไม่พบตำแหน่ง";
    }
  }

  if (!currentLiveSiteName || currentLiveSiteName.trim() === "") {
    currentLiveSiteName = currentLiveLocation ? "นอกพื้นที่" : "ไม่พบตำแหน่ง";
  }

  updateLiveSiteDisplay();
}

function getWorkdayDateFromKey(workdayKey) {
  const [year, month, day] = workdayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getAutoCheckoutThreshold(workdayKey) {
  const workdayDate = getWorkdayDateFromKey(workdayKey);
  const threshold = new Date(workdayDate);
  threshold.setDate(threshold.getDate() + 1);
  threshold.setHours(10, 0, 0, 0);
  return threshold;
}

function getAutoCheckoutMoment(workdayKey) {
  const workdayDate = getWorkdayDateFromKey(workdayKey);
  const autoCheckout = new Date(workdayDate);
  autoCheckout.setHours(23, 59, 0, 0);
  return autoCheckout;
}

function shouldAutoCheckoutRecord(record, now) {
  if (!record || !record.workdayKey) {
    return false;
  }

  if (!record.checkInTime || record.checkOutTime) {
    return false;
  }

  return now >= getAutoCheckoutThreshold(record.workdayKey);
}

function updateAttendanceUI() {
  if (!currentRecord) {
    setEmptyRecord(getWorkdayKey(getNow()));
  }

  const now = getNow();
  const noon = getNoonMoment(now);
  const canRunCountdown = isAfterCountdownStart(now);

  checkInDisplayEl.textContent = currentRecord.checkInLabel || "--:--";
  checkOutDisplayEl.textContent = currentRecord.checkOutLabel || "--:--";
  normalizeLiveSiteName();

  if (!isAppReady) {
    mainActionBtn.disabled = true;
    return;
  }

  if (isActionRunning || isAutoCheckoutRunning) {
    return;
  }

  if (!currentRecord.checkInTime) {
    statusTextEl.textContent = "ยังไม่ได้เข้างาน";
    subStatusTextEl.textContent = "พร้อมเริ่มงาน";
    setButtonState("state-checkin", "เข้างาน", false);
    return;
  }

  if (!currentRecord.checkOutTime) {
    if (canRunCountdown && now < noon) {
      statusTextEl.textContent = "เข้างานแล้ว";
      subStatusTextEl.textContent = "รอถึง 12:00 เพื่อเลิกงาน";
      setButtonState("state-countdown", buildCountdownButtonText(now, noon), true);
      return;
    }

    statusTextEl.textContent = "พร้อมเลิกงาน";
    subStatusTextEl.textContent =
      currentRecord.checkInStatus === "สาย"
        ? "สถานะเข้างาน: สาย"
        : "สถานะเข้างาน: ปกติ";

    setButtonState("state-checkout", "เลิกงาน", false);
    return;
  }

  statusTextEl.textContent = "วันนี้เรียบร้อยแล้ว";

  if (currentRecord.autoCheckedOut) {
    subStatusTextEl.textContent = "ระบบตัดเลิกงานอัตโนมัติ";
  } else if (currentRecord.checkOutStatus === "OT") {
    subStatusTextEl.textContent = "เลิกงานแล้ว (OT)";
  } else {
    subStatusTextEl.textContent = "บันทึกการเลิกงานเรียบร้อย";
  }

  setButtonState("state-complete", "วันนี้เรียบร้อยแล้ว", true);
}

function showPopup(options) {
  const {
    title = "แจ้งเตือน",
    message = "",
    mode = "alert",
    confirmText = "ตกลง",
    cancelText = "ยกเลิก",
    onConfirm = null,
    onCancel = null
  } = options;

  popupTitle.innerHTML = title;
  popupMessage.textContent = message;

  if (mode === "confirm") {
    popupActions.style.display = "flex";
    popupCancelBtn.style.display = "block";
    popupConfirmBtn.textContent = confirmText;
    popupCancelBtn.textContent = cancelText;
    popupConfirmBtn.disabled = false;
    popupCancelBtn.disabled = false;

    popupConfirmBtn.onclick = () => {
      if (onConfirm) onConfirm();
    };

    popupCancelBtn.onclick = () => {
      hidePopup();
      if (onCancel) onCancel();
    };
  } else {
    popupActions.style.display = "flex";
    popupCancelBtn.style.display = "none";
    popupConfirmBtn.textContent = confirmText;
    popupConfirmBtn.disabled = false;

    popupConfirmBtn.onclick = () => {
      hidePopup();
      if (onConfirm) onConfirm();
    };

    popupCancelBtn.onclick = null;
  }

  popupOverlay.classList.remove("hidden");
}

function updatePopupToSuccess(title, message) {
  popupTitle.innerHTML = `
    <div class="popup-success-icon">✓</div>
    ${title}
  `;
  popupMessage.textContent = message;
  popupActions.style.display = "flex";
  popupCancelBtn.style.display = "none";
  popupConfirmBtn.textContent = "ตกลง";
  popupConfirmBtn.disabled = false;
  popupConfirmBtn.onclick = () => {
    hidePopup();
  };

  popupOverlay.classList.remove("hidden");
}

function hidePopup() {
  popupOverlay.classList.add("hidden");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStatusBadgeClass(status) {
  if (status === "approved") return "leave-status-approved";
  if (status === "rejected") return "leave-status-rejected";
  if (status === "pending") return "leave-status-pending";
  return "leave-status-default";
}

function getStatusLabel(status) {
  if (status === "approved") return "อนุมัติแล้ว";
  if (status === "rejected") return "ไม่อนุมัติ";
  if (status === "pending") return "รออนุมัติ";
  return status || "-";
}

function updateLeaveEmployeeUI() {
  if (!leaveEmployeeNameEl) return;
  leaveEmployeeNameEl.textContent = currentEmployeeName || "-";
  leaveEmployeeCodeEl.textContent = currentEmployeeCode || "-";
  leaveEmployeeDepartmentEl.textContent = currentEmployeeDepartment || "-";
  leaveEmployeePositionEl.textContent = currentEmployeePosition || "-";
}

function updateLeaveTypeUI() {
  if (!leaveTypeSelect) return;

  const typeConfig = LEAVE_TYPES[leaveTypeSelect.value];

  if (!typeConfig) {
    leaveRuleHint.textContent = "เลือกประเภทการลา";
    leaveNoteHint.textContent = "ลาฉุกเฉินและอื่นๆ ต้องกรอกหมายเหตุ";
    leaveNote.placeholder = "ระบุรายละเอียดเพิ่มเติม (ถ้ามี)";
    return;
  }

  leaveRuleHint.textContent = typeConfig.requiresAdvance
    ? "ต้องลาล่วงหน้าอย่างน้อย 1 วัน"
    : "สามารถยื่นลาในวันเดียวกันได้";

  leaveNoteHint.textContent = typeConfig.requiresNote
    ? "ประเภทนี้ต้องกรอกหมายเหตุ"
    : "หมายเหตุไม่บังคับ";

  leaveNote.placeholder = typeConfig.requiresNote
    ? "กรุณาระบุรายละเอียด"
    : "ระบุรายละเอียดเพิ่มเติม (ถ้ามี)";
}

function updateLeaveTotalDaysUI() {
  if (!leaveTotalDays) return;
  const total = getInclusiveDays(leaveStartDate.value, leaveEndDate.value);
  leaveTotalDays.textContent = `${total} วัน`;
}

function updateAttachmentNameUI() {
  if (!leaveAttachmentName) return;
  const file = leaveAttachment.files?.[0];
  leaveAttachmentName.textContent = file ? file.name : "ยังไม่ได้เลือกไฟล์";
}

/* =========================
   🔹 วันหยุด: helper
========================= */
function formatYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function getFixedThaiHolidayName(date) {
  return FIXED_THAI_HOLIDAYS[getMonthDayKey(date)] || null;
}

async function loadCompanyHolidays() {
  if (companyHolidaysLoaded) {
    return;
  }

  const holidaysRef = collection(db, "holidays");
  const snapshot = await getDocs(holidaysRef);

  cachedCompanyHolidays = snapshot.docs.map((holidayDoc) => {
    const data = holidayDoc.data();
    return {
      id: holidayDoc.id,
      name: data.name || "",
      date: data.date || holidayDoc.id
    };
  });

  companyHolidaysLoaded = true;
}

function getCompanyHolidayName(date) {
  const ymd = formatYmd(date);
  const found = cachedCompanyHolidays.find((item) => item.date === ymd);
  return found ? found.name || "วันหยุดบริษัท" : null;
}

function generateUpcomingHolidays() {
  const today = new Date();
  const temp = [];

  // 1. เก็บวันหยุดก่อน
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);

    const ymd = formatYmd(d);

    const company = getCompanyHolidayName(d);
    if (company) {
      temp.push({ name: company, date: ymd });
      continue;
    }

    const thai = getFixedThaiHolidayName(d);
    if (thai) {
      temp.push({ name: thai, date: ymd });
    }
  }

  // 2. รวมวันติดกัน
  const result = [];
  let group = [];

  function pushGroup() {
    if (group.length === 0) return;

    const first = group[0];
    const last = group[group.length - 1];

    const start = parseYmdToLocalDate(first.date);
    const end = parseYmdToLocalDate(last.date);

    let text;

    if (group.length === 1) {
      text = formatThaiDate(first.date);
    } else {
      text =
        `${start.getDate()}–${end.getDate()} ` +
        start.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
    }

    result.push({
      name: first.name,
      display: text
    });

    group = [];
  }

  for (let i = 0; i < temp.length; i++) {
    const current = temp[i];
    const prev = group[group.length - 1];

    if (
      prev &&
      current.name === prev.name &&
      new Date(current.date) - new Date(prev.date) === 86400000
    ) {
      group.push(current);
    } else {
      pushGroup();
      group.push(current);
    }
  }

  pushGroup();

  return result;
}

function renderHolidayList() {
  if (!holidayListEl) return;

  const holidays = generateUpcomingHolidays();

  if (!holidays.length) {
    holidayListEl.innerHTML = `
      <div class="holiday-empty">ไม่มีวันหยุดเร็ว ๆ นี้</div>
    `;
    return;
  }

  holidayListEl.innerHTML = holidays.map(h => `
    <div class="holiday-item">
      <span class="holiday-name">${h.name}</span>
      <span class="holiday-date">${h.display}</span>
    </div>
  `).join("");
}

function getHolidayConflictName(date) {

  const companyHolidayName = getCompanyHolidayName(date);
  if (companyHolidayName) {
    return companyHolidayName;
  }

  const fixedThaiHolidayName = getFixedThaiHolidayName(date);
  if (fixedThaiHolidayName) {
    return fixedThaiHolidayName;
  }

  return null;
}

function getLeaveHolidayConflicts(startYmd, endYmd) {
  const start = parseYmdToLocalDate(startYmd);
  const end = parseYmdToLocalDate(endYmd);

  if (!start || !end || end < start) {
    return [];
  }

  const conflicts = [];
  const current = new Date(start);

  while (current <= end) {
    const holidayName = getHolidayConflictName(current);

    if (holidayName) {
      conflicts.push({
        dateYmd: formatYmd(current),
        dateLabel: formatThaiDate(formatYmd(current)),
        holidayName
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return conflicts;
}

function validateLeaveForm() {
  const leaveType = leaveTypeSelect.value;
  const startDate = leaveStartDate.value;
  const endDate = leaveEndDate.value;
  const note = leaveNote.value.trim();
  const file = leaveAttachment.files?.[0] || null;

  if (!currentUserProfile) {
    return "ไม่พบข้อมูลผู้ลา";
  }

  if (!leaveType || !LEAVE_TYPES[leaveType]) {
    return "กรุณาเลือกประเภทการลา";
  }

  if (!startDate || !endDate) {
    return "กรุณาเลือกช่วงวันลา";
  }

  const start = parseYmdToLocalDate(startDate);
  const end = parseYmdToLocalDate(endDate);

  if (!start || !end) {
    return "รูปแบบวันที่ไม่ถูกต้อง";
  }

  if (end < start) {
    return "วันสิ้นสุดลาต้องไม่ก่อนวันเริ่มลา";
  }

  const typeConfig = LEAVE_TYPES[leaveType];

  if (typeConfig.requiresNote && !note) {
    return "ประเภทการลานี้ต้องกรอกหมายเหตุ";
  }

  if (typeConfig.requiresAdvance) {
    const today = getTodayLocalDate();
    const minAdvanceDate = new Date(today);
    minAdvanceDate.setDate(minAdvanceDate.getDate() + 1);

    if (start < minAdvanceDate) {
      return "ประเภทการลานี้ต้องยื่นลาล่วงหน้าอย่างน้อย 1 วัน";
    }
  }

  const holidayConflicts = getLeaveHolidayConflicts(startDate, endDate);

  if (holidayConflicts.length > 0) {
    const lines = holidayConflicts
      .map((item) => `• ${item.dateLabel} (${item.holidayName})`)
      .join("\n");

    return `ไม่สามารถลาทับวันหยุดได้\n${lines}`;
  }

  if (file) {
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > LEAVE_ATTACHMENT_MAX_MB) {
      return `ไฟล์แนบต้องมีขนาดไม่เกิน ${LEAVE_ATTACHMENT_MAX_MB} MB`;
    }
  }

  return null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function resetLeaveForm() {
  leaveForm.reset();
  updateLeaveTypeUI();
  updateLeaveTotalDaysUI();
  updateAttachmentNameUI();
}

function createLeaveRequestRef() {
  return doc(collection(db, "leaveRequests"));
}

async function loadLeaveHistory() {
  if (!leaveHistoryLoading || !leaveHistoryList) {
    return;
  }

  if (!auth.currentUser) {
    leaveHistoryLoading.textContent = "ไม่พบผู้ใช้งาน";
    return;
  }

  leaveHistoryLoading.style.display = "block";
  leaveHistoryList.innerHTML = "";

  try {
    const leaveRef = collection(db, "leaveRequests");
    const q = query(leaveRef, where("uid", "==", auth.currentUser.uid));
    const snapshot = await getDocs(q);

    const items = snapshot.docs
      .map((leaveDoc) => ({
        id: leaveDoc.id,
        ...leaveDoc.data()
      }))
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

    leaveHistoryLoading.style.display = "none";

    if (!items.length) {
      leaveHistoryList.innerHTML = `
        <div class="leave-history-empty">ยังไม่มีประวัติการลา</div>
      `;
      return;
    }

    leaveHistoryList.innerHTML = items
      .map((item) => {
        const attachmentHtml =
          item.attachmentDataUrl && item.attachmentName
            ? `
              <div class="leave-history-attachment">
                <a href="${item.attachmentDataUrl}" target="_blank" rel="noopener noreferrer">
                  ดูไฟล์แนบ: ${escapeHtml(item.attachmentName)}
                </a>
              </div>
            `
            : "";

        const noteHtml = item.note
          ? `<div class="leave-history-note">${escapeHtml(item.note)}</div>`
          : "";

        return `
          <div class="leave-history-item">
            <div class="leave-history-top">
              <div>
                <p class="leave-history-type">${escapeHtml(item.leaveTypeLabel || "-")}</p>
                <p class="leave-history-dates">
                  ${escapeHtml(formatThaiDate(item.startDate))} - ${escapeHtml(formatThaiDate(item.endDate))}
                </p>
              </div>
              <span class="leave-status-badge ${getStatusBadgeClass(item.status)}">
                ${escapeHtml(getStatusLabel(item.status))}
              </span>
            </div>

            <div class="leave-history-meta">
              <div class="leave-history-meta-item">
                <span class="leave-history-meta-label">จำนวนวัน</span>
                <span class="leave-history-meta-value">${escapeHtml(item.totalDays || 0)} วัน</span>
              </div>

              <div class="leave-history-meta-item">
                <span class="leave-history-meta-label">วันที่ส่งคำขอ</span>
                <span class="leave-history-meta-value">${escapeHtml(formatDateTimeThai(item.createdAt))}</span>
              </div>
            </div>

            ${noteHtml}
            ${attachmentHtml}
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
    leaveHistoryLoading.style.display = "none";
    leaveHistoryList.innerHTML = `
      <div class="leave-history-empty">โหลดประวัติการลาไม่สำเร็จ</div>
    `;
  }
}

async function handleLeaveSubmit(event) {
  event.preventDefault();

  if (isLeaveSubmitting) {
    return;
  }

  const validationError = validateLeaveForm();

  if (validationError) {
    showPopup({
      title: "เกิดข้อผิดพลาด",
      message: validationError,
      mode: "alert",
      confirmText: "ตกลง"
    });
    return;
  }

  try {
    isLeaveSubmitting = true;
    submitLeaveBtn.disabled = true;
    submitLeaveBtn.classList.add("loading");
    submitLeaveBtn.textContent = "กำลังส่งคำขอ...";

    const leaveType = leaveTypeSelect.value;
    const leaveTypeConfig = LEAVE_TYPES[leaveType];
    const startDate = leaveStartDate.value;
    const endDate = leaveEndDate.value;
    const note = leaveNote.value.trim();
    const file = leaveAttachment.files?.[0] || null;
    const attachmentDataUrl = await readFileAsDataUrl(file);

    const leaveRequestRef = createLeaveRequestRef();

    await setDoc(leaveRequestRef, {
      requestId: leaveRequestRef.id,
      uid: auth.currentUser.uid,
      employeeId: currentEmployeeCode || "",
      nameTH: currentEmployeeName || "",
      departmentTH: currentEmployeeDepartment || "",
      positionTH: currentEmployeePosition || "",
      leaveType,
      leaveTypeLabel: leaveTypeConfig.label,
      startDate,
      endDate,
      totalDays: getInclusiveDays(startDate, endDate),
      note,
      attachmentName: file ? file.name : "",
      attachmentMimeType: file ? file.type : "",
      attachmentDataUrl: attachmentDataUrl || "",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp()
    });

    resetLeaveForm();
    await loadLeaveHistory();
    renderHolidayList();
    
    updatePopupToSuccess("ส่งคำขอสำเร็จ", "ระบบบันทึกใบลาของคุณเรียบร้อยแล้ว");
  } catch (error) {
    console.error(error);
    showPopup({
      title: "ผิดพลาด",
      message: "ส่งคำขอลาไม่สำเร็จ",
      mode: "alert",
      confirmText: "ตกลง"
    });
  } finally {
    isLeaveSubmitting = false;
    submitLeaveBtn.disabled = false;
    submitLeaveBtn.classList.remove("loading");
    submitLeaveBtn.textContent = "ส่งคำขอลา";
  }
}

function getAttendanceRootRef(employeeCode) {
  return doc(db, "attendance", employeeCode);
}

function getAttendanceDayRef(employeeCode, workdayKey) {
  return doc(db, "attendance", employeeCode, "days", workdayKey);
}

async function loadEmployeeInfo(uid) {
  const userDoc = await getUserDocByUid(uid);
  const userData = userDoc.data();

  currentEmployeeCode = userData.employeeId || userDoc.id || null;
  currentEmployeeName =
    userData.nameTH ||
    userData.fullName ||
    userData.name ||
    "-";
  currentEmployeeDepartment =
    userData.departmentTH ||
    userData.department ||
    "-";
  currentEmployeePosition =
    userData.positionTH ||
    userData.position ||
    "-";

  currentUserProfile = {
    uid,
    employeeCode: currentEmployeeCode,
    nameTH: currentEmployeeName,
    departmentTH: currentEmployeeDepartment,
    positionTH: currentEmployeePosition
  };

  updateLeaveEmployeeUI();

  if (!currentEmployeeCode) {
    throw new Error("EMPLOYEE_CODE_NOT_FOUND");
  }
}

async function ensureAttendanceRootDoc() {
  const rootRef = getAttendanceRootRef(currentEmployeeCode);

  await setDoc(
    rootRef,
    {
      name: currentEmployeeName || "",
      employeeCode: currentEmployeeCode,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function loadAttendanceRecord() {
  const workdayKey = getWorkdayKey(getNow());
  const dayRef = getAttendanceDayRef(currentEmployeeCode, workdayKey);
  const daySnap = await getDoc(dayRef);

  if (!daySnap.exists()) {
    setEmptyRecord(workdayKey);
    return;
  }

  currentRecord = {
    workdayKey,
    ...daySnap.data()
  };
}

async function loadAttendanceRecordByKey(workdayKey) {
  const dayRef = getAttendanceDayRef(currentEmployeeCode, workdayKey);
  const daySnap = await getDoc(dayRef);

  if (!daySnap.exists()) {
    return null;
  }

  return {
    workdayKey,
    ...daySnap.data()
  };
}

async function saveAttendanceRecord(data) {
  const workdayKey = getWorkdayKey(getNow());
  const dayRef = getAttendanceDayRef(currentEmployeeCode, workdayKey);

  await setDoc(
    dayRef,
    {
      ...data,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  await loadAttendanceRecord();
}

async function saveAttendanceRecordByKey(workdayKey, data) {
  const dayRef = getAttendanceDayRef(currentEmployeeCode, workdayKey);

  await setDoc(
    dayRef,
    {
      ...data,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

function getCurrentLocationOnce() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function loadSitesCache() {
  if (sitesLoaded) {
    return;
  }

  const sitesRef = collection(db, "sites");
  const snapshot = await getDocs(sitesRef);

  cachedSites = snapshot.docs
    .map((siteDoc) => {
      const data = siteDoc.data();

      return {
        id: siteDoc.id,
        active: data.active,
        lat: data.lat,
        lng: data.lng,
        radius: data.radius
      };
    })
    .filter((site) => site.active);

  sitesLoaded = true;
}

function detectSiteByLocation(lat, lng) {
  let matchedSiteName = null;
  let nearestDistance = Infinity;

  cachedSites.forEach((site) => {
    const distance = calculateDistance(lat, lng, site.lat, site.lng);

    if (distance <= site.radius && distance < nearestDistance) {
      nearestDistance = distance;
      matchedSiteName = site.id;
    }
  });

  return matchedSiteName;
}

function applyLiveLocation(location) {
  const siteName = detectSiteByLocation(location.lat, location.lng);

  currentLiveLocation = location;
  currentLiveSiteName = siteName || "นอกพื้นที่";

  updateLiveSiteDisplay();
}

async function refreshCurrentLiveLocationOnce() {
  try {
    currentLiveSiteName = "กำลังตรวจตำแหน่ง...";
    updateLiveSiteDisplay();

    const location = await getCurrentLocationOnce();
    applyLiveLocation(location);
  } catch (error) {
    currentLiveLocation = null;
    currentLiveSiteName = "ไม่พบตำแหน่ง";
    updateLiveSiteDisplay();
  }
}

function startLocationWatcher() {
  if (!("geolocation" in navigator)) {
    currentLiveLocation = null;
    currentLiveSiteName = "ไม่รองรับ GPS";
    updateLiveSiteDisplay();
    return;
  }

  if (watchId !== null) {
    return;
  }

  currentLiveSiteName = "กำลังตรวจตำแหน่ง...";
  updateLiveSiteDisplay();

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      applyLiveLocation(location);
    },
    () => {
      currentLiveLocation = null;
      currentLiveSiteName = "ไม่พบตำแหน่ง";
      updateLiveSiteDisplay();
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

async function ensureUsableLiveLocation() {
  if (currentLiveLocation) {
    return true;
  }

  await refreshCurrentLiveLocationOnce();
  normalizeLiveSiteName();
  return !!currentLiveLocation;
}

async function handleCheckIn() {
  if (isActionRunning || !isAppReady || isAutoCheckoutRunning) {
    return;
  }

  if (!currentEmployeeCode) {
    showPopup({
      title: "ผิดพลาด",
      message: "ไม่พบรหัสพนักงาน",
      mode: "alert",
      confirmText: "ตกลง"
    });
    return;
  }

  if (currentRecord && currentRecord.checkInTime) {
    return;
  }

  try {
    isActionRunning = true;
    setButtonLoading("กำลังเข้างาน...");
    await sleep(250);

    const hasLocation = await ensureUsableLiveLocation();

    if (!hasLocation) {
      showPopup({
        title: "ผิดพลาด",
        message: "ไม่สามารถเข้าถึง GPS ได้",
        mode: "alert",
        confirmText: "ตกลง"
      });
      return;
    }

    if (currentLiveSiteName === "นอกพื้นที่" || currentLiveSiteName === "ไม่พบตำแหน่ง") {
      showPopup({
        title: "ไม่สามารถเข้างานได้",
        message: "คุณไม่ได้อยู่ในพื้นที่ที่กำหนด",
        mode: "alert",
        confirmText: "ตกลง"
      });
      return;
    }

    const now = getNow();
    const checkInLabel = now.getHours() >= 12 ? "ลา" : formatTime(now);
    const checkInType = now.getHours() >= 12 ? "half-day-morning-leave" : "normal";

    await saveAttendanceRecord({
      workdayKey: getWorkdayKey(now),
      checkInTime: now.toISOString(),
      checkOutTime: null,
      checkInLabel,
      checkOutLabel: "--:--",
      checkInType,
      checkOutType: null,
      checkInStatus: getCheckInStatus(now),
      checkOutStatus: null,
      siteIn: currentLiveSiteName,
      siteOut: null,
      locationIn: currentLiveLocation,
      locationOut: null,
      checkoutOutside: false,
      autoCheckedOut: false
    });

    await sleep(180);
    updatePopupToSuccess("สำเร็จ", `เข้างานที่ ${currentLiveSiteName}`);
  } catch (error) {
    showPopup({
      title: "ผิดพลาด",
      message: "บันทึกเข้างานไม่สำเร็จ",
      mode: "alert",
      confirmText: "ตกลง"
    });
  } finally {
    isActionRunning = false;
    clearButtonLoading();
    updateAttendanceUI();
  }
}

async function confirmCheckOut() {
  if (isActionRunning || !isAppReady || isAutoCheckoutRunning) {
    return;
  }

  if (!currentRecord || !currentRecord.checkInTime || currentRecord.checkOutTime) {
    return;
  }

  hidePopup();

  try {
    isActionRunning = true;
    setButtonLoading("กำลังเลิกงาน...");
    await sleep(350);

    const hasLocation = await ensureUsableLiveLocation();

    if (!hasLocation) {
      showPopup({
        title: "ผิดพลาด",
        message: "ไม่สามารถเข้าถึง GPS ได้",
        mode: "alert",
        confirmText: "ตกลง"
      });
      return;
    }

    const now = getNow();
    const checkInDate = new Date(currentRecord.checkInTime);
    const checkedInBeforeNoon = checkInDate.getHours() < 12;

    let checkOutLabel = formatTime(now);
    let checkOutType = "normal";

    if (checkedInBeforeNoon && now.getHours() === 12) {
      checkOutLabel = "ลา";
      checkOutType = "half-day-afternoon-leave";
    }

    await saveAttendanceRecord({
      checkOutTime: now.toISOString(),
      checkOutLabel,
      checkOutType,
      checkOutStatus: getCheckoutStatus(now),
      siteOut: currentLiveSiteName === "ไม่พบตำแหน่ง" ? "นอกพื้นที่" : currentLiveSiteName,
      locationOut: currentLiveLocation,
      checkoutOutside: currentLiveSiteName === "นอกพื้นที่" || currentLiveSiteName === "ไม่พบตำแหน่ง",
      autoCheckedOut: false
    });

    await sleep(220);
    updatePopupToSuccess("สำเร็จ", `เลิกงานที่ ${currentLiveSiteName}`);
  } catch (error) {
    showPopup({
      title: "ผิดพลาด",
      message: "บันทึกเลิกงานไม่สำเร็จ",
      mode: "alert",
      confirmText: "ตกลง"
    });
  } finally {
    isActionRunning = false;
    clearButtonLoading();
    updateAttendanceUI();
  }
}

function handleCheckOut() {
  if (isActionRunning || !isAppReady || isAutoCheckoutRunning) {
    return;
  }

  if (!currentRecord || !currentRecord.checkInTime || currentRecord.checkOutTime) {
    return;
  }

  showPopup({
    title: "ยืนยันการเลิกงาน",
    message: "คุณต้องการบันทึกเวลาเลิกงานใช่ไหม",
    mode: "confirm",
    confirmText: "ยืนยัน",
    cancelText: "ยกเลิก",
    onConfirm: confirmCheckOut
  });
}

function handleMainAction() {
  if (isActionRunning || !isAppReady || isAutoCheckoutRunning) {
    return;
  }

  if (!currentRecord || !currentRecord.checkInTime) {
    handleCheckIn();
    return;
  }

  if (currentRecord.checkInTime && !currentRecord.checkOutTime) {
    const now = getNow();
    const noon = getNoonMoment(now);
    const canRunCountdown = isAfterCountdownStart(now);

    if (!canRunCountdown || now >= noon) {
      handleCheckOut();
    }
  }
}

function normalizeLiveSiteDisplaySafe() {
  normalizeLiveSiteName();
}

function setActiveSection(sectionName) {
  if (!isAppReady) {
    return;
  }

  homeSection.classList.remove("active");
  profileSection.classList.remove("active");
  leaveSection.classList.remove("active");

  homeTabBtn.classList.remove("active");
  profileTabBtn.classList.remove("active");
  leaveTabBtn.classList.remove("active");

  if (sectionName === "home") {
    homeSection.classList.add("active");
    homeTabBtn.classList.add("active");
    normalizeLiveSiteDisplaySafe();
  }

  if (sectionName === "profile") {
    profileSection.classList.add("active");
    profileTabBtn.classList.add("active");
  }

  if (sectionName === "leave") {
    leaveSection.classList.add("active");
    leaveTabBtn.classList.add("active");
    renderHolidayList();
    void loadLeaveHistory();
  }
}

function updateProfile(user) {
  profileEmailEl.textContent = user?.email || "-";
  profileUidEl.textContent = user?.uid || "-";
}

async function autoCheckoutRecord(record) {
  const autoCheckoutMoment = getAutoCheckoutMoment(record.workdayKey);
  const checkInDate = new Date(record.checkInTime);
  const checkedInBeforeNoon = checkInDate.getHours() < 12;

  let checkOutLabel = formatTime(autoCheckoutMoment);
  let checkOutType = "auto";
  let checkOutStatus = getCheckoutStatus(autoCheckoutMoment);

  if (checkedInBeforeNoon && autoCheckoutMoment.getHours() === 12) {
    checkOutLabel = "ลา";
    checkOutType = "half-day-afternoon-leave-auto";
  }

  await saveAttendanceRecordByKey(record.workdayKey, {
    checkOutTime: autoCheckoutMoment.toISOString(),
    checkOutLabel,
    checkOutType,
    checkOutStatus,
    siteOut: record.siteOut || "ระบบอัตโนมัติ",
    locationOut: record.locationOut || null,
    checkoutOutside: !!record.checkoutOutside,
    autoCheckedOut: true
  });
}

async function processAutoCheckoutIfNeeded() {
  if (
    isAutoCheckoutRunning ||
    isActionRunning ||
    !currentEmployeeCode ||
    !currentRecord
  ) {
    return;
  }

  const now = getNow();

  if (!shouldAutoCheckoutRecord(currentRecord, now)) {
    return;
  }

  try {
    isAutoCheckoutRunning = true;
    updateAttendanceUI();

    await autoCheckoutRecord(currentRecord);
    await loadAttendanceRecord();
    updateAttendanceUI();
  } catch (error) {
    console.error("AUTO_CHECKOUT_FAILED", error);
  } finally {
    isAutoCheckoutRunning = false;
    updateAttendanceUI();
  }
}

async function processPreviousWorkdayAutoCheckoutIfNeeded() {
  if (!currentEmployeeCode) {
    return;
  }

  const now = getNow();

  if (!isAfterCountdownStart(now)) {
    return;
  }

  const previousDate = new Date(now);
  previousDate.setDate(previousDate.getDate() - 1);

  const previousWorkdayKey = (() => {
    const year = previousDate.getFullYear();
    const month = String(previousDate.getMonth() + 1).padStart(2, "0");
    const day = String(previousDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  })();

  const previousRecord = await loadAttendanceRecordByKey(previousWorkdayKey);

  if (!shouldAutoCheckoutRecord(previousRecord, now)) {
    return;
  }

  await autoCheckoutRecord(previousRecord);
}

async function syncWorkdayRecordIfNeeded() {
  if (
    isWorkdaySyncRunning ||
    isActionRunning ||
    isAutoCheckoutRunning ||
    !currentEmployeeCode ||
    !currentRecord
  ) {
    return;
  }

  const nowWorkdayKey = getWorkdayKey(getNow());

  if (currentRecord.workdayKey === nowWorkdayKey) {
    return;
  }

  try {
    isWorkdaySyncRunning = true;
    await loadAttendanceRecord();
    updateAttendanceUI();
  } catch (error) {
    console.error("SYNC_WORKDAY_FAILED", error);
  } finally {
    isWorkdaySyncRunning = false;
  }
}

homeTabBtn.addEventListener("click", () => {
  setActiveSection("home");
});

profileTabBtn.addEventListener("click", () => {
  setActiveSection("profile");
});

leaveTabBtn.addEventListener("click", () => {
  setActiveSection("leave");
});

mainActionBtn.addEventListener("click", handleMainAction);

if (leaveTypeSelect) {
  leaveTypeSelect.addEventListener("change", updateLeaveTypeUI);
  leaveStartDate.addEventListener("change", updateLeaveTotalDaysUI);
  leaveEndDate.addEventListener("change", updateLeaveTotalDaysUI);
  leaveAttachment.addEventListener("change", updateAttachmentNameUI);
  leaveForm.addEventListener("submit", handleLeaveSubmit);
}

popupOverlay.addEventListener("click", (event) => {
  if (event.target === popupOverlay && !isActionRunning && !isAutoCheckoutRunning) {
    hidePopup();
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    const user = auth.currentUser;

    if (user) {
      const userDoc = await getUserDocByUid(user.uid);

      await setDoc(
        doc(db, "users", userDoc.id),
        {
          deviceId: "",
          deviceBoundAt: null,
          deviceLabel: null
        },
        { merge: true }
      );
    }

    localStorage.removeItem("deviceId");

    await signOut(auth);
    window.location.replace("./index.html");
  } catch (error) {
    console.error(error);

    showPopup({
      title: "ผิดพลาด",
      message: "ออกจากระบบไม่สำเร็จ",
      mode: "alert",
      confirmText: "ตกลง"
    });
  }
});

window.addEventListener("beforeunload", () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("./index.html");
    return;
  }

  try {
    isAppReady = false;
    setAppLoading("กำลังตรวจสอบเครื่อง...");

    if (leaveTypeSelect) {
      updateLeaveTypeUI();
      updateLeaveTotalDaysUI();
      updateAttachmentNameUI();
    }

    await validateDeviceForCurrentUser(user);

    setAppLoading("กำลังโหลดข้อมูลพนักงาน...");

    updateProfile(user);
    updateClockUI();

    await loadEmployeeInfo(user.uid);

    setAppLoading("กำลังเตรียมข้อมูลการตอกบัตร...");
    await ensureAttendanceRootDoc();

    setAppLoading("กำลังตรวจสอบการตัดเวลาอัตโนมัติ...");
    await processPreviousWorkdayAutoCheckoutIfNeeded();

    setAppLoading("กำลังโหลดข้อมูลการตอกบัตร...");
    await loadAttendanceRecord();

    setAppLoading("กำลังโหลดจุดสถานที่...");
    await loadSitesCache();

    if (leaveHistoryLoading) {
      setAppLoading("กำลังโหลดข้อมูลการลา...");
      await loadLeaveHistory();
    }

    setAppLoading("กำลังโหลดวันหยุด...");
    await loadCompanyHolidays();
    renderHolidayList();

    setAppLoading("กำลังตรวจตำแหน่งปัจจุบัน...");
    await refreshCurrentLiveLocationOnce();
    normalizeLiveSiteName();

    updateAttendanceUI();
    startLocationWatcher();

    if (pageTimer) {
      clearInterval(pageTimer);
    }

    pageTimer = setInterval(() => {
      updateClockUI();
      updateAttendanceUI();
      void processAutoCheckoutIfNeeded();
      void syncWorkdayRecordIfNeeded();
    }, 1000);

    await sleep(250);
    hideAppLoading();
  } catch (error) {
    console.error(error);

    let message = "โหลดข้อมูลพนักงานไม่สำเร็จ";

    if (error.message === "USER_PROFILE_NOT_FOUND") {
      message = "ไม่พบข้อมูลผู้ใช้ในระบบ";
    }

    if (error.message === "EMPLOYEE_CODE_NOT_FOUND") {
      message = "ไม่พบรหัสพนักงานในข้อมูลผู้ใช้";
    }

    if (error.message === "DEVICE_NOT_ALLOWED") {
      message = "บัญชีนี้ถูกผูกกับเครื่องอื่น";
    }

    appLoadingOverlay.classList.add("hidden");

    if (error.message === "DEVICE_NOT_ALLOWED") {
      await signOut(auth);
    }

    showPopup({
      title: "ผิดพลาด",
      message,
      mode: "alert",
      confirmText: "ตกลง",
      onConfirm: () => {
        if (error.message === "DEVICE_NOT_ALLOWED") {
          window.location.replace("./index.html");
        }
      }
    });
  }
});