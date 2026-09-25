/**
 * findmyVybe Help Center -- the single source of truth for both the
 * searchable Help Center page (app/help/page.tsx) and the VybeHelp chat
 * agent (components/VybeHelp.tsx + app/api/help/ask/route.ts). One
 * content file, two surfaces, so an answer never drifts between "browse
 * the FAQ" and "ask VybeHelp" -- they read from the exact same entries.
 *
 * Every answer here describes real, shipped behavior -- checked against
 * the actual routes/components rather than generic dating-app copy.
 * Update this file whenever a feature changes; nothing else needs to
 * change in lockstep (the search page and the chat agent just re-render
 * from whatever is here).
 */

export interface HelpCategory {
  slug: string;
  label: string;
  emoji: string;
}

export interface HelpEntry {
  id: string;
  category: string; // HelpCategory.slug
  question: string;
  answer: string;
  keywords: string[]; // extra search terms not already in the question/answer
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { slug: 'getting-started', label: 'Getting started', emoji: '👋' },
  { slug: 'account-login', label: 'Account & signing in', emoji: '🔑' },
  { slug: 'profile', label: 'Your profile', emoji: '🧑' },
  { slug: 'vybes', label: 'Vybes: Just Vibing, Something Real, Rishta Ready', emoji: '💫' },
  { slug: 'discover', label: 'Discover & matching', emoji: '🌀' },
  { slug: 'chat', label: 'Chatting after a match', emoji: '💬' },
  { slug: 'safety', label: 'Safety, blocking & reporting', emoji: '🛡️' },
  { slug: 'privacy-location', label: 'Privacy & location', emoji: '📍' },
  { slug: 'verification', label: 'Verification', emoji: '✅' },
  { slug: 'mobile-app', label: 'iOS & Android app', emoji: '📱' },
  { slug: 'account-management', label: 'Managing your account', emoji: '⚙️' },
  { slug: 'troubleshooting', label: 'Troubleshooting', emoji: '🔧' },
  { slug: 'contact', label: 'Still stuck?', emoji: '🙋' },
];

