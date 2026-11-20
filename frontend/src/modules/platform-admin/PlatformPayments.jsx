import { useState } from "react";
import {
  AdminPanel,
  AdminTable,
  Toolbar,
  Field,
  AdminDialog,
  DataState,
} from "./admin-ui";
import { useAdminData, useAdminMutation, money, date } from "./admin-data";
const categories = ["subscription", "setup", "advance", "repair", "other"],
  types = ["1_month", "3_months", "6_months", "1_year", "2_years", "lifetime"];
export default function PlatformPayments({ version = 0, onChange }) {
  const [local, setLocal] = useState(0),
    [shop, setShop] = useState(""),
    [category, setCategory] = useState(""),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null);
  const payments = useAdminData("/api/admin/financial-logs", version + local),
    shops = useAdminData("/api/shops", version + local);
  const mutation = useAdminMutation(() => {
    setEditing(null);
    setDeleting(null);
    setLocal((v) => v + 1);
    onChange?.();
  });
  function edit(row) {
    mutation.clear();
    setEditing(
      row
        ? {
            ...row,
            shopId: row.shop_id || "",
            subscription_type: row.subscription_type || "1_month",
            start_date: (
              row.subscription_start_date ||
              row.created_at ||
              ""
            ).slice(0, 10),
            month:
              row.subscription_month ||
              row.month ||
              (row.created_at || "").slice(0, 7),
          }
        : {
            shopId: "",
            amount: "",
            category: "other",
            description: "",
            payment_method: "Cash",
            subscription_type: "1_month",
            start_date: new Date().toISOString().slice(0, 10),
            month: new Date().toISOString().slice(0, 7),
          },
    );
  }
  return (
    <AdminPanel
      title="Platform payments"
      description="Record setup fees, subscriptions, advances and other income. These are platform payments, not restaurant order sales."
    >
      <Toolbar
        onAdd={() => edit()}
        addLabel="Add payment"
        onRefresh={() => setLocal((v) => v + 1)}
      >
        <Field label="Restaurant">
          <select value={shop} onChange={(e) => setShop(e.target.value)}>
            <option value="">All restaurants</option>
            {(shops.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </Toolbar>
      <DataState state={payments} retry={() => setLocal((v) => v + 1)}>
        {(data) => {
          const rows = (data.logs || []).filter(
            (p) =>
              (!shop || String(p.shop_id) === shop) &&
              (!category || p.category === category),
          );
          return (
            <>
              <p className="pa-payment-total">
                Filtered total{" "}
                <strong>
                  {money(rows.reduce((s, p) => s + Number(p.amount || 0), 0))}
                </strong>
              </p>
              <AdminTable
                rows={rows}
                columns={[
                  { label: "Date", render: (p) => date(p.created_at) },
                  {
                    label: "Restaurant",
                    render: (p) => p.shop_name || "Platform",
                  },
                  { label: "Category", key: "category" },
                  {
                    label: "Details",
                    render: (p) => (
                      <>
                        {p.description}
                        <small>
                          {p.category === "subscription"
                            ? p.subscription_type +
                              " / " +
                              (p.subscription_start_date || "") +
                              " to " +
                              (p.subscription_end_date || "")
                            : ""}
                        </small>
                      </>
                    ),
                  },
                  { label: "Method", key: "payment_method" },
                  { label: "Amount", render: (p) => money(p.amount) },
                  {
                    label: "Actions",
                    render: (p) => (
                      <div className="pa-row-actions">
                        <button onClick={() => edit(p)}>Edit</button>
                        <button
                          onClick={() => {
                            mutation.clear();
                            setDeleting(p);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </>
          );
        }}
      </DataState>
      {editing && (
        <AdminDialog
          title={
            editing.id ? "Edit platform payment" : "Record platform payment"
          }
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setEditing(null)}
          onSubmit={(e) => {
            e.preventDefault();
            void mutation.run(
              "/api/admin/financial-logs" +
                (editing.id ? "/" + editing.id : ""),
              {
                method: editing.id ? "PATCH" : "POST",
                body: {
                  shopId: editing.shopId ? Number(editing.shopId) : null,
                  amount: Number(editing.amount),
                  category: editing.category,
                  description: editing.description,
                  paymentMethod: editing.payment_method,
                  subscription_type: editing.subscription_type,
                  start_date: editing.start_date,
                  month: editing.month,
                },
              },
            );
          }}
        >
          <DataState state={shops} retry={() => setLocal((v) => v + 1)}>
            {(rows) => (
              <Field label="Restaurant">
                <select
                  required={editing.category === "subscription"}
                  value={editing.shopId}
                  onChange={(e) =>
                    setEditing({ ...editing, shopId: e.target.value })
                  }
                >
                  <option value="">Platform / no restaurant</option>
                  {rows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </DataState>
          <Field label="Category">
            <select
              value={editing.category}
              onChange={(e) =>
                setEditing({ ...editing, category: e.target.value })
              }
            >
              {categories.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Amount"
            type="number"
            required
            min="0"
            step="0.01"
            value={editing.amount}
            onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
          />
          <Field
            label="Payment method"
            required
            maxLength={100}
            value={editing.payment_method}
            onChange={(e) =>
              setEditing({ ...editing, payment_method: e.target.value })
            }
          />
          <Field label="Description">
            <textarea
              maxLength={1000}
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </Field>
          {editing.category === "subscription" && (
            <>
              <Field label="Subscription duration">
                <select
                  value={editing.subscription_type}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      subscription_type: e.target.value,
                    })
                  }
                >
                  {types.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Start date"
                type="date"
                required
                value={editing.start_date}
                onChange={(e) =>
                  setEditing({ ...editing, start_date: e.target.value })
                }
              />
              <Field
                label="Billing month"
                type="month"
                required
                value={editing.month}
                onChange={(e) =>
                  setEditing({ ...editing, month: e.target.value })
                }
              />
            </>
          )}
        </AdminDialog>
      )}
      {deleting && (
        <AdminDialog
          title="Remove payment?"
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setDeleting(null)}
          onSubmit={(e) => {
            e.preventDefault();
            void mutation.run("/api/admin/financial-logs/" + deleting.id, {
              method: "DELETE",
            });
          }}
          submitLabel="Remove payment"
        >
          <p>
            {money(deleting.amount)} / {deleting.shop_name || "Platform"}
          </p>
          <p>
            Removing a subscription payment also removes its linked subscription
            validity. It must not be used to suspend a restaurant automatically.
          </p>
        </AdminDialog>
      )}
    </AdminPanel>
  );
}
