import { useState } from "react";
import {
  AdminPanel,
  AdminTable,
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
} from "./admin-data";
export function UserEditor({ user, shops, onClose, onSaved, currentUser }) {
  const [form, setForm] = useState(() => ({
    ...user,
    name: user.name || "",
    username: user.username || "",
    password: "",
    email: user.email || "",
    phone: user.phone || "",
    shop_id: user.shop_id ? String(user.shop_id) : "",
    role_id: user.roles?.[0]?.id ? String(user.roles[0].id) : "",
    status: user.status || "active",
    allowed_panels: listValue(user.allowed_panels),
    can_manage_register: Boolean(user.can_manage_register),
    printer_station: user.printer_station || "",
  }));
  const roles = useAdminData(
    "/api/roles" + (form.shop_id ? "?shop_id=" + form.shop_id : ""),
  );
  const mutation = useAdminMutation(onSaved),
    self = Number(user.id) === Number(currentUser.id),
    superUser = user.role === "superadmin";
  function field(key) {
    return {
      value: form[key],
      onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    };
  }
  return (
    <AdminDialog
      title={user.id ? "Edit user" : "Create user"}
      wide
      onClose={onClose}
      busy={mutation.busy}
      error={mutation.error}
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          name: form.name,
          username: form.username,
          email: form.email || null,
          phone: form.phone || null,
          status: form.status,
          can_manage_register: form.can_manage_register,
          allowed_panels: form.allowed_panels,
          printer_station: form.printer_station || null,
        };
        if (form.password) body.password = form.password;
        if (!superUser && !self) {
          body.shop_id = form.shop_id ? Number(form.shop_id) : null;
          if (form.role_id) body.role_ids = [Number(form.role_id)];
        }
        void mutation.run("/api/users" + (user.id ? "/" + user.id : ""), {
          method: user.id ? "PUT" : "POST",
          body,
        });
      }}
    >
      <div className="pa-form-grid">
        <Field label="Full name" required {...field("name")} />
        <Field
          label="Username"
          required
          minLength={3}
          autoComplete="off"
          {...field("username")}
        />
        <Field
          label={user.id ? "New password (leave blank to keep)" : "Password"}
          type="password"
          autoComplete="new-password"
          required={!user.id}
          minLength={4}
          {...field("password")}
        />
        <Field label="Email" type="email" {...field("email")} />
        <Field label="Phone" {...field("phone")} />
        {!superUser && !self && (
          <>
            <Field label="Restaurant">
              <select
                value={form.shop_id}
                onChange={(e) =>
                  setForm({ ...form, shop_id: e.target.value, role_id: "" })
                }
              >
                <option value="">Platform account</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned role">
              <DataState
                state={roles}
                retry={() => {
                  onClose();
                }}
              >
                {(rows) => (
                  <select
                    required
                    aria-label="Assigned role"
                    value={form.role_id}
                    onChange={(e) =>
                      setForm({ ...form, role_id: e.target.value })
                    }
                  >
                    <option value="">Select role</option>
                    {rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </DataState>
            </Field>
            <Field label="Status">
              <select {...field("status")}>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
              </select>
            </Field>
          </>
        )}
        <Field label="Printer station" {...field("printer_station")} />
      </div>
      <label className="pa-checkbox">
        <input
          type="checkbox"
          checked={form.can_manage_register}
          onChange={(e) =>
            setForm({ ...form, can_manage_register: e.target.checked })
          }
        />
        Can manage register
      </label>
      {!superUser && (
        <Checks
          label="Module access"
          options={panels}
          value={form.allowed_panels}
          onChange={(v) => setForm({ ...form, allowed_panels: v })}
        />
      )}
      <p className="pa-muted">
        User permissions are inherited from the assigned role. A role from the
        selected restaurant is required. Your own role and platform privileges
        cannot be changed here.
      </p>
    </AdminDialog>
  );
}
export function RoleEditor({ role, catalog, scope, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: role.name || "",
    description: role.description || "",
    permissions: (role.permissions || []).map((p) =>
      typeof p === "string" ? p : p.key,
    ),
  });
  const mutation = useAdminMutation(onSaved);
  const options = Array.isArray(catalog)
    ? catalog.map((p) => ({ id: p.key, label: p.label || p.key }))
    : [];
  return (
    <AdminDialog
      title={role.id ? "Edit role" : "Create role"}
      wide
      busy={mutation.busy}
      error={mutation.error}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        void mutation.run(
          "/api/roles" + (role.id ? "/" + role.id : "") + scope,
          { method: role.id ? "PUT" : "POST", body: form },
        );
      }}
    >
      <Field
        label="Role name"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Field label="Description">
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Checks
        label="Permissions"
        options={options}
        value={form.permissions}
        onChange={(v) => setForm({ ...form, permissions: v })}
      />
    </AdminDialog>
  );
}
export default function RootUsers({ user, version = 0, onChange }) {
  const [local, setLocal] = useState(0),
    [shop, setShop] = useState(""),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState(null),
    [roleEditor, setRoleEditor] = useState(null),
    [deleting, setDeleting] = useState(null);
  const users = useAdminData("/api/users", local + version),
    shops = useAdminData("/api/shops", local + version),
    scope = shop ? "?shop_id=" + shop : "",
    roles = useAdminData("/api/roles" + scope, local + version),
    catalog = useAdminData("/api/roles/catalog");
  const done = () => {
      setLocal((v) => v + 1);
      setEditing(null);
      setRoleEditor(null);
      setDeleting(null);
      onChange?.();
    },
    mutation = useAdminMutation(done);
  return (
    <>
      <AdminPanel
        title="Users and access"
        description="Root-only account management with explicit restaurant scope."
      >
        <Toolbar
          onAdd={() => setEditing({})}
          addLabel="Create user"
          onRefresh={() => setLocal((v) => v + 1)}
        >
          <Field label="Restaurant">
            <select value={shop} onChange={(e) => setShop(e.target.value)}>
              <option value="">All restaurants / platform roles</option>
              {(shops.data || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Search users"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Toolbar>
        <DataState state={users} retry={() => setLocal((v) => v + 1)}>
          {(rows) => (
            <AdminTable
              rows={rows.filter(
                (u) =>
                  (!shop || String(u.shop_id) === shop) &&
                  [u.name, u.username, u.shop_name]
                    .join(" ")
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )}
              columns={[
                {
                  label: "User",
                  render: (u) => (
                    <>
                      <strong>{u.name}</strong>
                      <small>{u.username}</small>
                    </>
                  ),
                },
                {
                  label: "Restaurant",
                  render: (u) => u.shop_name || "Platform",
                },
                {
                  label: "Role",
                  render: (u) => (
                    <>
                      {u.role}
                      <small>
                        {(u.roles || []).map((r) => r.name).join(", ")}
                      </small>
                    </>
                  ),
                },
                { label: "Status", key: "status" },
                {
                  label: "Actions",
                  render: (u) => (
                    <div className="pa-row-actions">
                      <button onClick={() => setEditing(u)}>Edit</button>
                      <button
                        disabled={
                          u.role === "superadmin" ||
                          Number(u.id) === Number(user.id)
                        }
                        onClick={() => {
                          mutation.clear();
                          setDeleting({ kind: "user", row: u });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </DataState>
      </AdminPanel>
      <AdminPanel
        title="Roles and permissions"
        description={
          shop
            ? "Roles for the selected restaurant."
            : "Platform roles. Select a restaurant to manage its roles."
        }
      >
        <Toolbar onAdd={() => setRoleEditor({})} addLabel="Create role" />
        <DataState state={roles} retry={() => setLocal((v) => v + 1)}>
          {(rows) => (
            <AdminTable
              rows={rows}
              columns={[
                { label: "Role", key: "name" },
                { label: "Description", key: "description" },
                {
                  label: "Permissions",
                  render: (r) => (r.permissions || []).length,
                },
                {
                  label: "Actions",
                  render: (r) => (
                    <div className="pa-row-actions">
                      <button onClick={() => setRoleEditor(r)}>
                        Edit permissions
                      </button>
                      <button
                        disabled={Boolean(r.is_system)}
                        onClick={() => {
                          mutation.clear();
                          setDeleting({ kind: "role", row: r });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </DataState>
      </AdminPanel>
      {editing && (
        <UserEditor
          user={editing}
          currentUser={user}
          shops={shops.data || []}
          onClose={() => setEditing(null)}
          onSaved={done}
        />
      )}
      {roleEditor && (
        <DataState state={catalog} retry={() => setLocal((v) => v + 1)}>
          {(items) => (
            <RoleEditor
              role={roleEditor}
              catalog={items}
              scope={scope}
              onClose={() => setRoleEditor(null)}
              onSaved={done}
            />
          )}
        </DataState>
      )}
      {deleting && (
        <AdminDialog
          title={"Delete " + deleting.kind + "?"}
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setDeleting(null)}
          submitLabel="Delete"
          onSubmit={(e) => {
            e.preventDefault();
            void mutation.run(
              "/api/" +
                (deleting.kind === "user" ? "users/" : "roles/") +
                deleting.row.id +
                (deleting.kind === "role" ? scope : ""),
              { method: "DELETE" },
            );
          }}
        >
          <p>{deleting.row.name}</p>
          <p>
            This removes the selected {deleting.kind}. Assigned roles and
            historical references may prevent deletion; server validation
            remains authoritative.
          </p>
        </AdminDialog>
      )}
    </>
  );
}
