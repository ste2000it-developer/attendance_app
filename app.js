import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword
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
let authChecked = false;

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

function showSuccess(message) {
  loginMessage.style.color = "#1f8b4c";
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
      return "ลองผิดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง";
    case "auth/network-request-failed":
      return "อินเทอร์เน็ตมีปัญหา กรุณาลองใหม่";
    default:
      return "เข้าสู่ระบบไม่สำเร็จ";
  }
}

bindFloatingInput(emailInput, emailGroup);
bindFloatingInput(passwordInput, passwordGroup);

togglePasswordBtn.addEventListener("click", () => {
  isPasswordVisible = !isPasswordVisible;

  if (isPasswordVisible) {
    passwordInput.type = "text";
    eyeOpenIcon.classList.add("hidden");
    eyeOffIcon.classList.remove("hidden");
  } else {
    passwordInput.type = "password";
    eyeOpenIcon.classList.remove("hidden");
    eyeOffIcon.classList.add("hidden");
  }

  updateFloatingState(passwordInput, passwordGroup);
});

onAuthStateChanged(auth, (user) => {
  if (!authChecked) {
    authChecked = true;
  }

   if (user) {
    window.location.replace("./attendance.html");
  } else {
    document.body.style.display = "block";
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  loginMessage.textContent = "";
  loginMessage.style.color = "#d12c2c";

  if (!email || !password) {
    showError("กรุณากรอกอีเมลและรหัสผ่าน");
    updateFloatingState(emailInput, emailGroup);
    updateFloatingState(passwordInput, passwordGroup);
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "กำลังเข้าสู่ระบบ...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showSuccess("เข้าสู่ระบบสำเร็จ");
    window.location.href = "./attendance.html";
  } catch (error) {
    showError(getFriendlyFirebaseError(error.code));
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "เข้าสู่ระบบ";
  }
});