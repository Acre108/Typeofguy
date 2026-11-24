// Personality quizzes: no right answers, just a result that shows on your player card.
//
// Every question and result here is original writing. Where a quiz follows a
// well-known framework, it follows the public idea (Jung's types, Holland's six
// interests, the classical temperaments) and credits that, never a branded test:
// "Myers-Briggs", "MBTI", "DiSC", "16Personalities" and similar are trademarks
// and their questionnaires are copyrighted, so none of their names or items are used.

export interface PersonaOutcome { name: string; blurb: string }
export interface PersonaOption { text: string; s: Record<string, number> }
export interface PersonaQuestion { q: string; options: PersonaOption[] }

export interface PersonaQuiz {
  id: string;
  title: string;
  blurb: string;
  /** Credit for the idea the quiz is built on (shown small on the card). */
  basedOn: string;
  colour: string;
  /** top: highest-scoring outcome wins. axes: one letter per pair. birthday: star sign from month/day. */
  kind: 'top' | 'axes' | 'birthday';
  axes?: [string, string][];
  /** Show every outcome's score as bars on the result screen. */
  showBars?: boolean;
  outcomes: Record<string, PersonaOutcome>;
  questions: PersonaQuestion[];
}

export const PERSONA_FIRST_REWARD = 30;
export const PERSONA_REPEAT_REWARD = 5;

// ---------------------------------------------------------------- helpers

/** One option per outcome key, each worth a point. */
const pick = (q: string, ...opts: [string, string][]): PersonaQuestion =>
  ({ q, options: opts.map(([text, key]) => ({ text, s: { [key]: 1 } })) });

/** "How much is this you?" with four answers; reversed statements count against the trait. */
const agree = (q: string, trait: string, reversed = false): PersonaQuestion => ({
  q,
  options: (['That’s me', 'Sort of', 'Not really', 'Not me at all'] as const).map((text, i) => {
    const w = [2, 1, -1, -2][i];
    return { text, s: { [trait]: reversed ? -w : w } };
  }),
});

// ---------------------------------------------------------------- the quizzes

const FOUR_LETTERS: PersonaQuiz = {
  id: 'four-letters', title: 'Four Letters', colour: '#a68cc9', kind: 'axes',
  blurb: 'Twelve quick choices sort you into one of sixteen four-letter types.',
  basedOn: 'Inspired by Carl Jung’s Psychological Types (1921)',
  axes: [['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']],
  outcomes: {
    ISTJ: { name: 'The Keeper of Lists', blurb: 'Dependable and thorough. If it’s worth doing, it’s worth writing down first.' },
    ISFJ: { name: 'The Quiet Host', blurb: 'You remember how everyone takes their tea, and you never make a fuss about it.' },
    INFJ: { name: 'The Lantern', blurb: 'Thoughtful and quietly idealistic, you light the way for people without needing the spotlight.' },
    INTJ: { name: 'The Planner in the Attic', blurb: 'You’ve got a ten-year plan and three backups, all worked out in peace and quiet.' },
    ISTP: { name: 'The Tinkerer', blurb: 'Calm hands and a practical mind. You’d rather take it apart than read the manual.' },
    ISFP: { name: 'The Gentle Maker', blurb: 'You notice beauty in small things and express yourself best by making them.' },
    INFP: { name: 'The Daydreamer', blurb: 'Big heart, rich inner world, and strong values you hold onto quietly.' },
    INTP: { name: 'The Puzzler', blurb: 'Endlessly curious. You love an idea most when it hasn’t been solved yet.' },
    ESTP: { name: 'The Spark', blurb: 'Quick, bold and hands-on. You learn by jumping in, and usually land on your feet.' },
    ESFP: { name: 'The Life of the Lobby', blurb: 'Warm and spontaneous, you turn any gathering into a good time.' },
    ENFP: { name: 'The Kite', blurb: 'Bursting with ideas and enthusiasm, happiest when the wind takes you somewhere new.' },
    ENTP: { name: 'The Debater', blurb: 'You’ll argue either side just to see where it goes, and you’re usually inventing something.' },
    ESTJ: { name: 'The Building Manager', blurb: 'Organised and direct. Things run on time when you’re around.' },
    ESFJ: { name: 'The Welcome Mat', blurb: 'Sociable and caring, you make sure nobody is left standing awkwardly by the door.' },
    ENFJ: { name: 'The Rallying Bell', blurb: 'You bring people together and help them believe in what they could do.' },
    ENTJ: { name: 'The Captain of the Block', blurb: 'Decisive and ambitious. You see the big picture and steer everyone towards it.' },
  },
  questions: [
    pick('It’s Friday evening. You’d rather…', ['Throw the door open and see who drops by', 'E'], ['Curl up with something good, door firmly shut', 'I']),
    pick('After a big party you feel…', ['Buzzing. When’s the next one?', 'E'], ['Happy, but ready for a very quiet day', 'I']),
    pick('When you’re working something out, you…', ['Talk it through with someone', 'E'], ['Mull it over on your own first', 'I']),
    pick('A friend tells you about a new café. You want to know…', ['What’s on the menu and what it costs', 'S'], ['What the feel of the place is and what it could become', 'N']),
    pick('Following a recipe, you…', ['Weigh everything to the gram', 'S'], ['Treat it as a loose suggestion', 'N']),
    pick('You tend to notice…', ['What’s actually in front of you', 'S'], ['Patterns, possibilities and what-ifs', 'N']),
    pick('A friend shows you a wonky shelf they built. First you…', ['Suggest how to fix the wobble', 'T'], ['Tell them it looks great and you’re proud of them', 'F']),
    pick('Making a tough choice, you lean on…', ['What makes the most sense', 'T'], ['What feels fairest to everyone involved', 'F']),
    pick('When giving feedback you’d rather be…', ['Clear, even if it stings a little', 'T'], ['Gentle, even if it takes longer to get there', 'F']),
    pick('Your weekend plans are…', ['Written down, ideally with times', 'J'], ['A rough idea at best', 'P']),
    pick('Packing for a trip, you…', ['Make a list days ahead', 'J'], ['Throw things in a bag the night before', 'P']),
    pick('A sudden change of plan feels…', ['Annoying. I’d sorted it all out', 'J'], ['Exciting. What happens now?', 'P']),
  ],
};