export const HELP_ENTRIES: HelpEntry[] = [
  // ---------------------------------------------------------------- getting-started
  {
    id: 'gs-what-is-findmyvybe',
    category: 'getting-started',
    question: 'What is findmyVybe?',
    answer:
      "findmyVybe is a dating and matchmaking app built for how people actually date today -- you tell it upfront whether you're Just Vibing, looking for Something Real, or Rishta Ready (open to family-involved, marriage-track matching), and it uses that -- plus a few quick \"Vybe Check\" prompts -- to explain *why* you matched with someone, not just that you did. No endless swiping through strangers with zero context.",
    keywords: ['about', 'overview', 'what is this app'],
  },
  {
    id: 'gs-cities',
    category: 'getting-started',
    question: 'Which cities is findmyVybe available in?',
    answer:
      'findmyVybe currently matches people within the same city, across Bengaluru, Mumbai, Delhi NCR, Pune, Hyderabad, and Chennai. Set your city during onboarding -- Discover only shows people in the same city as you.',
    keywords: ['location', 'cities', 'available', 'where'],
  },
  {
    id: 'gs-free',
    category: 'getting-started',
    question: 'Is findmyVybe free to use?',
    answer:
      "Yes -- there's no paid tier or subscription right now. Every feature described in this Help Center (matching, chat, Vybe Check, verification, location distance) is available to everyone at no cost.",
    keywords: ['price', 'cost', 'subscription', 'premium', 'paywall', 'free'],
  },
  {
    id: 'gs-age',
    category: 'getting-started',
    question: 'What is the minimum age to use findmyVybe?',
    answer:
      'You must be 18 or older to create a findmyVybe account. Your date of birth is collected during onboarding and is not editable afterward, so double-check it when you enter it.',
    keywords: ['minimum age', '18+', 'age requirement'],
  },
  {
    id: 'gs-different',
    category: 'getting-started',
    question: 'How is findmyVybe different from other dating apps?',
    answer:
      "Two things: (1) intent is explicit and visible from the start -- you and everyone you see has already said whether they're Just Vibing, want Something Real, or are Rishta Ready, so there's no guessing games; (2) every match comes with a plain-language explanation of what you actually have in common -- shared interests, a shared \"tribe,\" matching Vybe Check answers -- shown right on the match screen, not buried or absent entirely.",
    keywords: ['why findmyvybe', 'unique', 'compare'],
  },

  // ---------------------------------------------------------------- account-login
  {
    id: 'al-sign-up',
    category: 'account-login',
    question: 'How do I sign up or log in?',
    answer:
      "From the welcome screen, choose to continue with your phone number (you'll get a one-time code by SMS) or with Google, Facebook, or Instagram. First time in, you'll be taken through onboarding to set up your profile; if you already have a profile, you'll land straight on Discover.",
    keywords: ['sign up', 'log in', 'register', 'create account', 'otp'],
  },
  {
    id: 'al-otp-not-received',
    category: 'account-login',
    question: "I didn't receive my OTP code -- what do I do?",
    answer:
      "Double-check the phone number you entered (including the country code), then use the \"Resend code\" option -- SMS delivery can occasionally take a minute. If it still doesn't arrive after a couple of tries, switch to signing in with Google, Facebook, or Instagram instead, or reach out from the Contact section below.",
    keywords: ['otp', 'code not received', 'sms', 'verification code'],
  },
  {
    id: 'al-same-account-everywhere',
    category: 'account-login',
    question: 'Is my account the same on the website and the mobile app?',
    answer:
      "Yes. The iOS and Android apps and the website all connect to the exact same account and data -- there's nothing separate to set up. Log in with the same phone number or social account on any of them and you'll see the same profile, matches, and chats.",
    keywords: ['web and app', 'same account', 'sync'],
  },
  {
    id: 'al-change-phone-email',
    category: 'account-login',
    question: 'Can I change the phone number or email linked to my account?',
    answer:
      "Not directly from your Profile settings today. If you need to change the phone number or social account tied to your login, reach out from the Contact section below and the team can help move things over.",
    keywords: ['change phone number', 'change email', 'update login'],
  },
  {
    id: 'al-multiple-devices',
    category: 'account-login',
    question: 'Can I be logged in on more than one device at once?',
    answer: "Yes -- log in on your phone and your laptop's browser at the same time if you like; both stay in sync with the same account.",
    keywords: ['multiple devices', 'two phones', 'logged in everywhere'],
  },
  {
    id: 'al-logout',
    category: 'account-login',
    question: 'How do I log out?',
    answer:
      'On the web (wider screens), there is a "Log out" link in the top bar next to the navigation. On the mobile app or a phone-width browser, open Profile and scroll to the bottom -- there is a "Log out" button there.',
    keywords: ['log out', 'sign out', 'logout'],
  },
  // ---------------------------------------------------------------- profile
  {
    id: 'pr-onboarding-steps',
    category: 'profile',
    question: 'What do I need to fill out when setting up my profile?',
    answer:
      "Onboarding walks you through: your Vybe (intent), the basics (name, birthday, gender, who you're looking for, city), at least one photo, your interests, and a couple of short Vybe Check prompts. Something Real and Rishta Ready also ask about your \"tribe\" (communities you identify with) and relationship values; Rishta Ready adds a Future Vibe section (home, family, career, money) and a children preference. Just Vibing keeps it lighter -- date vibes and what you're up for tonight instead.",
    keywords: ['onboarding', 'sign up steps', 'profile setup'],
  },
  {
    id: 'pr-edit-later',
    category: 'profile',
    question: 'Can I edit my profile after I finish onboarding?',
    answer:
      'Yes -- every section on your Profile screen has an "Edit" option next to it: photos, bio, interests, tribes, relationship values or Vybe Check answers, and (for Rishta Ready) values, future vibe, and children preference. Changes save immediately and show up for anyone viewing your profile right away.',
    keywords: ['edit profile', 'update profile', 'change bio'],
  },
  {
    id: 'pr-photos',
    category: 'profile',
    question: 'How many photos can I add, and which one is shown first?',
    answer:
      'You can add multiple photos from your Profile screen. Whichever one is marked "Primary" is your main photo shown in Discover and to your matches -- open the photo section and choose "+Add" or reorder to change it.',
    keywords: ['photos', 'primary photo', 'upload picture'],
  },
  {
    id: 'pr-bio',
    category: 'profile',
    question: 'What should I write in my bio?',
    answer:
      "Anything that gives a real sense of you -- what you're into, how you spend a weekend, what you're looking for. There's no strict length requirement, but a short, specific bio tends to get better conversation starters than a generic one.",
    keywords: ['bio', 'about me', 'write bio'],
  },
  {
    id: 'pr-interests-tribes',
    category: 'profile',
    question: 'What is a "tribe," and how is it different from interests?',
    answer:
      "Interests are the quick tags for what you're into (Coffee, Gaming, Travel, and so on). A tribe is a broader community you identify with (like Tech, Booktok, or Run Club), and each tribe lets you pick specific sub-communities under it for more precision. Tribes are part of Something Real and Rishta Ready onboarding, not Just Vibing.",
    keywords: ['tribe', 'sub-community', 'interests vs tribe'],
  },
  {
    id: 'pr-verification-status',
    category: 'profile',
    question: 'What does the verification status on my profile mean?',
    answer:
      'Your Profile screen shows one of: "ID + liveness verified," "Verification in progress," or "Not verified yet." See the Verification section below for what it involves and why it is worth doing.',
    keywords: ['verified badge', 'verification status'],
  },
  {
    id: 'pr-quiet-mode',
    category: 'profile',
    question: 'What does Quiet Mode do?',
    answer:
      "Quiet Mode pauses you from Discover without deleting your profile or any of your matches and chats -- useful if you want a break without starting over later. Toggle it from Profile. While it's on, you won't appear in anyone else's Discover feed, but your existing matches and conversations stay exactly as they were.",
    keywords: ['quiet mode', 'pause profile', 'take a break', 'hide profile'],
  },

  // ---------------------------------------------------------------- vybes
  {
    id: 'vy-three-intents',
    category: 'vybes',
    question: "What's the difference between Just Vibing, Something Real, and Rishta Ready?",
    answer:
      "Just Vibing is for casual, low-pressure connection -- no pressure toward anything serious. Something Real is for people looking for a genuine relationship. Rishta Ready is for people who are open to family-involved, marriage-track matching (values, future plans, and family preview are part of that flow). Whichever you pick is shown to everyone you match with, so there's no ambiguity about what you're each looking for.",
    keywords: ['just vibing', 'something real', 'rishta ready', 'intent', 'vybe meaning'],
  },
  {
    id: 'vy-switch-intent',
    category: 'vybes',
    question: 'Can I switch my Vybe (intent) after setting it?',
    answer:
      'Yes, any time -- go to Profile, find the Intent section, and tap "Switch" next to the one you want. It takes you back into onboarding to fill in the fields specific to your new intent (for example, Rishta Ready needs a couple of extra basics like where you would prefer to live). Your name, birthday, photos, bio, and interests carry over; anything intent-specific (tribes, relationship values, Vybe Check answers, values/future vibe/children for Rishta Ready) resets so you fill it in fresh for the new intent.',
    keywords: ['switch intent', 'change vybe', 'change intent'],
  },
  {
    id: 'vy-switch-affects-matches',
    category: 'vybes',
    question: 'If I switch my intent, does it affect my existing matches and chats?',
    answer: "No -- switching your Vybe only changes what's shown on your profile going forward and what you'll see in Discover next. It doesn't unmatch anyone or touch your existing conversations.",
    keywords: ['switch intent matches', 'change intent chats'],
  },
  {
    id: 'vy-vybe-check',
    category: 'vybes',
    question: 'What is the Vybe Check?',
    answer:
      "A couple of short, forced-choice prompts during onboarding (for example, \"talk it out or take space first?\"). They're not a compatibility quiz with a score -- they're used to explain specific things you have in common (or interesting differences) with a match, shown as one of the reasons on your match screen.",
    keywords: ['vybe check', 'prompts', 'compatibility questions'],
  },
  {
    id: 'vy-family-preview',
    category: 'vybes',
    question: 'What is the "family preview link" for Rishta Ready?',
    answer:
      'It is an optional, shareable read-only link to a simplified version of your profile -- meant for sharing with family, if that is part of how you are comfortable being matched. Turn it on from Profile (Rishta Ready only); when it is on, your Profile screen shows the link to copy and share. Turning it off disables the link immediately.',
    keywords: ['family preview', 'share with family', 'rishta ready family'],
  },
  {
    id: 'vy-rishta-vs-something-real',
    category: 'vybes',
    question: "I'm not sure if I want Something Real or Rishta Ready -- which should I pick?",
    answer:
      'Something Real is right if you want a genuine relationship but want to get there organically, without family involvement being part of the picture. Rishta Ready is for when you are open to that -- matching on values, future plans, and (optionally) a family-shareable profile from the start. Neither is "more serious" than the other -- they are just different paths, and you can switch between them any time from Profile.',
    keywords: ['which intent', 'rishta ready vs something real'],
  },
  // ---------------------------------------------------------------- discover
  {
    id: 'di-how-feed-works',
    category: 'discover',
    question: 'How does the Discover feed decide who I see?',
    answer:
      "Discover only shows people in your city who match your stated gender preference and haven't been swiped, blocked, or already matched with. Within that pool, profiles are ranked using things like shared interests, tribe overlap, and how recently active someone's been -- so it's not a random shuffle, but it's also not a rigid queue; refreshing later can surface a different order.",
    keywords: ['discover feed', 'how matching works', 'ranking'],
  },
  {
    id: 'di-why-matched',
    category: 'discover',
    question: 'How do I know why I matched with someone?',
    answer:
      'Open the match screen right after you match (or the Match Profile panel in an existing chat) -- it lists the actual shared signals behind the match: things like a matching Vybe Check answer, a shared tribe or sub-community, common interests, or a compatible relationship value, each with a short explanation. If there is not a strong specific signal, it says so honestly rather than making one up.',
    keywords: ['why we matched', 'match reasons', 'match explanation'],
  },
  {
    id: 'di-distance',
    category: 'discover',
    question: 'What does the distance (like "6 km away") next to a profile mean?',
    answer:
      "It's an estimate of how far apart you and that person are, shown only as a rounded figure (or \"Nearby\" under 1 km) -- never anyone's exact coordinates. If you see a distance with a \"~\" in front of it, that means it's a same-city estimate rather than a precise one, because one or both of you haven't shared exact location yet (see the Privacy & location section for how to turn that on).",
    keywords: ['distance', 'how far away', 'km away', 'nearby'],
  },
  {
    id: 'di-running-out',
    category: 'discover',
    question: "I've run out of new profiles in Discover -- now what?",
    answer:
      "That means you've seen everyone currently eligible in your city and preferences. Check back later as new people join or become active again -- there's no way to force more profiles to appear immediately. In the meantime, your existing matches are a good place to focus.",
    keywords: ['no more profiles', 'ran out', 'empty discover', 'nobody left'],
  },
  {
    id: 'di-unswipe',
    category: 'discover',
    question: 'Can I undo a swipe?',
    answer: "There's currently no way to undo or take back a swipe once it's made -- take a moment before you decide.",
    keywords: ['undo swipe', 'take back swipe', 'unswipe'],
  },
  {
    id: 'di-who-sees-my-profile',
    category: 'discover',
    question: 'Who can see my profile?',
    answer:
      "Anyone in the same city as you, matching your stated preferences, who hasn't been blocked and isn't excluded by Quiet Mode -- i.e., the same pool Discover pulls your candidates from, just in reverse. If you turn on Quiet Mode, you stop appearing to anyone.",
    keywords: ['who sees my profile', 'visibility'],
  },
  {
    id: 'di-mutual-match',
    category: 'discover',
    question: 'How does matching actually work -- do we both have to like each other?',
    answer: "Yes -- a match only happens when you and the other person have both swiped to express interest. If only one side has, nothing is shared and no conversation opens yet.",
    keywords: ['mutual match', 'both like', 'how matches form'],
  },
  {
    id: 'di-rematch',
    category: 'discover',
    question: 'I accidentally unmatched someone -- can we match again?',
    answer:
      "An unmatch is final on our end -- it removes the connection and hides the conversation for both of you, and there's no automatic \"undo.\" If you both still want to connect, the other person would need to reappear in your Discover feed and you'd both swipe again as if for the first time.",
    keywords: ['unmatched by accident', 'rematch', 'undo unmatch'],
  },

  // ---------------------------------------------------------------- chat
  {
    id: 'ch-starting',
    category: 'chat',
    question: 'What can I do right after matching with someone?',
    answer:
      "The match screen gives you a few starting points: jump straight into chatting, use \"⚡ Vybe\" or \"🎯 Ask about me\" to open with something specific tied to what you actually have in common, or just say a quick hello from a few suggested openers. None of these are required -- they're just there so you're never staring at a blank message box.",
    keywords: ['start conversation', 'match screen', 'ask about me', 'opening message'],
  },
  {
    id: 'ch-plan',
    category: 'chat',
    question: 'How does "Make a plan" work?',
    answer:
      "Once a conversation has a bit of back-and-forth, a \"✨ Make a plan\" option unlocks in the chat. It's a short step-by-step wizard -- pick an activity, a vibe, and a time (including day-part options like evening or night) -- that sends a structured plan message to the other person, who can respond to it. Before it's sent, you'll see a short safety reminder about meeting in person.",
    keywords: ['make a plan', 'plan a date', 'schedule meetup'],
  },
  {
    id: 'ch-reply-like',
    category: 'chat',
    question: 'Can I reply to a specific message or like one?',
    answer:
      'Yes -- under a message bubble you will find a "↩ Reply" option, which quotes that message above your next one, and a heart/like button. Both work in either direction in the conversation.',
    keywords: ['reply to message', 'like a message', 'quote message'],
  },
  {
    id: 'ch-emoji',
    category: 'chat',
    question: 'How do I send an emoji?',
    answer: 'Tap the emoji icon next to the message box to open a picker with a full set of emoji to choose from.',
    keywords: ['emoji', 'send emoji', 'emoji picker'],
  },
  {
    id: 'ch-mute',
    category: 'chat',
    question: 'Can I mute a conversation without unmatching or blocking?',
    answer:
      'Yes -- open the "..." menu in a chat and choose "🔕 Mute." It stops new-message notifications for that conversation without affecting the match, the other person\'s ability to message you, or your message history. Choose "🔔 Unmute" the same way to turn it back on.',
    keywords: ['mute chat', 'mute conversation', 'stop notifications'],
  },
  {
    id: 'ch-delete-conversation',
    category: 'chat',
    question: "What's the difference between deleting a conversation and unmatching?",
    answer:
      'Deleting a conversation (from the "..." menu) hides it from your view -- it is a tidying-up action, more final-feeling than mute, but it does not end the match itself the way unmatching does. Unmatching (also in the "..." menu) ends the connection entirely for both of you.',
    keywords: ['delete conversation', 'delete chat', 'unmatch vs delete'],
  },
  {
    id: 'ch-video-call',
    category: 'chat',
    question: 'Does findmyVybe have video calling?',
    answer: "Not currently -- video calling isn't available as a chat option right now. Plans and in-app messaging are the way to coordinate meeting up.",
    keywords: ['video call', 'video chat', 'facetime'],
  },
  {
    id: 'ch-notifications',
    category: 'chat',
    question: 'Will I get a notification for a new message?',
    answer:
      "Push notifications for new messages and matches aren't available yet -- for now, check the app directly for new activity. This is on the roadmap.",
    keywords: ['push notification', 'message alert', 'notify me'],
  },
  {
    id: 'ch-date-feedback',
    category: 'chat',
    question: "What's the \"how did it go\" prompt about after meeting up?",
    answer:
      "After enough back-and-forth in a chat, you may see a short check-in asking how a plan or meetup went and whether you'd like to keep chatting. It's optional and just helps make sure the conversation reflects where things actually stand -- it's not shared with the other person as a rating of them.",
    keywords: ['date feedback', 'how did it go', 'post date check-in'],
  },
  {
    id: 'ch-match-profile-panel',
    category: 'chat',
    question: "What's in the Match Profile panel inside a chat?",
    answer:
      "It's the fuller view of your match from inside the conversation -- their photos, bio, city and distance (if shared), shared interests and tribes, and (for Rishta Ready) values, future vibe, and children preference. It's the same \"why you matched\" context from the match screen, always reachable while you're chatting.",
    keywords: ['match profile', 'view profile in chat'],
  },
  // ---------------------------------------------------------------- safety
  {
    id: 'sf-report',
    category: 'safety',
    question: 'How do I report someone?',
    answer:
      'Open the "..." menu in your conversation with them and choose "Report." Pick the reason that fits best -- Inappropriate messages, Fake profile, Harassment, Spam or scam, or Other -- and add any details that would help. Reporting is reviewed by the team and does not, by itself, unmatch or block the person; do that separately if you want to as well.',
    keywords: ['report user', 'report profile', 'flag someone'],
  },
  {
    id: 'sf-block',
    category: 'safety',
    question: 'How do I block someone?',
    answer:
      'Open the "..." menu in your conversation with them and choose "Block." Blocking ends the match, removes the conversation, and prevents them from seeing your profile or appearing in your Discover feed (and vice versa) going forward.',
    keywords: ['block user', 'block someone'],
  },
  {
    id: 'sf-block-vs-report',
    category: 'safety',
    question: "What's the difference between blocking, reporting, and unmatching?",
    answer:
      'Unmatching ends the connection but is the lightest of the three. Blocking does everything unmatching does and additionally prevents that person from ever seeing your profile or matching with you again. Reporting sends the details to the team for review and does not automatically end the match -- you can report and still stay matched, or report and separately block/unmatch, whichever fits the situation.',
    keywords: ['block vs report vs unmatch'],
  },
  {
    id: 'sf-unmatch',
    category: 'safety',
    question: 'How do I unmatch someone?',
    answer: 'Open the "..." menu in your conversation with them and choose "Unmatch." This is final and cannot be undone from either side.',
    keywords: ['unmatch', 'end match', 'remove match'],
  },
  {
    id: 'sf-meeting-tips',
    category: 'safety',
    question: 'What safety tips does findmyVybe give before meeting someone in person?',
    answer:
      "When you use \"Make a plan,\" you'll see a short reminder before it sends: meet in a public place, tell a friend where you're going, and arrange your own transport. These are shown every time you plan a meetup, not just the first.",
    keywords: ['safety tips', 'meeting in person', 'first date safety'],
  },
  {
    id: 'sf-uncomfortable-message',
    category: 'safety',
    question: 'Someone sent me an uncomfortable or inappropriate message -- what should I do?',
    answer:
      "Report it right away (\"...\" menu → Report → Inappropriate messages or Harassment, whichever fits), and block them if you don't want any further contact -- you don't need to wait or respond first.",
    keywords: ['inappropriate message', 'uncomfortable', 'harassment'],
  },
  {
    id: 'sf-fake-profile',
    category: 'safety',
    question: 'I think a profile is fake -- what do I do?',
    answer: 'Report it with the "Fake profile" reason from the "..." chat menu, and consider blocking to stop further contact while the report is reviewed.',
    keywords: ['fake profile', 'catfish', 'scam profile'],
  },

  // ---------------------------------------------------------------- privacy-location
  {
    id: 'pl-location-sharing',
    category: 'privacy-location',
    question: 'How does location sharing work, and is it required?',
    answer:
      'It is entirely optional. Go to Profile → Location and choose "Share" to let your device share your precise location, which lets matches see a more accurate "X km away." You can turn it off any time with "Turn off," which stops sharing immediately. Whether it is on or off, Discover eligibility itself is always based on city, not precise location.',
    keywords: ['location sharing', 'gps', 'turn off location', 'share location'],
  },
  {
    id: 'pl-exact-location',
    category: 'privacy-location',
    question: 'Can anyone see my exact location?',
    answer: 'No -- only a rounded distance (like "3 km away" or "Nearby") is ever shown to anyone else. Your exact coordinates are never exposed, even to your matches.',
    keywords: ['exact location', 'gps coordinates', 'precise location privacy'],
  },
  {
    id: 'pl-approx-distance',
    category: 'privacy-location',
    question: 'Why does someone\'s distance show with a "~" in front of it?',
    answer:
      "That means it's an approximate, same-city estimate rather than a precise one -- it shows up when you or the other person haven't turned on precise location sharing yet. Once both sides share their exact location, the distance shown becomes precise (and loses the \"~\").",
    keywords: ['approximate distance', 'tilde distance', 'estimate'],
  },
  {
    id: 'pl-data-usage',
    category: 'privacy-location',
    question: 'What happens to my data if I stop sharing location?',
    answer: "Turning location off clears your stored coordinates -- nothing is retained for distance calculations once you've turned it off.",
    keywords: ['data privacy', 'stop sharing data'],
  },
  {
    id: 'pl-who-sees-family-preview',
    category: 'privacy-location',
    question: 'Who can see my family preview link if I turn it on?',
    answer: 'Anyone you send the link to -- it is not searchable or discoverable on its own, and it only exists while the toggle is on. Turning it off in Profile disables the link immediately, even for people who already have it.',
    keywords: ['family preview privacy', 'who sees family link'],
  },

  // ---------------------------------------------------------------- verification
  {
    id: 've-what-it-is',
    category: 'verification',
    question: 'What does getting verified involve?',
    answer:
      'Verification confirms your ID and does a quick liveness check (making sure a real photo of you matches, not a photo of a photo). Start it from Profile → Trust layer → "Get verified." Your status shows as Not verified, Verification in progress, or ID + liveness verified.',
    keywords: ['verification process', 'id verification', 'liveness check'],
  },
  {
    id: 've-why-bother',
    category: 'verification',
    question: 'Why should I get verified?',
    answer: "A verified badge signals to potential matches that you're a real, confirmed person -- it tends to build more trust and can improve how much attention your profile gets. It's optional, but recommended.",
    keywords: ['why verify', 'verification benefits'],
  },
  {
    id: 've-failed',
    category: 'verification',
    question: 'My verification failed -- can I try again?',
    answer: 'Yes -- go back to Profile → Trust layer and start verification again. Make sure you are in good lighting and your ID document is clearly visible and not expired.',
    keywords: ['verification failed', 'verification rejected', 'try again'],
  },
  // ---------------------------------------------------------------- mobile-app
  {
    id: 'mo-download',
    category: 'mobile-app',
    question: 'Where do I download the findmyVybe app?',
    answer: "The iOS app is available on the App Store and the Android app on the Play Store -- search \"findmyVybe.\" The mobile app uses the exact same account and data as the website, so there's nothing separate to set up.",
    keywords: ['download app', 'app store', 'play store', 'install app'],
  },
  {
    id: 'mo-location-permission',
    category: 'mobile-app',
    question: 'The app is asking for location permission -- do I have to allow it?',
    answer:
      "No -- it's only needed if you choose to turn on precise location sharing from Profile → Location, so matches can see a more accurate distance. If you deny it or never turn that toggle on, everything else in the app works exactly the same.",
    keywords: ['location permission', 'allow location', 'ios location', 'android location'],
  },
  {
    id: 'mo-updates',
    category: 'mobile-app',
    question: 'Do I need to update the app to get new features?',
    answer:
      "Most of what you'll notice -- new features, fixes, content changes -- updates automatically the next time you open the app, without needing a fresh App Store/Play Store download. Occasionally a deeper change (like a new permission) will need an actual app update, which your phone will prompt you for as usual.",
    keywords: ['app update', 'new version', 'auto update'],
  },
  {
    id: 'mo-app-frozen',
    category: 'mobile-app',
    question: 'The app seems frozen or unresponsive -- what should I try?',
    answer:
      "First, fully close the app (swipe it away from your recent apps, don't just background it) and reopen it. If that doesn't help, check your internet connection, then try restarting your phone. If it's still stuck, see the Troubleshooting section below or reach out from Contact.",
    keywords: ['app frozen', 'app stuck', 'app not responding', 'app crashed'],
  },
  {
    id: 'mo-cant-scroll',
    category: 'mobile-app',
    question: "A screen isn't scrolling -- is something broken?",
    answer:
      "Usually not -- try a firm swipe (touch and drag) rather than a light flick, especially right after the app first opens. If a screen genuinely won't move no matter what you try, force-close and reopen the app; if it persists, let the team know from Contact with which screen it happened on.",
    keywords: ['cant scroll', 'scrolling stuck', 'page frozen'],
  },
  {
    id: 'mo-same-features',
    category: 'mobile-app',
    question: 'Does the mobile app have all the same features as the website?',
    answer: 'Yes -- the iOS and Android apps and the website all run the same findmyVybe experience with the same features. The mobile apps additionally offer real device integrations like location sharing through your phone\'s own permission system.',
    keywords: ['app vs website features', 'mobile vs web'],
  },
  {
    id: 'mo-uninstall-reinstall',
    category: 'mobile-app',
    question: 'If I uninstall and reinstall the app, will I lose anything?',
    answer: "No -- your profile, matches, and chats live on findmyVybe's servers under your account, not on your device. Reinstalling and logging back in brings everything back exactly as it was.",
    keywords: ['uninstall app', 'reinstall', 'lose data'],
  },

  // ---------------------------------------------------------------- account-management
  {
    id: 'ac-delete-account',
    category: 'account-management',
    question: 'How do I delete my account?',
    answer: "There isn't a self-serve delete option in the app yet -- reach out from the Contact section below and the team will take care of it for you.",
    keywords: ['delete account', 'close account', 'remove account'],
  },
  {
    id: 'ac-pause-vs-delete',
    category: 'account-management',
    question: "What's the difference between pausing with Quiet Mode and deleting my account?",
    answer:
      "Quiet Mode is reversible and self-serve -- you disappear from Discover but keep your profile, matches, and chats, and can turn it off yourself any time from Profile. Deleting your account is permanent and currently needs to go through the team (see the Contact section).",
    keywords: ['quiet mode vs delete', 'pause vs delete'],
  },
  {
    id: 'ac-data-request',
    category: 'account-management',
    question: 'Can I request a copy of my data?',
    answer: "Reach out from the Contact section below with your request, and the team will help.",
    keywords: ['data request', 'export data', 'download my data'],
  },
  {
    id: 'ac-multiple-profiles',
    category: 'account-management',
    question: 'Can I have more than one profile?',
    answer: 'Each account is meant to represent one real person with one profile -- creating multiple profiles isn\'t supported and may get flagged as a fake profile if reported.',
    keywords: ['multiple profiles', 'two accounts', 'second profile'],
  },
  // ---------------------------------------------------------------- troubleshooting
  {
    id: 'tr-cant-see-match',
    category: 'troubleshooting',
    question: "I matched with someone but can't find the conversation -- where did it go?",
    answer:
      "Check the Matches tab -- it should be listed there. If you don't see it, check whether you or they may have unmatched or blocked since (which removes the conversation for both sides), or whether you deleted the conversation yourself, which hides it from your list without ending the match.",
    keywords: ['missing match', 'conversation gone', 'match disappeared'],
  },
  {
    id: 'tr-photo-upload-fails',
    category: 'troubleshooting',
    question: "My photo won't upload -- what's wrong?",
    answer:
      "Make sure the file is a standard photo format (JPG or PNG) and not unusually large, and that you have a stable connection. If it keeps failing, try a different photo or switch between Wi-Fi and mobile data, then try again.",
    keywords: ['photo upload failed', 'cant upload photo'],
  },
  {
    id: 'tr-message-not-sending',
    category: 'troubleshooting',
    question: "A message isn't sending -- what should I check?",
    answer: "Check your internet connection first. If it's stable and the message still won't send, force-close and reopen the app -- it usually resolves on the next attempt.",
    keywords: ['message not sending', 'chat not working'],
  },
  {
    id: 'tr-wrong-city-people',
    category: 'troubleshooting',
    question: "I'm seeing people from the wrong city, or nobody from mine -- why?",
    answer:
      'Double-check the city set on your profile (Profile → the basics section) -- Discover strictly matches your set city, so if it is wrong, correct it there. If your city is correct and you are still seeing an empty or odd feed, it may simply mean there are not currently more eligible profiles for you (see "I have run out of new profiles" above).',
    keywords: ['wrong city', 'no matches in my city'],
  },
  {
    id: 'tr-plan-step-stuck',
    category: 'troubleshooting',
    question: 'The "Make a plan" wizard seems stuck on a step -- what do I do?',
    answer: 'Try tapping your selection again, or use the back option in the wizard to re-select the previous step. If it is still stuck after that, force-close and reopen the app and start the plan again.',
    keywords: ['plan wizard stuck', 'make a plan not working'],
  },
  {
    id: 'tr-general-bug',
    category: 'troubleshooting',
    question: "I think I've found a bug that's not covered here -- what should I do?",
    answer: 'Please report it from the Contact section below with as much detail as you can: what screen you were on, what you tapped, and what happened instead of what you expected. Screenshots help a lot.',
    keywords: ['report a bug', 'found a bug', 'something is broken'],
  },

  // ---------------------------------------------------------------- contact
  {
    id: 'co-still-stuck',
    category: 'contact',
    question: 'VybeHelp and this Help Center did not answer my question -- what now?',
    answer:
      "Reach out to the team directly and describe what's going on -- include your account's phone number or the email you signed in with, and as much detail as possible (what screen, what you expected, what happened instead). The team reads and responds to every message.",
    keywords: ['contact support', 'talk to a human', 'need more help'],
  },
  {
    id: 'co-safety-emergency',
    category: 'contact',
    question: "I'm in an unsafe situation right now -- what should I do?",
    answer:
      "If you are in immediate danger, contact local emergency services first -- that comes before anything in the app. Once you're safe, report and block the person involved from the chat's \"...\" menu so the team has a record and they can't contact you again.",
    keywords: ['emergency', 'unsafe', 'in danger', 'immediate help'],
  },
];

