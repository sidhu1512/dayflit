export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  body: string;
}

export const JOURNAL_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "daily",
    name: "Daily reflection",
    description: "Three questions to close the day",
    body: "## What happened today\n\n\n## What went well\n\n\n## What I would do differently\n\n\n## Tomorrow's one thing\n\n",
  },
  {
    id: "gratitude",
    name: "Gratitude",
    description: "Three things, however small",
    body: "## Grateful for\n\n1. \n2. \n3. \n\n## Why it mattered\n\n",
  },
  {
    id: "morning",
    name: "Morning pages",
    description: "Unfiltered stream of thought",
    body: "Write without stopping. Don't edit, don't judge.\n\n",
  },
  {
    id: "weekly",
    name: "Weekly review",
    description: "Look back, then plan ahead",
    body: "## Wins this week\n\n- \n\n## What drained me\n\n- \n\n## Lessons\n\n- \n\n## Focus for next week\n\n- [ ] \n- [ ] \n- [ ] \n",
  },
  {
    id: "decision",
    name: "Decision log",
    description: "Record the why, revisit later",
    body: "## Decision\n\n\n## Options considered\n\n- \n\n## Why this one\n\n\n## What would change my mind\n\n\n## Revisit on\n\n",
  },
  {
    id: "dream",
    name: "Dream log",
    description: "Capture it before it fades",
    body: "## The dream\n\n\n## Feelings on waking\n\n\n## Recurring elements\n\n",
  },
  {
    id: "learning",
    name: "Something I learned",
    description: "Teach it back to yourself",
    body: "## What I learned\n\n\n## In my own words\n\n\n## Where I'll use it\n\n",
  },
];

export const JOURNAL_PROMPTS: string[] = [
  "What is one thing that went better than expected today?",
  "What drained your energy today, and what restored it?",
  "Describe a conversation that stayed with you.",
  "What would you tell yourself from a week ago?",
  "What are you avoiding right now, and why?",
  "Name three small things you noticed today.",
  "What did you do today that your future self will thank you for?",
  "Who made your day easier? How?",
  "What problem are you circling without solving?",
  "What did you learn about yourself this week?",
  "If today had a title, what would it be?",
  "What is something you changed your mind about recently?",
  "Where did you spend time that did not feel like yours?",
  "What would make tomorrow 1% better?",
  "What are you looking forward to?",
  "Describe a moment of flow you had recently.",
  "What is a worry you can safely put down tonight?",
  "What did you finish today, and how did finishing feel?",
  "What is one thing you want to remember about this week?",
  "What are you proud of that nobody else noticed?",
  "What advice did you ignore, and was that right?",
  "Which habit is quietly paying off?",
  "What would you do with an unexpected free afternoon?",
  "What boundary did you hold, or wish you had held?",
  "What is the most interesting thing you read or heard today?",
  "What is one assumption you are making about next week?",
  "Describe your ideal ordinary Tuesday.",
  "What did you say no to today?",
  "What made you laugh recently?",
  "What is unfinished that you are fine leaving unfinished?",
  "What are you grateful for in your work right now?",
  "What was the hardest part of today, and how did you get through it?",
];

export function promptForDay(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return JOURNAL_PROMPTS[h % JOURNAL_PROMPTS.length];
}

export const MOODS: { value: number; label: string }[] = [
  { value: 1, label: "Rough" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
];

export const JOURNAL_ICONS = ["book-open", "pen-line", "heart", "sun", "moon", "sprout", "briefcase", "brain", "sparkles", "coffee", "leaf", "activity"];