const NINE_POINTS: PersonaQuiz = {
  id: 'nine-points', title: 'Nine Points', colour: '#d98b67', kind: 'top',
  blurb: 'Which of nine core motivations drives you? An enneagram-style sorter.',
  basedOn: 'Inspired by the nine-type enneagram of personality',
  outcomes: {
    '1': { name: 'Type 1 · The Straightener', blurb: 'Principled and conscientious. You want things done properly, and the world a bit better.' },
    '2': { name: 'Type 2 · The Kettle-On', blurb: 'Generous and warm. You notice what people need before they ask.' },
    '3': { name: 'Type 3 · The Go-Getter', blurb: 'Driven and adaptable. You set goals and love the feeling of reaching them.' },
    '4': { name: 'Type 4 · The Original', blurb: 'Expressive and sensitive. You want life to feel meaningful, and you, to feel like you.' },
    '5': { name: 'Type 5 · The Observer', blurb: 'Curious and private. You understand things deeply before you step in.' },
    '6': { name: 'Type 6 · The Steady Friend', blurb: 'Loyal and responsible. You think ahead so the people you love are safe.' },
    '7': { name: 'Type 7 · The Adventurer', blurb: 'Bright and spontaneous. There is always another good thing just around the corner.' },
    '8': { name: 'Type 8 · The Protector', blurb: 'Strong and straight-talking. You stand up for yourself and for anyone who can’t.' },
    '9': { name: 'Type 9 · The Calm Harbour', blurb: 'Easy-going and accepting. People feel at peace around you.' },
  },
  questions: [
    pick('What drives you most?', ['Doing things the right way', '1'], ['Being there for people', '2'], ['Getting somewhere in life', '3']),
    pick('Which compliment lands best?', ['“There’s nobody quite like you”', '4'], ['“You really know your stuff”', '5'], ['“I can always count on you”', '6']),
    pick('Your ideal Saturday…', ['Somewhere new with lots going on', '7'], ['Taking charge of a big project', '8'], ['No plans and no pressure', '9']),
    pick('What bothers you most?', ['Mistakes nobody bothers to fix', '1'], ['Feeling ordinary', '4'], ['Feeling trapped or bored', '7']),
    pick('In a group project you’re…', ['Checking everyone is all right', '2'], ['Doing the deep research', '5'], ['Stepping up to lead', '8']),
    pick('When stressed, you tend to…', ['Work harder so it looks like you’ve got it handled', '3'], ['Imagine everything that could go wrong', '6'], ['Go quiet and wait for it to pass', '9']),
    pick('Your home is…', ['Tidy, everything in its place', '1'], ['Full of things that mean something to you', '4'], ['Always ready for guests', '2']),
    pick('You’d love to be known as…', ['The expert', '5'], ['The loyal one', '6'], ['The fearless one', '8']),
    pick('Your gift to your friends is…', ['Making them laugh', '7'], ['Helping them reach their goals', '3'], ['Keeping the peace', '9']),
    pick('Deep down, you fear…', ['Being wrong or careless', '1'], ['Being unloved', '2'], ['Being useless', '3']),
    pick('Which would you rather have?', ['A life that feels true to you', '4'], ['Enough knowledge to understand anything', '5'], ['Somebody you can fully trust', '6']),
    pick('Which word fits best?', ['Free', '7'], ['Strong', '8'], ['Settled', '9']),
  ],
};

