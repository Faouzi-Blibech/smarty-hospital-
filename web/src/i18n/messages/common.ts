import { messages } from "../define";

// App-wide words: time, greetings, generic actions and states.
export const common = messages({
  en: {
    today: "Today",
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
    secondsAgo: "{n} s ago",
    minutesAgo: "{n} min ago",
    hoursAgo: "{n} h ago",
    language: "Language",
  },
  fr: {
    today: "Aujourd'hui",
    goodMorning: "Bonjour",
    goodAfternoon: "Bon après-midi",
    goodEvening: "Bonsoir",
    secondsAgo: "il y a {n} s",
    minutesAgo: "il y a {n} min",
    hoursAgo: "il y a {n} h",
    language: "Langue",
  },
  ar: {
    today: "اليوم",
    goodMorning: "صباح الخير",
    goodAfternoon: "مساء الخير",
    goodEvening: "مساء الخير",
    secondsAgo: "منذ {n} ث",
    minutesAgo: "منذ {n} د",
    hoursAgo: "منذ {n} س",
    language: "اللغة",
  },
});
