import {
  auth,
  db,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onAuthStateChanged,
  signOut
} from "./firebase.js";

const adminHomeSection = document.getElementById("adminHomeSection");
const reportsSection = document.getElementById("reportsSection");
const approvalSection = document.getElementById("approvalSection");
const holidaysSection = document.getElementById("holidaysSection");

const openReportsBtn = document.getElementById("openReportsBtn");
const openApprovalBtn = document.getElementById("openApprovalBtn");
const openHolidaysBtn = document.getElementById("openHolidaysBtn");

const backFromReportsBtn = document.getElementById("backFromReportsBtn");
const backFromApprovalBtn = document.getElementById("backFromApprovalBtn");
const backFromHolidaysBtn = document.getElementById("backFromHolidaysBtn");

const refreshApprovalBtn = document.getElementById("refreshApprovalBtn");
const refreshHolidaysBtn = document.getElementById("refreshHolidaysBtn");
const loadReportBtn = document.getElementById("loadReportBtn");

const reportMonthInput = document.getElementById("reportMonthInput");
const reportRangeText = document.getElementById("reportRangeText");
const reportLoading = document.getElementById("reportLoading");
const reportList = document.getElementById("reportList");

const approvalDropdown = document.getElementById("approvalDropdown");
const approvalDropdownBtn = document.getElementById("approvalDropdownBtn");
const approvalDropdownMenu = document.getElementById("approvalDropdownMenu");
const approvalDropdownLabel = document.getElementById("approvalDropdownLabel");
const approvalDropdownItems = Array.from(document.querySelectorAll(".custom-dropdown-item"));

const pendingCountEl = document.getElementById("pendingCount");
const approvedCountEl = document.getElementById("approvedCount");
const rejectedCountEl = document.getElementById("rejectedCount");
const approvalLoadingEl = document.getElementById("approvalLoading");
const approvalListEl = document.getElementById("approvalList");

const holidayForm = document.getElementById("holidayForm");
const holidayNameInput = document.getElementById("holidayNameInput");
const holidayDateInput = document.getElementById("holidayDateInput");
const holidayLoading = document.getElementById("holidayLoading");
const holidayList = document.getElementById("holidayList");

const adminPopupOverlay = document.getElementById("adminPopupOverlay");
const adminPopupTitle = document.getElementById("adminPopupTitle");
const adminPopupMessage = document.getElementById("adminPopupMessage");
const adminPopupCancelBtn = document.getElementById("adminPopupCancelBtn");
const adminPopupConfirmBtn = document.getElementById("adminPopupConfirmBtn");

let approvalItems = [];
let holidayItems = [];
let isApprovalActionRunning = false;
let currentView = "pending";

const viewLabelMap = {
  pending: "รออนุมัติ",
  all: "ทั้งหมด",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ"
};

// วันหยุดไทยแบบ "วันที่คงที่ทุกปี"
// วันลอยตัว/วันจันทรคติ/วันหยุดพิเศษ ให้เพิ่มผ่าน holidays collection
const FIXED_THAI_HOLIDAYS = {
  "01-01": "วันขึ้นปีใหม่",
  "04-06": "วันจักรี",
  "04-13": "วันสงกรานต์",
  "04-14": "วันสงกรานต์",
  "04-15": "วันสงกรานต์",
  "05-01": "วันแรงงานแห่งชาติ",
  "05-04": "วันฉัตรมงคล",
  "06-03": "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี",
  "07-28": "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว",
  "08-12": "วันแม่แห่งชาติ",
  "10-13": "วันนวมินทรมหาราช",
  "10-23": "วันปิยมหาราช",
  "12-05": "วันพ่อแห่งชาติ",
  "12-10": "วันรัฐธรรมนูญ",
  "12-31": "วันสิ้นปี"
};

function showSection(sectionToShow) {
  adminHomeSection.classList.remove("active");
  reportsSection.classList.remove("active");
  approvalSection.classList.remove("active");
  holidaysSection.classList.remove("active");
  sectionToShow.classList.add("active");
}