const BIG_FIVE: PersonaQuiz = {
  id: 'big-five', title: 'The Big Five', colour: '#86bccb', kind: 'top', showBars: true,
  blurb: 'Ten statements score you on the five broad traits psychologists use most.',
  basedOn: 'Inspired by the Five-Factor Model of personality',
  outcomes: {
    O: { name: 'Openness · The Curious One', blurb: 'Imaginative and adventurous. New ideas, foods and places pull you in.' },
    C: { name: 'Conscientiousness · The Reliable One', blurb: 'Organised and dependable. You finish what you start.' },
    E: { name: 'Extraversion · The Sociable One', blurb: 'Outgoing and energetic. Company recharges you.' },
    A: { name: 'Agreeableness · The Kind One', blurb: 'Warm, trusting and cooperative. People feel looked after around you.' },
    N: { name: 'Sensitivity · The Deep Feeler', blurb: 'You feel things strongly and notice the weather inside you. It makes you perceptive and caring.' },
  },
  questions: [
    agree('I love trying food I’ve never heard of.', 'O'),
    agree('I like things the way they’ve always been.', 'O', true),
    agree('I finish my chores before I relax.', 'C'),
    agree('My desk could politely be called “creative”.', 'C', true),
    agree('A busy room gives me energy.', 'E'),
    agree('I’d rather send a message than make a call.', 'E', true),
    agree('I’ll go out of my way to help a stranger.', 'A'),
    agree('I can be quick to lose patience with people.', 'A', true),
    agree('Little worries can keep me up at night.', 'N'),
    agree('I stay calm when plans fall apart.', 'N', true),
  ],
};

const TEMPERAMENTS: PersonaQuiz = {
  id: 'temperaments', title: 'Four Humours', colour: '#c97b6a', kind: 'top',
  blurb: 'The oldest personality test going: are you sanguine, choleric, melancholic or phlegmatic?',
  basedOn: 'Based on the classical four temperaments (Hippocrates and Galen)',
  outcomes: {
    sanguine: { name: 'Sanguine · The Sunbeam', blurb: 'Cheerful, chatty and optimistic. You bring the warmth to any room.' },
    choleric: { name: 'Choleric · The Firebrand', blurb: 'Driven and decisive. You see what needs doing and get on with it.' },
    melancholic: { name: 'Melancholic · The Poet', blurb: 'Thoughtful, careful and deep. You care about getting things exactly right.' },
    phlegmatic: { name: 'Phlegmatic · The Still Pond', blurb: 'Calm, patient and steady. Nothing much ruffles you.' },
  },
  questions: [
    pick('At a gathering you’re usually…', ['Telling stories and laughing', 'sanguine'], ['Organising the games', 'choleric'], ['Having one long, deep chat', 'melancholic'], ['Happily listening on the sofa', 'phlegmatic']),
    pick('When something goes wrong you…', ['Shrug and find the funny side', 'sanguine'], ['Fix it, fast', 'choleric'], ['Replay it in your head for a while', 'melancholic'], ['Stay calm and wait it out', 'phlegmatic']),
    pick('Your friends would call you…', ['Fun', 'sanguine'], ['Determined', 'choleric'], ['Thoughtful', 'melancholic'], ['Easy-going', 'phlegmatic']),
    pick('Pick a pace for your day.', ['Lots of little adventures', 'sanguine'], ['Full speed ahead', 'choleric'], ['Slow and considered', 'melancholic'], ['Gentle and unhurried', 'phlegmatic']),
    pick('Your desk looks like…', ['Covered in doodles and souvenirs', 'sanguine'], ['A command centre', 'choleric'], ['Neat, colour-coded, precise', 'melancholic'], ['Whatever, honestly, it’s fine', 'phlegmatic']),
    pick('The weakness you’d own up to…', ['Forgetting what I promised', 'sanguine'], ['Being a bit bossy', 'choleric'], ['Overthinking', 'melancholic'], ['Putting things off', 'phlegmatic']),
    pick('Your dream holiday…', ['A festival with friends', 'sanguine'], ['Climbing the biggest mountain', 'choleric'], ['A quiet museum town', 'melancholic'], ['A hammock and nowhere to be', 'phlegmatic']),
    pick('A friend is upset. You…', ['Cheer them up', 'sanguine'], ['Help them make a plan', 'choleric'], ['Feel it with them', 'melancholic'], ['Sit with them, no rush', 'phlegmatic']),
  ],
};

const FOUR_STYLES: PersonaQuiz = {
  id: 'four-styles', title: 'Four Styles', colour: '#ec9a86', kind: 'top', showBars: true,
  blurb: 'How you act around other people: direct, inspiring, steady or careful?',
  basedOn: 'Inspired by William Moulton Marston’s four behavioural styles (1928)',
  outcomes: {
    D: { name: 'Direct · The Trailblazer', blurb: 'Confident and results-focused. You like a challenge and a quick decision.' },
    I: { name: 'Inspiring · The Cheerleader', blurb: 'Enthusiastic and persuasive. You get people excited about the plan.' },
    S: { name: 'Steady · The Anchor', blurb: 'Patient, loyal and supportive. You keep the team together.' },
    C: { name: 'Careful · The Fine-tuner', blurb: 'Accurate and analytical. You check the details so nobody else has to.' },
  },
  questions: [
    pick('In a meeting you’re most likely to…', ['Push for a decision', 'D'], ['Pitch a fun idea', 'I'], ['Make sure everyone’s heard', 'S'], ['Ask about the details', 'C']),
    pick('What frustrates you most?', ['Wasted time', 'D'], ['Being ignored', 'I'], ['Sudden change', 'S'], ['Sloppy work', 'C']),
    pick('Your email style is…', ['Two lines, done', 'D'], ['Exclamation marks!', 'I'], ['Warm and polite', 'S'], ['Bullet points with sources', 'C']),
    pick('You do your best work when…', ['There’s a challenge to win', 'D'], ['You’re with a lively team', 'I'], ['You know what’s expected', 'S'], ['You have time to get it right', 'C']),
    pick('Pick a motto.', ['“Just do it”', 'D'], ['“Let’s make it fun”', 'I'], ['“Slow and steady”', 'S'], ['“Measure twice, cut once”', 'C']),
    pick('Building flat-pack furniture, you…', ['Start immediately, no instructions', 'D'], ['Invite friends round to help', 'I'], ['Follow along at a calm pace', 'S'], ['Lay out and count every screw first', 'C']),
    pick('People come to you for…', ['A push', 'D'], ['A pep talk', 'I'], ['A listening ear', 'S'], ['The right answer', 'C']),
  ],
};

