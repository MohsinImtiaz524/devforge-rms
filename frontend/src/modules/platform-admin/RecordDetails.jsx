import { date } from "./admin-data";

export function RecordDetails({ rows }) {
  return (
    <div className="pa-record-list">
      {rows.length ? (
        rows.map((row, index) => (
          <details key={row.id || index}>
            <summary>
              {row.action || row.title || row.name || row.shop_name || "Record"}{" "}
              / {date(row.created_at || row.updated_at || row.start_time)}
            </summary>
            <dl>
              {Object.entries(row).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replaceAll("_", " ")}</dt>
                  <dd>
                    {typeof value === "object"
                      ? JSON.stringify(value, null, 2)
                      : String(value ?? "?")}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))
      ) : (
        <p className="pa-empty">No records found.</p>
      )}
    </div>
  );
}
