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
import { RecordDetails } from "./RecordDetails";

export default function RootSettings({ user }) {
  const [revision, setRevision] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const [password, setPassword] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [message, setMessage] = useState("");
  const sessions = useAdminData("/api/auth/sessions", revision);
  const events = useAdminData("/api/auth/security-events", revision);
  const mutation = useAdminMutation((result) => {
    if (result?.logged_out) {
      location.replace("/app/login");
      return;
    }
    setConfirmation(null);
    setPassword({ current: "", next: "", confirm: "" });
    setMessage("Account security updated.");
    setRevision((value) => value + 1);
  });
  return (
    <>
      <AdminPanel
        title="Root account security"
        description="Settings for the root administrator account. Restaurant receipt and printer settings stay in their restaurant workspace."
      >
        <div className="pa-settings-body">
          <p>
            {user.name || user.username} / {user.role}
          </p>
          <form
            className="pa-filter-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (password.next !== password.confirm) {
                setMessage("New passwords must match.");
                return;
              }
              void mutation.run("/api/auth/change-password", {
                method: "POST",
                body: {
                  current_password: password.current,
                  new_password: password.next,
                },
              });
            }}
          >
            <Field
              label="Current password"
              type="password"
              required
              autoComplete="current-password"
              value={password.current}
              onChange={(event) =>
                setPassword({ ...password, current: event.target.value })
              }
            />
            <Field
              label="New password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={password.next}
              onChange={(event) =>
                setPassword({ ...password, next: event.target.value })
              }
            />
            <Field
              label="Confirm new password"
              type="password"
              required
              autoComplete="new-password"
              value={password.confirm}
              onChange={(event) =>
                setPassword({ ...password, confirm: event.target.value })
              }
            />
            <button disabled={mutation.busy}>Change password</button>
          </form>
          {message && <p role="status">{message}</p>}
          {mutation.error && (
            <p className="pa-error" role="alert">
              {mutation.error}
            </p>
          )}
        </div>
      </AdminPanel>
      <AdminPanel title="Signed-in devices">
        <Toolbar onRefresh={() => setRevision((value) => value + 1)}>
          <button
            onClick={() => {
              mutation.clear();
              setConfirmation({ others: true });
            }}
          >
            Sign out other devices
          </button>
        </Toolbar>
        <DataState
          state={sessions}
          retry={() => setRevision((value) => value + 1)}
        >
          {(result) => (
            <AdminTable
              rows={Array.isArray(result) ? result : result.sessions || []}
              keyFor={(row) => row.device_id}
              columns={[
                {
                  label: "Device",
                  render: (row) => row.user_agent || "Unknown device",
                },
                { label: "Last seen", render: (row) => date(row.last_seen_at) },
                {
                  label: "Session",
                  render: (row) =>
                    row.is_current ? "Current session" : "Other device",
                },
                {
                  label: "Actions",
                  render: (row) => (
                    <button
                      onClick={() => {
                        mutation.clear();
                        setConfirmation({ device: row });
                      }}
                    >
                      Sign out device
                    </button>
                  ),
                },
              ]}
            />
          )}
        </DataState>
      </AdminPanel>
      <AdminPanel title="Security events">
        <DataState
          state={events}
          retry={() => setRevision((value) => value + 1)}
        >
          {(result) => (
            <RecordDetails
              rows={Array.isArray(result) ? result : result.events || []}
            />
          )}
        </DataState>
      </AdminPanel>
      {confirmation && (
        <AdminDialog
          title={
            confirmation.device
              ? "Sign out this device?"
              : "Sign out other devices?"
          }
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setConfirmation(null)}
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.run(
              confirmation.device
                ? "/api/auth/sessions/" +
                    encodeURIComponent(confirmation.device.device_id)
                : "/api/auth/sessions/others",
              {
                method: "DELETE",
              },
            );
          }}
        >
          <p>
            {confirmation.device?.is_current
              ? "This is your current session. You will need to sign in again."
              : "Selected devices will need to sign in again."}
          </p>
        </AdminDialog>
      )}
    </>
  );
}
