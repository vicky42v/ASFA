import os
import sys

# Ensure root dir is on python path
sys.path.insert(0, os.path.abspath("."))

import re
import pdfplumber
from collections import defaultdict
from backend.app import create_app
from backend.db import execute, rows

PDF_DIR = r"C:\major proj database\scheme\2025"

BRANCH_PDF_MAP = {
    "2025_scheme_cse.pdf": 5,   # Computer Science & Engineering
    "2025_scheme_aiml.pdf": 8,  # Artificial Intelligence & Machine Learning
    "2025_scheme_civil.pdf": 2, # Civil Engineering
    "2025_scheme_ec.pdf": 4,    # Electronics & Communication Engineering
    "2025_scheme_ifs.pdf": 6,   # Information Science & Engineering
    "2025_scheme_me.pdf": 1,    # Mechanical Engineering
    "2025_scheme_vlsi.pdf": 3,  # Electronics & Communication (VLSI)
}

SEM_MAP = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4,
    'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8,
    'FIRST': 1, 'SECOND': 2, 'THIRD': 3, 'FOURTH': 4,
    'FIFTH': 5, 'SIXTH': 6, 'SEVENTH': 7, 'EIGHTH': 8
}

TITLE_FIXES = {
    "1BNSS309": "National Service Scheme (NSS)",
    "1BPE309": "Physical Education (PE) (Sports and Athletics)",
    "1BYOG309": "Yoga",
    "1BMUK309": "Music",
    "1BNSK409": "National Service Scheme (NSS)",
    "1BPEK409": "Physical Education (PE) (Sports and Athletics)",
    "1BYOK409": "Yoga",
    "1BMUS409": "Music",
    "1BCP308": "Community Project (Project-Based Learning) / Societal Project",
    "1BEP408": "Environmental Science Project",
    "1BMATDIP310": "Mathematics course for Lateral Entry Students",
    "1BMATDIP410": "Mathematics course for Lateral Entry Students",
    "1BCS508": "Hackathon-Based Project",
    "1BAI508": "Hackathon-Based Project",
    "1BCV508": "Field Survey & Project",
    "1BEC508": "Mini Project / IoT Hackathon",
    "1BIS508": "Hackathon-Based Project",
    "1BME508": "Design & Fabrication Project",
    "1BVL508": "VLSI Mini Project",
}

def clean_val(c):
    if c is None: return ""
    return str(c).replace('\n', ' ').strip()

