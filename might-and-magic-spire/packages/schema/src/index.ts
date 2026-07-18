// @mms/schema — the content contract.
// Source* records + CardDef + the image manifest, plus one canonical fixture
// of each. This package is the keystone: the researcher produces records that
// validate against it, and every other package imports the fixtures here as
// the single source of truth. Do not regenerate these schemas downstream —
// route every change through the orchestrator and bump the version.

export * from "./source";
export * from "./card";
export * from "./manifest";
export * from "./fixtures";
