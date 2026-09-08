/**
 * The fixed set of people who can sign in to this private wedding workspace.
 *
 * Keeping this in one place prevents the seed, production repair command and
 * password command from quietly drifting to different names or addresses.
 */
export const FAMILY_ACCOUNTS = [
  { key: "avantika", name: "Avantika Chowdhry", email: "avantika.chowdhry@gmail.com", tone: "rose", relation: "Bride", displayCurrency: "GBP" },
  { key: "prateek", name: "Prateek Mehan", email: "prateek.mehan98@gmail.com", tone: "indigo", relation: "Groom", displayCurrency: "GBP" },
  { key: "namrita", name: "Namrita Chowdhry", email: "namrita.chowdhry@gmail.com", tone: "plum", relation: "Bride's Mother", displayCurrency: "GBP" },
  { key: "dheeraj", name: "Dheeraj Chowdhry", email: "dheeraj.chowdhry@gmail.com", tone: "saffron", relation: "Bride's Father", displayCurrency: "GBP" },
  { key: "preeti", name: "Preeti Mehan", email: "preeti.mehan1975@gmail.com", tone: "teal", relation: "Groom's Mother", displayCurrency: "SGD" },
  { key: "ajay", name: "Ajay Mehan", email: "ajaymehan@hotmail.com", tone: "olive", relation: "Groom's Father", displayCurrency: "SGD" },
  { key: "anousha", name: "Anousha Chowdhry", email: "chowdhry.anousha@gmail.com", tone: "amber", relation: "Bride's Sister", displayCurrency: "GBP" },
  { key: "trisha", name: "Trisha Mehan", email: "trisha.mehan95@gmail.com", tone: "sky", relation: "Groom's Sister", displayCurrency: "SGD" },
  { key: "aditya", name: "Aditya Vaidya", email: "adityavaidya2000@gmail.com", tone: "slate", relation: "Anousha's Partner", displayCurrency: "SGD" },
] as const;

export type FamilyAccount = (typeof FAMILY_ACCOUNTS)[number];
