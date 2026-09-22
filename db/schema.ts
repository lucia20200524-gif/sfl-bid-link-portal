import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("bid_members", {
  email: text("email").primaryKey(), userId: text("user_id"), name: text("name").notNull(), role: text("role").notNull().default("member"), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("idx_bid_members_user").on(t.userId)]);
export const bids = sqliteTable("bids", {
  workflow: text("workflow").notNull().default("{}"),
  id: text("id").primaryKey(), title: text("title").notNull(), agency: text("agency").notNull(), region: text("region").notNull().default(""), deadline: text("deadline").notNull().default(""), announcedOn: text("announced_on").notNull().default(""),
  contractMethod: text("contract_method").notNull().default(""), budget: text("budget").notNull().default(""), qualifications: text("qualifications").notNull().default(""), summary: text("summary").notNull().default(""), matchReason: text("match_reason").notNull().default(""), concerns: text("concerns").notNull().default(""), officialUrl: text("official_url").notNull().default(""),
  fit: text("fit").notNull().default("B"), status: text("status").notNull().default("new"), assignee: text("assignee").notNull().default(""), notes: text("notes").notNull().default(""), submittedOn: text("submitted_on").notNull().default(""), source: text("source").notNull().default("manual"), dedupeKey: text("dedupe_key").notNull(), createdBy: text("created_by").notNull(), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(), revision: integer("revision").notNull().default(1),
}, t => [uniqueIndex("idx_bids_dedupe").on(t.dedupeKey), index("idx_bids_status_deadline").on(t.status, t.deadline), index("idx_bids_submitted").on(t.submittedOn)]);

