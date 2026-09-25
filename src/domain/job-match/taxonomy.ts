// Job Match taxonomy (v1, English). A term is only ever detected if it is listed
// here: no free-form phrase guessing, so company names, places, people and generic
// words cannot become "skills". Aliases are exact alternative spellings of the SAME
// thing (never related-but-different things: "Java" is not an alias of "JavaScript").

export const TAXONOMY_VERSION = 1;

export type TermCategory = 'skill' | 'tool' | 'certification' | 'qualification';

export interface TaxonomyTerm {
  id: string;
  label: string;
  category: TermCategory;
  /** Literal spellings (case-insensitive unless `caseSensitive`). Spaces also match hyphens. */
  aliases: readonly string[];
  /** Regular-expression sources for spellings a literal cannot express (degrees). */
  patterns?: readonly string[];
  /** Also match with a plural "s"/"es" on the last word ("REST APIs", "microservices"). */
  plural?: boolean;
  /** Only the exact case counts ("R", "Go", "Excel", "Swift"). */
  caseSensitive?: boolean;
  /**
   * Ambiguous spellings that do not count at the start of a sentence, where they are
   * likely ordinary words ("Excel at…", "Swift delivery"). Other spellings are not gated.
   */
  notSentenceStart?: readonly string[];
  /**
   * Spellings too short to trust alone ("R", "Go", "C"): they count only next to another
   * listed language ("Python, R and SQL"; "Go/Rust"). "Golang" is not gated.
   */
  listContext?: readonly string[];
}

const t = (id: string, label: string, category: TermCategory, aliases: string[], extra: Partial<TaxonomyTerm> = {}): TaxonomyTerm => ({
  id, label, category, aliases, ...extra,
});