async function getUserDoc(user) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("uid", "==", user.uid));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  return snapshot.docs[0];
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseYmdToLocalDate(ymd) {
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getDateFromAny(value) {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
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

function formatDateTimeThai(isoString) {
  const date = getDateFromAny(isoString);
  if (!date) return "-";

  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isSunday(date) {
  return date.getDay() === 0;
}

function getDateKey(date) {
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

function getFixedThaiHolidayLabel(date) {
  return FIXED_THAI_HOLIDAYS[getMonthDayKey(date)] || null;
}

function getReportRangeFromMonth(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 2, 25);
  const end = new Date(year, month - 1, 24);
  return { start, end };
}

function getDatesInRange(start, end) {
  const dates = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function setDefaultReportMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  reportMonthInput.value = `${year}-${month}`;
}

function getApprovalStatusClass(status) {
  if (status === "approved") return "approval-status-approved";
  if (status === "rejected") return "approval-status-rejected";
  return "approval-status-pending";
}

function getApprovalStatusLabel(status) {
  if (status === "approved") return "อนุมัติแล้ว";
  if (status === "rejected") return "ไม่อนุมัติ";
  return "รออนุมัติ";
}

function getReportStatusClass(status) {
  if (status === "ปกติ") return "report-status-normal";
  if (status === "สาย") return "report-status-late";
  if (status === "OT") return "report-status-ot";
  if (status === "สาย + OT") return "report-status-late-ot";
  if (status === "ลา") return "report-status-leave";
  if (status === "วันหยุด") return "report-status-holiday";
  return "report-status-none";
}

function formatOtMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.floor(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainMinutes = safeMinutes % 60;

  if (hours <= 0 && remainMinutes <= 0) {
    return "0 ชม.";
  }

  if (remainMinutes === 0) {
    return `${hours} ชม.`;
  }

  return `${hours} ชม. ${remainMinutes} นาที`;
}

function getOtMinutesForRecord(baseDate, attendanceRecord) {
  if (!attendanceRecord?.checkOutTime) return 0;

  const checkOutDate = getDateFromAny(attendanceRecord.checkOutTime);
  if (!checkOutDate) return 0;

  const otStart = new Date(baseDate);
  const endOfDay = new Date(baseDate);
  endOfDay.setHours(23, 59, 59, 999);

  const nextDaySix = new Date(baseDate);
  nextDaySix.setDate(nextDaySix.getDate() + 1);
  nextDaySix.setHours(6, 0, 0, 0);

  if (isSunday(baseDate)) {
    otStart.setHours(8, 0, 0, 0);
  } else {
    otStart.setHours(18, 0, 0, 0);
  }

  let effectiveEnd = checkOutDate;

  if (checkOutDate >= nextDaySix) {
    effectiveEnd = endOfDay;
  }

  if (effectiveEnd <= otStart) return 0;

  const diffMs = effectiveEnd.getTime() - otStart.getTime();
  return Math.floor(diffMs / 60000);
}

function showPopup({
  title = "แจ้งเตือน",
  message = "",
  confirmText = "ตกลง",
  cancelText = "ยกเลิก",
  hideCancel = false,
  onConfirm = null,
  onCancel = null
}) {
  adminPopupTitle.textContent = title;
  adminPopupMessage.textContent = message;
  adminPopupConfirmBtn.textContent = confirmText;
  adminPopupCancelBtn.textContent = cancelText;
  adminPopupCancelBtn.style.display = hideCancel ? "none" : "inline-flex";

  adminPopupConfirmBtn.onclick = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      hidePopup();
    }
  };

  adminPopupCancelBtn.onclick = () => {
    hidePopup();
    if (onCancel) onCancel();
  };

  adminPopupOverlay.classList.remove("hidden");
}

function hidePopup() {
  adminPopupOverlay.classList.add("hidden");
}

/* ===== APPROVAL ===== */
function updateApprovalSummary(items) {
  const pending = items.filter((item) => item.status === "pending").length;
  const approved = items.filter((item) => item.status === "approved").length;
  const rejected = items.filter((item) => item.status === "rejected").length;

  pendingCountEl.textContent = String(pending);
  approvedCountEl.textContent = String(approved);
  rejectedCountEl.textContent = String(rejected);
}

function getFilteredApprovalItems(items) {
  if (currentView === "pending") {
    return items.filter((item) => item.status === "pending");
  }

  if (currentView === "all") {
    return items;
  }

  return items.filter((item) => item.status === currentView);
}

function renderApprovalList(items) {
  const filteredItems = getFilteredApprovalItems(items);

  if (!filteredItems.length) {
    const emptyText =
      currentView === "pending"
        ? "ตอนนี้ไม่มีใบลาที่รออนุมัติ"
        : "ไม่พบรายการตามตัวกรองที่เลือก";

    approvalListEl.innerHTML = `
      <div class="approval-empty">${emptyText}</div>
    `;
    return;
  }

  approvalListEl.innerHTML = filteredItems
    .map((item) => {
      const noteHtml = item.note
        ? `<div class="approval-note">${escapeHtml(item.note)}</div>`
        : "";

      const attachmentHtml =
        item.attachmentDataUrl && item.attachmentName
          ? `
            <div class="approval-attachment">
              <a href="${item.attachmentDataUrl}" target="_blank" rel="noopener noreferrer">
                ดูไฟล์แนบ: ${escapeHtml(item.attachmentName)}
              </a>
            </div>
          `
          : "";

      const actionButtonsHtml =
        currentView === "pending" && item.status === "pending"
          ? `
            <div class="approval-actions">
              <button
                class="action-btn action-btn-approve"
                type="button"
                data-leave-id="${escapeHtml(item.id)}"
                data-action="approved"
              >
                อนุมัติ
              </button>

              <button
                class="action-btn action-btn-reject"
                type="button"
                data-leave-id="${escapeHtml(item.id)}"
                data-action="rejected"
              >
                ไม่อนุมัติ
              </button>
            </div>
          `
          : "";

      return `
        <div class="approval-item">
          <div class="approval-item-top">
            <div>
              <p class="approval-name">${escapeHtml(item.nameTH || "-")}</p>
              <p class="approval-type">${escapeHtml(item.leaveTypeLabel || "-")}</p>
            </div>

            <span class="approval-status-badge ${getApprovalStatusClass(item.status)}">
              ${escapeHtml(getApprovalStatusLabel(item.status))}
            </span>
          </div>

          <div class="approval-meta">
            <div class="approval-meta-item">
              <span class="approval-meta-label">รหัสพนักงาน</span>
              <span class="approval-meta-value">${escapeHtml(item.employeeId || "-")}</span>
            </div>

            <div class="approval-meta-item">
              <span class="approval-meta-label">จำนวนวัน</span>
              <span class="approval-meta-value">${escapeHtml(item.totalDays || 0)} วัน</span>
            </div>

            <div class="approval-meta-item">
              <span class="approval-meta-label">แผนก</span>
              <span class="approval-meta-value">${escapeHtml(item.departmentTH || "-")}</span>
            </div>

            <div class="approval-meta-item">
              <span class="approval-meta-label">ตำแหน่ง</span>
              <span class="approval-meta-value">${escapeHtml(item.positionTH || "-")}</span>
            </div>

            <div class="approval-meta-item">
              <span class="approval-meta-label">ช่วงวันลา</span>
              <span class="approval-meta-value">
                ${escapeHtml(formatThaiDate(item.startDate))} - ${escapeHtml(formatThaiDate(item.endDate))}
              </span>
            </div>

            <div class="approval-meta-item">
              <span class="approval-meta-label">วันที่ส่งคำขอ</span>
              <span class="approval-meta-value">${escapeHtml(formatDateTimeThai(item.createdAt))}</span>
            </div>
          </div>

          ${noteHtml}
          ${attachmentHtml}
          ${actionButtonsHtml}
        </div>
      `;
    })
    .join("");
}

function openDropdown() {
  approvalDropdown.classList.add("open");
  approvalDropdownMenu.classList.remove("hidden");
  approvalDropdownBtn.setAttribute("aria-expanded", "true");
}

function closeDropdown() {
  approvalDropdown.classList.remove("open");
  approvalDropdownMenu.classList.add("hidden");
  approvalDropdownBtn.setAttribute("aria-expanded", "false");
}

function syncDropdownUI() {
  approvalDropdownLabel.textContent = viewLabelMap[currentView] || "รออนุมัติ";

  approvalDropdownItems.forEach((item) => {
    if (item.dataset.view === currentView) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

async function loadApprovalItems() {
  approvalLoadingEl.style.display = "block";
  approvalLoadingEl.textContent = "กำลังโหลดรายการใบลา...";
  approvalListEl.innerHTML = "";

  try {
    const leaveRef = collection(db, "leaveRequests");
    const snapshot = await getDocs(leaveRef);

    approvalItems = snapshot.docs
      .map((leaveDoc) => ({
        id: leaveDoc.id,
        ...leaveDoc.data()
      }))
      .sort((a, b) => {
        const aTime = getDateFromAny(a.createdAt)?.getTime() || 0;
        const bTime = getDateFromAny(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      });

    updateApprovalSummary(approvalItems);
    syncDropdownUI();
    renderApprovalList(approvalItems);

    approvalLoadingEl.style.display = "none";
  } catch (error) {
    console.error(error);
    approvalLoadingEl.style.display = "block";
    approvalLoadingEl.textContent = "โหลดรายการใบลาไม่สำเร็จ";
    approvalListEl.innerHTML = "";
  }
}

async function updateLeaveStatus(leaveId, newStatus) {
  if (isApprovalActionRunning) return;

  try {
    isApprovalActionRunning = true;

    await updateDoc(doc(db, "leaveRequests", leaveId), {
      status: newStatus,
      updatedAt: new Date().toISOString()
    });

    hidePopup();

    showPopup({
      title: "สำเร็จ",
      message:
        newStatus === "approved"
          ? "อนุมัติใบลาเรียบร้อยแล้ว"
          : "ไม่อนุมัติใบลาเรียบร้อยแล้ว",
      confirmText: "ตกลง",
      hideCancel: true,
      onConfirm: async () => {
        hidePopup();
        await loadApprovalItems();
      }
    });
  } catch (error) {
    console.error(error);

    showPopup({
      title: "ผิดพลาด",
      message: "อัปเดตสถานะใบลาไม่สำเร็จ",
      confirmText: "ตกลง",
      hideCancel: true,
      onConfirm: hidePopup
    });
  } finally {
    isApprovalActionRunning = false;
  }
}

function handleApprovalListClick(event) {
  const actionBtn = event.target.closest("[data-leave-id][data-action]");

  if (!actionBtn) return;

  const leaveId = actionBtn.dataset.leaveId;
  const action = actionBtn.dataset.action;

  const selectedItem = approvalItems.find((item) => item.id === leaveId);
  const employeeName = selectedItem?.nameTH || "รายการนี้";

  if (action === "approved") {
    showPopup({
      title: "ยืนยันการอนุมัติ",
      message: `คุณต้องการอนุมัติใบลาของ ${employeeName} ใช่ไหม`,
      confirmText: "อนุมัติ",
      cancelText: "ยกเลิก",
      onConfirm: () => {
        updateLeaveStatus(leaveId, "approved");
      }
    });
    return;
  }

  if (action === "rejected") {
    showPopup({
      title: "ยืนยันการไม่อนุมัติ",
      message: `คุณต้องการไม่อนุมัติใบลาของ ${employeeName} ใช่ไหม`,
      confirmText: "ไม่อนุมัติ",
      cancelText: "ยกเลิก",
      onConfirm: () => {
        updateLeaveStatus(leaveId, "rejected");
      }
    });
  }
}

/* ===== HOLIDAYS ===== */
function renderHolidayList(items) {
  if (!items.length) {
    holidayList.innerHTML = `<div class="holiday-empty">ยังไม่มีวันหยุดบริษัท</div>`;
    return;
  }

  holidayList.innerHTML = items
    .map((item) => {
      return `
        <div class="holiday-item">
          <div>
            <p class="holiday-name">${escapeHtml(item.name || "-")}</p>
            <p class="holiday-date">${escapeHtml(formatThaiDate(item.date))}</p>
          </div>

          <button
            class="holiday-delete-btn"
            type="button"
            data-holiday-id="${escapeHtml(item.id)}"
            data-holiday-name="${escapeHtml(item.name || "")}"
          >
            ลบ
          </button>
        </div>
      `;
    })
    .join("");
}

async function loadHolidays() {
  holidayLoading.style.display = "block";
  holidayLoading.textContent = "กำลังโหลดวันหยุด...";
  holidayList.innerHTML = "";

  try {
    const holidaysRef = collection(db, "holidays");
    const snapshot = await getDocs(holidaysRef);

    holidayItems = snapshot.docs
      .map((holidayDoc) => ({
        id: holidayDoc.id,
        ...holidayDoc.data()
      }))
      .sort((a, b) => {
        const aDate = a.date || "";
        const bDate = b.date || "";
        return aDate.localeCompare(bDate);
      });

    renderHolidayList(holidayItems);
    holidayLoading.style.display = "none";
  } catch (error) {
    console.error(error);
    holidayLoading.style.display = "block";
    holidayLoading.textContent = "โหลดวันหยุดไม่สำเร็จ";
    holidayList.innerHTML = "";
  }
}

async function saveHoliday(event) {
  event.preventDefault();

  const name = holidayNameInput.value.trim();
  const date = holidayDateInput.value;

  if (!name || !date) {
    showPopup({
      title: "ข้อมูลไม่ครบ",
      message: "กรุณากรอกชื่อวันหยุดและวันที่ให้ครบ",
      confirmText: "ตกลง",
      hideCancel: true,
      onConfirm: hidePopup
    });
    return;
  }

  try {
    const holidayId = date;

    await setDoc(
      doc(db, "holidays", holidayId),
      {
        name,
        date,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    holidayNameInput.value = "";
    holidayDateInput.value = "";

    showPopup({
      title: "สำเร็จ",
      message: "บันทึกวันหยุดเรียบร้อยแล้ว",
      confirmText: "ตกลง",
      hideCancel: true,
      onConfirm: async () => {
        hidePopup();
        await loadHolidays();
      }
    });
  } catch (error) {
    console.error(error);
    showPopup({
      title: "ผิดพลาด",
      message: "บันทึกวันหยุดไม่สำเร็จ",
      confirmText: "ตกลง",
      hideCancel: true,
      onConfirm: hidePopup
    });
  }
}

async function deleteHoliday(holidayId) {
  try {
    await deleteDoc(doc(db, "holidays", holidayId));

    showPopup({
      title: "สำเร็จ",
      message: "ลบวันหยุดเรียบร้อยแล้ว",
      confirmText: "ตกลง",
      hideCancel: true,
      onConfirm: async () => {
        hidePopup();
        await loadHolidays();
      }
    });
  } catch (error) {
    console.error(error);
    showPopup({
      title: "ผิดพลาด",
      message: "ลบวันหยุดไม่สำเร็จ",
      confirmText: "ตกลง",
      hideCancel: true,
      onConfirm: hidePopup
    });
  }
}

function handleHolidayListClick(event) {
  const deleteBtn = event.target.closest("[data-holiday-id]");
  if (!deleteBtn) return;

  const holidayId = deleteBtn.dataset.holidayId;
  const holidayName = deleteBtn.dataset.holidayName || "วันหยุดนี้";

  showPopup({
    title: "ยืนยันการลบ",
    message: `คุณต้องการลบ ${holidayName} ใช่ไหม`,
    confirmText: "ลบ",
    cancelText: "ยกเลิก",
    onConfirm: () => {
      deleteHoliday(holidayId);
    }
  });
}

/* ===== REPORT ===== */
function buildReportRangeText(start, end) {
  return `ช่วงรายงาน: ${formatThaiDate(getDateKey(start))} - ${formatThaiDate(getDateKey(end))}`;
}

function getLeaveDaysSet(items, start, end) {
  const result = new Set();

  items.forEach((item) => {
    const leaveStart = parseYmdToLocalDate(item.startDate);
    const leaveEnd = parseYmdToLocalDate(item.endDate);

    if (!leaveStart || !leaveEnd) return;

    const current = new Date(leaveStart);
    while (current <= leaveEnd) {
      if (current >= start && current <= end) {
        result.add(getDateKey(current));
      }
      current.setDate(current.getDate() + 1);
    }
  });

  return result;
}

function getCompanyHolidayMapInRange(start, end) {
  const map = new Map();

  holidayItems.forEach((item) => {
    const date = parseYmdToLocalDate(item.date);
    if (!date) return;

    if (date >= start && date <= end) {
      map.set(item.date, item.name || "วันหยุดบริษัท");
    }
  });

  return map;
}

async function loadEmployeesForReport() {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);

  return snapshot.docs
    .map((userDoc) => ({
      id: userDoc.id,
      ...userDoc.data()
    }))
    .filter((item) => item.role !== "admin" && (item.employeeId || item.id));
}

async function loadAttendanceDaysForEmployee(employeeCode) {
  const daysRef = collection(db, "attendance", employeeCode, "days");
  const snapshot = await getDocs(daysRef);

  const map = new Map();

  snapshot.docs.forEach((dayDoc) => {
    map.set(dayDoc.id, dayDoc.data());
  });

  return map;
}

async function loadApprovedLeavesForUser(uid) {
  const leaveRef = collection(db, "leaveRequests");
  const q = query(leaveRef, where("uid", "==", uid));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((leaveDoc) => ({
      id: leaveDoc.id,
      ...leaveDoc.data()
    }))
    .filter((item) => item.status === "approved");
}

function computeDayRow(date, attendanceRecord, approvedLeaveSet, companyHolidayMap) {
  const dateKey = getDateKey(date);
  const companyHolidayName = companyHolidayMap.get(dateKey);
  const fixedHolidayName = getFixedThaiHolidayLabel(date);

  if (approvedLeaveSet.has(dateKey)) {
    return {
      dateKey,
      status: "ลา",
      checkIn: "-",
      checkOut: "-",
      siteIn: "-",
      siteOut: "-",
      note: "มีใบลาอนุมัติ",
      otMinutes: 0
    };
  }

  if (companyHolidayName) {
    return {
      dateKey,
      status: "วันหยุด",
      checkIn: "-",
      checkOut: "-",
      siteIn: "-",
      siteOut: "-",
      note: companyHolidayName,
      otMinutes: 0
    };
  }

  if (fixedHolidayName) {
    return {
      dateKey,
      status: "วันหยุด",
      checkIn: "-",
      checkOut: "-",
      siteIn: "-",
      siteOut: "-",
      note: fixedHolidayName,
      otMinutes: 0
    };
  }

  if (isSunday(date)) {
    return {
      dateKey,
      status: "วันหยุด",
      checkIn: "-",
      checkOut: "-",
      siteIn: "-",
      siteOut: "-",
      note: "วันอาทิตย์",
      otMinutes: 0
    };
  }

  if (!attendanceRecord || !attendanceRecord.checkInTime) {
    return {
      dateKey,
      status: "-",
      checkIn: "-",
      checkOut: "-",
      siteIn: "-",
      siteOut: "-",
      note: "-",
      otMinutes: 0
    };
  }

  const otMinutes = getOtMinutesForRecord(date, attendanceRecord);
  const isLate = attendanceRecord.checkInStatus === "สาย";
  const hasOt = otMinutes > 0;

  let status = "ปกติ";
  if (isLate && hasOt) status = "สาย + OT";
  else if (isLate) status = "สาย";
  else if (hasOt) status = "OT";

  let note = attendanceRecord.autoCheckedOut ? "ตัดอัตโนมัติ" : "-";

  if (otMinutes > 0) {
    note =
      note === "-"
        ? `OT ${formatOtMinutes(otMinutes)}`
        : `${note} · OT ${formatOtMinutes(otMinutes)}`;
  }

  return {
    dateKey,
    status,
    checkIn: attendanceRecord.checkInLabel || "-",
    checkOut: attendanceRecord.checkOutLabel || "-",
    siteIn: attendanceRecord.siteIn || "-",
    siteOut: attendanceRecord.siteOut || "-",
    note,
    otMinutes
  };
}

function renderReport(reportItems) {
  if (!reportItems.length) {
    reportList.innerHTML = `<div class="report-empty">ไม่พบข้อมูลพนักงานสำหรับรายงาน</div>`;
    return;
  }

  reportList.innerHTML = reportItems
    .map((employee, index) => {
      const rowsHtml = employee.rows
        .map((row) => {
          return `
            <tr>
              <td>${escapeHtml(formatThaiDate(row.dateKey))}</td>
              <td>
                <span class="report-status-badge ${getReportStatusClass(row.status)}">
                  ${escapeHtml(row.status)}
                </span>
              </td>
              <td>${escapeHtml(row.checkIn)}</td>
              <td>${escapeHtml(row.checkOut)}</td>
              <td>${escapeHtml(row.siteIn)}</td>
              <td>${escapeHtml(row.siteOut)}</td>
              <td>${escapeHtml(row.note)}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <div class="report-employee-card" data-report-card="${index}">
          <button class="report-employee-toggle" type="button" data-report-toggle="${index}">
            <div class="report-employee-header">
              <div>
                <p class="report-employee-name">${escapeHtml(employee.name)}</p>
                <p class="report-employee-sub">
                  รหัส: ${escapeHtml(employee.employeeCode)} · แผนก: ${escapeHtml(employee.department)} · ตำแหน่ง: ${escapeHtml(employee.position)}
                </p>
              </div>

              <div class="report-mini-summary">
                <span class="report-mini-badge">มาสาย ${employee.lateCount}</span>
                <span class="report-mini-badge">OT ${escapeHtml(formatOtMinutes(employee.otMinutes))}</span>
                <span class="report-mini-badge">ลา ${employee.leaveCount}</span>
              </div>
            </div>

            <div class="report-toggle-row">
              <span class="report-toggle-text">กดเพื่อดูรายละเอียดรายวัน</span>
              <span class="report-toggle-icon">⌄</span>
            </div>
          </button>

          <div class="report-employee-body">
            <div class="report-table-wrap">
              <table class="report-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>สถานะ</th>
                    <th>เข้างาน</th>
                    <th>ออกงาน</th>
                    <th>Site In</th>
                    <th>Site Out</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function bindReportCardToggle() {
  const toggleButtons = Array.from(document.querySelectorAll("[data-report-toggle]"));

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const index = button.dataset.reportToggle;
      const card = document.querySelector(`[data-report-card="${index}"]`);
      if (!card) return;
      card.classList.toggle("open");
    });
  });
}

async function loadReport() {
  const monthValue = reportMonthInput.value;

  if (!monthValue) {
    reportLoading.style.display = "block";
    reportLoading.textContent = "กรุณาเลือกเดือนก่อน";
    reportList.innerHTML = "";
    return;
  }

  reportLoading.style.display = "block";
  reportLoading.textContent = "กำลังโหลดรายงาน...";
  reportList.innerHTML = "";

  try {
    const { start, end } = getReportRangeFromMonth(monthValue);
    reportRangeText.textContent = buildReportRangeText(start, end);

    // ให้แน่ใจว่าได้วันหยุดล่าสุดก่อนทำ report
    await loadHolidays();

    const users = await loadEmployeesForReport();
    const dates = getDatesInRange(start, end);
    const companyHolidayMap = getCompanyHolidayMapInRange(start, end);

    const reportItems = [];

    for (const user of users) {
      const employeeCode = user.employeeId || user.id;
      const attendanceMap = await loadAttendanceDaysForEmployee(employeeCode);
      const approvedLeaves = await loadApprovedLeavesForUser(user.uid);
      const approvedLeaveSet = getLeaveDaysSet(approvedLeaves, start, end);

      let lateCount = 0;
      let otMinutes = 0;
      let leaveCount = 0;

      const rows = dates.map((date) => {
        const row = computeDayRow(
          date,
          attendanceMap.get(getDateKey(date)),
          approvedLeaveSet,
          companyHolidayMap
        );

        if (row.status === "สาย" || row.status === "สาย + OT") {
          lateCount += 1;
        }

        if (row.otMinutes > 0) {
          otMinutes += row.otMinutes;
        }

        if (row.status === "ลา") {
          leaveCount += 1;
        }

        return row;
      });

      reportItems.push({
        employeeCode,
        name: user.nameTH || user.fullName || user.name || "-",
        department: user.departmentTH || user.department || "-",
        position: user.positionTH || user.position || "-",
        lateCount,
        otMinutes,
        leaveCount,
        rows
      });
    }

    renderReport(reportItems);
    bindReportCardToggle();

    reportLoading.style.display = "none";
  } catch (error) {
    console.error(error);
    reportLoading.style.display = "block";
    reportLoading.textContent = "โหลดรายงานไม่สำเร็จ";
    reportList.innerHTML = "";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("./index.html");
    return;
  }

  try {
    const userDoc = await getUserDoc(user);
    const userData = userDoc.data();

    if (userData.role !== "admin") {
      window.location.replace("./attendance.html");
      return;
    }

    currentView = "pending";
    syncDropdownUI();
    closeDropdown();
    setDefaultReportMonth();

    showSection(adminHomeSection);
    await loadApprovalItems();
    await loadHolidays();
  } catch (error) {
    console.error(error);
    await signOut(auth);
    window.location.replace("./index.html");
  }
});

openReportsBtn.addEventListener("click", () => {
  showSection(reportsSection);
});

openApprovalBtn.addEventListener("click", async () => {
  showSection(approvalSection);
  await loadApprovalItems();
});

openHolidaysBtn.addEventListener("click", async () => {
  showSection(holidaysSection);
  await loadHolidays();
});

backFromReportsBtn.addEventListener("click", () => {
  showSection(adminHomeSection);
});

backFromApprovalBtn.addEventListener("click", () => {
  showSection(adminHomeSection);
});

backFromHolidaysBtn.addEventListener("click", () => {
  showSection(adminHomeSection);
});

refreshApprovalBtn.addEventListener("click", async () => {
  await loadApprovalItems();
});

refreshHolidaysBtn.addEventListener("click", async () => {
  await loadHolidays();
});

loadReportBtn.addEventListener("click", async () => {
  await loadReport();
});

approvalDropdownBtn.addEventListener("click", (event) => {
  event.stopPropagation();

  if (approvalDropdown.classList.contains("open")) {
    closeDropdown();
  } else {
    openDropdown();
  }
});

approvalDropdownItems.forEach((item) => {
  item.addEventListener("click", () => {
    currentView = item.dataset.view || "pending";
    syncDropdownUI();
    closeDropdown();
    renderApprovalList(approvalItems);
  });
});

holidayForm.addEventListener("submit", saveHoliday);
holidayList.addEventListener("click", handleHolidayListClick);

document.addEventListener("click", (event) => {
  if (!approvalDropdown.contains(event.target)) {
    closeDropdown();
  }
});

approvalListEl.addEventListener("click", handleApprovalListClick);

adminPopupOverlay.addEventListener("click", (event) => {
  if (event.target === adminPopupOverlay) {
    hidePopup();
  }
});