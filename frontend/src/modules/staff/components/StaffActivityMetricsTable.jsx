import { formatShopCurrency } from '../../../currency';

export default function StaffActivityMetricsTable({ report }) {
  return <>
    <div className="info-banner">
      {report.notice || 'Operational metrics are descriptive and are not an automatic HR score.'}
      <br/>Order value is the full bill total of orders placed by this person, not money collected. Each order is credited only to the account that created it.
    </div>
    <div className="responsive-table activity-metrics"><table>
      <thead><tr><th>Staff</th><th>Orders placed</th><th>Order value</th><th>Payments</th><th>Register</th><th>Attendance</th><th>Records</th></tr></thead>
      <tbody>{report.rows?.map(row => <tr key={row.staff_profile_id}>
        <td><strong>{row.full_name}</strong><small>{row.employee_id} · {row.department_name || row.department || 'No department'}</small></td>
        <td>{row.orders_handled}<small>placed</small></td>
        <td>{formatShopCurrency(row.orders_total)}<small>placed orders</small></td>
        <td>{row.payments_received}<small>{row.payment_amount} received</small></td>
        <td>{row.register_sessions}<small>{row.closed_register_sessions} closed</small></td>
        <td>{row.attendance_reliable_days}/{row.attendance_scheduled_days}<small>{row.missing_clock_days} missing · {row.late_minutes} late min</small></td>
        <td>{row.open_tasks} tasks<small>{row.recognition_records} recognition · {row.disciplinary_records} disciplinary</small></td>
      </tr>)}{!report.rows?.length && <tr><td colSpan="7" className="empty-cell">No staff activity in this range.</td></tr>}</tbody>
    </table></div>
  </>;
}
