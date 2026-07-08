import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

// Converts a .docx to .pdf in the same directory using LibreOffice headless mode.
// Requires `soffice` to be installed (see .github/workflows — installed via apt-get).
export function convertDocxToPdf(docxPath) {
  const outDir = path.dirname(docxPath);

  execFileSync(
    "soffice",
    ["--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath],
    { stdio: "pipe" }
  );

  const pdfPath = docxPath.replace(/\.docx$/, ".pdf");
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF conversion did not produce expected file: ${pdfPath}`);
  }
  return pdfPath;
}
