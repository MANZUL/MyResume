// Mirrors the ResumeData contract of the product specification
// (MANZUL/Resume lib/api-spec/openapi.yaml).
export interface Contact {
  phone: string;
  email: string;
  location: string;
  linkedin: string;
  website: string;
}

export interface Summary {
  tagline: string;
  bullets: string[];
  skills: string[];
}

export interface Experience {
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  summary: string;
  bullets: string[];
}

export interface Education {
  degree: string;
  school: string;
  location: string;
  date: string;
  honors: string;
}

export interface Certification {
  name: string;
  org: string;
  date: string;
}

export interface Project {
  name: string;
  description: string;
  bullets: string[];
}

export interface ResumeData {
  name: string;
  contact: Contact;
  summary: Summary;
  experience: Experience[];
  education: Education[];
  certifications: Certification[];
  projects: Project[];
  awards: string[];
}

export interface StoredResume {
  id: string;
  title: string;
  templateId: string;
  accent: string;
  data: ResumeData;
  createdAt: number;
  updatedAt: number;
}

export function emptyResume(): ResumeData {
  return {
    name: '',
    contact: { phone: '', email: '', location: '', linkedin: '', website: '' },
    summary: { tagline: '', bullets: [], skills: [] },
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    awards: [],
  };
}

export const emptyExperience = (): Experience => ({
  title: '', company: '', location: '', start: '', end: '', summary: '', bullets: [],
});
export const emptyEducation = (): Education => ({
  degree: '', school: '', location: '', date: '', honors: '',
});
export const emptyCertification = (): Certification => ({ name: '', org: '', date: '' });
export const emptyProject = (): Project => ({ name: '', description: '', bullets: [] });
