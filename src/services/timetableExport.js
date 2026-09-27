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

export function getFacultyShortCode(name) {
  if (!name) return '—';
  const clean = name.trim();
  if (clean.includes('Sri Karan')) return 'VSK';
  if (clean.includes('Maheswari') || clean.includes('Patil')) return 'MLP';
  if (clean.includes('Nanda')) return 'NMB';
  if (clean.includes('Asghar')) return 'AP';
  if (clean.includes('Soujanya')) return 'GS';
  if (clean.includes('Jayasudha')) return 'JK';
  if (clean.includes('Lavanya')) return 'KL';
  if (clean.includes('Sai Kiran')) return 'ST';
  if (clean.includes('Ramya')) return 'RH';
  if (clean.includes('Manzoor')) return 'MA';
  if (clean.includes('Hemalatha')) return 'HKL';
  if (clean.includes('Nirmala')) return 'NSG';
  if (clean.includes('Sushmitha')) return 'SS';
  if (clean.includes('Rahul')) return 'RK';
  if (clean.includes('Shweta')) return 'SSB';
  const words = clean.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+/i, '').split(/\s+/);
  return words.map((w) => w[0]?.toUpperCase()).filter(Boolean).join('').slice(0, 4);
}

export function getSubjectAbbr(code, name) {
  const c = String(code || '').toUpperCase();
  const n = String(name || '').toUpperCase();
  if (c.includes('786') || n.includes('MAJOR PROJECT')) return 'Project';
  if (c.includes('PLACEMENT') || n.includes('PLACEMENT')) return 'Placement';
  if (c.includes('PROCTOR') || n.includes('PROCTOR')) return 'Proctor';
  if (c.includes('LIBRARY') || n.includes('LIBRARY')) return 'Library';
  if (c.includes('REMEDIAL') || n.includes('REMEDIAL')) return 'Remedial';
  if (c.includes('ACTIVITY') || n.includes('ACTIVITY')) return 'Activity';
  if (c.includes('701') || n.includes('DEEP LEARNING')) return n.includes('LAB') ? 'DL & RL Lab' : 'DL & RL';
  if (c.includes('702') || n.includes('MACHINE LEARNING')) return n.includes('LAB') ? 'ML-II Lab' : 'ML-II';
  if (c.includes('703') || n.includes('DATA SECURITY')) return 'DSP';
  if (c.includes('714') || n.includes('BIG DATA')) return 'BDA';
  if (c.includes('755') || n.includes('WASTE')) return 'OE';
  return code || name.split(' ').map((w) => w[0]).join('').slice(0, 6);
}