const WORK_COMPASS: PersonaQuiz = {
  id: 'work-compass', title: 'Work Compass', colour: '#7fab68', kind: 'top', showBars: true,
  blurb: 'Six kinds of work people love. Which way does your compass point?',
  basedOn: 'Inspired by John Holland’s six interest types (RIASEC)',
  outcomes: {
    R: { name: 'Realistic · The Maker', blurb: 'You like working with your hands, tools, plants or animals. Real things, real results.' },
    I: { name: 'Investigative · The Investigator', blurb: 'You love questions, experiments and figuring out how things work.' },
    A: { name: 'Artistic · The Creator', blurb: 'You want room to imagine, design and express things your own way.' },
    S: { name: 'Social · The Helper', blurb: 'You light up teaching, caring for or supporting other people.' },
    E: { name: 'Enterprising · The Persuader', blurb: 'You like leading, selling ideas and making things happen.' },
    C: { name: 'Conventional · The Organiser', blurb: 'You enjoy order, systems and keeping things running smoothly.' },
  },
  questions: [
    pick('Which afternoon sounds best?', ['Fixing a bike', 'R'], ['Reading about black holes', 'I'], ['Painting a mural', 'A']),
    pick('And which of these?', ['Coaching a junior team', 'S'], ['Running a market stall', 'E'], ['Sorting a messy filing cabinet', 'C']),
    pick('Pick a school subject.', ['Design and technology', 'R'], ['Art or drama', 'A'], ['Business studies', 'E']),
    pick('Pick another.', ['Science', 'I'], ['Anything with group work', 'S'], ['Maths and spreadsheets', 'C']),
    pick('A dream job for a day…', ['Carpenter', 'R'], ['Nurse', 'S'], ['Librarian', 'C']),
    pick('And another…', ['Detective', 'I'], ['Illustrator', 'A'], ['Mayor', 'E']),
    pick('You’re proudest when you…', ['Build something that works', 'R'], ['Solve a puzzle nobody else could', 'I'], ['Help someone through a bad day', 'S']),
    pick('Or when you…', ['Make something beautiful', 'A'], ['Talk people round', 'E'], ['Get everything perfectly in order', 'C']),
  ],
};

const CONFLICT: PersonaQuiz = {
  id: 'conflict', title: 'Conflict Style', colour: '#6884a3', kind: 'top',
  blurb: 'When people disagree, what do you reach for first?',
  basedOn: 'Inspired by Blake and Mouton’s conflict grid and its five modes',
  outcomes: {
    compete: { name: 'The Advocate', blurb: 'You stand firm for what you believe. Useful when something really matters.' },
    collaborate: { name: 'The Bridge-builder', blurb: 'You look for the answer that works for everyone, even if it takes longer.' },
    compromise: { name: 'The Fair Splitter', blurb: 'Meet in the middle and move on. You keep things practical.' },
    avoid: { name: 'The Cooler-offer', blurb: 'You step back until heads are calmer. Sometimes that’s exactly right.' },
    accommodate: { name: 'The Peacekeeper', blurb: 'You’ll often let others have their way to keep the relationship sweet.' },
  },
  questions: [
    pick('Two friends want different films. You…', ['Argue for the one you know is better', 'compete'], ['Find a third film everyone loves', 'collaborate'], ['Suggest one tonight, one next week', 'compromise'], ['Say you’re not bothered and get snacks', 'avoid'], ['Go with whatever they prefer', 'accommodate']),
    pick('Your neighbour’s music is too loud. You…', ['Knock and ask them to turn it down now', 'compete'], ['Chat about what times work for both of you', 'collaborate'], ['Agree on quiet after ten', 'compromise'], ['Put headphones on', 'avoid'], ['Decide it’s fine, they’re enjoying themselves', 'accommodate']),
    pick('In an argument, the most important thing is…', ['Making sure the truth comes out', 'compete'], ['Understanding each other', 'collaborate'], ['Ending it fairly', 'compromise'], ['Not making it worse', 'avoid'], ['Staying friends', 'accommodate']),
    pick('Someone takes credit for your idea. You…', ['Say so, clearly', 'compete'], ['Suggest you both present it together', 'collaborate'], ['Let it go this time but mention it later', 'compromise'], ['Let it go entirely', 'avoid'], ['Feel glad the idea is out there', 'accommodate']),
    pick('Your housemate never does the dishes. You…', ['Call a house meeting', 'compete'], ['Draw up a rota together', 'collaborate'], ['Offer to swap: you wash, they dry', 'compromise'], ['Buy more plates', 'avoid'], ['Just do them yourself', 'accommodate']),
    pick('After a disagreement you usually feel…', ['Glad I said my piece', 'compete'], ['Closer, if we worked it out', 'collaborate'], ['Fine, it’s sorted', 'compromise'], ['Relieved it’s over', 'avoid'], ['Worried they’re still upset', 'accommodate']),
  ],
};

