export const learningCourses = [
  { id: 'foundations', order: 1, title: 'Start modelling', level: 'Beginner', summary: 'Understand the work, take clear digitals and build a realistic practice routine.', outcomes: ['Prepare a clear set of phone digitals', 'Compare lighting and framing', 'Plan your first week of practice'] },
  { id: 'posing', order: 2, title: 'Posing & camera confidence', level: 'Beginner → developing', summary: 'Work on expression, hands, movement and responding to a photographer’s direction.', outcomes: ['Build a repeatable range of poses', 'Present clothing with natural movement', 'Use feedback to improve a second attempt'] },
  { id: 'runway', order: 3, title: 'Runway & movement', level: 'Beginner → developing', summary: 'Practise pace, posture, turns and walking to the requirements of a show.', outcomes: ['Walk and turn on a clear practice route', 'Recognise differences in show direction', 'Record a complete rehearsal sequence'] },
  { id: 'casting', order: 4, title: 'Castings & commercial work', level: 'Beginner → developing', summary: 'Prepare introductions, record self-tapes and work through a mock commercial casting.', outcomes: ['Set up a clear phone self-tape', 'Respond to a simple casting brief', 'Check and submit a complete audition'] },
  { id: 'portfolio', order: 5, title: 'Portfolio & representation', level: 'Developing', summary: 'Choose purposeful images, prepare a comp card and research potential representation.', outcomes: ['Build a small, coherent portfolio selection', 'Prepare a private comp-card draft', 'Plan a test shoot with clear expectations'] },
  { id: 'professional', order: 6, title: 'Working professionally', level: 'All levels', summary: 'Practise communication, ask clear booking questions and know when to pause or seek help.', outcomes: ['Communicate a change of availability', 'Prepare questions about fees and usage', 'Set a practical next step from feedback'] },
];

const legacy = {
  'start-here': ['foundations', 1], 'phone-digitals': ['foundations', 2], 'light-and-framing': ['foundations', 3], 'digitals-example': ['foundations', 4],
  'posing-practice': ['posing', 1], 'expression-and-direction': ['posing', 2],
  'runway-foundations': ['runway', 1], 'casting-introduction': ['casting', 1], 'read-the-brief': ['casting', 2],
  'fees-and-usage': ['professional', 1], 'boundaries-and-support': ['professional', 2], 'your-next-step': ['professional', 6],
};
/** Preserve existing lesson identities and staff edits while assigning old records a course. @param {{id:string, courseId?:string, order:number}} lesson */
export function courseMetadata(lesson) {
  const explicit = learningCourses.some(course => course.id === lesson.courseId);
  return { courseId: String(explicit ? lesson.courseId : legacy[lesson.id]?.[0] || 'foundations'), order: Number(explicit ? lesson.order : legacy[lesson.id]?.[1] || lesson.order) };
}
