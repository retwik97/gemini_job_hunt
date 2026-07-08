import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
} from "docx";
import fs from "fs";

const NAVY = "1F3864";

function heading(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY, space: 2 },
    },
  });
}

function bulletParagraph(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function applyBulletOrder(bullets, order) {
  return order.map((i) => bullets[i]);
}

export async function generateResumeDocx(baseResume, tailored, outputPath) {
  const children = [];

  // Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: baseResume.name, bold: true, size: 32, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: baseResume.headline, italics: true, size: 20 })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${baseResume.location} | ${baseResume.phone} | ${baseResume.email} | ${baseResume.linkedin}`,
          size: 18,
        }),
      ],
      spacing: { after: 120 },
    })
  );

  // Summary (tailored)
  children.push(heading("PROFESSIONAL SUMMARY"));
  children.push(new Paragraph({ text: tailored.tailoredSummary, spacing: { after: 100 } }));

  // Key skills for this role (tailored, ATS keyword line) — only shown if present
  if (tailored.topSkillsForThisRole?.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Key Skills for This Role: ", bold: true }),
          new TextRun({ text: tailored.topSkillsForThisRole.join(", ") }),
        ],
        spacing: { after: 120 },
      })
    );
  }

  // Full technical skills (unchanged, categorized)
  children.push(heading("TECHNICAL SKILLS"));
  for (const cat of baseResume.skillCategories) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${cat.category}: `, bold: true }),
          new TextRun({ text: cat.skills.join(", ") }),
        ],
        spacing: { after: 60 },
      })
    );
  }

  // Certifications
  children.push(heading("CERTIFICATIONS"));
  for (const cert of baseResume.certifications) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `✦ ${cert}` })],
        spacing: { after: 40 },
      })
    );
  }

  // Experience
  children.push(heading("PROFESSIONAL EXPERIENCE"));
  for (const exp of baseResume.experience) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: exp.company, bold: true, size: 22 }),
          new TextRun({ text: `   ${exp.location}`, italics: true, size: 20 }),
        ],
        spacing: { before: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: exp.role, bold: true }),
          new TextRun({ text: `   ${exp.dates}`, italics: true }),
        ],
        spacing: { after: 60 },
      })
    );

    for (const section of exp.sections) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.title, bold: true, underline: {} })],
          spacing: { before: 80, after: 40 },
        })
      );

      const order = tailored.sectionBulletOrder?.[section.title];
      const orderedBullets = order ? applyBulletOrder(section.bullets, order) : section.bullets;
      for (const bullet of orderedBullets) {
        children.push(bulletParagraph(bullet));
      }
    }
  }

  // Projects
  if (baseResume.projects?.length) {
    children.push(heading("PROJECTS"));
    for (const proj of baseResume.projects) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: proj.title, bold: true })],
          spacing: { before: 60, after: 40 },
        })
      );
      for (const bullet of proj.bullets) {
        children.push(bulletParagraph(bullet));
      }
    }
  }

  // Education
  if (baseResume.education?.length) {
    children.push(heading("EDUCATION"));
    for (const edu of baseResume.education) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: edu.degree, bold: true }),
            new TextRun({ text: `   ${edu.years}` }),
          ],
          spacing: { after: 20 },
        }),
        new Paragraph({ text: edu.school, spacing: { after: 60 } })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.6),
              right: convertInchesToTwip(0.6),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