const LARK_OWL: PersonaQuiz = {
  id: 'lark-owl', title: 'Lark or Owl', colour: '#f2c46b', kind: 'top',
  blurb: 'Is your body clock set for sunrise, midnight, or somewhere in between?',
  basedOn: 'Inspired by research on chronotypes (morningness and eveningness)',
  outcomes: {
    lark: { name: 'The Lark', blurb: 'Up with the sun and sharpest before lunch. You’ve done half your day while others hit snooze.' },
    hummingbird: { name: 'The Hummingbird', blurb: 'Flexible and fairly even through the day. You can bend either way when you need to.' },
    owl: { name: 'The Owl', blurb: 'You come alive after dark. Your best ideas arrive somewhere around 11pm.' },
  },
  questions: [
    pick('With no alarm, you’d wake up…', ['Before seven', 'lark'], ['Around eight or nine', 'hummingbird'], ['Somewhere near lunchtime', 'owl']),
    pick('Your brain works best…', ['First thing in the morning', 'lark'], ['Mid-afternoon', 'hummingbird'], ['Late at night', 'owl']),
    pick('Breakfast is…', ['The best meal of the day', 'lark'], ['Fine, a bit later', 'hummingbird'], ['Something that happens to other people', 'owl']),
    pick('Someone invites you out at 10pm.', ['Too late, I’m in my pyjamas', 'lark'], ['Maybe, if it’s close by', 'hummingbird'], ['The night is young!', 'owl']),
    pick('A 6am start feels…', ['Lovely', 'lark'], ['Doable with coffee', 'hummingbird'], ['Like a punishment', 'owl']),
    pick('Your energy dips…', ['In the evening', 'lark'], ['Just after lunch', 'hummingbird'], ['In the morning', 'owl']),
    pick('Your favourite sky is…', ['A pink sunrise', 'lark'], ['Bright blue midday', 'hummingbird'], ['A clear night full of stars', 'owl']),
  ],
};

const SOCIAL_BATTERY: PersonaQuiz = {
  id: 'social-battery', title: 'Social Battery', colour: '#b4e0cd', kind: 'top',
  blurb: 'Do people charge you up, wear you out, or a bit of both?',
  basedOn: 'Inspired by the introversion–extraversion spectrum',
  outcomes: {
    introvert: { name: 'The Introvert', blurb: 'Your battery charges in quiet. You love your people, in small doses and deep conversations.' },
    ambivert: { name: 'The Ambivert', blurb: 'You can be the life of the party or the one by the bookshelf, depending on the day.' },
    extrovert: { name: 'The Extrovert', blurb: 'Company charges you up. A quiet weekend alone? You’d start texting everyone by Saturday noon.' },
  },
  questions: [
    pick('Three social events in one weekend sounds…', ['Exhausting', 'introvert'], ['Fun, if I get Sunday off', 'ambivert'], ['Perfect', 'extrovert']),
    pick('At a party you know nobody at, you…', ['Find the cat', 'introvert'], ['Chat to one or two people', 'ambivert'], ['Know everyone by the end', 'extrovert']),
    pick('Your phone rings with an unknown number.', ['Let it ring', 'introvert'], ['Answer, a bit warily', 'ambivert'], ['Answer cheerfully. Who could it be?', 'extrovert']),
    pick('A perfect evening is…', ['A book and silence', 'introvert'], ['Dinner with a couple of close friends', 'ambivert'], ['A big noisy table', 'extrovert']),
    pick('Working in a busy café is…', ['Too distracting', 'introvert'], ['Nice now and then', 'ambivert'], ['How I work best', 'extrovert']),
    pick('After a day alone you feel…', ['Restored', 'introvert'], ['Ready to see people', 'ambivert'], ['Restless', 'extrovert']),
  ],
};

const STAR_SIGN: PersonaQuiz = {
  id: 'star-sign', title: 'Star Sign', colour: '#c8b5e6', kind: 'birthday',
  blurb: 'No questions, just your birthday. We keep your sign, never the date.',
  basedOn: 'Western tropical zodiac sun signs',
  outcomes: {
    aries: { name: '♈ Aries · The Ram', blurb: 'Fire sign. Bold, quick to start things, and first through any door.' },
    taurus: { name: '♉ Taurus · The Bull', blurb: 'Earth sign. Steady and loyal, with excellent taste in cushions.' },
    gemini: { name: '♊ Gemini · The Twins', blurb: 'Air sign. Curious, chatty and always halfway through two stories.' },
    cancer: { name: '♋ Cancer · The Crab', blurb: 'Water sign. Protective and caring. Home is where your heart lives.' },
    leo: { name: '♌ Leo · The Lion', blurb: 'Fire sign. Warm, generous and born to make an entrance.' },
    virgo: { name: '♍ Virgo · The Maiden', blurb: 'Earth sign. Thoughtful and precise. Your bookshelf is alphabetised.' },
    libra: { name: '♎ Libra · The Scales', blurb: 'Air sign. Charming and fair, and you can always see both sides.' },
    scorpio: { name: '♏ Scorpio · The Scorpion', blurb: 'Water sign. Intense, private and fiercely loyal.' },
    sagittarius: { name: '♐ Sagittarius · The Archer', blurb: 'Fire sign. Adventurous and optimistic, with one eye on the horizon.' },
    capricorn: { name: '♑ Capricorn · The Sea-goat', blurb: 'Earth sign. Patient and ambitious. You get there in the end.' },
    aquarius: { name: '♒ Aquarius · The Water-bearer', blurb: 'Air sign. Inventive and independent, a bit ahead of everyone.' },
    pisces: { name: '♓ Pisces · The Fish', blurb: 'Water sign. Dreamy and empathetic, with a rich imagination.' },
  },
  questions: [],
};

