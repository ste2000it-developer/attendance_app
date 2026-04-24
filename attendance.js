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

const profilePhotoEl = document.getElementById("profilePhoto");
const profilePhotoFallbackEl = document.getElementById("profilePhotoFallback");
const profileNameEl = document.getElementById("profileName");
const profileEmployeeCodeEl = document.getElementById("profileEmployeeCode");
const profileDepartmentEl = document.getElementById("profileDepartment");
const profilePositionEl = document.getElementById("profilePosition");
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
let currentEmployeePhotoUrl = null;
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
