// Barrel for the server actions, which were one 1,576-line file until they
// were split by domain into app/actions/.
//
// Kept as a barrel rather than updating the 24 import sites: every panel and
// page imports from "@/app/actions", and re-exporting here means the split
// is a pure move with no churn at the call sites. Each module below carries
// its own "use server" directive, so the actions keep their identity - this
// file deliberately has none of its own.

export * from "./actions/sales";
export * from "./actions/money";
export * from "./actions/delivery";
export * from "./actions/people";
export * from "./actions/reviews";
export * from "./actions/settings";