export const TAXONOMY: readonly TaxonomyTerm[] = [
  // --- programming languages ---
  t('python', 'Python', 'skill', ['Python']),
  t('java', 'Java', 'skill', ['Java']),
  t('javascript', 'JavaScript', 'skill', ['JavaScript', 'JS', 'ECMAScript']),
  t('typescript', 'TypeScript', 'skill', ['TypeScript']),
  t('csharp', 'C#', 'skill', ['C#']),
  t('cpp', 'C++', 'skill', ['C++']),
  t('c', 'C', 'skill', ['C'], { caseSensitive: true, listContext: ['C'] }),
  t('go', 'Go', 'skill', ['Golang', 'Go'], { caseSensitive: true, listContext: ['Go'] }),
  t('rust', 'Rust', 'skill', ['Rust'], { caseSensitive: true, notSentenceStart: ['Rust'] }),
  t('ruby', 'Ruby', 'skill', ['Ruby'], { caseSensitive: true, notSentenceStart: ['Ruby'] }),
  t('php', 'PHP', 'skill', ['PHP']),
  t('kotlin', 'Kotlin', 'skill', ['Kotlin']),
  t('swift', 'Swift', 'skill', ['Swift'], { caseSensitive: true, notSentenceStart: ['Swift'] }),
  t('scala', 'Scala', 'skill', ['Scala']),
  t('r', 'R', 'skill', ['R'], { caseSensitive: true, listContext: ['R'] }),
  t('sql', 'SQL', 'skill', ['SQL']),
  t('bash', 'Bash', 'skill', ['Bash', 'shell scripting']),
  t('powershell', 'PowerShell', 'skill', ['PowerShell']),
  t('html', 'HTML', 'skill', ['HTML', 'HTML5']),
  t('css', 'CSS', 'skill', ['CSS', 'CSS3']),
  // --- frameworks and libraries ---
  t('react', 'React', 'skill', ['React', 'React.js', 'ReactJS']),
  t('react-native', 'React Native', 'skill', ['React Native']),
  t('angular', 'Angular', 'skill', ['Angular', 'AngularJS']),
  t('vue', 'Vue.js', 'skill', ['Vue', 'Vue.js', 'VueJS']),
  t('nextjs', 'Next.js', 'skill', ['Next.js', 'NextJS']),
  t('nodejs', 'Node.js', 'skill', ['Node.js', 'NodeJS']),
  t('express', 'Express.js', 'skill', ['Express.js', 'ExpressJS']),
  t('django', 'Django', 'skill', ['Django']),
  t('flask', 'Flask', 'skill', ['Flask']),
  t('spring', 'Spring Boot', 'skill', ['Spring Boot']),
  t('dotnet', '.NET', 'skill', ['.NET', 'ASP.NET']),
  t('rails', 'Ruby on Rails', 'skill', ['Ruby on Rails', 'Rails'], { caseSensitive: true }), // "safety rails"
  t('graphql', 'GraphQL', 'skill', ['GraphQL']),
  t('rest', 'REST APIs', 'skill', ['REST API', 'RESTful API', 'REST'], { plural: true, caseSensitive: true }), // "the rest of"
  t('microservices', 'Microservices', 'skill', ['microservice', 'micro-service'], { plural: true }),
  t('pandas', 'pandas', 'skill', ['pandas']),
  t('numpy', 'NumPy', 'skill', ['NumPy']),
  t('tensorflow', 'TensorFlow', 'skill', ['TensorFlow']),
  t('pytorch', 'PyTorch', 'skill', ['PyTorch']),
  t('scikit', 'scikit-learn', 'skill', ['scikit-learn', 'sklearn']),
  // --- data ---
  t('machine-learning', 'Machine learning', 'skill', ['machine learning']),
  t('data-analysis', 'Data analysis', 'skill', ['data analysis', 'data analytics']),
  t('data-visualization', 'Data visualization', 'skill', ['data visualization', 'data visualisation']),
  t('statistics', 'Statistics', 'skill', ['statistics', 'statistical analysis']),
  t('etl', 'ETL', 'skill', ['ETL']),
  t('data-modeling', 'Data modeling', 'skill', ['data modeling', 'data modelling']),
  t('ab-testing', 'A/B testing', 'skill', ['A/B testing', 'A/B tests', 'A/B test', 'AB testing', 'split testing']),
  t('postgresql', 'PostgreSQL', 'tool', ['PostgreSQL', 'Postgres']),
  t('mysql', 'MySQL', 'tool', ['MySQL']),
  t('mongodb', 'MongoDB', 'tool', ['MongoDB']),
  t('redis', 'Redis', 'tool', ['Redis']),
  t('sql-server', 'SQL Server', 'tool', ['SQL Server', 'MSSQL']),
  t('oracle-db', 'Oracle Database', 'tool', ['Oracle Database', 'Oracle DB']),
  t('snowflake', 'Snowflake', 'tool', ['Snowflake'], { caseSensitive: true }),
  t('bigquery', 'BigQuery', 'tool', ['BigQuery']),
  t('redshift', 'Redshift', 'tool', ['Redshift']),
  t('spark', 'Apache Spark', 'tool', ['Apache Spark', 'Spark', 'PySpark'], { caseSensitive: true }),
  t('kafka', 'Kafka', 'tool', ['Kafka', 'Apache Kafka']),
  t('airflow', 'Airflow', 'tool', ['Airflow', 'Apache Airflow']),
  t('dbt', 'dbt', 'tool', ['dbt'], { caseSensitive: true }),
  t('excel', 'Excel', 'tool', ['Microsoft Excel', 'MS Excel', 'Excel'], { caseSensitive: true, notSentenceStart: ['Excel'] }),
  t('tableau', 'Tableau', 'tool', ['Tableau']),
  t('power-bi', 'Power BI', 'tool', ['Power BI', 'PowerBI']),
  t('looker', 'Looker', 'tool', ['Looker'], { caseSensitive: true }),
  // --- cloud and devops ---
  t('aws', 'AWS', 'tool', ['AWS', 'Amazon Web Services']),
  t('azure', 'Azure', 'tool', ['Azure', 'Microsoft Azure']),
  t('gcp', 'Google Cloud', 'tool', ['GCP', 'Google Cloud', 'Google Cloud Platform']),
  t('docker', 'Docker', 'tool', ['Docker']),
  t('kubernetes', 'Kubernetes', 'tool', ['Kubernetes', 'K8s']),
  t('terraform', 'Terraform', 'tool', ['Terraform']),
  t('ansible', 'Ansible', 'tool', ['Ansible']),
  t('jenkins', 'Jenkins', 'tool', ['Jenkins']),
  t('github-actions', 'GitHub Actions', 'tool', ['GitHub Actions']),
  t('ci-cd', 'CI/CD', 'skill', ['CI/CD', 'CI CD', 'continuous integration']),
  t('git', 'Git', 'tool', ['Git'], { caseSensitive: true }),
  t('github', 'GitHub', 'tool', ['GitHub']),
  t('gitlab', 'GitLab', 'tool', ['GitLab']),
  t('linux', 'Linux', 'tool', ['Linux']),
  // --- security ---
  t('siem', 'SIEM', 'skill', ['SIEM']),
  t('splunk', 'Splunk', 'tool', ['Splunk']),
  t('qradar', 'QRadar', 'tool', ['QRadar']),
  t('sentinel', 'Microsoft Sentinel', 'tool', ['Microsoft Sentinel', 'Azure Sentinel']),
  t('crowdstrike', 'CrowdStrike', 'tool', ['CrowdStrike']),
  t('edr', 'EDR', 'skill', ['EDR']),
  t('ids-ips', 'IDS/IPS', 'skill', ['IDS/IPS', 'IDS', 'IPS'], { caseSensitive: true }),
  t('incident-response', 'Incident response', 'skill', ['incident response']),
  t('threat-hunting', 'Threat hunting', 'skill', ['threat hunting']),
  t('vulnerability-management', 'Vulnerability management', 'skill', ['vulnerability management']),
  t('mitre', 'MITRE ATT&CK', 'skill', ['MITRE ATT&CK', 'MITRE']),
  t('nist', 'NIST', 'skill', ['NIST']),
  t('iso27001', 'ISO 27001', 'skill', ['ISO 27001', 'ISO/IEC 27001']),
  t('soc2', 'SOC 2', 'skill', ['SOC 2', 'SOC2']),
  t('wireshark', 'Wireshark', 'tool', ['Wireshark']),
  t('tcp-ip', 'TCP/IP', 'skill', ['TCP/IP']),
  t('firewalls', 'Firewalls', 'skill', ['firewall'], { plural: true }),
  // --- product and delivery ---
  t('user-research', 'User research', 'skill', ['user research']),
  t('stakeholder-management', 'Stakeholder management', 'skill', ['stakeholder management']),
  t('product-strategy', 'Product strategy', 'skill', ['product strategy']),
  t('roadmapping', 'Product roadmap', 'skill', ['product roadmap', 'roadmapping'], { plural: true }), // bare "roadmap" is too generic
  t('agile', 'Agile', 'skill', ['Agile']),
  t('scrum', 'Scrum', 'skill', ['Scrum']),
  t('kanban', 'Kanban', 'skill', ['Kanban']),
  t('okrs', 'OKRs', 'skill', ['OKR'], { plural: true }),
  t('project-management', 'Project management', 'skill', ['project management']),
  t('jira', 'Jira', 'tool', ['Jira']),
  t('confluence', 'Confluence', 'tool', ['Confluence']),
  t('figma', 'Figma', 'tool', ['Figma']),
  t('amplitude', 'Amplitude', 'tool', ['Amplitude'], { caseSensitive: true }),
  t('mixpanel', 'Mixpanel', 'tool', ['Mixpanel']),
  t('asana', 'Asana', 'tool', ['Asana'], { caseSensitive: true }),
  // --- marketing and sales ---
  t('seo', 'SEO', 'skill', ['SEO', 'search engine optimization', 'search engine optimisation']),
  t('sem', 'SEM', 'skill', ['SEM', 'search engine marketing']),
  t('ppc', 'PPC', 'skill', ['PPC', 'pay-per-click']),
  t('content-marketing', 'Content marketing', 'skill', ['content marketing']),
  t('email-marketing', 'Email marketing', 'skill', ['email marketing']),
  t('social-media-marketing', 'Social media marketing', 'skill', ['social media marketing']),
  t('marketing-automation', 'Marketing automation', 'skill', ['marketing automation']),
  t('copywriting', 'Copywriting', 'skill', ['copywriting']),
  t('google-analytics', 'Google Analytics', 'tool', ['Google Analytics', 'GA4']),
  t('google-ads', 'Google Ads', 'tool', ['Google Ads', 'AdWords']),
  t('hubspot', 'HubSpot', 'tool', ['HubSpot']),
  t('salesforce', 'Salesforce', 'tool', ['Salesforce']),
  t('crm', 'CRM', 'skill', ['CRM']),
  // --- certifications ---
  t('aws-certified', 'AWS Certified', 'certification', ['AWS Certified']),
  t('azure-certified', 'Microsoft Azure certification', 'certification', ['Azure Administrator', 'Azure Fundamentals', 'AZ-900', 'AZ-104']),
  t('pmp', 'PMP', 'certification', ['PMP', 'Project Management Professional']),
  t('csm', 'Certified ScrumMaster', 'certification', ['Certified ScrumMaster', 'Certified Scrum Master']), // not "CSM": also Customer Success Manager
  t('cissp', 'CISSP', 'certification', ['CISSP']),
  t('cism', 'CISM', 'certification', ['CISM']),
  t('ceh', 'CEH', 'certification', ['CEH', 'Certified Ethical Hacker']),
  t('oscp', 'OSCP', 'certification', ['OSCP']),
  t('security-plus', 'CompTIA Security+', 'certification', ['Security+', 'CompTIA Security+']),
  t('network-plus', 'CompTIA Network+', 'certification', ['Network+', 'CompTIA Network+']),
  t('a-plus', 'CompTIA A+', 'certification', ['CompTIA A+']),
  t('ccna', 'CCNA', 'certification', ['CCNA']),
  t('ccnp', 'CCNP', 'certification', ['CCNP']),
  t('gcih', 'GIAC GCIH', 'certification', ['GCIH']),
  t('cpa', 'CPA', 'certification', ['CPA'], { caseSensitive: true }),
  t('cfa', 'CFA', 'certification', ['CFA'], { caseSensitive: true }),
  // --- qualifications (degree level only; the field of study is not interpreted) ---
  t('bachelors', "Bachelor's degree", 'qualification', [], { patterns: ["\\bbachelor(?:'s|’s|s)?\\b", '\\bB\\.S(?:c)?\\.', '\\bBSc\\b', '\\bB\\.A\\.'] }),
  t('masters', "Master's degree", 'qualification', [], { patterns: ["\\bmaster(?:'s|’s|s)\\b(?=\\s+(?:degree|in|of)\\b)", '\\bmaster of\\b', '\\bM\\.S(?:c)?\\.', '\\bMSc\\b'] }),
  t('mba', 'MBA', 'qualification', ['MBA', 'Master of Business Administration']),
  t('phd', 'PhD', 'qualification', ['PhD', 'Ph.D.', 'doctorate']),
];

/** Nouns that make a short first line a job title ("Senior Software Engineer"). */
export const ROLE_NOUNS: ReadonlySet<string> = new Set([
  'engineer', 'developer', 'analyst', 'manager', 'designer', 'scientist', 'specialist', 'coordinator', 'consultant',
  'administrator', 'architect', 'director', 'intern', 'representative', 'marketer', 'strategist', 'researcher',
  'technician', 'accountant', 'recruiter', 'writer', 'officer', 'lead', 'executive', 'assistant', 'owner',
]);

/** Level words removed before looking for the role name in the resume. The level itself is never judged. */
export const LEVEL_WORDS: ReadonlySet<string> = new Set([
  'senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal', 'associate', 'entry-level', 'entry', 'level', 'mid-level',
  'i', 'ii', 'iii', 'iv', '1', '2', '3', 'head', 'chief',
]);