// ------------------------------------------------------------------- search

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'how', 'what', 'why', 'when', 'where',
  'i', 'my', 'me', 'you', 'your', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'it', 'this', 'that', 'can',
  'will', 'with', 'about', 'be', 'if', 'so', 'not', 'no', 'have', 'has', 'get', 'got',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export interface HelpSearchResult {
  entry: HelpEntry;
  score: number;
}

/**
 * Plain overlap-scoring search -- no external service, no API key, works
 * identically on the Help Center page and inside VybeHelp. Question-word
 * and keyword matches count for more than answer-word matches (someone
 * searching "reply" should find the reply/like entry before any entry
 * that merely mentions "reply" in passing), and an exact-phrase hit
 * anywhere in the question is a strong signal on its own.
 */
export function searchHelp(query: string, limit = 5): HelpSearchResult[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const qLower = query.toLowerCase().trim();

  const scored: HelpSearchResult[] = HELP_ENTRIES.map((entry) => {
    const questionTokens = new Set(tokenize(entry.question));
    const answerTokens = new Set(tokenize(entry.answer));
    const keywordTokens = new Set(entry.keywords.flatMap((k) => tokenize(k)));

    let score = 0;
    for (const t of qTokens) {
      if (questionTokens.has(t)) score += 3;
      if (keywordTokens.has(t)) score += 3;
      if (answerTokens.has(t)) score += 1;
    }
    if (qLower.length > 3 && entry.question.toLowerCase().includes(qLower)) score += 6;
    if (qLower.length > 3 && entry.keywords.some((k) => k.toLowerCase().includes(qLower))) score += 4;

    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function entryById(id: string): HelpEntry | undefined {
  return HELP_ENTRIES.find((e) => e.id === id);
}
