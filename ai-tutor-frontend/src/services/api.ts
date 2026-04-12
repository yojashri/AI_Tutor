import axios from "axios";

//////////////////////////////////////////////////////
// 🔥 BASE CONFIG
//////////////////////////////////////////////////////

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 300000,
});

//////////////////////////////////////////////////////
// 🔄 REQUEST INTERCEPTOR
//////////////////////////////////////////////////////

api.interceptors.request.use((config) => {
  console.log(
    "📡 API:",
    config.method?.toUpperCase(),
    config.url
  );
  return config;
});

//////////////////////////////////////////////////////
// 🔥 RESPONSE INTERCEPTOR
//////////////////////////////////////////////////////

api.interceptors.response.use(
  (response) => response,

  (error) => {
    ////////////////////////////////////////////
    // ❌ NETWORK ERROR
    ////////////////////////////////////////////
    if (!error.response) {
      console.error("❌ Network error:", error.message);

      error.customMessage =
        "Network error. Please check your connection.";

      return Promise.reject(error);
    }

    const status = error.response.status;
    const data = error.response.data;

    ////////////////////////////////////////////
    // 🔐 401 → SESSION EXPIRED
    ////////////////////////////////////////////
    if (status === 401) {
      console.warn("🔐 Unauthorized");

      if (typeof window !== "undefined") {
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }

      error.customMessage = "Session expired. Please login again.";
      return Promise.reject(error);
    }

    ////////////////////////////////////////////
    // ⚠️ 400
    ////////////////////////////////////////////
    if (status === 400) {
      error.customMessage = data?.message || "Invalid request";
      return Promise.reject(error);
    }

    ////////////////////////////////////////////
    // 💥 500+
    ////////////////////////////////////////////
    if (status >= 500) {
      error.customMessage = "Server error. Try again later.";
      return Promise.reject(error);
    }

    ////////////////////////////////////////////
    // DEFAULT
    ////////////////////////////////////////////
    error.customMessage = data?.message || error.message;

    return Promise.reject(error);
  }
);