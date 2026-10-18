/**
 * Sample data for the explicitly labeled Demo mode.
 * Every person and lab here is fictional. Sample sources have no URL and are never
 * presented as live university pages.
 */
import type { Candidate, FitLevel, Profile, Recruitment, SchoolId, Source } from '../types/api'

export type PresetId = 'hci' | 'ml' | 'robotics'

export const PRESETS: { id: PresetId; label: string; description: string }[] = [
  { id: 'hci', label: 'HCI sample', description: 'Accessibility and user research' },
  { id: 'ml', label: 'Machine learning sample', description: 'Language models and evaluation' },
  { id: 'robotics', label: 'Robotics sample', description: 'Manipulation and perception' },
]

const PROFILES: Record<PresetId, Omit<Profile, 'id' | 'version' | 'confirmed'>> = {
  hci: {
    name: 'Jordan Sample',
    institution: 'Sample State University',
    degreeYear: 'BS, junior',
    major: 'Human-Computer Interaction',
    skills: ['Figma', 'Python', 'Interview studies', 'Qualitative coding', 'React'],
    experiences: [
      {
        id: 'demo-exp-hci-1',
        title: 'Research assistant, campus accessibility study',
        description:
          'Helped run 14 semi-structured interviews with screen-reader users and coded transcripts with a faculty mentor.',
      },
      {
        id: 'demo-exp-hci-2',
        title: 'Course project: captioning tool prototype',
        description: 'Designed and tested a live-captioning prototype for lectures with five classmates.',
      },
      {
        id: 'demo-exp-hci-3',
        title: 'Teaching assistant, Intro to Design',
        description: 'Led weekly critique sessions for 25 first-year students.',
      },
    ],
    preferences: {
      interests: ['Accessibility', 'Human-computer interaction'],
      schools: ['cmu', 'stanford', 'uw'],
      startMonth: null,
      endMonth: null,
      arrangement: 'any',
      additional: '',
    },
  },
  ml: {
    name: 'Riley Sample',
    institution: 'Sample State University',
    degreeYear: 'BS, sophomore',
    major: 'Computer Science',
    skills: ['Python', 'PyTorch', 'Statistics', 'Linear algebra', 'SQL'],
    experiences: [
      {
        id: 'demo-exp-ml-1',
        title: 'Independent study: evaluating text classifiers',
        description: 'Compared three sentiment models on a small labeled dataset and wrote a short report on failure cases.',
      },
      {
        id: 'demo-exp-ml-2',
        title: 'Data science club project lead',
        description: 'Organized a four-person team analyzing public transit delays.',
      },
    ],
    preferences: {
      interests: ['Machine learning', 'Model evaluation'],
      schools: ['cmu', 'stanford', 'uw'],
      startMonth: null,
      endMonth: null,
      arrangement: 'any',
      additional: '',
    },
  },
  robotics: {
    name: 'Casey Sample',
    institution: 'Sample State University',
    degreeYear: 'BS, senior',
    major: 'Mechanical Engineering',
    skills: ['ROS', 'C++', 'SolidWorks', 'Python', 'Computer vision basics'],
    experiences: [
      {
        id: 'demo-exp-rob-1',
        title: 'Robotics team, perception lead',
        description: 'Built a camera-based object detector for a student competition robot.',
      },
      {
        id: 'demo-exp-rob-2',
        title: 'Summer intern, manufacturing lab',
        description: 'Programmed a pick-and-place arm and documented calibration steps.',
      },
    ],
    preferences: {
      interests: ['Robotics', 'Robot manipulation'],
      schools: ['cmu', 'stanford', 'uw'],
      startMonth: null,
      endMonth: null,
      arrangement: 'any',
      additional: '',
    },
  },
}

export function presetProfile(preset: PresetId, id: string): Profile {
  const base = structuredClone(PROFILES[preset])
  return { ...base, id, version: 0, confirmed: false }
}

interface SampleSpec {
  key: string
  schoolId: SchoolId
  name: string
  entityType: 'faculty' | 'lab'
  lab: string | null
  summary: string
  fitLevel: FitLevel
  reasons: { text: string; experienceIds: string[]; interestTerms: string[] }[]
  recruitment: Recruitment
  recruitmentExplanation: string
  unknowns: string[]
}