const ELEMENT: PersonaQuiz = {
  id: 'element', title: 'Your Element', colour: '#e3a986', kind: 'top',
  blurb: 'Earth, water, air or fire. Which one are you made of?',
  basedOn: 'Based on the classical four elements',
  outcomes: {
    earth: { name: 'Earth', blurb: 'Grounded, patient and practical. People lean on you, and you don’t wobble.' },
    water: { name: 'Water', blurb: 'Intuitive and adaptable. You flow round obstacles and feel things deeply.' },
    air: { name: 'Air', blurb: 'Quick-witted and full of ideas. You bring fresh perspective wherever you go.' },
    fire: { name: 'Fire', blurb: 'Passionate and lively. You light things up, and occasionally singe them.' },
  },
  questions: [
    pick('Pick a place to sit and think.', ['Under an old tree', 'earth'], ['By a river', 'water'], ['On a windy hilltop', 'air'], ['Beside a campfire', 'fire']),
    pick('Your friends rely on you for…', ['Sensible advice', 'earth'], ['Understanding', 'water'], ['New ideas', 'air'], ['Getting them excited', 'fire']),
    pick('Pick a hobby.', ['Gardening', 'earth'], ['Swimming', 'water'], ['Kite flying', 'air'], ['Cooking with lots of chilli', 'fire']),
    pick('In an argument you…', ['Hold your ground', 'earth'], ['Feel your way through', 'water'], ['Debate it logically', 'air'], ['Get heated', 'fire']),
    pick('Which colour palette?', ['Moss and clay', 'earth'], ['Sea blues', 'water'], ['Clouds and pale sky', 'air'], ['Sunset orange', 'fire']),
    pick('Your energy is…', ['Slow and steady', 'earth'], ['Ebbing and flowing', 'water'], ['Restless and changeable', 'air'], ['Big bursts', 'fire']),
    pick('A perfect gift for you…', ['A potted plant', 'earth'], ['A bath bomb', 'water'], ['A good book of ideas', 'air'], ['Concert tickets', 'fire']),
  ],
};

const COURT_SET: PersonaQuiz = {
  id: 'court-set', title: 'Which Set Are You?', colour: '#dca46a', kind: 'top',
  blurb: 'Cosy Cabin, Seaside, Greenhouse or Sunday Studio: which flat would be yours?',
  basedOn: 'An original Pebble Court quiz',
  outcomes: {
    cabin: { name: 'Cosy Cabin', blurb: 'Plaid blankets, a crackling stove and a mug that never goes cold. You’re a home-maker.' },
    seaside: { name: 'Seaside', blurb: 'Stripes, salt air and sand in your shoes. You’re breezy and easy to be around.' },
    garden: { name: 'Greenhouse', blurb: 'Leafy, warm and quietly growing. You tend to things and people.' },
    studio: { name: 'Sunday Studio', blurb: 'Soft curves, a record spinning, terrazzo underfoot. You’ve got an eye for style.' },
  },
  questions: [
    pick('Pick a drink.', ['Hot chocolate', 'cabin'], ['Lemonade', 'seaside'], ['Mint tea', 'garden'], ['A flat white', 'studio']),
    pick('Pick a sound.', ['Rain on the roof', 'cabin'], ['Waves', 'seaside'], ['Birdsong', 'garden'], ['A crackly vinyl record', 'studio']),
    pick('Your ideal Sunday…', ['Blanket, book, stove', 'cabin'], ['A long walk on the beach', 'seaside'], ['Repotting everything', 'garden'], ['Brunch and a gallery', 'studio']),
    pick('Pick a pattern.', ['Tartan', 'cabin'], ['Stripes', 'seaside'], ['Leaves', 'garden'], ['Squiggles', 'studio']),
    pick('What’s on your windowsill?', ['A candle', 'cabin'], ['Shells and sea glass', 'seaside'], ['Seedlings', 'garden'], ['A sculptural vase', 'studio']),
    pick('Your friends describe you as…', ['Cosy', 'cabin'], ['Breezy', 'seaside'], ['Nurturing', 'garden'], ['Stylish', 'studio']),
    pick('Pick a season to decorate for.', ['Deep winter', 'cabin'], ['High summer', 'seaside'], ['Spring', 'garden'], ['Any season, as long as it’s chic', 'studio']),
  ],
};

