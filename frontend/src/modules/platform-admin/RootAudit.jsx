import { useState } from "react";
import {
  AdminPanel,
  AdminTable,
  Field,
  AdminDialog,
  DataState,
} from "./admin-ui";
import { useAdminData, date, money } from "./admin-data";
import RootRegisterReview from "./RootRegisterReview";
import { RecordDetails } from "./RecordDetails";

export default function RootAudit({ version = 0 }) {
  const [kind, setKind] = useState("activity");
  const [filter, setFilter] = useState({
    shop: "",
    from: "",
    to: "",
    action: "",
  });
  const [applied, setApplied] = useState({});
  const [revision, setRevision] = useState(0);
  const [shift, setShift] = useState(null);
  const shops = useAdminData("/api/shops");
  const params = new URLSearchParams({ limit: "500" });
  if (applied.shop) {
    params.set("shopId", applied.shop);
    params.set("shop_id", applied.shop);
  }
  if (applied.from) params.set("from", applied.from + " 00:00:00");
  if (applied.to) params.set("to", applied.to + " 23:59:59");
  if (applied.action) params.set("action", applied.action);
  if (kind === "delivery") params.set("order_type", "delivery");
  const endpoint =
    kind === "register"
      ? "/api/shifts/history"
      : "/api/activity-logs" +
        ({
          payments: "/payments",
          sales: "/sales",
          delivery: "/sales",
          wastage: "/wastage",
        }[kind] || "");
  const data = useAdminData(endpoint + "?" + params, version + revision);
  const shiftData = useAdminData(
    shift ? "/api/activity-logs/shift/" + shift.id : null,
    revision,
  );
  return (
    <>
      {kind === "register" && (
        <RootRegisterReview
          shopId={applied.shop || ""}
          version={version + revision}
        />
      )}
      <AdminPanel
        title="Audit history"
        description="Inspect restaurant activity, payments, sales, deliveries, wastage and register records. Results are limited to 500 records per request."
      >
        <form
          className="pa-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({ ...filter });
            setRevision((value) => value + 1);
          }}
        >
          <Field label="Record type">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {[
                "activity",
                "register",
                "payments",
                "sales",
                "delivery",
                "wastage",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Restaurant">
            <select
              value={filter.shop}
              onChange={(event) =>
                setFilter({ ...filter, shop: event.target.value })
              }
            >
              <option value="">All restaurants</option>
              {(shops.data || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="From"
            type="date"
            value={filter.from}
            onChange={(event) =>
              setFilter({ ...filter, from: event.target.value })
            }
          />
          <Field
            label="To"
            type="date"
            min={filter.from}
            value={filter.to}
            onChange={(event) =>
              setFilter({ ...filter, to: event.target.value })
            }
          />
          <Field
            label="Action"
            value={filter.action}
            onChange={(event) =>
              setFilter({ ...filter, action: event.target.value })
            }
          />
          <button type="submit">Apply filters</button>
        </form>
        <DataState state={data} retry={() => setRevision((value) => value + 1)}>
          {(rows) => (
            <>
              <AdminTable
                rows={Array.isArray(rows) ? rows : rows.rows || []}
                columns={[
                  {
                    label: "Date",
                    render: (row) =>
                      date(row.created_at || row.start_time || row.paid_at),
                  },
                  {
                    label: "Restaurant",
                    render: (row) => row.shop_name || "Platform",
                  },
                  {
                    label: "User / customer",
                    render: (row) =>
                      row.user_name ||
                      row.cashier_name ||
                      row.customer_name ||
                      "?",
                  },
                  {
                    label: "Action / status",
                    render: (row) =>
                      row.action ||
                      row.order_status ||
                      row.status ||
                      row.type ||
                      row.reason_code,
                  },
                  {
                    label: "Amount",
                    render: (row) =>
                      row.amount == null && row.total == null
                        ? "?"
                        : money(row.amount ?? row.total),
                  },
                  {
                    label: "Details",
                    render: (row) => (
                      <details>
                        <summary>Inspect record</summary>
                        <RecordDetails rows={[row]} />
                        {kind === "register" && (
                          <button onClick={() => setShift(row)}>
                            View shift timeline
                          </button>
                        )}
                      </details>
                    ),
                  },
                ]}
              />
            </>
          )}
        </DataState>
        {shift && (
          <AdminDialog
            title="Shift timeline"
            wide
            onClose={() => setShift(null)}
          >
            <DataState
              state={shiftData}
              retry={() => setRevision((value) => value + 1)}
            >
              {(rows) => (
                <RecordDetails rows={Array.isArray(rows) ? rows : []} />
              )}
            </DataState>
          </AdminDialog>
        )}
      </AdminPanel>
    </>
  );
}
