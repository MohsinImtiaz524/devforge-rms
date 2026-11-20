import { useState, useEffect } from "react";
import { AdminPanel, AdminTable, Toolbar, DataState } from "./admin-ui";
import { useAdminData, date } from "./admin-data";
import { RecordDetails } from "./RecordDetails";

export default function RootRequests({ version = 0 }) {
  const [revision, setRevision] = useState(0);
  const [live, setLive] = useState(true);
  const state = useAdminData(
    "/api/admin/request-monitor?window=live",
    version + revision,
  );
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        setRevision((value) => value + 1);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [live]);
  return (
    <AdminPanel
      title="Request diagnostics"
      description="Metrics from this application instance. Live mode refreshes every five seconds while this page is visible."
    >
      <Toolbar onRefresh={() => setRevision((value) => value + 1)}>
        <label className="pa-checkbox">
          <input
            type="checkbox"
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
          />
          Live refresh
        </label>
      </Toolbar>
      <DataState state={state} retry={() => setRevision((value) => value + 1)}>
        {(data) => (
          <>
            <div className="pa-metrics pa-request-metrics">
              {Object.entries(data.cards || {}).map(([key, card]) => (
                <article className="pa-metric" key={key}>
                  <div>
                    <p>{key}</p>
                    <strong>{Number(card.total || 0).toLocaleString()}</strong>
                    <small>
                      {card.failed || 0} failed / {card.lastMinute || 0} in the
                      last minute
                    </small>
                    <small>
                      Average {Number(card.averageMs || 0).toFixed(1)} ms
                    </small>
                  </div>
                </article>
              ))}
            </div>
            {Object.entries(data.cards || {}).map(([key, card]) => (
              <section key={key} className="pa-request-section">
                <h3>{key} activity</h3>
                <AdminTable
                  rows={card.recent || []}
                  columns={[
                    {
                      label: "Request",
                      render: (row) =>
                        row.label || row.name || row.route || "Operation",
                    },
                    {
                      label: "Duration",
                      render: (row) =>
                        Number(row.durationMs ?? row.ms ?? 0).toFixed(1) +
                        " ms",
                    },
                    {
                      label: "Status",
                      render: (row) => (row.failed ? "Failed" : "Completed"),
                    },
                    {
                      label: "Details",
                      render: (row) => (
                        <details>
                          <summary>Inspect</summary>
                          <RecordDetails rows={[row]} />
                        </details>
                      ),
                    },
                  ]}
                />
              </section>
            ))}
            <p className="pa-muted pa-diagnostics">
              Snapshot {date(data.checkedAt)}
            </p>
            <div className="pa-diagnostics">
              {Object.entries(data)
                .filter(([key]) => key !== "cards")
                .map(([key, value]) => (
                  <details key={key}>
                    <summary>{key.replaceAll("_", " ")}</summary>
                    <pre>{JSON.stringify(value, null, 2)}</pre>
                  </details>
                ))}
            </div>
          </>
        )}
      </DataState>
    </AdminPanel>
  );
}
