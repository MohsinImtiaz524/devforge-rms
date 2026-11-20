import { useState } from "react";
import {
  ArrowLeft,
  Crown,
  KeyRound,
  Pencil,
  Plus,
  Store,
  Trash2,
  Users,
  Utensils,
} from "lucide-react";
import { AdminDialog, AdminTable, Checks, DataState } from "./admin-ui";
import {
  listValue,
  panels,
  useAdminData,
  useAdminMutation,
} from "./admin-data";
import { RoleEditor, UserEditor } from "./RootUsers";

const employeeRoles = new Set([
  "user",
  "manager",
  "rider",
  "pos_user",
  "waiter",
  "receptionist",
  "order_taker",
]);

function UserCard({ user, onEdit, onStatus, onDelete }) {
  return (
    <article className="shop-user-card">
      <header>
        <span className={`shop-user-icon is-${user.role}`}>
          {user.role === "admin" ? (
            <Crown size={19} />
          ) : user.role === "kitchen" ? (
            <Utensils size={19} />
          ) : (
            <Users size={19} />
          )}
        </span>
        <div>
          <strong>{user.name}</strong>
          <small>@{user.username}</small>
        </div>
        <span
          className={`pa-badge ${user.status !== "blocked" ? "good" : "warning"}`}
        >
          {user.status || "active"}
        </span>
      </header>
      <p>
        {(user.roles || []).map((role) => role.name).join(", ") ||
          String(user.role || "user").replaceAll("_", " ")}
        {listValue(user.allowed_panels).length
          ? ` · ${listValue(user.allowed_panels).length} modules`
          : ""}
      </p>
      <footer>
        <button type="button" onClick={onEdit}>
          Edit access & profile
        </button>
        <button
          type="button"
          onClick={onStatus}
          aria-label={`${user.status === "blocked" ? "Reactivate" : "Suspend"} ${user.name}`}
        >
          <KeyRound size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${user.name}`}
        >
          <Trash2 size={15} />
        </button>
      </footer>
    </article>
  );
}

function BrandCard({ brand, onEdit, onDelete }) {
  const productBased = brand.partner_type === "product_based";
  return (
    <article className="shop-brand-card">
      <header>
        <span className="shop-user-icon is-brand">
          <Store size={19} />
        </span>
        <div>
          <strong>{brand.name}</strong>
          <small>
            {brand.is_owner_partner
              ? "Owner / admin"
              : productBased
                ? "Product based"
                : "Share based"}
          </small>
        </div>
      </header>
      <p>
        {productBased
          ? "Product profit"
          : `${Number(brand.ownership_percent || 0)}% ${brand.is_owner_partner ? "auto share" : "share"}`}
      </p>
      <footer>
        <button type="button" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </button>
        {!brand.is_owner_partner && (
          <button type="button" onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </button>
        )}
      </footer>
    </article>
  );
}

export default function RestaurantWorkspace({
  shop,
  hierarchy,
  canonicalShop,
  onBack,
  onRename,
  onRemove,
  onEditBrand,
  onDeleteBrand,
  onChange,
}) {
  const [tab, setTab] = useState("admin");
  const [local, setLocal] = useState(0);
  const [editingUser, setEditingUser] = useState(null);
  const [roleManager, setRoleManager] = useState(false);
  const [roleEditor, setRoleEditor] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [modules, setModules] = useState(() =>
    listValue(canonicalShop?.allowed_panels || shop.allowed_panels),
  );
  const usersState = useAdminData("/api/users", local);
  const roles = useAdminData(`/api/roles?shop_id=${shop.id}`, local);
  const catalog = useAdminData("/api/roles/catalog");
  const done = () => {
    setLocal((value) => value + 1);
    setEditingUser(null);
    setRoleEditor(null);
    setRoleManager(false);
    setDeletingUser(null);
    onChange?.();
  };
  const mutation = useAdminMutation(done);
  const detailedUsers = (usersState.data || []).filter(
    (user) => Number(user.shop_id) === Number(shop.id),
  );
  const fallbackUsers = (hierarchy.users || []).filter(
    (user) => Number(user.shop_id) === Number(shop.id),
  );
  const users = detailedUsers.length ? detailedUsers : fallbackUsers;
  const brands = (hierarchy.brands || []).filter(
    (brand) => Number(brand.shop_id) === Number(shop.id),
  );
  const tabs = [
    ["admin", "Admin management", Crown],
    ["employees", "Staff & employees", Users],
    ...(shop.shop_type === "restaurant"
      ? [["kitchen", "Kitchen terminals", Utensils]]
      : []),
    ["brands", "Partner brands", Store],
  ];
  const visibleUsers = users.filter((user) =>
    tab === "admin"
      ? user.role === "admin"
      : tab === "kitchen"
        ? user.role === "kitchen"
        : employeeRoles.has(user.role),
  );

  function createUser(role) {
    setEditingUser({
      shop_id: shop.id,
      role,
      status: "active",
      allowed_panels: [],
    });
  }

  function toggleUser(user) {
    const body = { ...user };
    delete body.id;
    delete body.roles;
    delete body.shop_name;
    body.status = user.status === "blocked" ? "active" : "blocked";
    void mutation.run(`/api/users/${user.id}`, { method: "PUT", body });
  }

  return (
    <section className="shop-management-workspace">
      <header className="shop-management-header">
        <div>
          <button type="button" onClick={onBack} aria-label="Back to hierarchy">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>{shop.name || shop.store_name}</h2>
            <p>Full management suite for this tenant.</p>
          </div>
          <span className="pa-badge">{shop.shop_type}</span>
        </div>
        <div>
          <button type="button" onClick={onRename}>
            Rename restaurant
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={Number(shop.id) === 1}
            onClick={onRemove}
          >
            Remove restaurant
          </button>
        </div>
      </header>

      <div className="shop-management-layout">
        <nav aria-label="Restaurant management sections">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        <main>
          {tab === "admin" && (
            <>
              <div className="shop-section-title">
                <h3>Restaurant administrators</h3>
                <button
                  className="pa-primary"
                  type="button"
                  onClick={() => createUser("admin")}
                >
                  <Plus size={15} /> Add admin
                </button>
              </div>
              <DataState
                state={usersState}
                retry={() => setLocal((value) => value + 1)}
              >
                {() => (
                  <UserGrid
                    users={visibleUsers}
                    onEdit={setEditingUser}
                    onDelete={setDeletingUser}
                    onStatus={toggleUser}
                  />
                )}
              </DataState>
              <section className="shop-modules-editor">
                <h3>Master allowed panels</h3>
                <p>Select which modules this restaurant can access.</p>
                <Checks
                  label="Launch panels (master control)"
                  options={panels}
                  value={modules}
                  onChange={setModules}
                />
                <button
                  className="pa-primary"
                  disabled={mutation.busy || !modules.length}
                  onClick={() =>
                    mutation.run(`/api/shops/${shop.id}`, {
                      method: "PATCH",
                      body: {
                        name: shop.name || shop.store_name,
                        allowed_panels: modules,
                      },
                    })
                  }
                >
                  Update restaurant modules
                </button>
              </section>
            </>
          )}
          {tab === "employees" && (
            <>
              <div className="shop-section-title">
                <h3>Staff & employees</h3>
                <div>
                  <button type="button" onClick={() => setRoleManager(true)}>
                    Roles & permissions
                  </button>
                  <button
                    className="pa-primary"
                    type="button"
                    onClick={() => createUser("user")}
                  >
                    <Plus size={15} /> Add employee
                  </button>
                </div>
              </div>
              <UserGrid
                users={visibleUsers}
                onEdit={setEditingUser}
                onDelete={setDeletingUser}
                onStatus={toggleUser}
              />
            </>
          )}
          {tab === "kitchen" && (
            <>
              <div className="shop-section-title">
                <h3>Kitchen terminals</h3>
                <button
                  className="pa-primary"
                  type="button"
                  onClick={() => createUser("kitchen")}
                >
                  <Plus size={15} /> Add kitchen terminal
                </button>
              </div>
              <UserGrid
                users={visibleUsers}
                onEdit={setEditingUser}
                onDelete={setDeletingUser}
                onStatus={toggleUser}
              />
            </>
          )}
          {tab === "brands" && (
            <>
              <div className="shop-section-title">
                <h3>Partner brands</h3>
                <button
                  className="pa-primary"
                  type="button"
                  onClick={() =>
                    onEditBrand({
                      shopId: Number(shop.id),
                      name: "",
                      partner_type: "share_based",
                      ownership_percent: 0,
                    })
                  }
                >
                  <Plus size={15} /> Add brand
                </button>
              </div>
              <div className="shop-user-grid">
                {brands.map((brand) => (
                  <BrandCard
                    key={brand.id}
                    brand={brand}
                    onEdit={() =>
                      onEditBrand({ ...brand, shopId: Number(shop.id) })
                    }
                    onDelete={() => onDeleteBrand(brand)}
                  />
                ))}
                {!brands.length && (
                  <div className="pa-empty">No brands found.</div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {editingUser && (
        <UserEditor
          user={editingUser}
          currentUser={{}}
          shops={[shop]}
          onClose={() => setEditingUser(null)}
          onSaved={done}
        />
      )}
      {roleManager && !roleEditor && (
        <AdminDialog
          title="Roles & permissions"
          onClose={() => setRoleManager(false)}
        >
          <button
            className="pa-primary"
            type="button"
            onClick={() => setRoleEditor({})}
          >
            <Plus size={15} /> Create role
          </button>
          <DataState state={roles} retry={() => setLocal((value) => value + 1)}>
            {(items) => (
              <AdminTable
                rows={items}
                columns={[
                  { label: "Role", key: "name" },
                  { label: "Description", key: "description" },
                  {
                    label: "Permissions",
                    render: (role) => (role.permissions || []).length,
                  },
                  {
                    label: "Actions",
                    render: (role) => (
                      <button type="button" onClick={() => setRoleEditor(role)}>
                        Edit permissions
                      </button>
                    ),
                  },
                ]}
              />
            )}
          </DataState>
        </AdminDialog>
      )}
      {roleEditor && (
        <DataState state={catalog} retry={() => setLocal((value) => value + 1)}>
          {(items) => (
            <RoleEditor
              role={roleEditor}
              catalog={items}
              scope={`?shop_id=${shop.id}`}
              onClose={() => setRoleEditor(null)}
              onSaved={done}
            />
          )}
        </DataState>
      )}
      {deletingUser && (
        <AdminDialog
          title="Delete user?"
          busy={mutation.busy}
          error={mutation.error}
          submitLabel="Delete"
          onClose={() => setDeletingUser(null)}
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.run(`/api/users/${deletingUser.id}`, {
              method: "DELETE",
            });
          }}
        >
          <p>{deletingUser.name}</p>
          <p>This removes the selected restaurant user.</p>
        </AdminDialog>
      )}
    </section>
  );
}

function UserGrid({ users, onEdit, onStatus, onDelete }) {
  return (
    <div className="shop-user-grid">
      {users.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          onEdit={() => onEdit(user)}
          onStatus={() => onStatus(user)}
          onDelete={() => onDelete(user)}
        />
      ))}
      {!users.length && <div className="pa-empty">No users found.</div>}
    </div>
  );
}
