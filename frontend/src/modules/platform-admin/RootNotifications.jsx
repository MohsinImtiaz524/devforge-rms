import { useState } from "react";
import {
  AdminPanel,
  AdminTable,
  Toolbar,
  Field,
  AdminDialog,
  DataState,
} from "./admin-ui";
import { useAdminData, useAdminMutation, date } from "./admin-data";

export default function RootNotifications({ version = 0 }) {
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("all");
  const [shop, setShop] = useState("");
  const [editing, setEditing] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const shops = useAdminData("/api/shops", revision);
  const notifications = useAdminData(
    "/api/notifications?channel=platform&include_archived=true&status=" +
      status +
      (shop ? "&shop_id=" + shop : ""),
    version + revision,
  );
  const mutation = useAdminMutation(() => {
    setEditing(null);
    setArchiving(null);
    setRevision((value) => value + 1);
  });
  const empty = {
    title: "",
    message: "",
    shop_id: "",
    type: "announcement",
    priority: "normal",
    status: "active",
    action_label: "",
    action_url: "",
    publish_at: "",
    expires_at: "",
    due_at: "",
  };
  const timestamp = (value) => {
    if (!value) return "";
    const time = new Date(value);
    return new Date(time.getTime() - time.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  return (
    <AdminPanel
      title="Platform notifications"
      description="Compose and maintain restaurant-wide or platform-wide messages."
    >
      <Toolbar
        onAdd={() => {
          mutation.clear();
          setEditing({ ...empty });
        }}
        addLabel="Create notification"
        onRefresh={() => setRevision((value) => value + 1)}
      >
        <Field label="Restaurant">
          <select
            value={shop}
            onChange={(event) => setShop(event.target.value)}
          >
            <option value="">All restaurants</option>
            <option value="global">Global broadcasts</option>
            {(shops.data || []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["all", "active", "draft", "archived"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <button
          onClick={() =>
            void mutation.run("/api/notifications/read-all", {
              method: "PATCH",
              body: { channel: "platform" },
            })
          }
          disabled={mutation.busy}
        >
          Mark all read
        </button>
      </Toolbar>
      {!editing && !archiving && mutation.error && (
        <p className="pa-error" role="alert">
          {mutation.error}
        </p>
      )}
      <DataState
        state={notifications}
        retry={() => setRevision((value) => value + 1)}
      >
        {(rows) => (
          <AdminTable
            rows={rows}
            columns={[
              {
                label: "Notification",
                render: (row) => (
                  <>
                    <strong>{row.title}</strong>
                    <small>{row.message}</small>
                  </>
                ),
              },
              {
                label: "Audience",
                render: (row) => row.shop_name || "All restaurants",
              },
              {
                label: "Priority / status",
                render: (row) => row.priority + " / " + row.status,
              },
              {
                label: "Published",
                render: (row) => date(row.publish_at || row.created_at),
              },
              {
                label: "Actions",
                render: (row) => (
                  <div className="pa-row-actions">
                    <button
                      onClick={() => {
                        mutation.clear();
                        setEditing({
                          ...empty,
                          ...row,
                          shop_id: row.shop_id || "",
                          publish_at: timestamp(row.publish_at),
                          expires_at: timestamp(row.expires_at),
                          due_at: timestamp(row.due_at),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      disabled={mutation.busy || Boolean(row.read_at)}
                      onClick={() =>
                        void mutation.run(
                          "/api/notifications/" + row.id + "/read",
                          { method: "PATCH" },
                        )
                      }
                    >
                      Mark read
                    </button>
                    <button
                      disabled={row.status === "archived"}
                      onClick={() => {
                        mutation.clear();
                        setArchiving(row);
                      }}
                    >
                      Archive
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </DataState>
      {editing && (
        <AdminDialog
          title={editing.id ? "Edit notification" : "Create notification"}
          wide
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            const payload = Object.fromEntries(
              Object.keys(empty).map((key) => [key, editing[key]]),
            );
            payload.shop_id = editing.shop_id ? Number(editing.shop_id) : null;
            for (const key of ["publish_at", "expires_at", "due_at"])
              payload[key] = editing[key]
                ? new Date(editing[key]).toISOString()
                : null;
            void mutation.run(
              "/api/notifications" + (editing.id ? "/" + editing.id : ""),
              { method: editing.id ? "PATCH" : "POST", body: payload },
            );
          }}
        >
          <Field
            label="Title"
            required
            minLength={3}
            maxLength={160}
            value={editing.title}
            onChange={(event) =>
              setEditing({ ...editing, title: event.target.value })
            }
          />
          <Field label="Message">
            <textarea
              required
              minLength={3}
              maxLength={4000}
              value={editing.message}
              onChange={(event) =>
                setEditing({ ...editing, message: event.target.value })
              }
            />
          </Field>
          <div className="pa-form-grid">
            <Field label="Restaurant">
              <select
                value={editing.shop_id}
                onChange={(event) =>
                  setEditing({ ...editing, shop_id: event.target.value })
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
            {[
              [
                "type",
                [
                  "announcement",
                  "assignment",
                  "release",
                  "billing",
                  "maintenance",
                  "support",
                  "system",
                  "inventory",
                ],
              ],
              ["priority", ["low", "normal", "high", "urgent"]],
              ["status", ["active", "draft", "archived"]],
            ].map(([key, options]) => (
              <Field key={key} label={key}>
                <select
                  value={editing[key]}
                  onChange={(event) =>
                    setEditing({ ...editing, [key]: event.target.value })
                  }
                >
                  {options.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
            ))}
            {["publish_at", "expires_at", "due_at"].map((key) => (
              <Field
                key={key}
                label={key.replaceAll("_", " ")}
                type="datetime-local"
                value={editing[key]}
                onChange={(event) =>
                  setEditing({ ...editing, [key]: event.target.value })
                }
              />
            ))}
            <Field
              label="Action label"
              maxLength={80}
              value={editing.action_label || ""}
              onChange={(event) =>
                setEditing({ ...editing, action_label: event.target.value })
              }
            />
            <Field
              label="Action destination"
              maxLength={500}
              value={editing.action_url || ""}
              onChange={(event) =>
                setEditing({ ...editing, action_url: event.target.value })
              }
            />
          </div>
        </AdminDialog>
      )}
      {archiving && (
        <AdminDialog
          title="Archive notification?"
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setArchiving(null)}
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.run("/api/notifications/" + archiving.id, {
              method: "DELETE",
            });
          }}
        >
          <p>{archiving.title}</p>
        </AdminDialog>
      )}
    </AdminPanel>
  );
}
