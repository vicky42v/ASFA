export const statsData = [
  { id: 'dept', label: 'Total Departments', value: '8', subtext: 'All Departments', icon: 'Building2' },
  { id: 'faculty', label: 'Total Faculty', value: '124', subtext: 'Across All Departments', icon: 'Users' },
  { id: 'students', label: 'Total Students', value: '1,450', subtext: 'Active Enrolled', icon: 'GraduationCap' },
  { id: 'timetables', label: 'Active Timetables', value: '24', subtext: 'Across All Departments', icon: 'CalendarDays' },
];

export const quickActionsData = [
  { id: 'add-dept', label: 'Add Department', icon: 'Building2', action: 'add-dept' },
  { id: 'add-faculty', label: 'Add Faculty', icon: 'UserPlus', action: 'add-faculty' },
  { id: 'upload-scheme', label: 'Upload Scheme', icon: 'FileUp', action: 'upload-scheme' },
  { id: 'generate-tt', label: 'Generate Timetable', icon: 'CalendarPlus', action: 'generate-tt' },
  { id: 'assign-hod', label: 'Assign HOD', icon: 'UserCheck', action: 'assign-hod' },
  { id: 'manage-rooms', label: 'Manage Rooms', icon: 'DoorOpen', action: 'manage-rooms' },
  { id: 'send-notif', label: 'Send Notifications', icon: 'BellRing', action: 'send-notif' },
  { id: 'view-reports', label: 'View Reports', icon: 'BarChart3', action: 'view-reports' },
];

export const departmentsData = [
  { id: 1, name: 'Computer Science and Engineering', code: 'CSE', hod: 'Dr. Kavitha R', totalFaculty: 28, activeTimetables: 6, status: 'Active', studentsCount: 420 },
  { id: 2, name: 'Artificial Intelligence & Machine Learning', code: 'AI&ML', hod: 'Dr. Jayasudha K', totalFaculty: 18, activeTimetables: 4, status: 'Active', studentsCount: 240 },
  { id: 3, name: 'Electronics and Communication Engineering', code: 'ECE', hod: 'Dr. Meena S', totalFaculty: 16, activeTimetables: 3, status: 'Active', studentsCount: 300 },
  { id: 4, name: 'Information Science and Engineering', code: 'ISE', hod: 'Dr. Priya M', totalFaculty: 14, activeTimetables: 2, status: 'Active', studentsCount: 210 },
  { id: 5, name: 'Mechanical Engineering', code: 'ME', hod: 'Dr. Ramesh T', totalFaculty: 12, activeTimetables: 2, status: 'Active', studentsCount: 150 },
  { id: 6, name: 'Civil Engineering', code: 'CE', hod: 'Dr. Balaji K', totalFaculty: 10, activeTimetables: 2, status: 'Active', studentsCount: 130 },
  { id: 7, name: 'Electrical and Electronics Engineering', code: 'EEE', hod: 'Dr. Sunitha P', totalFaculty: 14, activeTimetables: 2, status: 'Active', studentsCount: 180 },
  { id: 8, name: 'Basic Science and Humanities', code: 'BSH', hod: 'Dr. Lakshmi V', totalFaculty: 12, activeTimetables: 3, status: 'Active', studentsCount: 0 },
];

