import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
export function useAdminData(path, version = 0) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  useEffect(() => {
    if (!path) return;
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setState({ loading: true, data: null, error: "" });
      try {
        const data = await api(path);
        if (active) setState({ loading: false, data, error: "" });
      } catch (e) {
        if (active) {
          if (e.status === 401) location.replace("/app/login");
          else setState({ loading: false, data: null, error: e.message });
        }
      }
    });
    return () => {
      active = false;
    };
  }, [path, version]);
  return state;
}

export function useAdminMutation(onDone) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(path, options) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(path, options);
      onDone?.(result);
      return result;
    } catch (e) {
      if (e.status === 401) location.replace("/app/login");
      setError(
        e.message +
          (!e.status || e.status >= 500
            ? " Refresh the records before retrying; the request may have reached the server."
            : ""),
      );
      return undefined;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, clear: () => setError("") };
}

export const date = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleString()
    : "\u2014";

export const money = (value) =>
  "Rs. " +
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const panels = [
  "reports",
  "dashboard",
  "pos",
  "product-categories",
  "expense-categories",
  "delivery",
  "sales-history",
  "pending-dues",
  "products",
  "brands",
  "customers",
  "notifications",
  "analytics",
  "logs",
  "raw-stock",
  "waste-management",
  "recipes",
  "expenses",
  "tables",
  "kds",
  "composite_products",
  "subscriptions",
];

export function listValue(value) {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}