const HOUSEPLANT: PersonaQuiz = {
  id: 'houseplant', title: 'Which Houseplant?', colour: '#86b56f', kind: 'top',
  blurb: 'Every flat needs a plant. Which one are you?',
  basedOn: 'An original Pebble Court quiz',
  outcomes: {
    fern: { name: 'The Fern', blurb: 'Lush, soft and a little sensitive. Treat you right and you absolutely thrive.' },
    cactus: { name: 'The Cactus', blurb: 'Independent and resilient. Prickly to strangers, a softie to friends.' },
    monstera: { name: 'The Monstera', blurb: 'Big, bold and dramatic. You fill a room without trying.' },
    ivy: { name: 'The Trailing Ivy', blurb: 'Adaptable and sociable. You reach out and connect everyone together.' },
  },
  questions: [
    pick('How much attention do you need?', ['A fair bit, honestly', 'fern'], ['Leave me be', 'cactus'], ['Notice me!', 'monstera'], ['Some, but I’m flexible', 'ivy']),
    pick('Your ideal spot in the flat…', ['A shady corner with steam from the kettle', 'fern'], ['The sunniest windowsill', 'cactus'], ['Centre stage', 'monstera'], ['Somewhere up high, spilling over', 'ivy']),
    pick('When life gets tough you…', ['Wilt a bit, then bounce back', 'fern'], ['Barely notice', 'cactus'], ['Make it everyone’s business', 'monstera'], ['Find a way round it', 'ivy']),
    pick('Pick a word.', ['Gentle', 'fern'], ['Tough', 'cactus'], ['Fabulous', 'monstera'], ['Friendly', 'ivy']),
    pick('At a party you…', ['Stick near a close friend', 'fern'], ['Arrive late, leave early', 'cactus'], ['Are the main event', 'monstera'], ['Introduce everyone to everyone', 'ivy']),
    pick('Your style…', ['Soft knits', 'fern'], ['Minimal', 'cactus'], ['Statement pieces', 'monstera'], ['Mix and match', 'ivy']),
  ],
};

const GUEST: PersonaQuiz = {
  id: 'guest', title: 'What Kind of Guest?', colour: '#f2bcc4', kind: 'top',
  blurb: 'Everyone’s a different sort of visitor. Find out which you are.',
  basedOn: 'An original Pebble Court quiz',
  outcomes: {
    early: { name: 'The Early Bird', blurb: 'You arrive before the host is dressed, and happily help put the bunting up.' },
    snacks: { name: 'The Bringer of Snacks', blurb: 'You never arrive empty-handed. Everyone is secretly glad you came.' },
    corner: { name: 'The Corner Philosopher', blurb: 'You find one person and talk about the meaning of life until midnight.' },
    dancer: { name: 'The Dancefloor Starter', blurb: 'Somebody has to go first, and it’s always you.' },
    last: { name: 'The Last to Leave', blurb: 'You stay to help with the washing-up and one more cup of tea.' },
  },
  questions: [
    pick('You arrive…', ['Fifteen minutes early', 'early'], ['Right on time, arms full of crisps', 'snacks'], ['Quietly, and find a comfy spot', 'corner'], ['Making an entrance', 'dancer'], ['Late-ish, but planning to stay', 'last']),
    pick('Your party trick is…', ['Setting things up', 'early'], ['Excellent homemade dip', 'snacks'], ['Asking the big questions', 'corner'], ['Getting everyone moving', 'dancer'], ['Making the host laugh at the end', 'last']),
    pick('You’re most often found…', ['In the kitchen, helping', 'early'], ['By the food table', 'snacks'], ['On the stairs, deep in conversation', 'corner'], ['In the middle of the room', 'dancer'], ['On the sofa, settled in', 'last']),
    pick('Your host thanks you for…', ['Helping set up', 'early'], ['The brownies', 'snacks'], ['A brilliant chat', 'corner'], ['The atmosphere', 'dancer'], ['Doing the dishes', 'last']),
    pick('Leaving, you say…', ['“Let me know if you need help next time!”', 'early'], ['“Keep the leftovers!”', 'snacks'], ['“We must finish that conversation”', 'corner'], ['“Same time next week?”', 'dancer'], ['“Oh, is it really two o’clock?”', 'last']),
    pick('Which do you leave in the guestbook?', ['A helpful tip', 'early'], ['A recipe', 'snacks'], ['A quote', 'corner'], ['Lots of exclamation marks', 'dancer'], ['A long thank-you', 'last']),
  ],
};