export const facultyData = [
  { id: 1, empId: 'SKIT1023', name: 'Dr. Kavitha R', email: 'kavitha.r@skit.edu.in', dept: 'Computer Science and Engineering', designation: 'Professor', role: 'HOD', status: 'Active', phone: '9876543210', workload: '20/24 hrs', confidence: '99%' },
  { id: 2, empId: 'SKIT1024', name: 'Dr. Arjun B', email: 'arjun.b@skit.edu.in', dept: 'Artificial Intelligence & Machine Learning', designation: 'Associate Professor', role: 'HOD', status: 'Active', phone: '9876543211', workload: '18/24 hrs', confidence: '98%' },
  { id: 3, empId: 'SKIT1025', name: 'Dr. Meena S', email: 'meena.s@skit.edu.in', dept: 'Electronics and Communication Engineering', designation: 'Assistant Professor', role: 'HOD', status: 'Active', phone: '9876543212', workload: '22/24 hrs', confidence: '97%' },
  { id: 4, empId: 'SKIT1026', name: 'Dr. Priya M', email: 'priya.m@skit.edu.in', dept: 'Information Science and Engineering', designation: 'Assistant Professor', role: 'HOD', status: 'Active', phone: '9876543213', workload: '16/24 hrs', confidence: '94%' },
  { id: 5, empId: 'SKIT1027', name: 'Dr. Ramesh T', email: 'ramesh.t@skit.edu.in', dept: 'Mechanical Engineering', designation: 'Associate Professor', role: 'HOD', status: 'Active', phone: '9876543214', workload: '19/24 hrs', confidence: '96%' },
  { id: 6, empId: 'SKIT1028', name: 'Dr. Balaji K', email: 'balaji.k@skit.edu.in', dept: 'Civil Engineering', designation: 'Assistant Professor', role: 'HOD', status: 'Active', phone: '9876543215', workload: '17/24 hrs', confidence: '95%' },
  { id: 7, empId: 'SKIT1029', name: 'Dr. Sunitha P', email: 'sunitha.p@skit.edu.in', dept: 'Electrical and Electronics Engineering', designation: 'Associate Professor', role: 'HOD', status: 'Active', phone: '9876543216', workload: '18/24 hrs', confidence: '93%' },
  { id: 8, empId: 'SKIT1030', name: 'Prof. Asghar Pasha', email: 'asghar.p@skit.edu.in', dept: 'Computer Science and Engineering', designation: 'Professor', role: 'Faculty', status: 'Active', phone: '9876543217', workload: '18/24 hrs', confidence: '95%' },
  { id: 9, empId: 'SKIT1031', name: 'Mr. V Sri Karan', email: 'sri.k@skit.edu.in', dept: 'Computer Science and Engineering', designation: 'Assistant Professor', role: 'Timetable Coordinator', status: 'Active', phone: '9876543218', workload: '20/24 hrs', confidence: '92%' },
  { id: 10, empId: 'SKIT1032', name: 'Mrs. Nanda M B', email: 'nanda.b@skit.edu.in', dept: 'Computer Science and Engineering', designation: 'Assistant Professor', role: 'Faculty', status: 'Active', phone: '9876543219', workload: '14/24 hrs', confidence: '90%' }
];

export const subjectsData = [
  { id: 1, code: '22MAT11', name: 'Mathematics-I', dept: 'Computer Science & Engineering', sem: 'I', type: 'Theory', credit: 4, status: 'Active' },
  { id: 2, code: '22PHY12', name: 'Engineering Physics', dept: 'Computer Science & Engineering', sem: 'I', type: 'Theory', credit: 3, status: 'Active' },
  { id: 3, code: '22CHE13', name: 'Engineering Chemistry', dept: 'Computer Science & Engineering', sem: 'I', type: 'Theory', credit: 3, status: 'Active' },
  { id: 4, code: '22CIV14', name: 'Engineering Graphics', dept: 'Computer Science & Engineering', sem: 'I', type: 'Theory', credit: 2, status: 'Active' },
  { id: 5, code: '22CSL15', name: 'Programming for Problem Solving Lab', dept: 'Computer Science & Engineering', sem: 'I', type: 'Lab', credit: 2, status: 'Active' },
  { id: 6, code: '22EEL16', name: 'Basic Electrical Engineering', dept: 'Computer Science & Engineering', sem: 'I', type: 'Theory', credit: 3, status: 'Active' },
  { id: 7, code: '22MAT21', name: 'Mathematics-II', dept: 'Computer Science & Engineering', sem: 'II', type: 'Theory', credit: 4, status: 'Active' },
  { id: 8, code: '22DSA22', name: 'Data Structures & Algorithms', dept: 'Computer Science & Engineering', sem: 'II', type: 'Theory', credit: 4, status: 'Active' },
  { id: 9, code: '22CSL23', name: 'Data Structures Lab', dept: 'Computer Science & Engineering', sem: 'II', type: 'Lab', credit: 2, status: 'Active' },
  { id: 10, code: '22OOP24', name: 'Object Oriented Programming', dept: 'Computer Science & Engineering', sem: 'II', type: 'Theory', credit: 3, status: 'Active' }
];

