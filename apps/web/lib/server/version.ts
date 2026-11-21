import pkg from "../../package.json" with { type: "json" };

export const APP_VERSION: string = pkg.version;
export const API_VERSION = 1 as const;
