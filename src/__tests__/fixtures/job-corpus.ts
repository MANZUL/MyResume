import { SAMPLE_RESUME } from '../../domain/resume/sample-data';
import { emptyResume, type ResumeData } from '../../domain/resume/types';

// Job Match corpus: realistic postings (with company blurbs, benefits and traps) and
// resumes covering exact, partial, alias, punctuation and substring-trap cases.

export const JDS = {
  softwareEngineer: `Senior Software Engineer, Payments
About Acme
Acme builds payment tools for small businesses in Austin and Berlin. We run on AWS.

What you'll do
- Design and build REST APIs and microservices in TypeScript and Node.js
- Own services running on Kubernetes and Docker
- Review code on GitHub and improve our CI/CD pipelines

Requirements
- 5+ years of experience with TypeScript or JavaScript
- Strong SQL skills (PostgreSQL preferred)
- Experience with React
- Bachelor's degree in Computer Science or equivalent experience

Nice to have
- Experience with Go, Rust or Kotlin
- Terraform
- Excellent communication skills

Benefits
- Health insurance, 401(k), and a great team`,

  dataAnalyst: `Data Analyst
We are looking for a Data Analyst to join our Insights team in Chicago.
Responsibilities:
• Build dashboards in Tableau and Power BI
• Run A/B tests with the product team and present results to stakeholders
• Write complex SQL queries against BigQuery
Qualifications:
• Proficiency in SQL and Python (pandas) or R
• Advanced Excel skills
• Solid understanding of statistics
• Excel at communicating findings (nice to have: dbt, Airflow)`,

  socAnalyst: `Position: SOC Analyst II
Responsibilities
Monitor alerts in Splunk and Microsoft Sentinel; perform incident response and threat hunting.
Triage EDR detections (CrowdStrike) and IDS/IPS events.
Requirements
CompTIA Security+ required; CySA+ or GCIH preferred.
Knowledge of TCP/IP, firewalls, and the MITRE ATT&CK framework.
Familiarity with NIST and ISO 27001.`,

  productManager: `Product Manager
The role
You will own the product roadmap, run user research, and drive stakeholder management across teams.
Requirements
- Experience with A/B testing and SQL
- Familiarity with Jira, Confluence, and Figma
- Agile/Scrum experience
- Nice to have: MBA
We move fast and value people who are nice to work with. 5+ years preferred.`,

  marketing: `Growth Marketing Manager
About us: HubSpot partner agency in Denver.
What you'll do
Plan SEO and SEM campaigns, email marketing and content marketing.
Report on Google Analytics (GA4) and manage Google Ads budgets.
Requirements
Experience with HubSpot or Salesforce and marketing automation.
Strong copywriting.`,

  entryLevel: `Junior Developer (Entry-Level)
Great for new graduates! You will learn HTML, CSS and JavaScript on our web team and use Git daily.
A bachelor's degree is required.`,

  short: `Python developer needed.`,

  long: Array.from({ length: 200 }, (_, i) => `Line ${i}: we value teamwork, ownership and SQL.`).join('\n'),

  malformed: `\u0000\u0007 ::: ••• \n\n   \t  ¯\\_(ツ)_/¯  REST?? rest of the day… JAVA;;javascript,,C++!!`,

  traps: `Tech Lead
Our stack: JavaScript (not Java), MySQL (not plain SQL), C++ and C#, React Native apps.
Excel at mentoring; swift delivery; we rest on Fridays; Go-getters welcome.
Experience with R, Python and Scala.`,
};

const base = SAMPLE_RESUME;
const exp = base.experience[0];

export const RESUMES: Record<string, ResumeData> = {
  sample: base,
  engineer: {
    ...emptyResume(),
    name: 'Priya Raman',
    summary: { tagline: 'Software Engineer focused on payments', bullets: [], skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Kubernetes', 'Docker', 'React'] },
    experience: [
      { title: 'Software Engineer', company: 'Monzo', location: 'London', start: '2019', end: 'Present', summary: '', bullets: ['Built REST APIs and micro-services in TypeScript.', 'Ran CI/CD on GitHub Actions.'] },
    ],
    education: [{ degree: 'BSc Computer Science', school: 'University of Bristol', location: 'Bristol', date: '2018', honors: '' }],
  },
  aliases: {
    ...emptyResume(),
    summary: { tagline: '', bullets: [], skills: ['ReactJS', 'NodeJS', 'Postgres', 'K8s', 'Golang', 'MS Excel', 'PowerBI'] },
    experience: [{ ...exp, bullets: ['Ran split testing for onboarding.', 'Maintained Amazon Web Services infrastructure.'] }],
  },
  traps: {
    ...emptyResume(),
    summary: { tagline: '', bullets: [], skills: ['JavaScript', 'MySQL', 'React Native'] },
    experience: [{ ...exp, bullets: ['Worked in Cloud and Compliance.', 'The rest of the team used Excel at times.', 'Go to market planning.'] }],
  },
  unicode: {
    ...emptyResume(),
    name: 'José Müller',
    summary: { tagline: 'Ingeniero de software', bullets: [], skills: ['Python', 'SQL', 'Análisis de datos'] },
    experience: [{ ...exp, company: 'Société Générale', bullets: ['Construí APIs REST con Python y SQL.'] }],
  },
  empty: emptyResume(),
};