const SEASON: PersonaQuiz = {
  id: 'season', title: 'Which Season?', colour: '#d9846b', kind: 'top',
  blurb: 'Fresh, bright, golden or snug: which time of year matches you?',
  basedOn: 'An original Pebble Court quiz',
  outcomes: {
    spring: { name: 'Spring', blurb: 'Hopeful and fresh. You’re always starting something new.' },
    summer: { name: 'Summer', blurb: 'Bright, warm and outgoing. Long evenings were made for you.' },
    autumn: { name: 'Autumn', blurb: 'Thoughtful and cosy, with a soft spot for crunchy leaves and new stationery.' },
    winter: { name: 'Winter', blurb: 'Calm and reflective. You love a quiet evening and a warm light in the window.' },
  },
  questions: [
    pick('Pick a smell.', ['Cut grass', 'spring'], ['Suncream', 'summer'], ['Woodsmoke', 'autumn'], ['Pine needles', 'winter']),
    pick('Pick a treat.', ['Strawberries', 'spring'], ['Ice lolly', 'summer'], ['Apple crumble', 'autumn'], ['Hot soup', 'winter']),
    pick('Your energy right now…', ['Fresh and ready to grow', 'spring'], ['Sunny and social', 'summer'], ['Mellow and reflective', 'autumn'], ['Quiet and restful', 'winter']),
    pick('A perfect walk is…', ['Through blossom', 'spring'], ['Along the beach', 'summer'], ['Through crunchy leaves', 'autumn'], ['Through fresh snow', 'winter']),
    pick('Pick a colour.', ['Pale green', 'spring'], ['Sunshine yellow', 'summer'], ['Rust orange', 'autumn'], ['Frosty blue', 'winter']),
    pick('Your favourite thing about evenings…', ['They’re getting lighter', 'spring'], ['Eating outside', 'summer'], ['Lighting candles', 'autumn'], ['Getting cosy early', 'winter']),
  ],
};

export const PERSONA_QUIZZES: PersonaQuiz[] = [
  FOUR_LETTERS, NINE_POINTS, BIG_FIVE, TEMPERAMENTS, FOUR_STYLES, WORK_COMPASS, CONFLICT,
  LARK_OWL, SOCIAL_BATTERY, STAR_SIGN, ELEMENT, COURT_SET, HOUSEPLANT, GUEST, SEASON,
];
export const PERSONA_BY_ID: Record<string, PersonaQuiz> = Object.fromEntries(PERSONA_QUIZZES.map((q) => [q.id, q]));

// ---------------------------------------------------------------- scoring

export interface PersonaResult {
  outcome: string;
  /** Raw score per outcome key (or per letter for 'axes'). */
  scores: Record<string, number>;
}

/** Score a set of answers (option index per question). Throws on malformed input. */
export function scorePersona(quiz: PersonaQuiz, answers: number[]): PersonaResult {
  if (quiz.kind === 'birthday') throw new Error('Use starSign for this quiz');
  if (!Array.isArray(answers) || answers.length !== quiz.questions.length) throw new Error('Answer every question');
  const scores: Record<string, number> = {};
  const lastHit: Record<string, number> = {};
  const keys = quiz.kind === 'axes' ? quiz.axes!.flat() : Object.keys(quiz.outcomes);
  for (const k of keys) { scores[k] = 0; lastHit[k] = -1; }
  answers.forEach((a, i) => {
    const opt = quiz.questions[i].options[a];
    if (!Number.isInteger(a) || !opt) throw new Error('That answer isn’t one of the options');
    for (const [k, v] of Object.entries(opt.s)) { scores[k] += v; if (v > 0) lastHit[k] = i; }
  });
  if (quiz.kind === 'axes') {
    // Each axis is decided by an odd number of questions, so there are no ties;
    // if a future quiz adds an even count, a tie goes to the more recent answer.
    const outcome = quiz.axes!.map(([a, b]) =>
      scores[a] > scores[b] || (scores[a] === scores[b] && lastHit[a] > lastHit[b]) ? a : b).join('');
    return { outcome, scores };
  }
  // Highest score wins; on a tie, the outcome you picked most recently.
  const outcome = keys.reduce((best, k) =>
    scores[k] > scores[best] || (scores[k] === scores[best] && lastHit[k] > lastHit[best]) ? k : best, keys[0]);
  return { outcome, scores };
}

const SIGN_STARTS: [number, number, string][] = [
  [1, 20, 'aquarius'], [2, 19, 'pisces'], [3, 21, 'aries'], [4, 20, 'taurus'], [5, 21, 'gemini'], [6, 21, 'cancer'],
  [7, 23, 'leo'], [8, 23, 'virgo'], [9, 23, 'libra'], [10, 23, 'scorpio'], [11, 22, 'sagittarius'], [12, 22, 'capricorn'],
];

/** Sun sign from month (1–12) and day. Cusp dates use the common convention and can shift by a day year to year. */
export function starSign(month: number, day: number): string {
  const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > daysIn[month - 1]) {
    throw new Error('That isn’t a real date');
  }
  let sign = 'capricorn'; // 1 Jan – 19 Jan
  for (const [m, d, s] of SIGN_STARTS) if (month > m || (month === m && day >= d)) sign = s;
  return sign;
}

/** Display text for a stored result, e.g. "INFJ · The Lantern". */
export function outcomeLabel(quizId: string, outcome: string): string {
  const quiz = PERSONA_BY_ID[quizId];
  const o = quiz?.outcomes[outcome];
  if (!o) return outcome;
  return quiz.kind === 'axes' ? `${outcome} · ${o.name}` : o.name;
}

/** Lowest and highest score each key can reach, for drawing result bars. */
export function scoreRange(quiz: PersonaQuiz): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const keys = quiz.kind === 'axes' ? quiz.axes!.flat() : Object.keys(quiz.outcomes);
  for (const k of keys) {
    let lo = 0, hi = 0;
    for (const q of quiz.questions) {
      const vals = q.options.map((o) => o.s[k] ?? 0);
      lo += Math.min(...vals);
      hi += Math.max(...vals);
    }
    out[k] = [lo, hi];
  }
  return out;
}
