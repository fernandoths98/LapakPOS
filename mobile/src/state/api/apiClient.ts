import axios from "axios";
import { useAuthStore } from "../auth/authStore";

/**
 * 10.0.2.2 is the Android-emulator-reaches-host convention (loopback alias
 * to the dev machine). Kept as a single exported constant so switching to a
 * real host (physical device, staging API) is a one-line change.
 */
export const API_BASE_URL = "http://192.168.97.61:3000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
