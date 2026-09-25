import { LEVEL_WORDS, ROLE_NOUNS } from './taxonomy';

// Splits a job description into lines and labels each with the part of the posting
// it sits in. Headings are recognised only from a fixed list; anything else is
// "general". Inline markers ("(preferred)", "nice to have", "required") override.

export type JdSection = 'required' | 'responsibilities' | 'general' | 'preferred' | 'about';

export interface JdLine {
  text: string;
  section: JdSection;
}

const HEADINGS: readonly [RegExp, JdSection][] = [
  [/^(preferred|nice[\s-]to[\s-]haves?|bonus(?: points)?|pluses|preferred (qualifications|skills|experience))\b/i, 'preferred'],
  [/^(requirements|required|qualifications|minimum qualifications|basic qualifications|must[\s-]haves?|what (you'?ll need|you will need|you'?ll bring|you will bring|we'?re looking for|you need|you bring)|who you are|skills( and| &)? (experience|qualifications)|your (skills|profile|background))\b/i, 'required'],
  [/^(responsibilities|key responsibilities|duties|what you'?ll do|what you will do|the role|your role|day[\s-]to[\s-]day|in this role)\b/i, 'responsibilities'],
  [/^(about (us|the company|the team|[A-Z][\w&.-]*)|who we are|our company|benefits|perks|what we offer|why join|equal opportunity|eeo)\b/i, 'about'],
];

/**
 * A heading is a short line (≤ 6 words) that starts with a known heading phrase and holds
 * nothing else: "Requirements", "Requirements:", "About Acme". A label followed by content
 * ("Required: Python", "About us: we are…") is not a heading (see inlineSection).
 */
function headingSection(line: string): JdSection | null {
  if (/[:：]\s*\S/.test(line)) return null;
  const text = line.replace(/[’]/g, "'").replace(/[:：]\s*$/, '').trim();
  if (!text || text.split(/\s+/).length > 6 || /[.!?]$/.test(text)) return null;
  for (const [pattern, section] of HEADINGS) if (pattern.test(text)) return section;
  return null;
}

/**
 * A line that STARTS with a label ("Nice to have: MBA", "Required: SQL", "About us: …").
 * Markers in the middle of a line ("SQL (PostgreSQL preferred)") are not interpreted: the
 * line keeps the section it sits in, which is a fact about the text.
 */
function inlineSection(line: string): JdSection | null {
  const text = line.replace(/^[-*•·–]\s*/, '');
  if (/^(nice[\s-]to[\s-]haves?|preferred|bonus|plus)\s*[:：]/i.test(text)) return 'preferred';
  if (/^(required|requirements|must[\s-]haves?|mandatory)\s*[:：]/i.test(text)) return 'required';
  if (/^(about (us|the company)|who we are)\s*[:：]/i.test(text)) return 'about';
  return null;
}

export function segmentJobDescription(text: string): JdLine[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: JdLine[] = [];
  let current: JdSection = 'general';
  for (const raw of lines) {
    const line = raw.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;
    const heading = headingSection(line);
    if (heading) {
      current = heading;
      continue;
    }
    out.push({ text: line, section: inlineSection(line) ?? current });
  }
  return out;
}

export interface DetectedTitle {
  /** As written in the job description. */
  text: string;
  /** Without level words or qualifiers ("Senior Software Engineer, Payments" → "Software Engineer"). */
  core: string;
}

/**
 * The job title, only when it is clearly given: a "Job title:" / "Position:" / "Role:" label,
 * or a short first line (≤ 8 words, not a sentence) that ends with a role noun.
 */
export function detectTitle(text: string): DetectedTitle | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  let candidate: string | null = null;
  for (const line of lines.slice(0, 15)) {
    const labelled = /^(job title|position|role|title)\s*[:：-]\s*(.+)$/i.exec(line);
    if (labelled) {
      candidate = labelled[2].trim();
      break;
    }
  }
  if (!candidate && lines[0] && lines[0].split(/\s+/).length <= 8 && !/[.!?]$/.test(lines[0])) candidate = lines[0];
  if (!candidate) return null;
  // Qualifiers after a comma, dash, pipe or parenthesis are not part of the role name.
  const main = candidate.split(/\s*(?:,|\||\(|\s[–—-]\s|\bat\b|@)\s*/i)[0].trim();
  const isLevel = (w: string) => LEVEL_WORDS.has(w.toLowerCase().replace(/\.$/, ''));
  const words = main.split(/\s+/);
  // Trailing levels ("SOC Analyst II") do not hide the role noun.
  const lastRoleWord = [...words].reverse().find((w) => !isLevel(w)) ?? '';
  if (!ROLE_NOUNS.has(lastRoleWord.toLowerCase().replace(/[^a-z]/g, ''))) return null;
  const core = words.filter((w) => !isLevel(w)).join(' ');
  if (!core || !ROLE_NOUNS.has(core.split(/\s+/).pop()!.toLowerCase())) return null;
  return { text: main, core };
}
