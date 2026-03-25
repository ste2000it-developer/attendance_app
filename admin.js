import {
  auth,
  db,
  doc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  onAuthStateChanged,
  signOut
} from "./firebase.js";

const adminHomeSection = document.getElementById("adminHomeSection");
const reportsSection = document.getElementById("reportsSection");
const approvalSection = document.getElementById("approvalSection");

const openReportsBtn = document.getElementById("openReportsBtn");
const openApprovalBtn = document.getElementById("openApprovalBtn");
const backFromReportsBtn = document.getElementById("backFromReportsBtn");
const backFromApprovalBtn = document.getElementById("backFromApprovalBtn");
const refreshApprovalBtn = document.getElementById("refreshApprovalBtn");

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

const adminPopupOverlay = document.getElementById("adminPopupOverlay");
const adminPopupTitle = document.getElementById("adminPopupTitle");
const adminPopupMessage = document.getElementById("adminPopupMessage");
const adminPopupCancelBtn = document.getElementById("adminPopupCancelBtn");
const adminPopupConfirmBtn = document.getElementById("adminPopupConfirmBtn");

let approvalItems = [];
let isApprovalActionRunning = false;
let currentView = "pending";

const viewLabelMap = {
  pending: "รออนุมัติ",
  all: "ทั้งหมด",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ"
};

function showSection(sectionToShow) {
  adminHomeSection.classList.remove("active");
  reportsSection.classList.remove("active");
  approvalSection.classList.remove("active");
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
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
      onConfirm: () => {
        hidePopup();
      }
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

    showSection(adminHomeSection);
    await loadApprovalItems();
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

backFromReportsBtn.addEventListener("click", () => {
  showSection(adminHomeSection);
});

backFromApprovalBtn.addEventListener("click", () => {
  showSection(adminHomeSection);
});

refreshApprovalBtn.addEventListener("click", async () => {
  await loadApprovalItems();
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
  item.addEventListener("click", async () => {
    currentView = item.dataset.view || "pending";
    syncDropdownUI();
    closeDropdown();
    renderApprovalList(approvalItems);
  });
});

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