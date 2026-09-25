import type { ResumeData } from './types';

export const SAMPLE_RESUME: ResumeData = {
  name: 'Eleanor Vance',
  contact: {
    phone: '(555) 123-4567',
    email: 'eleanor.vance@example.com',
    location: 'New York, NY',
    linkedin: 'linkedin.com/in/eleanorvance',
    website: 'eleanorvance.com'
  },
  summary: {
    tagline: 'Strategic product leader specializing in zero-to-one consumer experiences.',
    bullets: [
      'Over 10 years of experience driving product vision and execution at scale.',
      'Proven track record of building cross-functional teams and launching award-winning apps.'
    ],
    skills: ['Product Strategy', 'User Research', 'Agile Methodology', 'Data Analytics', 'Go-to-Market']
  },
  experience: [
    {
      title: 'Director of Product',
      company: 'Acme Innovation Labs',
      location: 'New York, NY',
      start: 'Mar 2020',
      end: 'Present',
      summary: 'Led the consumer product organization, overseeing a portfolio of 3 flagship applications with over 10M MAU.',
      bullets: [
        'Grew active user base by 45% year-over-year through targeted retention initiatives.',
        'Managed a cross-functional team of 14 product managers and designers.',
        'Spearheaded the redesign of the core onboarding flow, increasing day-1 conversion by 22%.'
      ]
    },
    {
      title: 'Senior Product Manager',
      company: 'Nexus Tech',
      location: 'San Francisco, CA',
      start: 'Jun 2016',
      end: 'Feb 2020',
      summary: '',
      bullets: [
        'Launched the MVP for a B2B SaaS analytics dashboard, securing 50 enterprise clients in Q1.',
        'Collaborated with engineering to migrate monolithic architecture to microservices.',
        'Instituted a weekly customer feedback loop that reduced feature time-to-market.'
      ]
    }
  ],
  education: [
    {
      degree: 'Master of Business Administration',
      school: 'Wharton School, University of Pennsylvania',
      location: 'Philadelphia, PA',
      date: '2016',
      honors: 'Palmer Scholar'
    },
    {
      degree: 'Bachelor of Arts in Economics',
      school: 'University of Michigan',
      location: 'Philadelphia, PA',
      date: '2012',
      honors: 'Summa Cum Laude'
    }
  ],
  certifications: [
    {
      name: 'Certified Scrum Professional (CSP)',
      org: 'Scrum Alliance',
      date: '2018'
    }
  ],
  projects: [
    {
      name: 'Project Horizon',
      description: 'Internal hackathon winner',
      bullets: ['Developed a machine-learning prototype for predictive customer churn.']
    }
  ],
  awards: [
    'Forbes 30 Under 30 in Enterprise Tech (2021)'
  ]
};