export const larkRegistrations = sqliteTable("lark_bid_registrations", {
  connectionScope: text("connection_scope").notNull().default("sfl"),
  key: text("key").primaryKey(), mode: text("mode").notNull(), clientToken: text("client_token").notNull(),
  state: text("state").notNull().default("ready"), recordId: text("record_id").notNull().default(""),
  warnings: text("warnings").notNull().default("[]"), createdBy: text("created_by").notNull(),
  leaseToken: text("lease_token").notNull().default(""), lockedUntil: integer("locked_until").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_lark_registration_scope_mode").on(t.connectionScope, t.mode)]);

export const memberLarkConnections = sqliteTable("member_lark_connections", {
  userId: text("user_id").primaryKey(), appId: text("app_id").notNull(),
  secretCipher: text("secret_cipher").notNull(), baseToken: text("base_token").notNull(),
  targetsJson: text("targets_json").notNull(), revision: text("revision").notNull(),
  checkedAt: integer("checked_at").notNull(),
}, t => [uniqueIndex("idx_member_lark_base").on(t.baseToken)]);
export const larkTemplateSettings = sqliteTable("lark_template_settings", {
  key: text("key").primaryKey(), url: text("url").notNull(), updatedAt: integer("updated_at").notNull(),
});

// Historical table retained by the original production migration. Keeping its
// schema here prevents unrelated data deletion when generating new migrations.
// No research feature or API uses this table.
export const legacyResearchJobs = sqliteTable("bid_research_jobs", {
  id: text("id").primaryKey(), createdBy: text("created_by").notNull(), status: text("status").notNull(),
  filtersJson: text("filters_json").notNull(), responseId: text("response_id"), resultJson: text("result_json"),
  error: text("error").notNull().default(""), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_bid_research_user_created").on(t.createdBy, t.createdAt)]);

// One resumable browser search per member / audience / defense source.
// New searches replace that slot, bounding retained data without a scheduler.
export const defenseBrowserJobs = sqliteTable("defense_browser_jobs", {
  id: text("id").primaryKey(), createdBy: text("created_by").notNull(),
  mode: text("mode").notNull(), sourceId: text("source_id").notNull(),
  stateJson: text("state_json").notNull(),
  leaseToken: text("lease_token").notNull().default(""), lockedUntil: integer("locked_until").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("idx_defense_browser_slot").on(t.createdBy,t.mode,t.sourceId)]);

export const discoveryCandidates = sqliteTable("discovery_candidates", {
  id:text("id").primaryKey(), data:text("data").notNull(),
  firstSeen:integer("first_seen").notNull(), lastSeen:integer("last_seen").notNull(),
  changedAt:integer("changed_at").notNull(), fingerprint:text("fingerprint").notNull(),
  deadline:text("deadline").notNull().default(""),
  searchVersion:integer("search_version").notNull().default(0),
  searchData:text("search_data").notNull().default(""),
  searchText:text("search_text").notNull().default(""),
  searchTitle:text("search_title").notNull().default(""),
  searchBody:text("search_body").notNull().default(""),
  searchTitleWords:text("search_title_words").notNull().default(""),
  searchBodyWords:text("search_body_words").notNull().default(""),
}, t=>[index("idx_discovery_deadline").on(t.deadline),index("idx_discovery_search_version").on(t.searchVersion,t.id)]);
export const discoveryReviews = sqliteTable("discovery_reviews", {
  key:text("key").primaryKey(), userId:text("user_id").notNull(), mode:text("mode").notNull(), candidateId:text("candidate_id").notNull(),
  state:text("state").notNull(), reason:text("reason").notNull().default(""), reviewedVersion:text("reviewed_version").notNull(), updatedAt:integer("updated_at").notNull(),
},t=>[index("idx_discovery_review_user_mode").on(t.userId,t.mode)]);
export const discoveryRuntime = sqliteTable("discovery_runtime", {
  key:text("key").primaryKey(), data:text("data").notNull(), lease:text("lease").notNull().default(""),
  lockedUntil:integer("locked_until").notNull().default(0), updatedAt:integer("updated_at").notNull(),
});
export const discoveryCache = sqliteTable("discovery_cache", {
  url:text("url").primaryKey(), body:text("body").notNull(), kind:text("kind").notNull(), fetchedAt:integer("fetched_at").notNull(),
});

export const procurementPreferences = sqliteTable("procurement_preferences", {
  userId:text("user_id").primaryKey(), profile:text("profile").notNull().default("{}"), updatedAt:integer("updated_at").notNull(),
});
export const savedProcurementSearches = sqliteTable("saved_procurement_searches", {
  id:text("id").primaryKey(), userId:text("user_id").notNull(), data:text("data").notNull(), updatedAt:integer("updated_at").notNull(),
}, t=>[index("idx_saved_searches_user").on(t.userId)]);
export const discoveryRevisions = sqliteTable("discovery_revisions", {
  id:text("id").primaryKey(), candidateId:text("candidate_id").notNull(), data:text("data").notNull(), recordedAt:integer("recorded_at").notNull(),
},t=>[index("idx_discovery_revisions_candidate").on(t.candidateId,t.recordedAt)]);

export const portalAccounts = sqliteTable("portal_accounts", {
  id: text("id").primaryKey(), loginId: text("login_id").notNull(), name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(), active: integer("active").notNull().default(1),
  credentialCipher: text("credential_cipher").notNull().default(""),
  credentialVersion: integer("credential_version").notNull().default(1),
  larkBaseUrl: text("lark_base_url").notNull().default(""),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("idx_portal_account_login").on(t.loginId)]);
export const portalCredentialViews = sqliteTable("portal_credential_views", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(),
  viewedBy: text("viewed_by").notNull(), viewedAt: integer("viewed_at").notNull(),
});
export const portalMemberSessions = sqliteTable("portal_member_sessions", {
  tokenHash: text("token_hash").primaryKey(), accountId: text("account_id").notNull().references(() => portalAccounts.id, { onDelete: "cascade" }),
  credentialVersion: integer("credential_version").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_portal_session_account").on(t.accountId), index("idx_portal_session_expiry").on(t.expiresAt)]);
export const portalLoginLimits = sqliteTable("portal_login_limits", {
  key: text("key").primaryKey(), attempts: integer("attempts").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_portal_login_expiry").on(t.expiresAt)]);
