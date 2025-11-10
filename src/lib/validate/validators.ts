import { DOMParser } from "@xmldom/xmldom";

/** Validate Python code syntax (very lightweight) */
export function validatePython(code: string): string | null {
  if (!code || code.trim().length === 0) return "Empty file";
  // Quick structural sanity checks
  if (!code.includes("class") && !code.includes("def") && !code.includes("from odoo"))
    return "Python file missing basic Odoo constructs";
  return null;
}

/** Validate XML files */
export function validateXML(code: string): string | null {
  if (!code || code.trim().length === 0) return "Empty XML file";
  try {
    const parser = new DOMParser();
    const dom = parser.parseFromString(code, "application/xml");
    const parseError = dom.getElementsByTagName("parsererror");
    if (parseError.length > 0) return "XML parse error";
    return null;
  } catch (e) {
    return `XML validation failed: ${String(e)}`;
  }
}

/** Validate CSV files */
export function validateCSV(code: string): string | null {
  if (!code || code.trim().length === 0) return "Empty CSV file";
  const lines = code.split("\n");
  const header = lines[0];
  if (!header.includes(",")) return "CSV missing commas in header";
  return null;
}
