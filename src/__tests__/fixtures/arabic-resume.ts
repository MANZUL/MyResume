import type { ResumeData } from '../../domain/resume/types';

// A representative Arabic resume. Real Arabic CVs mix scripts constantly: Arabic names and
// sentences next to English company names, skills, certifications, e-mail addresses, URLs,
// phone numbers, dates and numbers. Every item here is a case the renderers must keep in
// order (no reordering, no reversed words, punctuation on the right side).

export const ARABIC_RESUME: ResumeData = {
  name: 'محمد أحمد',
  contact: {
    phone: '+49 170 1234567',
    email: 'mohamed.ahmed@example.com',
    location: 'الرياض، المملكة العربية السعودية',
    linkedin: 'https://linkedin.com/in/mohamed-ahmed',
    website: 'https://example.com/profile',
  },
  summary: {
    tagline: 'مهندس برمجيات بخبرة 8 سنوات في بناء منصات الويب',
    bullets: [
      'قدت فريقًا من 8 مهندسين لبناء منصة React/Node.js وخفضت زمن التحميل بنسبة 35%.',
      'Reduced latency by 35% using AWS Lambda.',
      'خبرة في C++ وPostgreSQL وإدارة المنتجات.',
    ],
    skills: ['JavaScript', 'TypeScript', 'React', 'C++', 'AWS', 'Node.js', '.NET', 'قيادة الفرق'],
  },
  experience: [
    {
      title: 'مهندس برمجيات أول',
      company: 'Acme Corp',
      location: 'Berlin',
      start: '03/2020',
      end: 'Present',
      summary: 'مسؤول عن منصة المدفوعات الإلكترونية (Payments API) لأكثر من 2 مليون مستخدم.',
      bullets: [
        'تصميم خدمات REST وGraphQL باستخدام TypeScript.',
        'Reduced cloud costs by 28% (AWS) in 2023.',
        'تحسين أداء قاعدة البيانات (استعلامات أسرع 3x).',
      ],
    },
    {
      title: 'Senior C++ Developer',
      company: 'شركة الأفق',
      location: 'دبي',
      start: '2015',
      end: '2020',
      summary: '',
      bullets: ['تطوير محرك رسوميات بلغة C++17 يدعم 60 FPS.'],
    },
  ],
  education: [
    { degree: 'بكالوريوس علوم الحاسب', school: 'جامعة الملك سعود', location: 'الرياض', date: '2015', honors: 'مرتبة الشرف الأولى' },
    { degree: 'M.Sc. Computer Science', school: 'TU Berlin', location: 'Berlin', date: '2018', honors: '' },
  ],
  certifications: [
    { name: 'AWS Certified Solutions Architect', org: 'Amazon', date: '2022' },
    { name: 'شهادة إدارة المشاريع PMP', org: 'PMI', date: '2021' },
  ],
  projects: [
    {
      name: 'منصة e-Commerce',
      description: 'متجر إلكتروني متعدد اللغات (العربية والإنجليزية) على https://shop.example.com.',
      bullets: ['إطلاق النسخة 2.0 في 03/2023.', 'Increased conversion by 12.5%.'],
    },
  ],
  awards: ['جائزة التميز الهندسي 2023', 'Employee of the Year 2022'],
};

/** An English resume with an Arabic section: the opposite mix (an LTR document with Arabic text). */
export const ENGLISH_WITH_ARABIC: ResumeData = {
  ...ARABIC_RESUME,
  name: 'John Smith',
  summary: { ...ARABIC_RESUME.summary, tagline: 'Software engineer (مهندس برمجيات) with 8 years of experience' },
};
