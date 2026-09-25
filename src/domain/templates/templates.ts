export type TemplateCategory = 'Corporate' | 'Tech' | 'Creative' | 'Healthcare' | 'Academic' | 'Trades';

export type TemplateConfig = {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
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
    name: 'The Boardroom',
    category: 'Corporate',
    description: 'Classic executive presentation with a commanding presence.',
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
    name: 'The Partner',
    category: 'Corporate',
    description: 'Understated elegance for legal and financial professionals.',
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
    name: 'The Builder',
    category: 'Tech',
    description: 'Clean, dense, and structured for engineering roles.',
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
    name: 'The Architect',
    category: 'Tech',
    description: 'Modern and pill-based styling for full-stack developers.',
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
    name: 'The Editorial',
    category: 'Creative',
    description: 'Asymmetric layout resembling a magazine masthead.',
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
    name: 'The Studio',
    category: 'Creative',
    description: 'Generous leading and soft colors for designers.',
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
    name: 'The Practitioner',
    category: 'Healthcare',
    description: 'Reference-style layout for clinicians and specialists.',
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
    name: 'The Educator',
    category: 'Healthcare',
    description: 'Compact format for academics and medical educators.',
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
    name: 'The Scholar',
    category: 'Academic',
    description: 'Formal and traditional CV styling.',
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
    name: 'The Researcher',
    category: 'Academic',
    description: 'High-density CV for publications and grants.',
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
    name: 'The Operator',
    category: 'Trades',
    description: 'Bold headings and strong underlines for field leadership.',
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
    name: 'The Foreman',
    category: 'Trades',
    description: 'Clear, centered structure prioritizing licenses and skills.',
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
