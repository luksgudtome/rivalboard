import { readFile } from "node:fs/promises";
import path from "node:path";

export type LegalDocKey = "privacy" | "terms";

const LEGAL_DOCS: Record<LegalDocKey, { title: string; fileName: string }> = {
  privacy: {
    title: "Privacy Policy",
    fileName: "privacy-policy.md",
  },
  terms: {
    title: "Terms of Service",
    fileName: "terms-of-service.md",
  },
};

export interface LegalDoc {
  key: LegalDocKey;
  title: string;
  content: string;
}

export async function getLegalDoc(key: LegalDocKey): Promise<LegalDoc> {
  const entry = LEGAL_DOCS[key];
  const docPath = path.join(process.cwd(), "content", "legal", entry.fileName);
  const content = await readFile(docPath, "utf8");

  return {
    key,
    title: entry.title,
    content,
  };
}