export function printTimetable(entries, meta = {}) {
  const title = meta.title || 'AI-ASFA Timetable';
  const deptName = meta.department_name || 'Artificial Intelligence and Machine Learning';
  const deptCode = meta.department_code || 'AIML';
  const semNo = meta.semester_no || (meta.semester_id ? String(meta.semester_id) : '7');
  const romanSem = semNo === '7' ? 'VII' : semNo === '5' ? 'V' : semNo === '3' ? 'III' : semNo === '1' ? 'I' : semNo === '8' ? 'VIII' : semNo === '6' ? 'VI' : semNo === '4' ? 'IV' : semNo;
  const section = meta.section || 'A';
  const roomNo = meta.room_no || 'S-201';
  const wefDate = meta.wef_date || '20/07/2026';
  const version = meta.version || '2';
  const hodName = meta.hod_name || (deptCode === 'AIML' ? 'Dr. Jayasudha K' : 'Head of Department');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const periodSlots = [
    { p: 1, label: 'I', time: '9:10-10:05' },
    { p: 2, label: 'II', time: '10:05-11:00' },
    { p: 3, label: 'III', time: '11:15-12:10' },
    { p: 4, label: 'IV', time: '12:10-1:05' },
    { p: 5, label: 'V', time: '1:45-2:40' },
    { p: 6, label: 'VI', time: '2:40-3:35' },
    { p: 7, label: 'VII', time: '3:35-4:30' },
  ];

  // Helper to find items for a day and period
  const findItems = (day, p) => (entries || []).filter((item) =>
    item.day === day && Number(item.period_no ?? item.period) === p
  );

  // Extract unique faculty details
  const facultyMap = new Map();
  // Extract unique subject details
  const subjectMap = new Map();

  (entries || []).forEach((item) => {
    const fName = item.faculty_name || item.faculty;
    const coName = item.co_faculty_name;
    if (fName && !fName.includes('TBD')) {
      const code = getFacultyShortCode(fName);
      if (coName && !coName.includes('TBD')) {
        const coCode = getFacultyShortCode(coName);
        facultyMap.set(`${code}/ ${coCode}`, `${fName} / ${coName}`);
      } else {
        facultyMap.set(code, fName);
      }
    }

    const sCode = item.subject_code || item.code;
    const sName = item.subject_name || item.name;
    if (sCode && !subjectMap.has(sCode)) {
      subjectMap.set(sCode, {
        code: sCode,
        abbr: getSubjectAbbr(sCode, sName),
        name: sName || sCode,
      });
    }
  });

  // Ensure default core subjects for AIML Sem 7 if missing
  if (semNo === '7' && subjectMap.size < 4) {
    subjectMap.set('BAI701(IPCC)', { code: 'BAI701(IPCC)', abbr: 'DL & RL', name: 'Deep Learning & Reinforcement Learning' });
    subjectMap.set('BAI701', { code: 'BAI701', abbr: 'DL & RL Lab', name: 'Deep Learning & Reinforcement Learning' });
    subjectMap.set('BAI702(IPCC)', { code: 'BAI702(IPCC)', abbr: 'ML-II', name: 'Machine Learning -II' });
    subjectMap.set('BAI702', { code: 'BAI702', abbr: 'ML-II Lab', name: 'Machine Learning -II' });
    subjectMap.set('BAD703', { code: 'BAD703', abbr: 'DSP', name: 'Data Security & Privacy' });
    subjectMap.set('BCS714D', { code: 'BCS714D', abbr: 'BDA', name: 'Big Data Analytics' });
    subjectMap.set('BEC755A', { code: 'BEC755A', abbr: 'EWM', name: 'E-Waste Management' });
    subjectMap.set('BAJ786', { code: 'BAJ786', abbr: 'PROJ', name: 'Major Project Phase-II' });
  }

  // Format cell contents
  const formatCell = (day, p) => {
    // If Saturday and Sem 7: full Major Project across all periods!
    if (day === 'Saturday' && semNo === '7') {
      return '<div class="project-cell">Project</div>';
    }

    const items = findItems(day, p);
    if (!items || items.length === 0) return '—';

    // Lab with 2 batches
    if (items.length > 1) {
      const b1 = items.find((i) => i.batch === 'B1') || items[0];
      const b2 = items.find((i) => i.batch === 'B2') || items[1];
      const abbr1 = getSubjectAbbr(b1.subject_code || b1.code, b1.subject_name || b1.name);
      const abbr2 = getSubjectAbbr(b2.subject_code || b2.code, b2.subject_name || b2.name);
      const r1 = b1.room_no || b1.room || b1.classroom;
      const r2 = b2.room_no || b2.room || b2.classroom;
      let roomInfo = '';
      if (r1 && r2 && r1 !== r2) {
        roomInfo = `<small style="display:block;font-size:8.5px;color:#0369A1;">Lab: B1(${r1}) / B2(${r2})</small>`;
      } else if (r1 || r2) {
        roomInfo = `<small style="display:block;font-size:8.5px;color:#0369A1;">Lab: ${r1 || r2}</small>`;
      }
      return `<div class="lab-cell">${abbr1} (B1) / ${abbr2} (B2)${roomInfo}</div>`;
    }

    const item = items[0];
    const sCode = item.subject_code || item.code;
    const sName = item.subject_name || item.name;
    const abbr = getSubjectAbbr(sCode, sName);
    const room = item.room_no || item.room || item.classroom || (meta.room_no ? meta.room_no : '');
    const roomStr = room ? ` (${room})` : '';

    if (abbr === 'Project' || sCode === 'BAJ786') {
      return '<div class="project-cell">Project</div>';
    }
    if (abbr === 'Placement') {
      return `<div>Placement${roomStr}</div>`;
    }
    if (abbr === 'Library') {
      return `<div>Library</div>`;
    }
    if (abbr === 'Proctor') {
      return `<div>Proctor${roomStr}</div>`;
    }
    if (abbr === 'Activity') {
      return `<div>Activity${roomStr}</div>`;
    }
    if (abbr === 'Remedial') {
      return `<div>Remedial${roomStr}</div>`;
    }

    return `<div><strong>${abbr}</strong>${roomStr}</div>`;
  };

  const rowsHtml = days.map((day, dIdx) => {
    const p1 = formatCell(day, 1);
    const p2 = formatCell(day, 2);
    const p3 = formatCell(day, 3);
    const p4 = formatCell(day, 4);
    const p5 = formatCell(day, 5);
    const p6 = formatCell(day, 6);
    const p7 = formatCell(day, 7);

    // Saturday Sem 7 spans
    if (day === 'Saturday' && semNo === '7') {
      return `
        <tr>
          <td class="day-col">${day}</td>
          <td colspan="2" class="merged-proj">Project</td>
          ${dIdx === 0 ? '<td rowspan="6" class="v-break"><div>B<br>R<br>E<br>A<br>K</div></td>' : ''}
          <td colspan="2" class="merged-proj">Project</td>
          ${dIdx === 0 ? '<td rowspan="6" class="v-break"><div>L<br>U<br>N<br>C<br>H<br><br>B<br>R<br>E<br>A<br>K</div></td>' : ''}
          <td colspan="3" class="merged-proj">Project</td>
        </tr>
      `;
    }

    return `
      <tr>
        <td class="day-col">${day}</td>
        <td>${p1}</td>
        <td>${p2}</td>
        ${dIdx === 0 ? '<td rowspan="6" class="v-break"><div>B<br>R<br>E<br>A<br>K</div></td>' : ''}
        <td>${p3}</td>
        <td>${p4}</td>
        ${dIdx === 0 ? '<td rowspan="6" class="v-break"><div>L<br>U<br>N<br>C<br>H<br><br>B<br>R<br>E<br>A<br>K</div></td>' : ''}
        <td>${p5}</td>
        <td>${p6}</td>
        <td>${p7}</td>
      </tr>
    `;
  }).join('');

  // Faculty Details table rows
  const facultyArray = Array.from(facultyMap.entries());
  const subjectArray = Array.from(subjectMap.values());
  const maxRows = Math.max(facultyArray.length, subjectArray.length);

  const bottomTableRows = Array.from({ length: maxRows }).map((_, idx) => {
    const f = facultyArray[idx] || ['', ''];
    const s = subjectArray[idx] || { code: '', abbr: '', name: '' };
    return `
      <tr>
        <td style="width: 14%; font-weight: bold; text-align: center;">${f[0]}</td>
        <td style="width: 36%;">${f[1]}</td>
        <td style="width: 18%; font-weight: bold; text-align: center;">${s.code}</td>
        <td style="width: 12%; text-align: center;">${s.abbr}</td>
        <td style="width: 20%;">${s.name}</td>
      </tr>
    `;
  }).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      color: #000000;
      background: #FFFFFF;
      padding: 10px 14px;
      font-size: 11px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-container {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      margin-bottom: 8px;
      border-bottom: 2px solid #000000;
      padding-bottom: 6px;
    }
    .college-emblem {
      position: absolute;
      left: 6px;
      top: 2px;
      width: 60px;
      height: 60px;
      object-fit: contain;
    }
    .header-text {
      text-align: center;
      width: 100%;
    }
    .header-text h1 {
      font-size: 19px;
      font-weight: 900;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
      text-transform: uppercase;
    }
    .header-text .sub-1 {
      font-size: 9.5px;
      font-weight: 600;
      line-height: 1.3;
    }
    .header-text .sub-2 {
      font-size: 9.5px;
      line-height: 1.3;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .meta-table td {
      border: 1.5px solid #000000;
      padding: 4px 6px;
      text-align: center;
      background: #FDFDFD;
    }
    .meta-table td span {
      font-weight: normal;
    }
    .timetable-grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 8px;
    }
    .timetable-grid th, .timetable-grid td {
      border: 1.5px solid #000000;
      text-align: center;
      vertical-align: middle;
      padding: 5px 3px;
      font-size: 10px;
      line-height: 1.25;
    }
    .timetable-grid th {
      background: #F2F2F2;
      font-weight: 800;
      font-size: 10px;
    }
    .timetable-grid th small {
      display: block;
      font-size: 8.5px;
      font-weight: normal;
      margin-top: 2px;
    }
    .day-col {
      font-weight: 800;
      width: 90px;
      background: #FAFAFA;
      font-size: 10.5px;
    }
    .v-break {
      width: 32px;
      font-weight: 800;
      font-size: 9px;
      letter-spacing: 1px;
      background: #FAFAFA;
      vertical-align: middle;
      text-align: center;
    }
    .v-break div {
      line-height: 1.3;
    }
    .merged-proj {
      font-weight: 800;
      font-size: 11.5px;
      letter-spacing: 0.5px;
      background: #F9F9F9;
    }
    .lab-cell {
      font-weight: 700;
      font-size: 9.5px;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 10px;
    }
    .details-table th, .details-table td {
      border: 1.5px solid #000000;
      padding: 3.5px 6px;
      font-size: 9.5px;
      line-height: 1.25;
    }
    .details-table th {
      background: #EAEAEA;
      font-weight: 900;
      text-align: center;
    }
    .batch-banner {
      border: 1.5px solid #000000;
      border-top: none;
      padding: 4px 8px;
      font-size: 9.5px;
      font-weight: 700;
      background: #FAFAFA;
      display: flex;
      justify-content: space-between;
    }
    .signatures-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 36px;
      padding: 0 20px;
    }
    .sig-col {
      text-align: center;
      min-width: 180px;
    }
    .sig-title {
      font-weight: 900;
      font-size: 11px;
      margin-top: 4px;
      border-top: 1.5px solid #000000;
      padding-top: 4px;
    }
    .sig-sub {
      font-size: 9.5px;
      line-height: 1.25;
      color: #333333;
    }
  </style>
