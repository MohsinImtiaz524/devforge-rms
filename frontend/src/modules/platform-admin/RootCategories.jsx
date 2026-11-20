import { useState } from "react";
import {
  AdminPanel,
  AdminTable,
  Toolbar,
  Field,
  AdminDialog,
  DataState,
} from "./admin-ui";
import { useAdminData, useAdminMutation } from "./admin-data";
import { RecordDetails } from "./RecordDetails";

export default function RootCategories({ version = 0 }) {
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [history, setHistory] = useState(null);
  const categories = useAdminData(
    "/api/expenses/categories?include_archived=true",
    version + revision,
  );
  const categoryHistory = useAdminData(
    history ? "/api/expenses/categories/" + history.id + "/history" : null,
    revision,
  );
  const mutation = useAdminMutation(() => {
    setEditing(null);
    setConfirmation(null);
    setRevision((value) => value + 1);
  });
  return (
    <AdminPanel
      title="Shared expense categories"
      description="Global categories maintained by root administrators. Archiving preserves historical expenses."
    >
      <Toolbar
        onAdd={() => {
          mutation.clear();
          setEditing({ name: "" });
        }}
        addLabel="Add category"
        onRefresh={() => setRevision((value) => value + 1)}
      />
      <DataState
        state={categories}
        retry={() => setRevision((value) => value + 1)}
      >
        {(rows) => (
          <AdminTable
            rows={rows}
            columns={[
              { label: "Category", key: "name" },
              {
                label: "Status",
                render: (row) => (row.is_active ? "Active" : "Archived"),
              },
              {
                label: "Actions",
                render: (row) => (
                  <div className="pa-row-actions">
                    <button
                      onClick={() => {
                        mutation.clear();
                        setEditing(row);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        mutation.clear();
                        setConfirmation(row);
                      }}
                    >
                      {row.is_active ? "Archive" : "Restore"}
                    </button>
                    <button onClick={() => setHistory(row)}>History</button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </DataState>
      {editing && (
        <AdminDialog
          title={editing.id ? "Rename category" : "Add category"}
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.run(
              "/api/expenses/categories" + (editing.id ? "/" + editing.id : ""),
              {
                method: editing.id ? "PATCH" : "POST",
                body: { name: editing.name },
              },
            );
          }}
        >
          <Field
            label="Category name"
            required
            minLength={2}
            maxLength={120}
            value={editing.name}
            onChange={(event) =>
              setEditing({ ...editing, name: event.target.value })
            }
          />
        </AdminDialog>
      )}
      {confirmation && (
        <AdminDialog
          title={
            (confirmation.is_active ? "Archive" : "Restore") + " category?"
          }
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setConfirmation(null)}
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.run(
              "/api/expenses/categories/" +
                confirmation.id +
                "/" +
                (confirmation.is_active ? "archive" : "restore"),
              { method: "POST" },
            );
          }}
        >
          <p>{confirmation.name}</p>
        </AdminDialog>
      )}
      {history && (
        <AdminDialog
          title={"Category history: " + history.name}
          onClose={() => setHistory(null)}
        >
          <DataState
            state={categoryHistory}
            retry={() => setRevision((value) => value + 1)}
          >
            {(rows) => (
              <RecordDetails
                rows={
                  Array.isArray(rows) ? rows : rows.items || rows.history || []
                }
              />
            )}
          </DataState>
        </AdminDialog>
      )}
    </AdminPanel>
  );
}
