import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memoryFile = path.join(__dirname, "memory.json");

const defaultMemory = {
  user: {
    preferredName: null,
  },
  facts: [],
  preferences: {},
};

async function ensureMemoryFile() {
  try {
    await fs.access(memoryFile);
  } catch {
    await fs.writeFile(memoryFile, JSON.stringify(defaultMemory, null, 2), "utf8");
  }
}

export async function readMemory() {
  await ensureMemoryFile();
  const raw = await fs.readFile(memoryFile, "utf8");
  return JSON.parse(raw);
}

export async function writeMemory(memory) {
  await fs.writeFile(memoryFile, JSON.stringify(memory, null, 2), "utf8");
}

export async function setPreferredName(name) {
  const memory = await readMemory();
  memory.user.preferredName = name.trim();
  await writeMemory(memory);
  return memory.user.preferredName;
}

export async function getPreferredName() {
  const memory = await readMemory();
  return memory.user.preferredName;
}

export async function addFact(fact) {
  const memory = await readMemory();
  const cleanedFact = fact.trim();

  if (!cleanedFact) return false;

  if (!memory.facts.includes(cleanedFact)) {
    memory.facts.push(cleanedFact);
    await writeMemory(memory);
  }

  return true;
}

export async function getMemorySummary() {
  return readMemory();
}
