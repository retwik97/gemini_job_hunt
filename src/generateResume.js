import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import fs from "fs";

// Builds a simple single-column tailored resume docx.
// This is intentionally minimal — swap in your existing full resume template/design
// (the navy/blue Arial two-page layout) and just replace the summary/skills/bullets
// sections with the tailored content below.
export async function generateResumeDocx(baseResume, tailored, outputPath) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: baseResume.name,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            children: [new TextRun({ text: baseResume.contactLine, italics: true })],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: tailored.tailoredSummary }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Skills", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: tailored.tailoredSkills.join(", ") }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Experience Highlights", heading: HeadingLevel.HEADING_2 }),
          ...tailored.tailoredBullets.map(
            (bullet) => new Paragraph({ text: `• ${bullet}` })
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
