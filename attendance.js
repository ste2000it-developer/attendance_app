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

let currentRecord = null;
let currentEmployeeCode = null;
let currentEmployeeName = null;
let pageTimer = null;

let currentLiveLocation = null;
let currentLiveSiteName = "กำลังตรวจตำแหน่ง...";
let watchId = null;

let cachedSites = [];
let sitesLoaded = false;
let isActionRunning = false;
let isAppReady = false;

let locationLoadingInterval = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getWorkdayBaseDate(date) {
  const base = new Date(date);
  const hour = base.getHours();
  const minute = base.getMinutes();

  const isBeforeReset = hour < 6 || (hour === 6 && minute === 0);

  if (isBeforeReset) {
    base.setDate(base.getDate() - 1);
  }

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

  if (isActionRunning) {
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

function getAttendanceRootRef(employeeCode) {
  return doc(db, "attendance", employeeCode);
}

function getAttendanceDayRef(employeeCode, workdayKey) {
  return doc(db, "attendance", employeeCode, "days", workdayKey);
}

async function loadEmployeeInfo(uid) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("uid", "==", uid));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const userDoc = querySnapshot.docs[0];
  const userData = userDoc.data();

  currentEmployeeCode = userData.employeeId || null;
  currentEmployeeName = userData.nameTH || "";

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
  if (isActionRunning || !isAppReady) {
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
  if (isActionRunning || !isAppReady) {
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
  if (isActionRunning || !isAppReady) {
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
  if (isActionRunning || !isAppReady) {
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
    normalizeLiveSiteName();
  }

  if (sectionName === "profile") {
    profileSection.classList.add("active");
    profileTabBtn.classList.add("active");
  }

  if (sectionName === "leave") {
    leaveSection.classList.add("active");
    leaveTabBtn.classList.add("active");
  }
}

function updateProfile(user) {
  profileEmailEl.textContent = user?.email || "-";
  profileUidEl.textContent = user?.uid || "-";
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

popupOverlay.addEventListener("click", (event) => {
  if (event.target === popupOverlay && !isActionRunning) {
    hidePopup();
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("./index.html");
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
    setAppLoading("กำลังโหลดข้อมูลพนักงาน...");

    updateProfile(user);
    updateClockUI();

    await loadEmployeeInfo(user.uid);

    setAppLoading("กำลังเตรียมข้อมูลการตอกบัตร...");
    await ensureAttendanceRootDoc();
    await loadAttendanceRecord();

    setAppLoading("กำลังโหลดจุดสถานที่...");
    await loadSitesCache();

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

    appLoadingOverlay.classList.add("hidden");

    showPopup({
      title: "ผิดพลาด",
      message,
      mode: "alert",
      confirmText: "ตกลง"
    });
  }
});
