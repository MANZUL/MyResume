import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx';
import type { ResumeData } from './types';

type ExportOptions = {
  data: ResumeData;
  accent: string;
  templateName: string;
};

const contactLine = (data: ResumeData) =>
  [
    data.contact.location,
    data.contact.phone,
    data.contact.email,
    data.contact.linkedin,
    data.contact.website,
  ]
    .filter(Boolean)
    .join('  |  ');

const sectionHeading = (text: string, accent: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    shading: {
      type: ShadingType.CLEAR,
      fill: 'E8E8E8',
      color: 'auto',
    },
    spacing: { before: 220, after: 100 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        color: accent.replace('#', ''),
        size: 20,
      }),
    ],
  });

const bullet = (text: string) =>
  new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 50 },
  });

export async function buildResumeDocxBase64({
  data,
  accent,
  templateName,
}: ExportOptions) {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: (data.name || 'Resume').toUpperCase(),
          bold: true,
          size: 52,
          characterSpacing: 45,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [new TextRun({ text: contactLine(data), size: 18, color: '444444' })],
    }),
  ];

  if (
    data.summary.tagline ||
    data.summary.bullets.length ||
    data.summary.skills.length
  ) {
    children.push(sectionHeading('Summary', accent));
    children.push(...data.summary.bullets.filter(Boolean).map(bullet));
    if (data.summary.tagline) {
      children.push(
        new Paragraph({
          spacing: { after: 70 },
          children: [new TextRun({ text: data.summary.tagline, italics: true })],
        }),
      );
    }
    if (data.summary.skills.length) {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: data.summary.skills.filter(Boolean).join('  -  '),
            }),
          ],
        }),
      );
    }
  }

  if (data.experience.length) {
    children.push(sectionHeading('Experience', accent));
    for (const role of data.experience) {
      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          spacing: { before: 100, after: 35 },
          children: [
            new TextRun({ text: role.title, bold: true }),
            new TextRun({
              text: [role.company, role.location].filter(Boolean).length
                ? ` — ${[role.company, role.location].filter(Boolean).join(', ')}`
                : '',
            }),
            new TextRun({
              text: `\t${[role.start, role.end].filter(Boolean).join(' — ')}`,
            }),
          ],
        }),
      );
      if (role.summary) {
        children.push(
          new Paragraph({
            spacing: { after: 45 },
            children: [new TextRun({ text: role.summary, italics: true })],
          }),
        );
      }
      children.push(...role.bullets.filter(Boolean).map(bullet));
    }
  }

  if (data.education.length) {
    children.push(sectionHeading('Education', accent));
    for (const item of data.education) {
      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          spacing: { before: 80, after: 35 },
          children: [
            new TextRun({ text: item.degree, bold: true }),
            new TextRun({
              text: item.school
                ? ` — ${[item.school, item.location].filter(Boolean).join(', ')}`
                : '',
            }),
            new TextRun({ text: `\t${item.date}` }),
          ],
        }),
      );
      if (item.honors) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: item.honors, italics: true })],
          }),
        );
      }
    }
  }

  if (data.certifications.length) {
    children.push(sectionHeading('Certifications & Licenses', accent));
    children.push(
      ...data.certifications.map((item) =>
        bullet(
          [
            item.name,
            item.org,
            item.date ? `(${item.date})` : '',
          ]
            .filter(Boolean)
            .join(', '),
        ),
      ),
    );
  }

  if (data.projects.length) {
    children.push(sectionHeading('Projects', accent));
    for (const project of data.projects) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 35 },
          children: [
            new TextRun({ text: project.name, bold: true }),
            new TextRun({
              text: project.description ? ` — ${project.description}` : '',
            }),
          ],
        }),
      );
      children.push(...project.bullets.filter(Boolean).map(bullet));
    }
  }

  if (data.awards.length) {
    children.push(sectionHeading('Awards & Honors', accent));
    children.push(...data.awards.filter(Boolean).map(bullet));
  }

  const doc = new Document({
    creator: 'My Resume',
    title: `${data.name || 'Resume'} — ${templateName}`,
    styles: {
      default: {
        document: {
          run: { font: 'Georgia', size: 21, color: '1C1C1C' },
          paragraph: { spacing: { line: 280 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });

  // Base64 keeps this runtime-agnostic (no Blob/DOM needed on iOS/Android).
  return Packer.toBase64String(doc);
}
