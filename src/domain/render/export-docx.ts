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
import { FIRST_LETTER_LTR, mapLatinRuns } from '../i18n/bidi';
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

// Directional controls for plain-text runs in right-to-left documents (the DOCX counterpart
// of the renderer's <bdi>).
//  - Contact parts and dates, which are short and always one direction, use Unicode isolates:
//    LRI…PDI for always-LTR strings (phone, e-mail, links), FSI…PDI for the rest.
//  - Free text (names, titles, bullets, paragraphs, skills) uses LRM marks instead. Isolates
//    are poorly supported by some DOCX engines: around digits next to Arabic they were seen to
//    mis-position glyphs. A left-to-right mark is the long-established, universally supported
//    way to keep the final period or the "++" of an English value on the right side.
const LRI = '\u2066';
const FSI = '\u2068';
const PDI = '\u2069';
const LRM = '\u200E';
const RLM_MARK = '\u200F';
// The first letter decides: Latin (and other left-to-right scripts) text is bracketed as a
// whole. Arabic-first text already runs in the paragraph's direction, so only its Latin runs
// ("C++", "AWS Lambda") are bracketed (mapLatinRuns).

/** Paragraphs and runs for this document's direction: right-to-left adds bidi properties. */
function builders(typography: Typography) {
  const rtl = typography.direction === 'rtl';
  return {
    rtl,
    para: (options: ParagraphOptions) => new Paragraph(rtl ? { ...options, bidirectional: true } : options),
    run: (options: RunOptions) => new TextRun(rtl ? { ...options, rightToLeft: true } : options),
    isolate: (text: string, ltr = false) => (rtl && text ? `${ltr ? LRI : FSI}${text}${PDI}` : text),
    /**
     * A user-entered value: in a right-to-left document, left-to-right text is bracketed by
     * LRM, and so is each Latin run inside Arabic text.
     */
    free: (text: string) =>
      !rtl || !text
        ? text
        : FIRST_LETTER_LTR.test(text)
          ? `${LRM}${text}${LRM}`
          : mapLatinRuns(text, (s) => s, (s) => `${LRM}${s}${LRM}`),
    /** Template italics are off for Arabic (no italic script). */
    italics: typography.italics,
    /** The separator for lists the app joins itself (Arabic comma in Arabic documents). */
    separator: typography.listSeparator,
    /**
     * Between skills. In a right-to-left document the separator is bracketed by RLM so the
     * skills keep their reading order (first skill at the start side); without it a run of
     * Latin skills would merge into one left-to-right block.
     */
    skillSeparator: rtl ? `${RLM_MARK}  -  ${RLM_MARK}` : '  -  ',
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
    ? b.para({ children: [b.run({ text: b.free(text) })], bullet: { level: 0 }, spacing: { after: 50 } })
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
          text: b.free(typography.caseTransforms ? (data.name || labels.resume).toUpperCase() : data.name || labels.resume),
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
          children: [b.run({ text: b.free(data.summary.tagline), italics: b.italics })],
        }),
      );
    }
    if (data.summary.skills.length) {
      children.push(
        b.para({
          spacing: { after: 100 },
          children: [
            b.run({
              text: data.summary.skills.filter(Boolean).map((skill) => b.free(skill)).join(b.skillSeparator),
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
            b.run({ text: b.free(role.title), bold: true }),
            b.run({
              text: [role.company, role.location].filter(Boolean).length
                ? ` — ${[role.company, role.location].filter(Boolean).map((v) => b.free(v)).join(b.separator)}`
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
            children: [b.run({ text: b.free(role.summary), italics: b.italics })],
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
            b.run({ text: b.free(item.degree), bold: true }),
            b.run({
              text: item.school
                ? ` — ${[item.school, item.location].filter(Boolean).map((v) => b.free(v)).join(b.separator)}`
                : '',
            }),
            b.run({ text: `\t${b.isolate(item.date)}` }),
          ],
        }),
      );
      if (item.honors) {
        children.push(
          b.para({
            children: [b.run({ text: b.free(item.honors), italics: b.italics })],
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
            .join(b.separator),
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
            b.run({ text: b.free(project.name), bold: true }),
            b.run({
              text: project.description ? ` — ${b.free(project.description)}` : '',
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
          // Latin text stays Georgia. Georgia has no Arabic glyphs, so an Arabic document names
          // its complex-script font (what right-to-left runs use) instead of leaving it to the
          // application's fallback: Times New Roman ships with Arabic on Windows and macOS Word.
          run: {
            font: b.rtl ? { ascii: 'Georgia', hAnsi: 'Georgia', eastAsia: 'Georgia', cs: 'Times New Roman' } : 'Georgia',
            size: 21,
            color: '1C1C1C',
          },
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
