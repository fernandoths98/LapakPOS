import axios from "axios";
import { useAuthStore } from "../auth/authStore";
import { getActiveOutletId } from "../outlet/outletStore";

/**
 * 10.0.2.2 is the Android-emulator-reaches-host convention (loopback alias
 * to the dev machine). Kept as a single exported constant so switching to a
 * real host (physical device, staging API) is a one-line change.
 */
export const API_BASE_URL = "https://lapak-api.kotdee.tech";

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
  const outletId = getActiveOutletId();
  if (outletId) {
    config.headers["X-Outlet-Id"] = outletId;
  }
  return config;
});

/** `true` when an error is the backend's 402 "your plan doesn't allow this". */
export function isPlanLimitError(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
  return res?.status === 402 || res?.data?.error === "plan_limit";
}

/** The human message from a backend AppError, or a fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * An expired or revoked token otherwise leaves every screen stuck on
 * "gagal dimuat" with no way out. Any 401 on an authenticated request signs
 * the user out, which drops them back on the login screen.
 */
apiClient.interceptors.response.use(undefined, (err) => {
  const hadToken = !!err?.config?.headers?.Authorization;
  if (err?.response?.status === 401 && hadToken && useAuthStore.getState().token) {
    useAuthStore.getState().logout();
  }
  return Promise.reject(err);
});

/** Absolute URL for a path the API serves under /uploads. */
export function uploadUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}
