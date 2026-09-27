import pdfplumber, re

def test_parse_tables(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        current_sem = None
        for page_idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            # Detect semester header on page
            sem_m = re.search(r'\b(III|IV|V|VI|VII|VIII|I|II)\s+SEMESTER', text, re.IGNORECASE)
            if sem_m:
                sem_roman = sem_m.group(1).upper()
                sem_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
                current_sem = sem_map.get(sem_roman, current_sem)
            
            tables = page.extract_tables()
            if not tables or not current_sem:
                continue
                
            for table in tables:
                for r_idx, row in enumerate(table):
                    row_clean = [str(c).replace('\n', ' ').strip() if c is not None else '' for c in row]
                    # Check if row contains a course code like 1BCS301 or 1BCSL306 or 1Bxxx
                    m_code = None
                    for cell in row_clean:
                        # Course code pattern: 1B[A-Z]{2,4}[0-9]{3}[A-Z]?
                        found = re.search(r'\b(1[A-Z]{2,6}[0-9]{3}[A-Z0-9]?)\b', cell)
                        if found:
                            m_code = found.group(1)
                            break
                    if m_code:
                        print(f"Sem {current_sem} | Code: {m_code:<12} | Row: {row_clean[:6]}")

if __name__ == "__main__":
    test_parse_tables(r"C:\major proj database\scheme\2025\2025_scheme_cse.pdf")
