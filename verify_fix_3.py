
import sys
# Add swimbuzz/public/bridge to path
sys.path.append("/Users/tanaygupta/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Georgia Tech/GTSC/SwimBuzz/swimbuzz/public/bridge")

from packet_parse import parse_packet_pdf_bytes

# Use the file that caused the incorrect parsing
PDF_PATH = "/Users/tanaygupta/Downloads/meet-packets/2025_regional_championship_meet_packet_v1.pdf"

with open(PDF_PATH, "rb") as f:
    content = f.read()

result = parse_packet_pdf_bytes(content)
for session in result["sessions"]:
    print(f"Session: '{session['label']}'")
