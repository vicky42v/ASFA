import pdfplumber, re, os

PDF_DIR = r"C:\major proj database\scheme\2025"

PDF_DEPT_MAP = {
    "2025_scheme_c_cycle_first_year.pdf": (9, "FY-C"),
    "2025_scheme_p_cycle_first_year.pdf": (9, "FY-P"),
    "2025_scheme_cse.pdf": (5, "CSE"),
    "2025_scheme_aiml.pdf": (8, "AIML"),
    "2025_scheme_civil.pdf": (2, "CV"),
    "2025_scheme_ec.pdf": (4, "EC"),
    "2025_scheme_ifs.pdf": (6, "ISE"),
    "2025_scheme_me.pdf": (1, "ME"),
    "2025_scheme_vlsi.pdf": (3, "VLSI"),
}

def analyze_all():
    for fname, (dept_id, dept_code) in PDF_DEPT_MAP.items():
        fpath = os.path.join(PDF_DIR, fname)
        if not os.path.exists(fpath):
            print("Missing:", fpath)
            continue
        with pdfplumber.open(fpath) as pdf:
            print(f"\n==================== {fname} (Dept {dept_id}: {dept_code}) ====================")
            sem_found = set()
            total_subjects = 0
            for page in pdf.pages:
                text = page.extract_text() or ""
                tables = page.extract_tables()
                if not tables: continue
                
                # Check for sem
                for sem_word, s_num in [('I SEMESTER', 1), ('II SEMESTER', 2), ('III SEMESTER', 3), ('IV SEMESTER', 4),
                                        ('V SEMESTER', 5), ('VI SEMESTER', 6), ('VII SEMESTER', 7), ('VIII SEMESTER', 8),
                                        ('FIRST SEMESTER', 1), ('SECOND SEMESTER', 2)]:
                    if sem_word in text.upper():
                        sem_found.add(s_num)
                        
                for t in tables:
                    for row in t:
                        row_str = " ".join([str(c) for c in row if c])
                        # Check course code pattern
                        codes = re.findall(r'\b(1[A-Z]{2,6}[0-9]{3}[A-Z0-9]?)\b', row_str)
                        if codes:
                            total_subjects += len(codes)
            print(f"Semesters found: {sorted(list(sem_found))}, Total subject code occurrences: {total_subjects}")

if __name__ == "__main__":
    analyze_all()
