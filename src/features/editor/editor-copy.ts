// Editor labels, placeholders and add-button text, matching the web editor
// (ResumeEditor.tsx) where the spec defines them. Mobile-only helpers (resume
// title, date and location placeholders, reorder) are kept.

export const EDITOR_COPY = {
  personal: {
    name: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    location: 'Location',
    linkedin: 'LinkedIn',
    website: 'Website',
  },
  summary: {
    tagline: 'Tagline (One short line)',
    bullets: 'Summary Bullets',
    bulletsPlaceholder: 'Add a concise summary point',
    bulletsAdd: 'Add summary bullet',
    skills: 'Skills',
    skillsPlaceholder: 'Add a skill',
    skillsAdd: 'Add skill',
  },
  experience: {
    title: 'Job Title',
    company: 'Company',
    start: 'Start Date',
    end: 'End Date',
    location: 'Location',
    summary: 'Short Summary (Optional paragraph)',
    bullets: 'Accomplishments',
    bulletsAdd: 'Add accomplishment',
  },
  education: {
    degree: 'Degree',
    school: 'School',
    date: 'Date (Year)',
    location: 'Location',
    honors: 'Honors (Optional)',
  },
  certifications: {
    name: 'Certification Name',
    org: 'Organization',
    date: 'Date',
  },
  projects: {
    name: 'Project Name',
    description: 'Short Description',
    bullets: 'Accomplishments',
    bulletsPlaceholder: 'Add a project accomplishment',
    bulletsAdd: 'Add accomplishment',
  },
  awards: {
    list: 'Awards & Honors',
    placeholder: 'Add an award or honor',
    add: 'Add award',
  },
} as const;
