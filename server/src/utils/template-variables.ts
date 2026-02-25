/**
 * Dynamic response variables — replaces {{$variableName}} placeholders
 * in response bodies with generated values at request time.
 */

const FIRST_NAMES = ['James', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Lucas', 'Mia', 'Logan', 'Charlotte', 'Alexander'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore'];
const DOMAINS = ['example.com', 'test.io', 'mock.dev', 'sample.org', 'demo.net'];
const LOREM_WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua'];
const COMPANIES = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Inc', 'Stark Industries', 'Wayne Enterprises', 'Cyberdyne', 'Soylent Corp'];
const STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Pine Rd', 'Elm St', 'Washington Blvd', 'Park Ave'];
const CITIES = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'San Francisco', 'Seattle', 'Austin', 'Denver', 'Boston'];
const COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'South Korea'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function loremSentence(): string {
  const len = randomInt(6, 14);
  const words = Array.from({ length: len }, () => pick(LOREM_WORDS));
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.';
}

function loremParagraph(): string {
  const count = randomInt(3, 6);
  return Array.from({ length: count }, () => loremSentence()).join(' ');
}

/** Registry of all available template variables */
const VARIABLES: Record<string, () => string> = {
  // Identifiers
  '$randomUUID': () => randomUUID(),
  '$guid': () => randomUUID(),

  // Names
  '$randomFirstName': () => pick(FIRST_NAMES),
  '$randomLastName': () => pick(LAST_NAMES),
  '$randomFullName': () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
  '$randomUserName': () => `${pick(FIRST_NAMES).toLowerCase()}${randomInt(1, 999)}`,

  // Internet
  '$randomEmail': () => `${pick(FIRST_NAMES).toLowerCase()}.${pick(LAST_NAMES).toLowerCase()}${randomInt(1, 99)}@${pick(DOMAINS)}`,
  '$randomUrl': () => `https://${pick(DOMAINS)}/${pick(LOREM_WORDS)}/${pick(LOREM_WORDS)}`,
  '$randomIP': () => `${randomInt(1, 254)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`,
  '$randomIPv6': () => Array.from({ length: 8 }, () => randomInt(0, 65535).toString(16).padStart(4, '0')).join(':'),
  '$randomSlug': () => Array.from({ length: 3 }, () => pick(LOREM_WORDS)).join('-'),
  '$randomHexColor': () => '#' + randomInt(0, 0xFFFFFF).toString(16).padStart(6, '0'),

  // Numbers
  '$randomInt': () => String(randomInt(0, 9999)),
  '$randomFloat': () => (Math.random() * 1000).toFixed(2),
  '$randomBoolean': () => String(Math.random() > 0.5),

  // Date / Time
  '$timestamp': () => String(Math.floor(Date.now() / 1000)),
  '$isoTimestamp': () => new Date().toISOString(),
  '$randomDate': () => {
    const d = new Date(Date.now() - randomInt(0, 365 * 24 * 60 * 60 * 1000));
    return d.toISOString().split('T')[0];
  },
  '$randomDatetime': () => {
    const d = new Date(Date.now() - randomInt(0, 365 * 24 * 60 * 60 * 1000));
    return d.toISOString();
  },

  // Address
  '$randomCity': () => pick(CITIES),
  '$randomCountry': () => pick(COUNTRIES),
  '$randomStreetAddress': () => `${randomInt(1, 9999)} ${pick(STREETS)}`,
  '$randomZipCode': () => String(randomInt(10000, 99999)),
  '$randomLatitude': () => (Math.random() * 180 - 90).toFixed(6),
  '$randomLongitude': () => (Math.random() * 360 - 180).toFixed(6),

  // Business
  '$randomCompanyName': () => pick(COMPANIES),
  '$randomPhoneNumber': () => `+1-${randomInt(200, 999)}-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
  '$randomJobTitle': () => pick(['Engineer', 'Designer', 'Manager', 'Analyst', 'Developer', 'Consultant', 'Director']),

  // Text
  '$randomLoremSentence': () => loremSentence(),
  '$randomLoremParagraph': () => loremParagraph(),
  '$randomWord': () => pick(LOREM_WORDS),

  // Images (placeholder)
  '$randomImageUrl': () => `https://picsum.photos/id/${randomInt(1, 200)}/400/300`,
  '$randomAvatarUrl': () => `https://i.pravatar.cc/150?u=${randomInt(1, 999)}`,
};

/** Pattern: {{$variableName}} */
const TEMPLATE_REGEX = /\{\{\s*(\$\w+)\s*\}\}/g;

/**
 * Resolve all {{$variable}} placeholders in the given template string.
 * Unknown variables are left as-is.
 */
export function resolveVariables(template: string): string {
  return template.replace(TEMPLATE_REGEX, (fullMatch, varName: string) => {
    const generator = VARIABLES[varName];
    return generator ? generator() : fullMatch;
  });
}

/** Check if a string contains any template variable patterns */
export function hasVariables(template: string): boolean {
  return TEMPLATE_REGEX.test(template);
}

/** Get all available variable names (for autocomplete) */
export function getAvailableVariables(): { name: string; description: string }[] {
  return [
    { name: '$randomUUID', description: 'Random UUID v4' },
    { name: '$guid', description: 'Alias for $randomUUID' },
    { name: '$randomFirstName', description: 'Random first name' },
    { name: '$randomLastName', description: 'Random last name' },
    { name: '$randomFullName', description: 'Random full name' },
    { name: '$randomUserName', description: 'Random username' },
    { name: '$randomEmail', description: 'Random email address' },
    { name: '$randomUrl', description: 'Random URL' },
    { name: '$randomIP', description: 'Random IPv4 address' },
    { name: '$randomIPv6', description: 'Random IPv6 address' },
    { name: '$randomSlug', description: 'Random URL slug' },
    { name: '$randomHexColor', description: 'Random hex color code' },
    { name: '$randomInt', description: 'Random integer (0-9999)' },
    { name: '$randomFloat', description: 'Random float (0-1000)' },
    { name: '$randomBoolean', description: 'Random true/false' },
    { name: '$timestamp', description: 'Current Unix timestamp' },
    { name: '$isoTimestamp', description: 'Current ISO 8601 timestamp' },
    { name: '$randomDate', description: 'Random date (YYYY-MM-DD)' },
    { name: '$randomDatetime', description: 'Random ISO datetime' },
    { name: '$randomCity', description: 'Random city name' },
    { name: '$randomCountry', description: 'Random country name' },
    { name: '$randomStreetAddress', description: 'Random street address' },
    { name: '$randomZipCode', description: 'Random zip code' },
    { name: '$randomLatitude', description: 'Random latitude' },
    { name: '$randomLongitude', description: 'Random longitude' },
    { name: '$randomCompanyName', description: 'Random company name' },
    { name: '$randomPhoneNumber', description: 'Random phone number' },
    { name: '$randomJobTitle', description: 'Random job title' },
    { name: '$randomLoremSentence', description: 'Random lorem ipsum sentence' },
    { name: '$randomLoremParagraph', description: 'Random lorem ipsum paragraph' },
    { name: '$randomWord', description: 'Random lorem word' },
    { name: '$randomImageUrl', description: 'Random image URL (picsum)' },
    { name: '$randomAvatarUrl', description: 'Random avatar URL' },
  ];
}