const SAMPLE_SPECS: Record<PresetId, SampleSpec[]> = {
  hci: [
    {
      key: 'hci-cmu-1',
      schoolId: 'cmu',
      name: 'Prof. Elena Marrow',
      entityType: 'faculty',
      lab: 'Quiet Interfaces Lab (sample)',
      summary:
        'Designs and evaluates non-visual interfaces for blind and low-vision people, with a focus on how screen-reader users navigate complex documents.',
      fitLevel: 'strong',
      reasons: [
        {
          text: 'Your interview study with screen-reader users is close to the lab’s research on non-visual document navigation.',
          experienceIds: ['demo-exp-hci-1'],
          interestTerms: ['Accessibility'],
        },
        {
          text: 'The lab runs user studies that rely on qualitative coding, which you have practiced.',
          experienceIds: [],
          interestTerms: ['Human-computer interaction'],
        },
      ],
      recruitment: 'recruiting_stated',
      recruitmentExplanation: 'The sample lab page says it is accepting undergraduate applications for Summer 2027.',
      unknowns: ['Whether students from other universities are eligible', 'Whether the position is paid'],
    },
    {
      key: 'hci-cmu-2',
      schoolId: 'cmu',
      name: 'Civic Design Studio (sample)',
      entityType: 'lab',
      lab: 'Civic Design Studio (sample)',
      summary: 'Studies how communities use public-service websites and co-designs simpler forms with residents.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'The studio’s co-design sessions connect to your interest in human-computer interaction.',
          experienceIds: [],
          interestTerms: ['Human-computer interaction'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'The sample page describes projects but says nothing about current openings.',
      unknowns: ['Whether undergraduate positions are open this year'],
    },
    {
      key: 'hci-stanford-1',
      schoolId: 'stanford',
      name: 'Prof. Tomas Lindqvist-Arora',
      entityType: 'faculty',
      lab: 'Captioning and Hearing Access Group (sample)',
      summary: 'Builds and evaluates real-time captioning systems for classrooms and meetings.',
      fitLevel: 'strong',
      reasons: [
        {
          text: 'Your captioning prototype for lectures matches the group’s classroom captioning work.',
          experienceIds: ['demo-exp-hci-2'],
          interestTerms: ['Accessibility'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'A sample news post mentions students, but it is two years old and does not name a term.',
      unknowns: ['Whether undergraduate positions are open this year', 'Expected weekly hours'],
    },
    {
      key: 'hci-stanford-2',
      schoolId: 'stanford',
      name: 'Prof. Naomi Achterberg',
      entityType: 'faculty',
      lab: 'Learning Interfaces Lab (sample)',
      summary: 'Researches tools that help instructors give feedback on design work at scale.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'Leading design critiques as a TA relates to the lab’s work on design feedback.',
          experienceIds: ['demo-exp-hci-3'],
          interestTerms: ['Human-computer interaction'],
        },
      ],
      recruitment: 'closed_stated',
      recruitmentExplanation: 'The sample lab page says undergraduate spots for 2026–27 are filled.',
      unknowns: ['When the next application round opens'],
    },
    {
      key: 'hci-uw-1',
      schoolId: 'uw',
      name: 'Prof. Imani Castellanos',
      entityType: 'faculty',
      lab: 'Inclusive Mobility Lab (sample)',
      summary: 'Studies how people with disabilities plan trips, and designs accessible wayfinding apps.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'The lab’s accessibility focus matches your stated interest, though its methods are more quantitative.',
          experienceIds: [],
          interestTerms: ['Accessibility'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'No sample page mentions undergraduate recruiting.',
      unknowns: ['Whether undergraduate positions are open this year', 'Whether remote work is possible'],
    },
    {
      key: 'hci-uw-2',
      schoolId: 'uw',
      name: 'Prof. Gideon Farrow',
      entityType: 'faculty',
      lab: null,
      summary: 'Works on visualization literacy for general audiences.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'Connects to human-computer interaction broadly, with less overlap with your accessibility work.',
          experienceIds: [],
          interestTerms: ['Human-computer interaction'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'No sample page mentions undergraduate recruiting.',
      unknowns: ['Whether undergraduate positions are open this year'],
    },
  ],
  ml: [
    {
      key: 'ml-cmu-1',
      schoolId: 'cmu',
      name: 'Prof. Dmitri Okonjo-Hale',
      entityType: 'faculty',
      lab: 'Reliable Learning Group (sample)',
      summary: 'Studies how to evaluate language models fairly, including benchmark design and error analysis.',
      fitLevel: 'strong',
      reasons: [
        {
          text: 'Your write-up on classifier failure cases is directly related to the group’s error-analysis research.',
          experienceIds: ['demo-exp-ml-1'],
          interestTerms: ['Model evaluation'],
        },
      ],
      recruitment: 'recruiting_stated',
      recruitmentExplanation: 'The sample group page lists an undergraduate research opening for Spring 2027.',
      unknowns: ['Required prerequisite courses'],
    },
    {
      key: 'ml-cmu-2',
      schoolId: 'cmu',
      name: 'Prof. Priya Vandermeer',
      entityType: 'faculty',
      lab: 'Statistical Learning Lab (sample)',
      summary: 'Develops uncertainty estimates for machine learning models used in public policy.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'Matches your machine learning interest; your transit data project shows applied analysis experience.',
          experienceIds: ['demo-exp-ml-2'],
          interestTerms: ['Machine learning'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'The sample page lists PhD openings only, which does not apply to undergraduates.',
      unknowns: ['Whether undergraduate positions are open this year'],
    },
    {
      key: 'ml-stanford-1',
      schoolId: 'stanford',
      name: 'Prof. Hana Westbrook',
      entityType: 'faculty',
      lab: 'Language and Evaluation Lab (sample)',
      summary: 'Builds evaluation suites for multilingual language models.',
      fitLevel: 'strong',
      reasons: [
        {
          text: 'Comparing sentiment models in your independent study is a small-scale version of this lab’s evaluation work.',
          experienceIds: ['demo-exp-ml-1'],
          interestTerms: ['Model evaluation', 'Machine learning'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'No sample page states current undergraduate recruiting.',
      unknowns: ['Whether undergraduate positions are open this year', 'Whether remote work is possible'],
    },
    {
      key: 'ml-stanford-2',
      schoolId: 'stanford',
      name: 'Efficient Systems Group (sample)',
      entityType: 'lab',
      lab: 'Efficient Systems Group (sample)',
      summary: 'Researches faster training methods for large neural networks.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'Relates to machine learning, though the work is more systems-focused than your experience.',
          experienceIds: [],
          interestTerms: ['Machine learning'],
        },
      ],
      recruitment: 'closed_stated',
      recruitmentExplanation: 'The sample page states that undergraduate positions are closed for this academic year.',
      unknowns: ['When applications reopen'],
    },
    {
      key: 'ml-uw-1',
      schoolId: 'uw',
      name: 'Prof. Marisol Brandt',
      entityType: 'faculty',
      lab: 'Data for Good Lab (sample)',
      summary: 'Applies machine learning to transportation and urban data.',
      fitLevel: 'strong',
      reasons: [
        {
          text: 'Your transit-delay analysis aligns with the lab’s transportation projects.',
          experienceIds: ['demo-exp-ml-2'],
          interestTerms: ['Machine learning'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'No sample page mentions undergraduate recruiting.',
      unknowns: ['Whether undergraduate positions are open this year'],
    },
  ],
  robotics: [
    {
      key: 'rob-cmu-1',
      schoolId: 'cmu',
      name: 'Prof. Aurelio Kwan',
      entityType: 'faculty',
      lab: 'Dexterous Manipulation Lab (sample)',
      summary: 'Develops grasping and in-hand manipulation methods for household robots.',
      fitLevel: 'strong',
      reasons: [
        {
          text: 'Programming a pick-and-place arm relates closely to the lab’s manipulation research.',
          experienceIds: ['demo-exp-rob-2'],
          interestTerms: ['Robot manipulation'],
        },
      ],
      recruitment: 'recruiting_stated',
      recruitmentExplanation: 'The sample lab page invites undergraduates to apply for Summer 2027.',
      unknowns: ['Whether the position includes housing support'],
    },
    {
      key: 'rob-cmu-2',
      schoolId: 'cmu',
      name: 'Field Perception Group (sample)',
      entityType: 'lab',
      lab: 'Field Perception Group (sample)',
      summary: 'Builds perception systems for outdoor and agricultural robots.',
      fitLevel: 'strong',
      reasons: [
        {
          text: 'Your camera-based detector for the competition robot matches this group’s perception focus.',
          experienceIds: ['demo-exp-rob-1'],
          interestTerms: ['Robotics'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'No sample page mentions undergraduate recruiting.',
      unknowns: ['Whether undergraduate positions are open this year'],
    },
    {
      key: 'rob-stanford-1',
      schoolId: 'stanford',
      name: 'Prof. Selin Okoro',
      entityType: 'faculty',
      lab: 'Assistive Robotics Lab (sample)',
      summary: 'Designs robot arms that help people with limited mobility eat and dress.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'Manipulation research connects to your interest; assistive applications would be new for you.',
          experienceIds: [],
          interestTerms: ['Robot manipulation'],
        },
      ],
      recruitment: 'unknown',
      recruitmentExplanation: 'A sample post from an earlier year mentioned summer students but gave no current term.',
      unknowns: ['Whether undergraduate positions are open this year'],
    },
    {
      key: 'rob-uw-1',
      schoolId: 'uw',
      name: 'Prof. Wren Halvorsen',
      entityType: 'faculty',
      lab: 'Soft Robotics Studio (sample)',
      summary: 'Fabricates soft grippers and studies how they handle fragile objects.',
      fitLevel: 'partial',
      reasons: [
        {
          text: 'Your SolidWorks and manufacturing background is relevant to gripper fabrication.',
          experienceIds: ['demo-exp-rob-2'],
          interestTerms: ['Robotics'],
        },
      ],
      recruitment: 'closed_stated',
      recruitmentExplanation: 'The sample page says the studio is not taking new students this year.',
      unknowns: ['When the studio will accept students again'],
    },
  ],
}

function sampleSources(spec: SampleSpec, retrievedAt: string): Source[] {
  const label = spec.entityType === 'lab' ? 'Sample lab page' : 'Sample faculty profile'
  return [
    {
      id: `${spec.key}-src-1`,
      title: label,
      url: null,
      domain: null,
      summary: `Describes research on ${spec.summary.charAt(0).toLowerCase()}${spec.summary.slice(1)}`,
      retrievedAt,
      publishedAt: null,
      sample: true,
    },
    {
      id: `${spec.key}-src-2`,
      title: 'Sample research overview',
      url: null,
      domain: null,
      summary: spec.recruitmentExplanation,
      retrievedAt,
      publishedAt: null,
      sample: true,
    },
  ]
}

/** Sample candidates for the chosen schools. Experience links are kept only if the experience still exists. */
export function sampleCandidates(
  preset: PresetId,
  schools: SchoolId[],
  experienceIds: string[],
  retrievedAt: string,
): Candidate[] {
  const known = new Set(experienceIds)
  const levelRank: Record<FitLevel, number> = { strong: 0, partial: 1, insufficient_evidence: 2 }
  return SAMPLE_SPECS[preset]
    .filter((spec) => schools.includes(spec.schoolId))
    .map((spec, index) => {
      const sources = sampleSources(spec, retrievedAt)
      const candidate: Candidate = {
        id: `demo-${spec.key}`,
        schoolId: spec.schoolId,
        name: spec.name,
        entityType: spec.entityType,
        lab: spec.lab,
        researchSummary: spec.summary,
        fitLevel: spec.fitLevel,
        fitReasons: spec.reasons.map((reason) => ({
          text: reason.text,
          experienceIds: reason.experienceIds.filter((id) => known.has(id)),
          interestTerms: reason.interestTerms,
          sourceIds: [sources[0].id],
        })),
        recruitment: spec.recruitment,
        recruitmentExplanation: spec.recruitmentExplanation,
        recruitmentSourceIds: spec.recruitment === 'unknown' ? [] : [sources[1].id],
        unknowns: spec.unknowns,
        sources,
        mode: 'demo',
      }
      return { candidate, index }
    })
    .sort((a, b) => {
      const level = levelRank[a.candidate.fitLevel] - levelRank[b.candidate.fitLevel]
      if (level !== 0) return level
      const expA = a.candidate.fitReasons.filter((r) => r.experienceIds.length).length
      const expB = b.candidate.fitReasons.filter((r) => r.experienceIds.length).length
      return expB - expA || a.index - b.index
    })
    .map(({ candidate }) => candidate)
    .slice(0, 5)
}
