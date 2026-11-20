import { useState } from "react";
import {
  Boxes,
  Building2,
  Pencil,
  Settings2,
  ShieldCheck,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import {
  AdminPanel,
  Toolbar,
  Field,
  Checks,
  AdminDialog,
  DataState,
} from "./admin-ui";
import {
  useAdminData,
  useAdminMutation,
  panels,
  listValue,
  date,
} from "./admin-data";
import RestaurantWorkspace from "./RestaurantWorkspace";
const initial = {
  name: "",
  shop_type: "restaurant",
  adminUsername: "",
  adminPassword: "",
  allowed_order_types: ["dine_in", "takeaway", "delivery"],
  allowed_panels: [],
  employees: [],
  kitchens: [],
};

const shopTypes = {
  restaurant: { label: "Restaurant", icon: Store },
  retail: { label: "Retail", icon: Building2 },
  retail_restaurant: { label: "Retail + restaurant", icon: Boxes },
};

function initials(name) {
  return String(name || "Shop")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="root-hierarchy-metric">
      <span>
        <Icon size={13} />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function RestaurantCard({ shop, users, brands, onView, onEdit, onDelete }) {
  const type = shopTypes[shop.shop_type] || shopTypes.restaurant;
  const TypeIcon = type.icon;
  return (
    <article className="root-hierarchy-card">
      <div className="root-hierarchy-card-body">
        <div className="root-hierarchy-identity">
          <span className="root-hierarchy-avatar">
            {initials(shop.name || shop.store_name)}
          </span>
          <div>
            <h3>
              {shop.name || shop.store_name}
              <i
                className={shop.status === "active" ? "is-active" : ""}
                title={shop.status}
              />
            </h3>
            <span>
              <TypeIcon size={12} />
              {type.label}
            </span>
          </div>
        </div>
        <div className="root-hierarchy-metrics">
          <Metric label="Staff" icon={Users} value={`${users.length} users`} />
          <Metric
            label="Partners"
            icon={ShieldCheck}
            value={`${brands.length} brands`}
          />
          <Metric
            label="Products"
            icon={Boxes}
            value={`${Number(shop.product_count || 0)} items`}
          />
          <Metric
            label="Plan tier"
            icon={Settings2}
            value={String(shop.subscription_plan || "No plan").replaceAll(
              "_",
              " ",
            )}
          />
        </div>
      </div>
      <footer>
        <span className="root-shop-type">
          <TypeIcon size={13} />
          {type.label}
        </span>
        <div>
          <button type="button" onClick={onEdit}>
            <Pencil size={14} />
            Rename
          </button>
          <button
            type="button"
            aria-label={`Delete ${shop.name || shop.store_name}`}
            disabled={Number(shop.id) === 1}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            className="root-hierarchy-manage"
            onClick={onView}
          >
            <Settings2 size={15} />
            Manage {type.label}
          </button>
        </div>
      </footer>
    </article>
  );
}
export default function RestaurantManagement({ version = 0, onChange }) {
  const [local, setLocal] = useState(0),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [editor, setEditor] = useState(null),
    [rename, setRename] = useState(null),
    [confirm, setConfirm] = useState(null),
    [partner, setPartner] = useState(null),
    [newMember, setNewMember] = useState({
      name: "",
      username: "",
      password: "",
      role: "user",
      allowed_panels: [],
    });
  const data = useAdminData("/api/admin/hierarchy-data", version + local);
  const shopRecords = useAdminData("/api/shops", version + local);
  const mutation = useAdminMutation(() => {
    setEditor(null);
    setConfirm(null);
    setPartner(null);
    setLocal((v) => v + 1);
    onChange?.();
  });
  function edit(shop) {
    if (shop) {
      const canonical = (shopRecords.data || []).find(
        (record) => Number(record.id) === Number(shop.id),
      );
      if (!canonical) return;
      shop = canonical;
    }
    mutation.clear();
    setEditor(
      shop
        ? {
            ...shop,
            allowed_panels: listValue(shop.allowed_panels),
            allowed_order_types: listValue(shop.allowed_order_types),
            editing: true,
          }
        : { ...initial },
    );
  }
  async function save(e) {
    e.preventDefault();
    if (!editor.allowed_order_types.length || !editor.allowed_panels.length)
      return;
    await mutation.run(
      editor.editing ? "/api/shops/" + editor.id : "/api/shops",
      {
        method: editor.editing ? "PATCH" : "POST",
        body: editor.editing
          ? {
              name: editor.name,
              allowed_panels: editor.allowed_panels,
              allowed_order_types: editor.allowed_order_types,
            }
          : { ...editor },
      },
    );
  }
  return (
    <>
      <AdminPanel
        title={selected ? "" : "Master platform hierarchy"}
        description={
          selected
            ? ""
            : "Multi-tenant view of all shops, assigned administrators, staff and partners."
        }
      >
        {!selected && (
          <Toolbar
            onAdd={() => edit()}
            addLabel="New shop"
            onRefresh={() => setLocal((v) => v + 1)}
          >
            <Field label="Search">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search shops, users, roles and partners"
              />
            </Field>
          </Toolbar>
        )}
        {shopRecords.error && (
          <div className="pa-error" role="alert">
            {shopRecords.error}
            <button onClick={() => setLocal((value) => value + 1)}>
              Retry restaurant access data
            </button>
          </div>
        )}
        <DataState state={data} retry={() => setLocal((v) => v + 1)}>
          {(result) => {
            const managedShop = (result.shops || []).find(
              (shop) => String(shop.id) === selected,
            );
            if (managedShop)
              return (
                <RestaurantWorkspace
                  shop={managedShop}
                  canonicalShop={(shopRecords.data || []).find(
                    (shop) => Number(shop.id) === Number(managedShop.id),
                  )}
                  hierarchy={result}
                  onBack={() => setSelected("")}
                  onRename={() => {
                    mutation.clear();
                    setRename({
                      id: managedShop.id,
                      name: managedShop.name || managedShop.store_name,
                    });
                  }}
                  onRemove={() => {
                    mutation.clear();
                    setConfirm({
                      kind: "delete",
                      shop: managedShop,
                      typed: "",
                    });
                  }}
                  onEditBrand={(brand) => {
                    mutation.clear();
                    setPartner(brand);
                  }}
                  onDeleteBrand={(brand) => {
                    mutation.clear();
                    setConfirm({
                      kind: "partner",
                      shop: managedShop,
                      partner: brand,
                    });
                  }}
                  onChange={() => setLocal((value) => value + 1)}
                />
              );
            return (
              <div className="root-hierarchy-grid">
                {(result.shops || [])
                  .filter((shop) => {
                    const term = search.trim().toLowerCase();
                    if (!term) return true;
                    if (
                      String(shop.name || shop.store_name || "")
                        .toLowerCase()
                        .includes(term)
                    )
                      return true;
                    return [...(result.users || []), ...(result.brands || [])]
                      .filter(
                        (record) => Number(record.shop_id) === Number(shop.id),
                      )
                      .some((record) =>
                        [record.name, record.username, record.role].some(
                          (value) =>
                            String(value || "")
                              .toLowerCase()
                              .includes(term),
                        ),
                      );
                  })
                  .map((shop) => (
                    <RestaurantCard
                      key={shop.id}
                      shop={shop}
                      users={(result.users || []).filter(
                        (user) => Number(user.shop_id) === Number(shop.id),
                      )}
                      brands={(result.brands || []).filter(
                        (brand) => Number(brand.shop_id) === Number(shop.id),
                      )}
                      onEdit={() => {
                        mutation.clear();
                        setRename({ id: shop.id, name: shop.name });
                      }}
                      onDelete={() => {
                        mutation.clear();
                        setConfirm({ kind: "delete", shop, typed: "" });
                      }}
                      onView={() => {
                        setSelected(String(shop.id));
                      }}
                    />
                  ))}
              </div>
            );
          }}
        </DataState>
      </AdminPanel>
      {editor && (
        <AdminDialog
          title={
            editor.editing ? "Edit restaurant access" : "Create restaurant"
          }
          wide
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setEditor(null)}
          onSubmit={save}
        >
          <div className="pa-form-grid">
            <Field
              label="Restaurant name"
              required
              value={editor.name || editor.store_name || ""}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
            {!editor.editing && (
              <>
                <Field label="Business type">
                  <select
                    value={editor.shop_type}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        shop_type: e.target.value,
                        allowed_order_types:
                          e.target.value === "restaurant"
                            ? ["dine_in", "takeaway", "delivery"]
                            : ["dine_in", "takeaway", "delivery", "walk_in"],
                      })
                    }
                  >
                    {["restaurant", "retail", "retail_restaurant"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Administrator username"
                  required
                  minLength={3}
                  autoComplete="off"
                  value={editor.adminUsername}
                  onChange={(e) =>
                    setEditor({ ...editor, adminUsername: e.target.value })
                  }
                />
                <Field
                  label="Administrator password"
                  required
                  minLength={6}
                  type="password"
                  autoComplete="new-password"
                  value={editor.adminPassword}
                  onChange={(e) =>
                    setEditor({ ...editor, adminPassword: e.target.value })
                  }
                />
              </>
            )}
          </div>
          <Checks
            label="Order types (select at least one)"
            options={
              editor.shop_type === "restaurant"
                ? ["dine_in", "takeaway", "delivery"]
                : ["dine_in", "takeaway", "delivery", "walk_in"]
            }
            value={editor.allowed_order_types}
            onChange={(v) => setEditor({ ...editor, allowed_order_types: v })}
          />
          <Checks
            label="Enabled modules (select at least one)"
            options={panels}
            value={editor.allowed_panels}
            onChange={(v) => setEditor({ ...editor, allowed_panels: v })}
          />
          {(!editor.allowed_panels.length ||
            !editor.allowed_order_types.length) && (
            <p className="pa-muted">
              Select at least one order type and module before saving.
            </p>
          )}
          {!editor.editing && (
            <div className="pa-member-setup">
              <h3>Initial staff and kitchens</h3>
              <div className="pa-form-grid">
                <Field
                  label="Member name"
                  value={newMember.name}
                  onChange={(e) =>
                    setNewMember({ ...newMember, name: e.target.value })
                  }
                />
                <Field
                  label="Login username"
                  value={newMember.username}
                  onChange={(e) =>
                    setNewMember({ ...newMember, username: e.target.value })
                  }
                />
                <Field
                  label="Login password"
                  type="password"
                  autoComplete="new-password"
                  value={newMember.password}
                  onChange={(e) =>
                    setNewMember({ ...newMember, password: e.target.value })
                  }
                />
                <Field label="Member role">
                  <select
                    value={newMember.role}
                    onChange={(e) =>
                      setNewMember({ ...newMember, role: e.target.value })
                    }
                  >
                    {[
                      "user",
                      "pos_user",
                      "manager",
                      "waiter",
                      "order_taker",
                      "rider",
                      "receptionist",
                      "kitchen",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Checks
                label="Member modules"
                options={editor.allowed_panels}
                value={newMember.allowed_panels}
                onChange={(v) =>
                  setNewMember({ ...newMember, allowed_panels: v })
                }
              />
              <button
                type="button"
                disabled={
                  !newMember.name.trim() ||
                  newMember.username.length < 3 ||
                  newMember.password.length < 4
                }
                onClick={() => {
                  const key =
                    newMember.role === "kitchen" ? "kitchens" : "employees";
                  setEditor({
                    ...editor,
                    [key]: [...editor[key], { ...newMember }],
                  });
                  setNewMember({
                    name: "",
                    username: "",
                    password: "",
                    role: "user",
                    allowed_panels: [],
                  });
                }}
              >
                Add member
              </button>
              {["employees", "kitchens"].map((key) => (
                <ul key={key}>
                  {editor[key].map((m, i) => (
                    <li key={i}>
                      {m.name} / {m.role || "kitchen"}{" "}
                      <button
                        type="button"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            [key]: editor[key].filter(
                              (_, index) => index !== i,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          )}
        </AdminDialog>
      )}
      {rename && (
        <AdminDialog
          title="Rename restaurant"
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setRename(null)}
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await mutation.run(`/api/shops/${rename.id}`, {
              method: "PATCH",
              body: { name: rename.name.trim() },
            });
            if (saved) setRename(null);
          }}
        >
          <Field
            label="Restaurant name"
            required
            value={rename.name}
            onChange={(event) =>
              setRename({ ...rename, name: event.target.value })
            }
          />
        </AdminDialog>
      )}
      {partner && (
        <AdminDialog
          title={partner.id ? "Edit partner" : "Add partner"}
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setPartner(null)}
          onSubmit={(e) => {
            e.preventDefault();
            void mutation.run(
              "/api/brands" + (partner.id ? "/" + partner.id : ""),
              {
                method: partner.id ? "PUT" : "POST",
                body: {
                  name: partner.name,
                  shopId: partner.shopId,
                  partner_type: partner.partner_type,
                  ownership_percent: Number(partner.ownership_percent),
                },
              },
            );
          }}
        >
          <Field
            label="Partner name"
            required
            value={partner.name}
            onChange={(e) => setPartner({ ...partner, name: e.target.value })}
          />
          <Field label="Partner type">
            <select
              value={partner.partner_type}
              onChange={(e) =>
                setPartner({ ...partner, partner_type: e.target.value })
              }
            >
              <option value="share_based">Share based</option>
              <option value="product_based">Product based</option>
            </select>
          </Field>
          <Field
            label="Ownership percentage"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={partner.ownership_percent}
            onChange={(e) =>
              setPartner({ ...partner, ownership_percent: e.target.value })
            }
          />
        </AdminDialog>
      )}
      {confirm && (
        <AdminDialog
          title={
            confirm.kind === "status"
              ? "Change restaurant status?"
              : "Delete " +
                (confirm.kind === "partner" ? "partner" : "restaurant") +
                "?"
          }
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setConfirm(null)}
          submitLabel="Confirm"
          submitDisabled={
            confirm.kind === "delete" && confirm.typed !== "DELETE"
          }
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm.kind === "status")
              void mutation.run(
                "/api/admin/store/" + confirm.shop.id + "/status",
                {
                  method: "PATCH",
                  body: {
                    status:
                      confirm.shop.status === "active" ? "blocked" : "active",
                  },
                },
              );
            else if (confirm.kind === "partner")
              void mutation.run(
                "/api/brands/" +
                  confirm.partner.id +
                  "?shopId=" +
                  confirm.shop.id,
                { method: "DELETE" },
              );
            else
              void mutation.run("/api/shops/" + confirm.shop.id, {
                method: "DELETE",
              });
          }}
        >
          <p>{confirm.shop.name || confirm.shop.store_name}</p>
          <p>
            {confirm.kind === "delete"
              ? "This permanently deletes the restaurant and associated records. Confirm only after verifying that its history is no longer needed."
              : confirm.kind === "partner"
                ? "Remove this partner from the restaurant."
                : "Suspending a restaurant prevents its users from logging in and processing orders."}
          </p>
          {confirm.kind === "delete" && (
            <Field
              label="Type DELETE to confirm"
              value={confirm.typed}
              autoComplete="off"
              onChange={(event) =>
                setConfirm({ ...confirm, typed: event.target.value })
              }
            />
          )}
          <small>Created {date(confirm.shop.created_at)}</small>
        </AdminDialog>
      )}
    </>
  );
}