def extract_branch_pdf(pdf_path, dept_id):
    records = []
    seen_codes = set()
    with pdfplumber.open(pdf_path) as pdf:
        current_sem = None
        for page_idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            
            # Check for semester heading
            sem_m = re.search(r'\b(III|IV|V|VI|VII|VIII|I|II)\s+SEMESTER\b', text, re.IGNORECASE)
            if sem_m:
                s_rom = sem_m.group(1).upper()
                if s_rom in SEM_MAP:
                    current_sem = SEM_MAP[s_rom]
                    
            tables = page.extract_tables()
            if not tables or not current_sem:
                continue
                
            for table in tables:
                for row in table:
                    row_clean = [clean_val(c) for c in row]
                    
                    code = ""
                    code_idx = -1
                    for idx, cell in enumerate(row_clean):
                        m = re.search(r'\b(1[A-Z]{2,10}[0-9]{3}[A-Z0-9]?)\b', cell)
                        if m:
                            code = m.group(1)
                            code_idx = idx
                            break
                    if not code or code.startswith("1BXXL307") or code.startswith("1BXXL406") or code.startswith("1BXX505"):
                        continue
                        
                    # Category
                    category = "Core"
                    for cell in row_clean:
                        cat_m = re.match(r'^(ASC|IPCC|PCC|PCCL|AEC|SDC|NCMC|OEC|PEC|HSMC|BSC|ESC|ETC|PLC|SEC)$', cell, re.IGNORECASE)
                        if cat_m:
                            category = cat_m.group(1).upper()
                            break
                            
                    # Title
                    title = ""
                    if code in TITLE_FIXES:
                        title = TITLE_FIXES[code]
                    else:
                        candidates = [c for i, c in enumerate(row_clean) if i != code_idx and len(c) > 3]
                        candidates = [c for c in candidates if not any(h in c.lower() for h in [
                            'scheme', 'examination', 'outcome-based', 'sl.', 'total', 'hours', 'marks', 
                            'cie', 'see', 'teaching', 'learning', 'duration', 'credits', 'td/psb', 'respective', 's u p m a c'
                        ])]
                        if candidates:
                            alpha_cands = [c for c in candidates if not c[0].isdigit() and not c.startswith('TD') and not c.startswith('Respective') and not c.startswith('Physical') and not c.startswith('CIE:')]
                            title = max(alpha_cands, key=len) if alpha_cands else max(candidates, key=len)
                            
                    if not title or title.lower().startswith('to be completed') or title.lower().startswith('table'):
                        title = code
                        
                    # Calculate L, T, P, Credits accurately
                    l_hrs, t_hrs, p_hrs, creds = 3, 0, 0, 3
                    
                    # Pattern matching by category/code
                    if category == 'IPCC':
                        l_hrs, t_hrs, p_hrs, creds = 3, 0, 2, 4
                    elif category in ('PCCL', 'SEC') or 'L' in code[4:6] or 'LAB' in title.upper():
                        l_hrs, t_hrs, p_hrs, creds = 0, 0, 2, 1
                    elif category == 'ASC':
                        l_hrs, t_hrs, p_hrs, creds = 3, 2, 0, 4
                    elif category in ('AEC', 'SDC'):
                        l_hrs, t_hrs, p_hrs, creds = 0, 0, 2, 1
                    elif category == 'NCMC' or any(code.startswith(pre) for pre in ('1BNSS', '1BPE', '1BYOG', '1BMUK', '1BNSK', '1BPEK', '1BYOK', '1BMUS', '1BMATDIP')):
                        l_hrs, t_hrs, p_hrs, creds = (1, 0, 0, 0) if 'MATDIP' in code else (0, 0, 2, 0)
                        category = 'NCMC'
                    elif 'PROJECT' in title.upper() or 'CAPSTONE' in title.upper():
                        if 'PHASE I' in title.upper() or 'PHASE-I' in title.upper():
                            l_hrs, t_hrs, p_hrs, creds = 0, 0, 4, 2
                        elif 'PHASE II' in title.upper() or 'PHASE-II' in title.upper():
                            l_hrs, t_hrs, p_hrs, creds = 0, 0, 12, 6
                        else:
                            l_hrs, t_hrs, p_hrs, creds = 0, 0, 4, 2
                    elif 'INTERNSHIP' in title.upper():
                        l_hrs, t_hrs, p_hrs, creds = 0, 0, 12, 10
                    else:
                        # Standard theory course
                        l_hrs, t_hrs, p_hrs, creds = 3, 0, 0, 3

                    key = (dept_id, current_sem, code)
                    if key in seen_codes:
                        continue
                    seen_codes.add(key)
                    
                    records.append({
                        "subject_code": code,
                        "subject_name": title,
                        "department_id": dept_id,
                        "teaching_department_id": dept_id,
                        "semester_id": current_sem,
                        "scheme_id": 2,
                        "group_id": 1,
                        "course_category": category,
                        "course_structure": None,
                        "faculty_assignment_required": 0 if (category == 'NCMC' or creds == 0) else 1,
                        "cycle": None,
                        "is_optional": 1 if ('PEC' in category or 'OEC' in category or 'ELECTIVE' in title.upper()) else 0,
                        "option_group_id": None,
                        "lecture_hours": l_hrs,
                        "tutorial_hours": t_hrs,
                        "practical_hours": p_hrs,
                        "credits": creds
                    })
    return records