</head>
<body>
  <div class="header-container">
    <img src="/skit-emblem.png" onerror="this.style.display='none'" class="college-emblem" alt="SKIT Logo" />
    <div class="header-text">
      <h1>Sri Krishna Institute of Technology</h1>
      <div class="sub-1">(Accredited by NAAC Approved by A.I.C.T.E. New Delhi, Recognized by Govt. of Karnataka & Affiliated to V.T.U., Belagavi)</div>
      <div class="sub-2">#57, Chimney Hills, Hesaraghatta Main Road, Chikkabanavara Post, Bengaluru- 560090</div>
    </div>
  </div>

  <table class="meta-table">
    <tr>
      <td>Dept: <span>${deptCode}</span></td>
      <td>Sem: <span>${romanSem}</span></td>
      <td>Div: <span>${section}</span></td>
      <td>Room No.: <span>${roomNo}</span></td>
      <td>Branch: <span>${deptCode}</span></td>
      <td>Version: <span>${version}</span></td>
      <td>W.E.F: <span>${wefDate}</span></td>
    </tr>
  </table>

  <table class="timetable-grid">
    <thead>
      <tr>
        <th class="day-col">Time<br>Day</th>
        <th>I<small>9:10-10:05</small></th>
        <th>II<small>10:05-11:00</small></th>
        <th style="width: 34px;">11:00<br>-11:15</th>
        <th>III<small>11:15-12:10</small></th>
        <th>IV<small>12:10-1:05</small></th>
        <th style="width: 34px;">1:05<br>-1:45</th>
        <th>V<small>1:45-2:40</small></th>
        <th>VI<small>2:40-3:35</small></th>
        <th>VII<small>3:35-4:30</small></th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <table class="details-table">
    <thead>
      <tr>
        <th colspan="2">Faculty Details</th>
        <th colspan="3">Subject Details</th>
      </tr>
      <tr style="background: #F8F8F8; font-weight: 700; font-size: 8.5px;">
        <th style="width: 14%;">Short Code</th>
        <th style="width: 36%;">Faculty Name</th>
        <th style="width: 18%;">Subject Code</th>
        <th style="width: 12%;">Short Form</th>
        <th style="width: 20%;">Full Subject Name</th>
      </tr>
    </thead>
    <tbody>
      ${bottomTableRows}
    </tbody>
  </table>

  <div class="batch-banner">
    <div><strong>Batch Details:</strong> B1: 1KT22AI058, 1KT22AI059, 1KT23AI001-1KT23AI031</div>
    <div>B2: 1KT23AI032-1KT23AI063, 1KT24AI400</div>
  </div>

  <div class="signatures-row">
    <div class="sig-col">
      <div class="sig-title">Class Coordinator</div>
      <div class="sig-sub">Department of ${deptCode}</div>
    </div>
    <div class="sig-col">
      <div class="sig-title">Head of the Department</div>
      <div class="sig-sub">${deptName}</div>
      <div class="sig-sub" style="font-weight: 700;">${hodName}</div>
    </div>
    <div class="sig-col">
      <div class="sig-title">Dean Academics</div>
      <div class="sig-sub">Dean Academics</div>
      <div class="sig-sub">SKIT, Bengaluru - 560 090</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  const popup = window.open('', '_blank', 'width=1280,height=880');
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}
