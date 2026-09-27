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
import type { Language } from '../i18n/languages';
import { resumeLabels } from '../i18n/resume-labels';
import { typographyFor, type Typography } from '../i18n/typography';
import type { ResumeData } from '../resume/types';

type ExportOptions = {
  data: ResumeData;
  accent: string;
  templateName: string;
  /** The resume's own language: labels and typography come from the same source as the PDF. */
  language: Language;
};

type ParagraphOptions = ConstructorParameters<typeof Paragraph>[0] & object;
type RunOptions = ConstructorParameters<typeof TextRun>[0] & object;

// Unicode isolates for plain-text runs in right-to-left documents (the DOCX equivalent of
// the renderer's <bdi>): LRI…PDI for always-LTR strings, FSI…PDI for the rest.
const LRI = '\u2066';
const FSI = '\u2068';
const PDI = '\u2069';

/** Paragraphs and runs for this document's direction: right-to-left adds bidi properties. */
function builders(typography: Typography) {
  const rtl = typography.direction === 'rtl';
  return {
    rtl,
    para: (options: ParagraphOptions) => new Paragraph(rtl ? { ...options, bidirectional: true } : options),
    run: (options: RunOptions) => new TextRun(rtl ? { ...options, rightToLeft: true } : options),
    isolate: (text: string, ltr = false) => (rtl && text ? `${ltr ? LRI : FSI}${text}${PDI}` : text),
  };
}
type Builders = ReturnType<typeof builders>;

const contactLine = (data: ResumeData, b: Builders) =>
  [
    b.isolate(data.contact.location),
    b.isolate(data.contact.phone, true),
    b.isolate(data.contact.email, true),
    b.isolate(data.contact.linkedin, true),
    b.isolate(data.contact.website, true),
  ]
    .filter(Boolean)
    .join('  |  ');

const sectionHeading = (text: string, accent: string, b: Builders, typography: Typography) =>
  b.para({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    shading: {
      type: ShadingType.CLEAR,
      fill: 'E8E8E8',
      color: 'auto',
    },
    spacing: { before: 220, after: 100 },
    children: [
      b.run({
        text: typography.caseTransforms ? text.toUpperCase() : text,
        bold: true,
        color: accent.replace('#', ''),
        size: 20,
      }),
    ],
  });

const bullet = (text: string, b: Builders) =>
  b.rtl
    ? b.para({ children: [b.run({ text })], bullet: { level: 0 }, spacing: { after: 50 } })
    : new Paragraph({
        text,
        bullet: { level: 0 },
        spacing: { after: 50 },
      });

export async function buildResumeDocxBase64({
  data,
  accent,
  templateName,
  language,
}: ExportOptions) {
  const labels = resumeLabels(language);
  const typography = typographyFor(language);
  const b = builders(typography);
  const heading = (text: string) => sectionHeading(text, accent, b, typography);
  const children: Paragraph[] = [
    b.para({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        b.run({
          text: typography.caseTransforms ? (data.name || labels.resume).toUpperCase() : data.name || labels.resume,
          bold: true,
          size: 52,
          characterSpacing: typography.letterSpacing ? 45 : 0,
        }),
      ],
    }),
    b.para({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [b.run({ text: contactLine(data, b), size: 18, color: '444444' })],
    }),
  ];

  if (
    data.summary.tagline ||
    data.summary.bullets.length ||
    data.summary.skills.length
  ) {
    children.push(heading(labels.summary));
    children.push(...data.summary.bullets.filter(Boolean).map((text) => bullet(text, b)));
    if (data.summary.tagline) {
      children.push(
        b.para({
          spacing: { after: 70 },
          children: [b.run({ text: data.summary.tagline, italics: true })],
        }),
      );
    }
    if (data.summary.skills.length) {
      children.push(
        b.para({
          spacing: { after: 100 },
          children: [
            b.run({
              text: data.summary.skills.filter(Boolean).join('  -  '),
            }),
          ],
        }),
      );
    }
  }

  if (data.experience.length) {
    children.push(heading(labels.experience));
    for (const role of data.experience) {
      children.push(
        b.para({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          spacing: { before: 100, after: 35 },
          children: [
            b.run({ text: role.title, bold: true }),
            b.run({
              text: [role.company, role.location].filter(Boolean).length
                ? ` — ${[role.company, role.location].filter(Boolean).join(', ')}`
                : '',
            }),
            b.run({
              text: `\t${[role.start, role.end].filter(Boolean).map((d) => b.isolate(d)).join(' — ')}`,
            }),
          ],
        }),
      );
      if (role.summary) {
        children.push(
          b.para({
            spacing: { after: 45 },
            children: [b.run({ text: role.summary, italics: true })],
          }),
        );
      }
      children.push(...role.bullets.filter(Boolean).map((text) => bullet(text, b)));
    }
  }

  if (data.education.length) {
    children.push(heading(labels.education));
    for (const item of data.education) {
      children.push(
        b.para({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          spacing: { before: 80, after: 35 },
          children: [
            b.run({ text: item.degree, bold: true }),
            b.run({
              text: item.school
                ? ` — ${[item.school, item.location].filter(Boolean).join(', ')}`
                : '',
            }),
            b.run({ text: `\t${b.isolate(item.date)}` }),
          ],
        }),
      );
      if (item.honors) {
        children.push(
          b.para({
            children: [b.run({ text: item.honors, italics: true })],
          }),
        );
      }
    }
  }

  if (data.certifications.length) {
    children.push(heading(labels.certifications));
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
          b,
        ),
      ),
    );
  }

  if (data.projects.length) {
    children.push(heading(labels.projects));
    for (const project of data.projects) {
      children.push(
        b.para({
          spacing: { before: 80, after: 35 },
          children: [
            b.run({ text: project.name, bold: true }),
            b.run({
              text: project.description ? ` — ${project.description}` : '',
            }),
          ],
        }),
      );
      children.push(...project.bullets.filter(Boolean).map((text) => bullet(text, b)));
    }
  }

  if (data.awards.length) {
    children.push(heading(labels.awards));
    children.push(...data.awards.filter(Boolean).map((text) => bullet(text, b)));
  }

  const doc = new Document({
    creator: 'My Resume',
    title: `${data.name || labels.resume} — ${templateName}`,
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
