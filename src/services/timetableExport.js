function escapeCsv(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportTimetableCsv(entries, filename = 'timetable.csv') {
  const headers = [
    'Day', 'Period', 'Subject Code', 'Subject Name', 'Component',
    'Faculty', 'Co Faculty', 'Room', 'Batch',
  ];

  const rows = (entries || []).map((item) => [
    item.day,
    item.period,
    item.subject_code || item.code,
    item.subject_name || item.name,
    item.component,
    item.faculty_name || item.faculty,
    item.co_faculty_name,
    item.room,
    item.batch,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printTimetable(entries, title = 'AI-ASFA Timetable') {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const periods = [1, 2, 3, 4, 5, 6, 7];
  const find = (day, period) => (entries || []).find((item) =>
    item.day === day && Number(item.period_no ?? item.period) === period
  );

  const rows = days.map((day) => `
    <tr>
      <th>${day}</th>
      ${periods.map((p) => {
        const item = find(day, p);
        return `<td>${item ? `<strong>${item.subject_code || item.code || ''}</strong><br>${item.subject_name || ''}<br><small>${item.faculty_name || item.faculty || ''}</small>` : '—'}</td>`;
      }).join('')}
    </tr>
  `).join('');

  const html = `<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:center;font-size:11px}th{background:#f1f5f9}small{color:#64748b}
  </style></head><body><h1>${title}</h1><table><thead><tr><th>Day</th>${periods.map((p)=>`<th>Period ${p}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`;

  const popup = window.open('', '_blank', 'width=1200,height=800');
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}
