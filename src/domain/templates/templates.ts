// The 12 templates are defined once. Display text (name, short name, description,
// category name) is not part of a definition: it is localized by id in the app catalog
// (src/i18n/messages, "templates.<id>.*"), so every language shows the same 12 templates.

export type TemplateCategory = 'Corporate' | 'Tech' | 'Creative' | 'Healthcare' | 'Academic' | 'Trades';

export type TemplateConfig = {
  /** Stable id: stored with each resume and shared by every language. */
  id: string;
  /** Stable category id; its display name is localized. */
  category: TemplateCategory;
  defaultAccent: string;
  fontBody: 'sans' | 'serif';
  fontHeadings: 'sans' | 'serif';
  fontName: 'sans' | 'serif';
  nameAlign: 'left' | 'center' | 'split';
  nameCase: 'uppercase' | 'normal';
  contactAlign: 'left' | 'center' | 'split';
  sectionHeaderStyle: 'banner' | 'underline' | 'small-caps' | 'small-caps-rule' | 'plain';
  sectionHeaderCase: 'uppercase' | 'normal';
  decorativeMark: 'quarter-circle' | 'rule' | 'none';
  dateAlign: 'right' | 'inline';
  jobTitleWeight: 'bold' | 'normal';
  companyStyle: 'italic' | 'normal';
  skillsStyle: 'dash' | 'pills' | 'comma' | 'mono';
  headerRuleVariant?: 'thin' | 'hairline' | 'thick';
};

export const TEMPLATES: TemplateConfig[] = [
  {
    id: 'corporate-boardroom',
    category: 'Corporate',
    defaultAccent: '#1B2B47',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'center',
    nameCase: 'uppercase',
    contactAlign: 'center',
    sectionHeaderStyle: 'banner',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'quarter-circle',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'dash'
  },
  {
    id: 'corporate-partner',
    category: 'Corporate',
    defaultAccent: '#1B2B47',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'left',
    nameCase: 'normal',
    contactAlign: 'left',
    sectionHeaderStyle: 'small-caps-rule',
    headerRuleVariant: 'hairline',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'rule',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'comma'
  },
  {
    id: 'tech-builder',
    category: 'Tech',
    defaultAccent: '#3B5168',
    fontBody: 'sans',
    fontHeadings: 'sans',
    fontName: 'sans',
    nameAlign: 'left',
    nameCase: 'normal',
    contactAlign: 'left',
    sectionHeaderStyle: 'underline',
    headerRuleVariant: 'thin',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'none',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'normal',
    skillsStyle: 'mono'
  },
  {
    id: 'tech-architect',
    category: 'Tech',
    defaultAccent: '#3B5168',
    fontBody: 'sans',
    fontHeadings: 'sans',
    fontName: 'sans',
    nameAlign: 'center',
    nameCase: 'normal',
    contactAlign: 'center',
    sectionHeaderStyle: 'banner',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'none',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'pills'
  },
  {
    id: 'creative-editorial',
    category: 'Creative',
    defaultAccent: '#A85432',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'split',
    nameCase: 'normal',
    contactAlign: 'split',
    sectionHeaderStyle: 'small-caps',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'rule',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'dash'
  },
  {
    id: 'creative-studio',
    category: 'Creative',
    defaultAccent: '#6B7F5C',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'center',
    nameCase: 'normal',
    contactAlign: 'center',
    sectionHeaderStyle: 'banner',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'none',
    dateAlign: 'inline',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'comma'
  },
  {
    id: 'healthcare-practitioner',
    category: 'Healthcare',
    defaultAccent: '#2A6B6E',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'left',
    nameCase: 'normal',
    contactAlign: 'left',
    sectionHeaderStyle: 'banner',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'none',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'dash'
  },
  {
    id: 'healthcare-educator',
    category: 'Healthcare',
    defaultAccent: '#2A6B6E',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'left',
    nameCase: 'normal',
    contactAlign: 'left',
    sectionHeaderStyle: 'underline',
    headerRuleVariant: 'thick',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'rule',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'normal',
    skillsStyle: 'comma'
  },
  {
    id: 'academic-scholar',
    category: 'Academic',
    defaultAccent: '#6B2737',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'center',
    nameCase: 'uppercase',
    contactAlign: 'center',
    sectionHeaderStyle: 'banner',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'none',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'comma'
  },
  {
    id: 'academic-researcher',
    category: 'Academic',
    defaultAccent: '#6B2737',
    fontBody: 'serif',
    fontHeadings: 'serif',
    fontName: 'serif',
    nameAlign: 'left',
    nameCase: 'normal',
    contactAlign: 'left',
    sectionHeaderStyle: 'small-caps-rule',
    headerRuleVariant: 'thin',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'rule',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'comma'
  },
  {
    id: 'trades-operator',
    category: 'Trades',
    defaultAccent: '#2D2D2D',
    fontBody: 'sans',
    fontHeadings: 'sans',
    fontName: 'sans',
    nameAlign: 'left',
    nameCase: 'uppercase',
    contactAlign: 'left',
    sectionHeaderStyle: 'banner',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'none',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'normal',
    skillsStyle: 'dash'
  },
  {
    id: 'trades-foreman',
    category: 'Trades',
    defaultAccent: '#2D2D2D',
    fontBody: 'sans',
    fontHeadings: 'sans',
    fontName: 'sans',
    nameAlign: 'center',
    nameCase: 'uppercase',
    contactAlign: 'center',
    sectionHeaderStyle: 'underline',
    headerRuleVariant: 'thick',
    sectionHeaderCase: 'uppercase',
    decorativeMark: 'quarter-circle',
    dateAlign: 'right',
    jobTitleWeight: 'bold',
    companyStyle: 'italic',
    skillsStyle: 'pills'
  }
];

export function getTemplate(id: string): TemplateConfig {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}

/** Categories in registry order (the web gallery's filter order). */
export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [...new Set(TEMPLATES.map((template) => template.category))];

/** The template with this id, or undefined. Use getTemplate where a fallback is wanted. */
export function findTemplate(id: string): TemplateConfig | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