def extract_first_year():
    # Dept 9, Sem 1 and 2, Cycles P and C
    records = []
    seen = set()
    
    fy_defs = [
        # Sem 1 C-Cycle
        ("1BMATC101", "Differential Calculus and Linear Algebra: CV Stream", 9, 1, 'C', 3, 2, 0, 4, "ASC"),
        ("1BMATM101", "Differential Calculus and Linear Algebra: ME Stream", 9, 1, 'C', 3, 2, 0, 4, "ASC"),
        ("1BMATE101", "Differential Calculus and Linear Algebra: EEE Stream", 9, 1, 'C', 3, 2, 0, 4, "ASC"),
        ("1BMATS101", "Calculus and Linear Algebra: CSE Stream", 9, 1, 'C', 3, 2, 0, 4, "ASC"),
        ("1BCHEC102", "Applied Chemistry for Sustainable Structure & Material Design (CV)", 9, 1, 'C', 3, 0, 2, 4, "ASC"),
        ("1BCHEM102", "Applied Chemistry for Advanced Metal Protection & Sustainable Energy (ME)", 9, 1, 'C', 3, 0, 2, 4, "ASC"),
        ("1BCHEE102", "Applied Chemistry for Emerging Electronics and Devices (EEE/ECE)", 9, 1, 'C', 3, 0, 2, 4, "ASC"),
        ("1BCHES102", "Applied Chemistry for Smart Systems (CSE)", 9, 1, 'C', 3, 0, 2, 4, "ASC"),
        ("1BCEDC103", "Computer-Aided Engineering Drawing for CV Stream", 9, 1, 'C', 2, 0, 2, 3, "ESC"),
        ("1BCEDM103", "Computer-Aided Engineering Drawing for ME Stream", 9, 1, 'C', 2, 0, 2, 3, "ESC"),
        ("1BCEDEC103", "Computer-Aided Engineering Drawing for ECE Stream", 9, 1, 'C', 2, 0, 2, 3, "ESC"),
        ("1BCEDS103", "Computer-Aided Engineering Drawing for CSE Stream", 9, 1, 'C', 2, 0, 2, 3, "ESC"),
        ("1BESC104A", "Building Sciences & Mechanics", 9, 1, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC104B", "Introduction to Electrical Engineering", 9, 1, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC104C", "Introduction to Electronics and Communication", 9, 1, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC104D", "Introduction to Mechanical Engineering", 9, 1, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC104E", "Essentials of Information Technology", 9, 1, 'C', 3, 0, 0, 3, "ESC"),
        ("1BPLC105A", "Introduction to Web Programming", 9, 1, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC105B", "Python Programming", 9, 1, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC105C", "Basics of Java Programming", 9, 1, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC105D", "Introduction to C++ Programming", 9, 1, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC105E", "Introduction to C Programming", 9, 1, 'C', 2, 0, 2, 3, "PLC"),
        ("1BENG106", "Communicative English", 9, 1, 'C', 1, 0, 0, 1, "AEC"),
        ("1BSKS106", "Soft Skills", 9, 1, 'C', 1, 0, 0, 1, "AEC"),
        ("1BICO107", "Indian Constitution & Engineering Ethics", 9, 1, 'C', 1, 0, 0, 1, "HSMC"),
        ("1BIDTL158", "Innovation and Design Thinking Lab", 9, 1, 'C', 0, 0, 2, 1, "SDC"),
        ("1BKSK109", "Samskrutika Kannada", 9, 1, 'C', 1, 0, 0, 1, "HSMC"),
        ("1BKBK109", "Balake Kannada", 9, 1, 'C', 1, 0, 0, 1, "HSMC"),

        # Sem 1 P-Cycle
        ("1BMATC101", "Differential Calculus and Linear Algebra: CV Stream", 9, 1, 'P', 3, 2, 0, 4, "ASC"),
        ("1BMATM101", "Differential Calculus and Linear Algebra: ME Stream", 9, 1, 'P', 3, 2, 0, 4, "ASC"),
        ("1BMATE101", "Differential Calculus and Linear Algebra: EEE Stream", 9, 1, 'P', 3, 2, 0, 4, "ASC"),
        ("1BMATS101", "Calculus and Linear Algebra: CSE Stream", 9, 1, 'P', 3, 2, 0, 4, "ASC"),
        ("1BPHYC102", "Physics for Sustainable Structural Systems (CV)", 9, 1, 'P', 3, 0, 2, 4, "ASC"),
        ("1BPHYM102", "Physics of Materials (ME)", 9, 1, 'P', 3, 0, 2, 4, "ASC"),
        ("1BPHEC102", "Quantum Physics and Electronic Sensors (ECE)", 9, 1, 'P', 3, 0, 2, 4, "ASC"),
        ("1BPHYS102", "Quantum Physics and Applications (CSE)", 9, 1, 'P', 3, 0, 2, 4, "ASC"),
        ("1BCEDC103", "Computer-Aided Engineering Drawing for CV Stream", 9, 1, 'P', 2, 0, 2, 3, "ESC"),
        ("1BCEDM103", "Computer-Aided Engineering Drawing for ME Stream", 9, 1, 'P', 2, 0, 2, 3, "ESC"),
        ("1BCEDEC103", "Computer-Aided Engineering Drawing for ECE Stream", 9, 1, 'P', 2, 0, 2, 3, "ESC"),
        ("1BCEDS103", "Computer-Aided Engineering Drawing for CSE Stream", 9, 1, 'P', 2, 0, 2, 3, "ESC"),
        ("1BESC104A", "Building Sciences & Mechanics", 9, 1, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC104B", "Introduction to Electrical Engineering", 9, 1, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC104C", "Introduction to Electronics and Communication", 9, 1, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC104D", "Introduction to Mechanical Engineering", 9, 1, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC104E", "Essentials of Information Technology", 9, 1, 'P', 3, 0, 0, 3, "ESC"),
        ("1BPLC105A", "Introduction to Web Programming", 9, 1, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC105B", "Python Programming", 9, 1, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC105C", "Basics of Java Programming", 9, 1, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC105D", "Introduction to C++ Programming", 9, 1, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC105E", "Introduction to C Programming", 9, 1, 'P', 2, 0, 2, 3, "PLC"),
        ("1BENG106", "Communicative English", 9, 1, 'P', 1, 0, 0, 1, "AEC"),
        ("1BSKS106", "Soft Skills", 9, 1, 'P', 1, 0, 0, 1, "AEC"),
        ("1BICO107", "Indian Constitution & Engineering Ethics", 9, 1, 'P', 1, 0, 0, 1, "HSMC"),
        ("1BIDTL158", "Innovation and Design Thinking Lab", 9, 1, 'P', 0, 0, 2, 1, "SDC"),
        ("1BKSK109", "Samskrutika Kannada", 9, 1, 'P', 1, 0, 0, 1, "HSMC"),
        ("1BKBK109", "Balake Kannada", 9, 1, 'P', 1, 0, 0, 1, "HSMC"),

        # Sem 2 C-Cycle (Takes Physics group)
        ("1BMATC201", "Differential Calculus and Numerical Methods: CV stream", 9, 2, 'C', 3, 2, 0, 4, "ASC"),
        ("1BMATM201", "Multivariable Calculus and Numerical Methods: ME stream", 9, 2, 'C', 3, 2, 0, 4, "ASC"),
        ("1BMATE201", "Calculus, Laplace Transform, and Numerical Techniques: EEE stream", 9, 2, 'C', 3, 2, 0, 4, "ASC"),
        ("1BMATS201", "Numerical Methods: CSE Stream", 9, 2, 'C', 3, 2, 0, 4, "ASC"),
        ("1BPHYC202", "Physics for Sustainable Structural Systems (CV stream)", 9, 2, 'C', 3, 0, 2, 4, "ASC"),
        ("1BPHYM202", "Physics of Materials (Mech stream)", 9, 2, 'C', 3, 0, 2, 4, "ASC"),
        ("1BPHEC202", "Quantum Physics and Electronic Sensors (ECE stream)", 9, 2, 'C', 3, 0, 2, 4, "ASC"),
        ("1BPHYS202", "Quantum Physics and Applications (CSE stream)", 9, 2, 'C', 3, 0, 2, 4, "ASC"),
        ("1BCEDC203", "Computer-Aided Engineering Drawing for CV Stream", 9, 2, 'C', 2, 0, 2, 3, "ESC"),
        ("1BCEDM203", "Computer-Aided Engineering Drawing for ME stream", 9, 2, 'C', 2, 0, 2, 3, "ESC"),
        ("1BCEDEC203", "Computer-Aided Engineering Drawing for ECE stream", 9, 2, 'C', 2, 0, 2, 3, "ESC"),
        ("1BCEDS203", "Computer-Aided Engineering Drawing for CSE stream", 9, 2, 'C', 2, 0, 2, 3, "ESC"),
        ("1BESC204A", "Building Sciences & Mechanics", 9, 2, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC204B", "Introduction to Electrical Engineering", 9, 2, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC204C", "Introduction to Electronics & Communication Engineering", 9, 2, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC204D", "Introduction to Mechanical Engineering", 9, 2, 'C', 3, 0, 0, 3, "ESC"),
        ("1BESC204E", "Essentials of Information Technology", 9, 2, 'C', 3, 0, 0, 3, "ESC"),
        ("1BPLC205A", "Introduction to Web Programming", 9, 2, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC205B", "Python Programming", 9, 2, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC205C", "Basics of Java Programming", 9, 2, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC205D", "Introduction to C++ Programming", 9, 2, 'C', 2, 0, 2, 3, "PLC"),
        ("1BPLC205E", "Introduction to C Programming", 9, 2, 'C', 2, 0, 2, 3, "PLC"),
        ("1BSKS206", "Soft Skills", 9, 2, 'C', 1, 0, 0, 1, "AEC"),
        ("1BPRJ258", "Interdisciplinary Project-Based Learning", 9, 2, 'C', 0, 0, 2, 1, "SDC"),
        ("1BKSK209", "Samskrutika Kannada", 9, 2, 'C', 1, 0, 0, 1, "HSMC"),
        ("1BKBK209", "Balake Kannada", 9, 2, 'C', 1, 0, 0, 1, "HSMC"),

        # Sem 2 P-Cycle (Takes Chemistry group)
        ("1BMATC201", "Differential Calculus and Numerical Methods: CV Stream", 9, 2, 'P', 3, 2, 0, 4, "ASC"),
        ("1BMATM201", "Multivariable Calculus and Numerical Methods: ME Stream", 9, 2, 'P', 3, 2, 0, 4, "ASC"),
        ("1BMATE201", "Calculus, Laplace Transform And Numerical Techniques: EEE stream", 9, 2, 'P', 3, 2, 0, 4, "ASC"),
        ("1BMATS201", "Numerical Methods: CSE Stream", 9, 2, 'P', 3, 2, 0, 4, "ASC"),
        ("1BCHEC202", "Applied Chemistry for Sustainable Structure & Material Design (CV)", 9, 2, 'P', 3, 0, 2, 4, "ASC"),
        ("1BCHEM202", "Applied Chemistry for Advanced Metal Protection & Sustainable Energy (ME)", 9, 2, 'P', 3, 0, 2, 4, "ASC"),
        ("1BCHEE202", "Applied Chemistry for Emerging Electronics and Devices (EEE/ECE)", 9, 2, 'P', 3, 0, 2, 4, "ASC"),
        ("1BCHES202", "Applied Chemistry for Smart Systems (CSE)", 9, 2, 'P', 3, 0, 2, 4, "ASC"),
        ("1BAIA203", "Introduction to AI and Applications", 9, 2, 'P', 3, 0, 0, 3, "ETC"),
        ("1BESC204A", "Building Sciences & Mechanics", 9, 2, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC204B", "Introduction to Electrical Engineering", 9, 2, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC204C", "Introduction to Electronics & Communication Engineering", 9, 2, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC204D", "Introduction to Mechanical Engineering", 9, 2, 'P', 3, 0, 0, 3, "ESC"),
        ("1BESC204E", "Essentials of Information Technology", 9, 2, 'P', 3, 0, 0, 3, "ESC"),
        ("1BPLC205A", "Introduction to Web Programming", 9, 2, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC205B", "Python Programming", 9, 2, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC205C", "Basics of Java Programming", 9, 2, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC205D", "Introduction to C++ Programming", 9, 2, 'P', 2, 0, 2, 3, "PLC"),
        ("1BPLC205E", "Introduction to C Programming", 9, 2, 'P', 2, 0, 2, 3, "PLC"),
        ("1BENG206", "Communication Skills", 9, 2, 'P', 1, 0, 0, 1, "AEC"),
        ("1BICO207", "Indian Constitution & Engineering Ethics", 9, 2, 'P', 1, 0, 0, 1, "HSMC"),
        ("1BPRJ258", "Interdisciplinary Project-Based Learning", 9, 2, 'P', 0, 0, 2, 1, "SDC"),
    ]
    
    for code, title, dept_id, sem_id, cycle, l_hrs, t_hrs, p_hrs, creds, cat in fy_defs:
        key = (dept_id, sem_id, cycle, code)
        if key in seen: continue
        seen.add(key)
        records.append({
            "subject_code": code,
            "subject_name": title,
            "department_id": dept_id,
            "teaching_department_id": dept_id,
            "semester_id": sem_id,
            "scheme_id": 2,
            "group_id": 1,
            "course_category": cat,
            "course_structure": None,
            "faculty_assignment_required": 1,
            "cycle": cycle,
            "is_optional": 0,
            "option_group_id": None,
            "lecture_hours": l_hrs,
            "tutorial_hours": t_hrs,
            "practical_hours": p_hrs,
            "credits": creds
        })
    return records

def run_import():
    app = create_app()
    with app.app_context():
        print("Starting 2025 Scheme Import...")
        all_recs = []
        
        # 1. First Year
        fy_recs = extract_first_year()
        all_recs.extend(fy_recs)
        print(f"Extracted First Year: {len(fy_recs)} subjects")
        
        # 2. Branch PDFs
        for fname, dept_id in BRANCH_PDF_MAP.items():
            fpath = os.path.join(PDF_DIR, fname)
            if not os.path.exists(fpath): continue
            b_recs = extract_branch_pdf(fpath, dept_id)
            all_recs.extend(b_recs)
            print(f"Extracted {fname} (Dept {dept_id}): {len(b_recs)} subjects")
            
        # 3. Dept 7 (CSD): clone from CSE (Dept 5)
        csd_recs = []
        for r in all_recs:
            if r["department_id"] == 5 and r["semester_id"] >= 3:
                c = dict(r)
                c["department_id"] = 7
                c["teaching_department_id"] = 7
                csd_recs.append(c)
        all_recs.extend(csd_recs)
        print(f"Cloned for Dept 7 (CSD): {len(csd_recs)} subjects")
        
        print(f"\nTotal subjects to insert into scheme_id = 2: {len(all_recs)}")
        
        # 4. Clean out existing scheme_id = 2 subjects if any
        del_count = execute("DELETE FROM subject WHERE scheme_id = 2")
        print(f"Cleared old scheme_id=2 subjects: {del_count}")
        
        # 5. Insert subjects
        insert_sql = """
            INSERT INTO subject (
                subject_code, subject_name, department_id, teaching_department_id,
                semester_id, scheme_id, group_id, course_category, course_structure,
                faculty_assignment_required, cycle, is_optional, option_group_id,
                lecture_hours, tutorial_hours, practical_hours, credits
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
        """
        inserted = 0
        for s in all_recs:
            sub_name = s["subject_name"].strip()[:140]
            sub_code = s["subject_code"].strip()[:20]
            cat = (s["course_category"] or "Core")[:20]
            execute(insert_sql, (
                sub_code, sub_name, s["department_id"], s["teaching_department_id"],
                s["semester_id"], s["scheme_id"], s["group_id"], cat, s["course_structure"],
                s["faculty_assignment_required"], s["cycle"], s["is_optional"], s["option_group_id"],
                s["lecture_hours"], s["tutorial_hours"], s["practical_hours"], s["credits"]
            ))
            inserted += 1
        print(f"Successfully inserted {inserted} subjects for Scheme 2025 (scheme_id=2)!")
        
        # 6. Seed timetable_constraints for scheme_id = 2
        print("\nSeeding timetable_constraints for Scheme 2025...")
        execute("DELETE FROM timetable_constraints WHERE scheme_id = 2")
        
        existing_constraints = rows("""
            SELECT department_id, academic_year, semester_type, semester_id,
                   working_days, periods_per_day, college_start_time, period_duration,
                   lunch_after_period, short_break_after_period, short_break_duration,
                   max_periods_per_day, max_periods_per_week, lab_duration
            FROM timetable_constraints
            WHERE scheme_id = 1
        """)
        
        ins_c_sql = """
            INSERT INTO timetable_constraints (
                department_id, scheme_id, academic_year, semester_type, semester_id,
                working_days, periods_per_day, college_start_time, period_duration,
                lunch_after_period, short_break_after_period, short_break_duration,
                max_periods_per_day, max_periods_per_week, lab_duration
            ) VALUES (
                %s, 2, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
        """
        c_count = 0
        for c in existing_constraints:
            execute(ins_c_sql, (
                c["department_id"], c["academic_year"], c["semester_type"], c["semester_id"],
                c["working_days"], c["periods_per_day"], c["college_start_time"], c["period_duration"],
                c["lunch_after_period"], c["short_break_after_period"], c["short_break_duration"],
                7, 42, 2
            ))
            c_count += 1
        print(f"Successfully seeded {c_count} timetable_constraints for Scheme 2025!")
        
        # 7. Check database summary
        s2_count = rows("SELECT COUNT(*) as c FROM subject WHERE scheme_id = 2")[0]["c"]
        tc2_count = rows("SELECT COUNT(*) as c FROM timetable_constraints WHERE scheme_id = 2")[0]["c"]
        print(f"\nVerification:")
        print(f"  Subjects under Scheme 2025: {s2_count}")
        print(f"  Constraints under Scheme 2025: {tc2_count}")

if __name__ == "__main__":
    run_import()
