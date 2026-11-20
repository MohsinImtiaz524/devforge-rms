import { useState } from "react";
import {
  AdminDialog,
  AdminPanel,
  AdminTable,
  DataState,
  Field,
} from "./admin-ui";
import { useAdminData, useAdminMutation, date, money } from "./admin-data";

export default function RootRegisterReview({ shopId = "", version = 0 }) {
  const [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState(null);
  const drops = useAdminData(
    "/api/shifts/cash-drops/pending",
    version + revision,
  );
  const handovers = useAdminData(
    "/api/shifts/pending-handovers",
    version + revision,
  );
  const mutation = useAdminMutation(() => {
    setDecision(null);
    setRevision((value) => value + 1);
  });
  const scoped = (rows) =>
    (Array.isArray(rows) ? rows : []).filter(
      (row) => !shopId || String(row.shop_id) === String(shopId),
    );
  const columns = (kind) => [
    {
      label: "Restaurant",
      render: (row) => row.shop_name || "Shop #" + row.shop_id,
    },
    { label: "Requested", render: (row) => date(row.created_at) },
    {
      label: "Requested by",
      render: (row) =>
        row.requested_by_name ||
        row.user_name ||
        row.from_user_name ||
        row.cashier_name ||
        "?",
    },
    { label: "Amount", render: (row) => money(row.amount) },
    { label: "Reason", render: (row) => row.note || row.reason || "?" },
    {
      label: "Actions",
      render: (row) => (
        <div className="pa-row-actions">
          <button
            onClick={() => {
              mutation.clear();
              setDecision({ kind, row, status: "verified" });
            }}
          >
            Verify
          </button>
          <button
            onClick={() => {
              mutation.clear();
              setDecision({ kind, row, status: "rejected" });
            }}
          >
            Reject
          </button>
        </div>
      ),
    },
  ];
  return (
    <>
      <AdminPanel
        title="Pending cash drops"
        description="Verify or reject recorded cash removals. Root administrators do not open or collect restaurant register cash."
      >
        <DataState
          state={drops}
          retry={() => setRevision((value) => value + 1)}
        >
          {(rows) => (
            <AdminTable rows={scoped(rows)} columns={columns("drop")} />
          )}
        </DataState>
      </AdminPanel>
      <AdminPanel title="Pending cash handovers">
        <DataState
          state={handovers}
          retry={() => setRevision((value) => value + 1)}
        >
          {(rows) => (
            <AdminTable rows={scoped(rows)} columns={columns("handover")} />
          )}
        </DataState>
      </AdminPanel>
      {decision && (
        <AdminDialog
          title={
            decision.status === "verified"
              ? "Verify cash record?"
              : "Reject cash record?"
          }
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setDecision(null)}
          onSubmit={(event) => {
            event.preventDefault();
            const path =
              decision.kind === "drop"
                ? "/api/shifts/cash-drops/" + decision.row.id + "/verify"
                : "/api/shifts/verify-handover";
            const body = { status: decision.status };
            if (decision.kind === "handover")
              body.handover_id = decision.row.id;
            void mutation.run(path, { method: "POST", body });
          }}
        >
          <Field label="Restaurant">
            <input
              disabled
              value={decision.row.shop_name || "Shop #" + decision.row.shop_id}
            />
          </Field>
          <p>{money(decision.row.amount)}</p>
          <p>
            Confirm the actual cash record before continuing. This action
            updates the audit trail.
          </p>
        </AdminDialog>
      )}
    </>
  );
}