export const schemesData = [
  { id: 1, name: 'VTU 2022 Scheme', desc: 'B.E - 7th Sem Onwards', dept: 'Computer Science & Engineering', type: 'UG - 2022', year: '2022 - 2026', file: 'PDF • 2.4 MB', date: '20/07/2026 10:30 AM', status: 'Active' },
  { id: 2, name: 'VTU 2022 Scheme', desc: 'B.E - 5th & 6th Sem', dept: 'Computer Science & Engineering', type: 'UG - 2022', year: '2022 - 2026', file: 'PDF • 1.8 MB', date: '18/07/2026 04:15 PM', status: 'Active' },
  { id: 3, name: 'VTU 2022 Scheme', desc: 'B.E - 1st to 4th Sem', dept: 'Computer Science & Engineering', type: 'UG - 2022', year: '2022 - 2026', file: 'PDF • 2.1 MB', date: '15/07/2026 11:20 AM', status: 'Active' },
  { id: 4, name: 'VTU 2022 Scheme', desc: 'Electronics & Communication', dept: 'Electronics & Communication', type: 'UG - 2022', year: '2022 - 2026', file: 'PDF • 2.6 MB', date: '14/07/2026 09:45 AM', status: 'Active' },
  { id: 5, name: 'VTU 2022 Scheme', desc: 'Mechanical Engineering', dept: 'Mechanical Engineering', type: 'UG - 2022', year: '2022 - 2026', file: 'PDF • 2.3 MB', date: '12/07/2026 02:30 PM', status: 'Active' },
  { id: 6, name: 'VTU 2025 Scheme', desc: 'AI & ML - 1st to 4th Sem', dept: 'AI & Machine Learning', type: 'UG - 2025', year: '2025 - 2029', file: 'PDF • 2.0 MB', date: '21/07/2026 01:15 PM', status: 'Active' }
];

export const roomsData = [
  { id: 1, roomNo: 'A-204', building: 'Academic Block A', type: 'Classroom', capacity: 70, projector: true, ac: true, status: 'Occupied' },
  { id: 2, roomNo: 'A-203', building: 'Academic Block A', type: 'Classroom', capacity: 70, projector: true, ac: false, status: 'Occupied' },
  { id: 3, roomNo: 'Lab-1', building: 'CS Block', type: 'Computer Lab', capacity: 40, projector: true, ac: true, status: 'Occupied' },
  { id: 4, roomNo: 'Lab-2', building: 'CS Block', type: 'Computer Lab', capacity: 40, projector: true, ac: true, status: 'Occupied' },
  { id: 5, roomNo: 'B-102', building: 'Academic Block B', type: 'Seminar Hall', capacity: 150, projector: true, ac: true, status: 'Available' },
];

export const usersData = [
  { id: 'USR001', name: 'Admin User', email: 'admin@skit.ac.in', role: 'Super Admin', dept: 'Administration', status: 'Active', lastLogin: '20/07/2026 10:30 AM' },
  { id: 'USR002', name: 'Dr. Mahesh B', email: 'hod.cse@skit.ac.in', role: 'HOD', dept: 'CSE', status: 'Active', lastLogin: '20/07/2026 09:15 AM' },
  { id: 'USR003', name: 'Prof. Ramesh K', email: 'tcc.se@skit.ac.in', role: 'Timetable Coordinator', dept: 'CSE', status: 'Active', lastLogin: '19/07/2026 04:45 PM' },
  { id: 'USR004', name: 'Prof. Priya S', email: 'priya.s@skit.ac.in', role: 'Faculty', dept: 'CSE', status: 'Active', lastLogin: '18/07/2026 11:20 AM' },
  { id: 'USR005', name: 'Prof. Arjun P', email: 'arjun.p@skit.ac.in', role: 'Faculty', dept: 'ECE', status: 'Active', lastLogin: '18/07/2026 10:05 AM' }
];

export const recentActivitiesData = [
  { id: 1, title: 'Computer Science - 5th Sem Timetable Generated', date: '02 May 2026', type: 'Timetable', status: 'Published' },
  { id: 2, title: 'AI & ML - 3rd Sem Scheme PDF Uploaded', date: '01 May 2026', type: 'Scheme', status: 'Published' },
  { id: 3, title: 'Dr. Kavitha R Assigned as CSE HOD', date: '30 Apr 2026', type: 'Faculty', status: 'Published' },
  { id: 4, title: 'Room A-204 Workstation Hardware Updated', date: '28 Apr 2026', type: 'Room', status: 'Published' },
  { id: 5, title: 'Notification Sent to All Faculty Members', date: '27 Apr 2026', type: 'Notification', status: 'Sent' }
];

