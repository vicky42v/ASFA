import pdfplumber, re, os

def inspect_pdf(filepath):
    print(f"==================================================")
    print(f"FILE: {os.path.basename(filepath)}")
    print(f"==================================================")
    with pdfplumber.open(filepath) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            tables = page.extract_tables()
            sem_matches = re.findall(r'(I|II|III|IV|V|VI|VII|VIII)\s+SEMESTER', text)
            if tables:
                print(f"--- Page {page_idx+1}: Semesters found {sem_matches} | Tables: {len(tables)} ---")
                for t_idx, t in enumerate(tables):
                    print(f"  Table {t_idx+1} rows: {len(t)}")
                    for row in t[:5]:
                        cleaned = [str(c).replace('\n', ' ') if c is not None else '' for c in row]
                        print("   ", cleaned[:8])

if __name__ == "__main__":
    inspect_pdf(r"C:\major proj database\scheme\2025\2025_scheme_cse.pdf")
