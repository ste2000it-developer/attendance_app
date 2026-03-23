import {
  auth,
  db,
  doc,
  getDocs,
  setDoc,
  collection,
  query,
  where,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "./firebase.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");

const eyeOpenIcon = document.getElementById("eyeOpenIcon");
const eyeOffIcon = document.getElementById("eyeOffIcon");

const emailGroup = document.getElementById("emailGroup");
const passwordGroup = document.getElementById("passwordGroup");

let isPasswordVisible = false;

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

// 🔥 หา user doc จาก uid
async function getUserDoc(user) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("uid", "==", user.uid));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  return snapshot.docs[0]; // <-- ตัวนี้สำคัญ (มี id = IT00001)
}

// 🔥 ตรวจ device
async function validateDevice(user) {
  const userDoc = await getUserDoc(user);
  const userData = userDoc.data();

  const currentDeviceId = getDeviceId();

  // ยังไม่ผูกเครื่อง
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

    return true;
  }

  // เครื่องตรง
  if (userData.deviceId === currentDeviceId) {
    return true;
  }

  // เครื่องไม่ตรง
  return false;
}

// 🔥 เช็ค session
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const ok = await validateDevice(user);

      if (!ok) {
        await signOut(auth);
        showError("บัญชีนี้ถูกใช้งานบนเครื่องอื่น");
        document.body.style.display = "block";
        return;
      }

      window.location.replace("./attendance.html");

    } catch (error) {
      console.error(error);

      if (error.message === "USER_PROFILE_NOT_FOUND") {
        showError("ไม่พบข้อมูลผู้ใช้ในระบบ");
      } else {
        showError("เกิดข้อผิดพลาด");
      }

      document.body.style.display = "block";
    }
  } else {
    document.body.style.display = "block";
  }
});

// ================= UI =================
function updateFloatingState(inputElement, groupElement) {
  const hasValue = inputElement.value.trim() !== "";
  const isFocused = document.activeElement === inputElement;

  if (hasValue || isFocused) {
    groupElement.classList.add("active");
  } else {
    groupElement.classList.remove("active");
  }
}

function bindFloatingInput(inputElement, groupElement) {
  inputElement.addEventListener("focus", () => {
    updateFloatingState(inputElement, groupElement);
  });

  inputElement.addEventListener("blur", () => {
    updateFloatingState(inputElement, groupElement);
  });

  inputElement.addEventListener("input", () => {
    updateFloatingState(inputElement, groupElement);
  });

  updateFloatingState(inputElement, groupElement);
}

function showError(message) {
  loginMessage.style.color = "#d12c2c";
  loginMessage.textContent = message;
}

function getFriendlyFirebaseError(errorCode) {
  switch (errorCode) {
    case "auth/invalid-email":
      return "รูปแบบอีเมลไม่ถูกต้อง";
    case "auth/user-not-found":
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "auth/too-many-requests":
      return "ลองผิดหลายครั้งเกินไป";
    case "auth/network-request-failed":
      return "อินเทอร์เน็ตมีปัญหา";
    default:
      return "เข้าสู่ระบบไม่สำเร็จ";
  }
}

bindFloatingInput(emailInput, emailGroup);
bindFloatingInput(passwordInput, passwordGroup);

togglePasswordBtn.addEventListener("click", () => {
  isPasswordVisible = !isPasswordVisible;

  passwordInput.type = isPasswordVisible ? "text" : "password";
  eyeOpenIcon.classList.toggle("hidden");
  eyeOffIcon.classList.toggle("hidden");
});

// 🔥 LOGIN
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("กรุณากรอกอีเมลและรหัสผ่าน");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "กำลังเข้าสู่ระบบ...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showError(getFriendlyFirebaseError(error.code));
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "เข้าสู่ระบบ";
  }
});