export const timetableMatrixData = [
  { day: 'Monday', slots: [
    { code: 'DL & RL (B1)', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { code: 'ML-II Lab (B2)', faculty: 'Mrs. Nanda M B', room: 'Lab-2' },
    { break: true, label: 'TEA BREAK' },
    { code: 'BDA', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { code: 'DSP', faculty: 'Mr. Asghar Pasha', room: 'A-204' },
    { break: true, label: 'LUNCH BREAK' },
    { code: 'DL & RL', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { code: 'ML-II', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { code: 'Placement', faculty: 'Training', room: 'Auditorium' }
  ]},
  { day: 'Tuesday', slots: [
    { code: 'OE', faculty: 'Mrs. Nanda M B', room: 'A-203' },
    { code: 'DL & RL', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { break: true, label: 'TEA BREAK' },
    { code: 'DSP', faculty: 'Mr. Asghar Pasha', room: 'A-204' },
    { code: 'ML-II', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { break: true, label: 'LUNCH BREAK' },
    { code: 'Project', faculty: 'Team Based', room: 'A-204', selected: true },
    { code: 'Library', faculty: 'Self Study', room: 'Library' },
    { code: 'Placement', faculty: 'Training', room: 'Auditorium' }
  ]},
  { day: 'Wednesday', slots: [
    { code: 'DL & RL', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { code: 'OE', faculty: 'Mrs. Nanda M B', room: 'A-203' },
    { break: true, label: 'TEA BREAK' },
    { code: 'DL & RL (B2)', faculty: 'Mr. V Sri Karan', room: 'Lab-1' },
    { code: 'ML-II Lab (B1)', faculty: 'Dr. Maheswari L Patil', room: 'Lab-2' },
    { break: true, label: 'LUNCH BREAK' },
    { code: 'BDA', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { code: 'DSP', faculty: 'Mr. Asghar Pasha', room: 'A-204' },
    { code: 'Project', faculty: 'Team Based', room: 'A-204' }
  ]},
  { day: 'Thursday', slots: [
    { code: 'ML-II', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { code: 'BDA', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { break: true, label: 'TEA BREAK' },
    { code: 'DSP', faculty: 'Mr. Asghar Pasha', room: 'A-204' },
    { code: 'OE', faculty: 'Mrs. Nanda M B', room: 'A-203' },
    { break: true, label: 'LUNCH BREAK' },
    { code: 'DL & RL', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { code: 'Remedial', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { code: 'Project', faculty: 'Team Based', room: 'A-204' }
  ]},
  { day: 'Friday', slots: [
    { code: 'BDA', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { code: 'ML-II', faculty: 'Dr. Maheswari L Patil', room: 'A-204' },
    { break: true, label: 'TEA BREAK' },
    { code: 'DL & RL', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { code: 'Remedial', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { break: true, label: 'LUNCH BREAK' },
    { code: 'DSP', faculty: 'Mr. Asghar Pasha', room: 'A-204' },
    { code: 'DL & RL', faculty: 'Mr. V Sri Karan', room: 'A-204' },
    { code: 'Project', faculty: 'Team Based', room: 'A-204' }
  ]},
  { day: 'Saturday', slots: [
    { code: 'Project', faculty: 'Team Based', room: 'Lab-1' },
    { code: 'Project', faculty: 'Team Based', room: 'Lab-1' },
    { break: true, label: 'TEA BREAK' },
    { code: 'Project', faculty: 'Team Based', room: 'Lab-1' },
    { code: 'Project', faculty: 'Team Based', room: 'Lab-1' },
    { break: true, label: 'LUNCH BREAK' },
    { code: 'Project', faculty: 'Team Based', room: 'Lab-1' },
    { code: 'Project', faculty: 'Team Based', room: 'Lab-1' },
    { code: 'Project', faculty: 'Team Based', room: 'Lab-1' }
  ]}
];
