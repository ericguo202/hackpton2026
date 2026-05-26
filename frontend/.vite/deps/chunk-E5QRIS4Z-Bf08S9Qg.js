import { i as __toESM, t as require_react } from "./react-B6J-hxuQ.js";
//#region node_modules/@clerk/shared/dist/runtime/clerkRuntimeError-DqAmLuLY.mjs
/**
* Creates a type guard function for any error class.
* The returned function can be called as a standalone function or as a method on an error object.
*
* @example
* ```typescript
* class MyError extends Error {}
* const isMyError = createErrorTypeGuard(MyError);
*
* // As a standalone function
* if (isMyError(error)) { ... }
*
* // As a method (when attached to error object)
* if (error.isMyError()) { ... }
* ```
*/
function createErrorTypeGuard(ErrorClass) {
	function typeGuard(error) {
		const target = error ?? this;
		if (!target) throw new TypeError(`${ErrorClass.kind || ErrorClass.name} type guard requires an error object`);
		if (ErrorClass.kind && typeof target === "object" && target !== null && "constructor" in target) {
			if (target.constructor?.kind === ErrorClass.kind) return true;
		}
		return target instanceof ErrorClass;
	}
	return typeGuard;
}
var ClerkError = class ClerkError extends Error {
	static kind = "ClerkError";
	clerkError = true;
	code;
	longMessage;
	docsUrl;
	cause;
	get name() {
		return this.constructor.name;
	}
	constructor(opts) {
		super(new.target.formatMessage(new.target.kind, opts.message, opts.code, opts.docsUrl), { cause: opts.cause });
		Object.setPrototypeOf(this, ClerkError.prototype);
		this.code = opts.code;
		this.docsUrl = opts.docsUrl;
		this.longMessage = opts.longMessage;
		this.cause = opts.cause;
	}
	toString() {
		return `[${this.name}]\nMessage:${this.message}`;
	}
	static formatMessage(name, msg, code, docsUrl) {
		const prefix = "Clerk:";
		const regex = new RegExp(prefix.replace(" ", "\\s*"), "i");
		msg = msg.replace(regex, "");
		msg = `${prefix} ${msg.trim()}\n\n(code="${code}")\n\n`;
		if (docsUrl) msg += `\n\nDocs: ${docsUrl}`;
		return msg;
	}
};
/**
* Custom error class for representing Clerk runtime errors.
*
* @class ClerkRuntimeError
*
* @example
*   throw new ClerkRuntimeError('An error occurred', { code: 'password_invalid' });
*/
var ClerkRuntimeError = class ClerkRuntimeError extends ClerkError {
	static kind = "ClerkRuntimeError";
	/**
	* @deprecated Use `clerkError` property instead. This property is maintained for backward compatibility.
	*/
	clerkRuntimeError = true;
	constructor(message, options) {
		super({
			...options,
			message
		});
		Object.setPrototypeOf(this, ClerkRuntimeError.prototype);
	}
};
createErrorTypeGuard(ClerkRuntimeError);
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/error-NXMTfCAv.mjs
/**
* This error contains the specific error message, code, and any additional metadata that was returned by the Clerk API.
*/
var ClerkAPIError = class {
	static kind = "ClerkAPIError";
	code;
	message;
	longMessage;
	meta;
	constructor(json) {
		const parsedError = {
			code: json.code,
			message: json.message,
			longMessage: json.long_message,
			meta: {
				paramName: json.meta?.param_name,
				sessionId: json.meta?.session_id,
				emailAddresses: json.meta?.email_addresses,
				identifiers: json.meta?.identifiers,
				zxcvbn: json.meta?.zxcvbn,
				plan: json.meta?.plan,
				isPlanUpgradePossible: json.meta?.is_plan_upgrade_possible
			}
		};
		this.code = parsedError.code;
		this.message = parsedError.message;
		this.longMessage = parsedError.longMessage;
		this.meta = parsedError.meta;
	}
};
createErrorTypeGuard(ClerkAPIError);
/**
* Type guard to check if an error is a ClerkAPIResponseError.
* Can be called as a standalone function or as a method on an error object.
*
* @example
* // As a standalone function
* if (isClerkAPIResponseError(error)) { ... }
*
* // As a method (when attached to error object)
* if (error.isClerkAPIResponseError()) { ... }
*/
var isClerkAPIResponseError = createErrorTypeGuard(class ClerkAPIResponseError extends ClerkError {
	static kind = "ClerkAPIResponseError";
	status;
	clerkTraceId;
	retryAfter;
	errors;
	constructor(message, options) {
		const { data: errorsJson, status, clerkTraceId, retryAfter } = options;
		super({
			...options,
			message,
			code: "api_response_error"
		});
		Object.setPrototypeOf(this, ClerkAPIResponseError.prototype);
		this.status = status;
		this.clerkTraceId = clerkTraceId;
		this.retryAfter = retryAfter;
		this.errors = (errorsJson || []).map((e) => new ClerkAPIError(e));
	}
	toString() {
		let message = `[${this.name}]\nMessage:${this.message}\nStatus:${this.status}\nSerialized errors: ${this.errors.map((e) => JSON.stringify(e))}`;
		if (this.clerkTraceId) message += `\nClerk Trace ID: ${this.clerkTraceId}`;
		return message;
	}
	static formatMessage(name, msg, _, __) {
		return msg;
	}
});
var DefaultMessages = Object.freeze({
	InvalidProxyUrlErrorMessage: `The proxyUrl passed to Clerk is invalid. The expected value for proxyUrl is an absolute URL or a relative path with a leading '/'. (key={{url}})`,
	InvalidPublishableKeyErrorMessage: `The publishableKey passed to Clerk is invalid. You can get your Publishable key at https://dashboard.clerk.com/last-active?path=api-keys. (key={{key}})`,
	MissingPublishableKeyErrorMessage: `Missing publishableKey. You can get your key at https://dashboard.clerk.com/last-active?path=api-keys.`,
	MissingSecretKeyErrorMessage: `Missing secretKey. You can get your key at https://dashboard.clerk.com/last-active?path=api-keys.`,
	MissingClerkProvider: `{{source}} can only be used within the <ClerkProvider /> component. Learn more: https://clerk.com/docs/components/clerk-provider`
});
/**
* Builds an error thrower.
*
* @internal
*/
function buildErrorThrower({ packageName, customMessages }) {
	let pkg = packageName;
	/**
	* Builds a message from a raw message and replacements.
	*
	* @internal
	*/
	function buildMessage(rawMessage, replacements) {
		if (!replacements) return `${pkg}: ${rawMessage}`;
		let msg = rawMessage;
		const matches = rawMessage.matchAll(/{{([a-zA-Z0-9-_]+)}}/g);
		for (const match of matches) {
			const replacement = (replacements[match[1]] || "").toString();
			msg = msg.replace(`{{${match[1]}}}`, replacement);
		}
		return `${pkg}: ${msg}`;
	}
	const messages = {
		...DefaultMessages,
		...customMessages
	};
	return {
		setPackageName({ packageName: packageName$1 }) {
			if (typeof packageName$1 === "string") pkg = packageName$1;
			return this;
		},
		setMessages({ customMessages: customMessages$1 }) {
			Object.assign(messages, customMessages$1 || {});
			return this;
		},
		throwInvalidPublishableKeyError(params) {
			throw new Error(buildMessage(messages.InvalidPublishableKeyErrorMessage, params));
		},
		throwInvalidProxyUrl(params) {
			throw new Error(buildMessage(messages.InvalidProxyUrlErrorMessage, params));
		},
		throwMissingPublishableKeyError() {
			throw new Error(buildMessage(messages.MissingPublishableKeyErrorMessage));
		},
		throwMissingSecretKeyError() {
			throw new Error(buildMessage(messages.MissingSecretKeyErrorMessage));
		},
		throwMissingClerkProviderError(params) {
			throw new Error(buildMessage(messages.MissingClerkProvider, params));
		},
		throw(message) {
			throw new Error(buildMessage(message));
		}
	};
}
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/constants-Bta24VLk.mjs
var DEV_OR_STAGING_SUFFIXES = [
	".lcl.dev",
	".stg.dev",
	".lclstage.dev",
	".stgstage.dev",
	".dev.lclclerk.com",
	".stg.lclclerk.com",
	".accounts.lclclerk.com",
	"accountsstage.dev",
	"accounts.dev"
];
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/isomorphicAtob-CoF80qYz.mjs
/**
* A function that decodes a string of data which has been encoded using base-64 encoding.
* Uses `atob` if available, otherwise uses `Buffer` from `globalThis`. If neither are available, returns the data as-is.
*/
var isomorphicAtob = (data) => {
	if (typeof atob !== "undefined" && typeof atob === "function") return atob(data);
	else if (typeof globalThis.Buffer !== "undefined") return globalThis.Buffer.from(data, "base64").toString();
	return data;
};
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/keys-DuxzP8MU.mjs
/** Prefix used for production publishable keys */
var PUBLISHABLE_KEY_LIVE_PREFIX = "pk_live_";
/** Prefix used for development publishable keys */
var PUBLISHABLE_KEY_TEST_PREFIX = "pk_test_";
/**
* Validates that a decoded publishable key has the correct format.
* The decoded value should be a frontend API followed by exactly one '$' at the end.
*
* @param decoded - The decoded publishable key string to validate.
* @returns `true` if the decoded key has valid format, `false` otherwise.
*/
function isValidDecodedPublishableKey(decoded) {
	if (!decoded.endsWith("$")) return false;
	const withoutTrailing = decoded.slice(0, -1);
	if (withoutTrailing.includes("$")) return false;
	return withoutTrailing.includes(".");
}
/**
* Parses and validates a publishable key, extracting the frontend API and instance type.
*
* @param key - The publishable key to parse.
* @param options - Configuration options for parsing.
* @param options.fatal
* @param options.domain
* @param options.proxyUrl
* @param options.isSatellite
* @returns Parsed publishable key object with instanceType and frontendApi, or null if invalid.
*
* @throws {Error} When options.fatal is true and key is missing or invalid.
*/
function parsePublishableKey(key, options = {}) {
	key = key || "";
	if (!key || !isPublishableKey(key)) {
		if (options.fatal && !key) throw new Error("Publishable key is missing. Ensure that your publishable key is correctly configured. Double-check your environment configuration for your keys, or access them here: https://dashboard.clerk.com/last-active?path=api-keys");
		if (options.fatal && !isPublishableKey(key)) throw new Error("Publishable key not valid.");
		return null;
	}
	const instanceType = key.startsWith(PUBLISHABLE_KEY_LIVE_PREFIX) ? "production" : "development";
	let decodedFrontendApi;
	try {
		decodedFrontendApi = isomorphicAtob(key.split("_")[2]);
	} catch {
		if (options.fatal) throw new Error("Publishable key not valid: Failed to decode key.");
		return null;
	}
	if (!isValidDecodedPublishableKey(decodedFrontendApi)) {
		if (options.fatal) throw new Error("Publishable key not valid: Decoded key has invalid format.");
		return null;
	}
	let frontendApi = decodedFrontendApi.slice(0, -1);
	if (options.proxyUrl) frontendApi = options.proxyUrl;
	else if (instanceType !== "development" && options.domain && options.isSatellite) frontendApi = `clerk.${options.domain}`;
	return {
		instanceType,
		frontendApi
	};
}
/**
* Checks if the provided key is a valid publishable key.
*
* @param key - The key to be checked. Defaults to an empty string if not provided.
* @returns `true` if 'key' is a valid publishable key, `false` otherwise.
*/
function isPublishableKey(key = "") {
	try {
		if (!(key.startsWith(PUBLISHABLE_KEY_LIVE_PREFIX) || key.startsWith(PUBLISHABLE_KEY_TEST_PREFIX))) return false;
		const parts = key.split("_");
		if (parts.length !== 3) return false;
		const encodedPart = parts[2];
		if (!encodedPart) return false;
		return isValidDecodedPublishableKey(isomorphicAtob(encodedPart));
	} catch {
		return false;
	}
}
/**
* Creates a memoized cache for checking if URLs are development or staging environments.
* Uses a Map to cache results for better performance on repeated checks.
*
* @returns An object with an isDevOrStagingUrl method that checks if a URL is dev/staging.
*/
function createDevOrStagingUrlCache() {
	const devOrStagingUrlCache = /* @__PURE__ */ new Map();
	return { isDevOrStagingUrl: (url) => {
		if (!url) return false;
		const hostname = typeof url === "string" ? url : url.hostname;
		let res = devOrStagingUrlCache.get(hostname);
		if (res === void 0) {
			res = DEV_OR_STAGING_SUFFIXES.some((s) => hostname.endsWith(s));
			devOrStagingUrlCache.set(hostname, res);
		}
		return res;
	} };
}
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/authorization-errors-CBHAr6Ld.mjs
var REVERIFICATION_REASON = "reverification-error";
var reverificationError = (missingConfig) => ({ clerk_error: {
	type: "forbidden",
	reason: REVERIFICATION_REASON,
	metadata: { reverification: missingConfig }
} });
var isReverificationHint = (result) => {
	return result && typeof result === "object" && "clerk_error" in result && result.clerk_error?.type === "forbidden" && result.clerk_error?.reason === REVERIFICATION_REASON;
};
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/authorization-Un7v7f6J.mjs
var TYPES_TO_OBJECTS = {
	strict_mfa: {
		afterMinutes: 10,
		level: "multi_factor"
	},
	strict: {
		afterMinutes: 10,
		level: "second_factor"
	},
	moderate: {
		afterMinutes: 60,
		level: "second_factor"
	},
	lax: {
		afterMinutes: 1440,
		level: "second_factor"
	}
};
var ALLOWED_LEVELS = new Set([
	"first_factor",
	"second_factor",
	"multi_factor"
]);
var ALLOWED_TYPES = new Set([
	"strict_mfa",
	"strict",
	"moderate",
	"lax"
]);
var ORG_SCOPES = new Set([
	"o",
	"org",
	"organization"
]);
var USER_SCOPES = new Set(["u", "user"]);
var isValidMaxAge = (maxAge) => typeof maxAge === "number" && maxAge > 0;
var isValidLevel = (level) => ALLOWED_LEVELS.has(level);
var isValidVerificationType = (type) => ALLOWED_TYPES.has(type);
var prefixWithOrg = (value) => value.replace(/^(org:)*/, "org:");
/**
* Checks if a user has the required organization-level authorization.
* Verifies if the user has the specified role or permission within their organization.
*
* @returns null, if unable to determine due to missing data or unspecified role/permission.
*/
var checkOrgAuthorization = (params, options) => {
	const { orgId, orgRole, orgPermissions } = options;
	if (!params.role && !params.permission) return null;
	if (!orgId || !orgRole || !orgPermissions) return null;
	if (params.permission) return orgPermissions.includes(prefixWithOrg(params.permission));
	if (params.role) return prefixWithOrg(orgRole) === prefixWithOrg(params.role);
	return null;
};
var checkForFeatureOrPlan = (claim, featureOrPlan) => {
	const { org: orgFeatures, user: userFeatures } = splitByScope(claim);
	const [rawScope, rawId] = featureOrPlan.split(":");
	const hasExplicitScope = rawId !== void 0;
	const scope = rawScope;
	const id = rawId || rawScope;
	if (hasExplicitScope && !ORG_SCOPES.has(scope) && !USER_SCOPES.has(scope)) throw new Error(`Invalid scope: ${scope}`);
	if (hasExplicitScope) {
		if (ORG_SCOPES.has(scope)) return orgFeatures.includes(id);
		if (USER_SCOPES.has(scope)) return userFeatures.includes(id);
	}
	return [...orgFeatures, ...userFeatures].includes(id);
};
var checkBillingAuthorization = (params, options) => {
	const { features, plans } = options;
	if (params.feature && features) return checkForFeatureOrPlan(features, params.feature);
	if (params.plan && plans) return checkForFeatureOrPlan(plans, params.plan);
	return null;
};
var splitByScope = (fea) => {
	const org = [];
	const user = [];
	if (!fea) return {
		org,
		user
	};
	const parts = fea.split(",");
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i].trim();
		const colonIndex = part.indexOf(":");
		if (colonIndex === -1) throw new Error(`Invalid claim element (missing colon): ${part}`);
		const scope = part.slice(0, colonIndex);
		const value = part.slice(colonIndex + 1);
		if (scope === "o") org.push(value);
		else if (scope === "u") user.push(value);
		else if (scope === "ou" || scope === "uo") {
			org.push(value);
			user.push(value);
		}
	}
	return {
		org,
		user
	};
};
var validateReverificationConfig = (config) => {
	if (!config) return false;
	const convertConfigToObject = (config$1) => {
		if (typeof config$1 === "string") return TYPES_TO_OBJECTS[config$1];
		return config$1;
	};
	const isValidStringValue = typeof config === "string" && isValidVerificationType(config);
	const isValidObjectValue = typeof config === "object" && isValidLevel(config.level) && isValidMaxAge(config.afterMinutes);
	if (isValidStringValue || isValidObjectValue) return convertConfigToObject.bind(null, config);
	return false;
};
/**
* Evaluates if the user meets re-verification authentication requirements.
* Compares the user's factor verification ages against the specified maxAge.
* Handles different verification levels (first factor, second factor, multi-factor).
*
* @returns null, if requirements or verification data are missing.
*/
var checkReverificationAuthorization = (params, { factorVerificationAge }) => {
	if (!params.reverification || !factorVerificationAge) return null;
	const isValidReverification = validateReverificationConfig(params.reverification);
	if (!isValidReverification) return null;
	const { level, afterMinutes } = isValidReverification();
	const [factor1Age, factor2Age] = factorVerificationAge;
	const isValidFactor1 = factor1Age !== -1 ? afterMinutes > factor1Age : null;
	const isValidFactor2 = factor2Age !== -1 ? afterMinutes > factor2Age : null;
	switch (level) {
		case "first_factor": return isValidFactor1;
		case "second_factor": return factor2Age !== -1 ? isValidFactor2 : isValidFactor1;
		case "multi_factor": return factor2Age === -1 ? isValidFactor1 : isValidFactor1 && isValidFactor2;
	}
};
/**
* Creates a function for comprehensive user authorization checks.
* Combines organization-level and reverification authentication checks.
* The returned function authorizes if both checks pass, or if at least one passes
* when the other is indeterminate. Fails if userId is missing.
*/
var createCheckAuthorization = (options) => {
	return (params) => {
		if (!options.userId) return false;
		const billingAuthorization = checkBillingAuthorization(params, options);
		const orgAuthorization = checkOrgAuthorization(params, options);
		const reverificationAuthorization = checkReverificationAuthorization(params, options);
		if ([billingAuthorization || orgAuthorization, reverificationAuthorization].some((a) => a === null)) return [billingAuthorization || orgAuthorization, reverificationAuthorization].some((a) => a === true);
		return [billingAuthorization || orgAuthorization, reverificationAuthorization].every((a) => a === true);
	};
};
/**
* Shared utility function that centralizes auth state resolution logic,
* preventing duplication across different packages.
*
* @internal
*/
var resolveAuthState = ({ authObject: { sessionId, sessionStatus, userId, actor, orgId, orgRole, orgSlug, signOut, getToken, has, sessionClaims }, options: { treatPendingAsSignedOut = true } }) => {
	if (sessionId === void 0 && userId === void 0) return {
		actor: void 0,
		getToken,
		has: () => false,
		isLoaded: false,
		isSignedIn: void 0,
		orgId: void 0,
		orgRole: void 0,
		orgSlug: void 0,
		sessionClaims: void 0,
		sessionId,
		signOut,
		userId
	};
	if (sessionId === null && userId === null) return {
		actor: null,
		getToken,
		has: () => false,
		isLoaded: true,
		isSignedIn: false,
		orgId: null,
		orgRole: null,
		orgSlug: null,
		sessionClaims: null,
		sessionId,
		signOut,
		userId
	};
	if (treatPendingAsSignedOut && sessionStatus === "pending") return {
		actor: null,
		getToken,
		has: () => false,
		isLoaded: true,
		isSignedIn: false,
		orgId: null,
		orgRole: null,
		orgSlug: null,
		sessionClaims: null,
		sessionId: null,
		signOut,
		userId: null
	};
	if (!!sessionId && !!sessionClaims && !!userId && !!orgId && !!orgRole) return {
		actor: actor || null,
		getToken,
		has,
		isLoaded: true,
		isSignedIn: true,
		orgId,
		orgRole,
		orgSlug: orgSlug || null,
		sessionClaims,
		sessionId,
		signOut,
		userId
	};
	if (!!sessionId && !!sessionClaims && !!userId && !orgId) return {
		actor: actor || null,
		getToken,
		has,
		isLoaded: true,
		isSignedIn: true,
		orgId: null,
		orgRole: null,
		orgSlug: null,
		sessionClaims,
		sessionId,
		signOut,
		userId
	};
};
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/deriveState-CQUgOdaO.mjs
/**
* Derives authentication state based on the current rendering context (SSR or client-side).
*/
var deriveState = (clerkOperational, state, initialState) => {
	if (!clerkOperational && initialState) return deriveFromSsrInitialState(initialState);
	return deriveFromClientSideState(state);
};
var deriveFromSsrInitialState = (initialState) => {
	const userId = initialState.userId;
	const user = initialState.user;
	const sessionId = initialState.sessionId;
	const sessionStatus = initialState.sessionStatus;
	const sessionClaims = initialState.sessionClaims;
	return {
		userId,
		user,
		sessionId,
		session: initialState.session,
		sessionStatus,
		sessionClaims,
		organization: initialState.organization,
		orgId: initialState.orgId,
		orgRole: initialState.orgRole,
		orgPermissions: initialState.orgPermissions,
		orgSlug: initialState.orgSlug,
		actor: initialState.actor,
		factorVerificationAge: initialState.factorVerificationAge
	};
};
var deriveFromClientSideState = (state) => {
	const userId = state.user ? state.user.id : state.user;
	const user = state.user;
	const sessionId = state.session ? state.session.id : state.session;
	const session = state.session;
	const sessionStatus = state.session?.status;
	const sessionClaims = state.session ? state.session.lastActiveToken?.jwt?.claims : null;
	const factorVerificationAge = state.session ? state.session.factorVerificationAge : null;
	const actor = session?.actor;
	const organization = state.organization;
	const orgId = state.organization ? state.organization.id : state.organization;
	const orgSlug = organization?.slug;
	const membership = organization ? user?.organizationMemberships?.find((om) => om.organization.id === orgId) : organization;
	const orgPermissions = membership ? membership.permissions : membership;
	return {
		userId,
		user,
		sessionId,
		session,
		sessionStatus,
		sessionClaims,
		organization,
		orgId,
		orgRole: membership ? membership.role : membership,
		orgSlug,
		orgPermissions,
		actor,
		factorVerificationAge
	};
};
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/organization-Cy_ag_4B.mjs
/**
* Finds the Organization membership for a given Organization ID from a list of memberships
* @param organizationMemberships - Array of Organization memberships to search through
* @param organizationId - ID of the Organization to find the membership for
* @returns The matching Organization membership or undefined if not found
*/
function getCurrentOrganizationMembership(organizationMemberships, organizationId) {
	return organizationMemberships.find((organizationMembership) => organizationMembership.organization.id === organizationId);
}
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/noop-B7RzLU-c.mjs
var noop$1 = (..._args) => {};
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/underscore-ClYSgvuy.mjs
/**
* Converts a string from snake_case to camelCase.
*/
function snakeToCamel(str) {
	return str ? str.replace(/([-_][a-z])/g, (match) => match.toUpperCase().replace(/-|_/, "")) : "";
}
/**
* Converts a string from camelCase to snake_case.
*/
function camelToSnake(str) {
	return str ? str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`) : "";
}
var createDeepObjectTransformer = (transform) => {
	const deepTransform = (obj) => {
		if (!obj) return obj;
		if (Array.isArray(obj)) return obj.map((el) => {
			if (typeof el === "object" || Array.isArray(el)) return deepTransform(el);
			return el;
		});
		const copy = { ...obj };
		const keys = Object.keys(copy);
		for (const oldName of keys) {
			const newName = transform(oldName.toString());
			if (newName !== oldName) {
				copy[newName] = copy[oldName];
				delete copy[oldName];
			}
			if (typeof copy[newName] === "object") copy[newName] = deepTransform(copy[newName]);
		}
		return copy;
	};
	return deepTransform;
};
createDeepObjectTransformer(camelToSnake);
createDeepObjectTransformer(snakeToCamel);
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/telemetry-DE2JFEBf.mjs
var EVENT_METHOD_CALLED = "METHOD_CALLED";
var EVENT_SAMPLING_RATE$2 = .1;
/**
* Fired when a helper method is called from a Clerk SDK.
*/
function eventMethodCalled(method, payload) {
	return {
		event: EVENT_METHOD_CALLED,
		eventSamplingRate: EVENT_SAMPLING_RATE$2,
		payload: {
			method,
			...payload
		}
	};
}
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/createDeferredPromise-CYCAgyvC.mjs
/**
* Create a promise that can be resolved or rejected from
* outside the Promise constructor callback
* A ES6 compatible utility that implements `Promise.withResolvers`
*
* @internal
*/
var createDeferredPromise = () => {
	let resolve = noop$1;
	let reject = noop$1;
	return {
		promise: new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		}),
		resolve,
		reject
	};
};
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/errors-oOcNTWU9.mjs
var errorPrefix = "ClerkJS:";
/**
*
*/
function clerkCoreErrorNoClerkSingleton() {
	throw new Error(`${errorPrefix} Clerk instance not found. Make sure Clerk is initialized before using any Clerk components.`);
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/subscribable.js
var Subscribable = class {
	constructor() {
		this.listeners = /* @__PURE__ */ new Set();
		this.subscribe = this.subscribe.bind(this);
	}
	subscribe(listener) {
		this.listeners.add(listener);
		this.onSubscribe();
		return () => {
			this.listeners.delete(listener);
			this.onUnsubscribe();
		};
	}
	hasListeners() {
		return this.listeners.size > 0;
	}
	onSubscribe() {}
	onUnsubscribe() {}
};
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/timeoutManager.js
var defaultTimeoutProvider = {
	setTimeout: (callback, delay) => setTimeout(callback, delay),
	clearTimeout: (timeoutId) => clearTimeout(timeoutId),
	setInterval: (callback, delay) => setInterval(callback, delay),
	clearInterval: (intervalId) => clearInterval(intervalId)
};
var TimeoutManager = class {
	#provider = defaultTimeoutProvider;
	#providerCalled = false;
	setTimeoutProvider(provider) {
		if (this.#providerCalled && provider !== this.#provider) console.error(`[timeoutManager]: Switching provider after calls to previous provider might result in unexpected behavior.`, {
			previous: this.#provider,
			provider
		});
		this.#provider = provider;
		this.#providerCalled = false;
	}
	setTimeout(callback, delay) {
		this.#providerCalled = true;
		return this.#provider.setTimeout(callback, delay);
	}
	clearTimeout(timeoutId) {
		this.#provider.clearTimeout(timeoutId);
	}
	setInterval(callback, delay) {
		this.#providerCalled = true;
		return this.#provider.setInterval(callback, delay);
	}
	clearInterval(intervalId) {
		this.#provider.clearInterval(intervalId);
	}
};
var timeoutManager = new TimeoutManager();
function systemSetTimeoutZero(callback) {
	setTimeout(callback, 0);
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/utils.js
var isServer = typeof window === "undefined" || "Deno" in globalThis;
function noop() {}
function isValidTimeout(value) {
	return typeof value === "number" && value >= 0 && value !== Infinity;
}
function timeUntilStale(updatedAt, staleTime) {
	return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0);
}
function resolveStaleTime(staleTime, query) {
	return typeof staleTime === "function" ? staleTime(query) : staleTime;
}
function resolveEnabled(enabled, query) {
	return typeof enabled === "function" ? enabled(query) : enabled;
}
var hasOwn = Object.prototype.hasOwnProperty;
function replaceEqualDeep(a, b) {
	if (a === b) return a;
	const array = isPlainArray(a) && isPlainArray(b);
	if (!array && !(isPlainObject(a) && isPlainObject(b))) return b;
	const aSize = (array ? a : Object.keys(a)).length;
	const bItems = array ? b : Object.keys(b);
	const bSize = bItems.length;
	const copy = array ? new Array(bSize) : {};
	let equalItems = 0;
	for (let i = 0; i < bSize; i++) {
		const key = array ? i : bItems[i];
		const aItem = a[key];
		const bItem = b[key];
		if (aItem === bItem) {
			copy[key] = aItem;
			if (array ? i < aSize : hasOwn.call(a, key)) equalItems++;
			continue;
		}
		if (aItem === null || bItem === null || typeof aItem !== "object" || typeof bItem !== "object") {
			copy[key] = bItem;
			continue;
		}
		const v = replaceEqualDeep(aItem, bItem);
		copy[key] = v;
		if (v === aItem) equalItems++;
	}
	return aSize === bSize && equalItems === aSize ? a : copy;
}
function shallowEqualObjects(a, b) {
	if (!b || Object.keys(a).length !== Object.keys(b).length) return false;
	for (const key in a) if (a[key] !== b[key]) return false;
	return true;
}
function isPlainArray(value) {
	return Array.isArray(value) && value.length === Object.keys(value).length;
}
function isPlainObject(o) {
	if (!hasObjectPrototype(o)) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	const prot = ctor.prototype;
	if (!hasObjectPrototype(prot)) return false;
	if (!prot.hasOwnProperty("isPrototypeOf")) return false;
	if (Object.getPrototypeOf(o) !== Object.prototype) return false;
	return true;
}
function hasObjectPrototype(o) {
	return Object.prototype.toString.call(o) === "[object Object]";
}
function replaceData(prevData, data, options) {
	if (typeof options.structuralSharing === "function") return options.structuralSharing(prevData, data);
	else if (options.structuralSharing !== false) {
		try {
			return replaceEqualDeep(prevData, data);
		} catch (error) {
			console.error(`Structural sharing requires data to be JSON serializable. To fix this, turn off structuralSharing or return JSON-serializable data from your queryFn. [${options.queryHash}]: ${error}`);
			throw error;
		}
		return replaceEqualDeep(prevData, data);
	}
	return data;
}
function addToEnd(items, item, max = 0) {
	const newItems = [...items, item];
	return max && newItems.length > max ? newItems.slice(1) : newItems;
}
function addToStart(items, item, max = 0) {
	const newItems = [item, ...items];
	return max && newItems.length > max ? newItems.slice(0, -1) : newItems;
}
var skipToken = Symbol();
function ensureQueryFn(options, fetchOptions) {
	if (options.queryFn === skipToken) console.error(`Attempted to invoke queryFn when set to skipToken. This is likely a configuration error. Query hash: '${options.queryHash}'`);
	if (!options.queryFn && fetchOptions?.initialPromise) return () => fetchOptions.initialPromise;
	if (!options.queryFn || options.queryFn === skipToken) return () => Promise.reject(/* @__PURE__ */ new Error(`Missing queryFn: '${options.queryHash}'`));
	return options.queryFn;
}
function addConsumeAwareSignal(object, getSignal, onCancelled) {
	let consumed = false;
	let signal;
	Object.defineProperty(object, "signal", {
		enumerable: true,
		get: () => {
			signal ??= getSignal();
			if (consumed) return signal;
			consumed = true;
			if (signal.aborted) onCancelled();
			else signal.addEventListener("abort", onCancelled, { once: true });
			return signal;
		}
	});
	return object;
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/focusManager.js
var FocusManager = class extends Subscribable {
	#focused;
	#cleanup;
	#setup;
	constructor() {
		super();
		this.#setup = (onFocus) => {
			if (!isServer && window.addEventListener) {
				const listener = () => onFocus();
				window.addEventListener("visibilitychange", listener, false);
				return () => {
					window.removeEventListener("visibilitychange", listener);
				};
			}
		};
	}
	onSubscribe() {
		if (!this.#cleanup) this.setEventListener(this.#setup);
	}
	onUnsubscribe() {
		if (!this.hasListeners()) {
			this.#cleanup?.();
			this.#cleanup = void 0;
		}
	}
	setEventListener(setup) {
		this.#setup = setup;
		this.#cleanup?.();
		this.#cleanup = setup((focused) => {
			if (typeof focused === "boolean") this.setFocused(focused);
			else this.onFocus();
		});
	}
	setFocused(focused) {
		if (this.#focused !== focused) {
			this.#focused = focused;
			this.onFocus();
		}
	}
	onFocus() {
		const isFocused = this.isFocused();
		this.listeners.forEach((listener) => {
			listener(isFocused);
		});
	}
	isFocused() {
		if (typeof this.#focused === "boolean") return this.#focused;
		return globalThis.document?.visibilityState !== "hidden";
	}
};
var focusManager = new FocusManager();
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/thenable.js
function pendingThenable() {
	let resolve;
	let reject;
	const thenable = new Promise((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});
	thenable.status = "pending";
	thenable.catch(() => {});
	function finalize(data) {
		Object.assign(thenable, data);
		delete thenable.resolve;
		delete thenable.reject;
	}
	thenable.resolve = (value) => {
		finalize({
			status: "fulfilled",
			value
		});
		resolve(value);
	};
	thenable.reject = (reason) => {
		finalize({
			status: "rejected",
			reason
		});
		reject(reason);
	};
	return thenable;
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/notifyManager.js
var defaultScheduler = systemSetTimeoutZero;
function createNotifyManager() {
	let queue = [];
	let transactions = 0;
	let notifyFn = (callback) => {
		callback();
	};
	let batchNotifyFn = (callback) => {
		callback();
	};
	let scheduleFn = defaultScheduler;
	const schedule = (callback) => {
		if (transactions) queue.push(callback);
		else scheduleFn(() => {
			notifyFn(callback);
		});
	};
	const flush = () => {
		const originalQueue = queue;
		queue = [];
		if (originalQueue.length) scheduleFn(() => {
			batchNotifyFn(() => {
				originalQueue.forEach((callback) => {
					notifyFn(callback);
				});
			});
		});
	};
	return {
		batch: (callback) => {
			let result;
			transactions++;
			try {
				result = callback();
			} finally {
				transactions--;
				if (!transactions) flush();
			}
			return result;
		},
		batchCalls: (callback) => {
			return (...args) => {
				schedule(() => {
					callback(...args);
				});
			};
		},
		schedule,
		setNotifyFunction: (fn) => {
			notifyFn = fn;
		},
		setBatchNotifyFunction: (fn) => {
			batchNotifyFn = fn;
		},
		setScheduler: (fn) => {
			scheduleFn = fn;
		}
	};
}
var notifyManager = createNotifyManager();
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/onlineManager.js
var OnlineManager = class extends Subscribable {
	#online = true;
	#cleanup;
	#setup;
	constructor() {
		super();
		this.#setup = (onOnline) => {
			if (!isServer && window.addEventListener) {
				const onlineListener = () => onOnline(true);
				const offlineListener = () => onOnline(false);
				window.addEventListener("online", onlineListener, false);
				window.addEventListener("offline", offlineListener, false);
				return () => {
					window.removeEventListener("online", onlineListener);
					window.removeEventListener("offline", offlineListener);
				};
			}
		};
	}
	onSubscribe() {
		if (!this.#cleanup) this.setEventListener(this.#setup);
	}
	onUnsubscribe() {
		if (!this.hasListeners()) {
			this.#cleanup?.();
			this.#cleanup = void 0;
		}
	}
	setEventListener(setup) {
		this.#setup = setup;
		this.#cleanup?.();
		this.#cleanup = setup(this.setOnline.bind(this));
	}
	setOnline(online) {
		if (this.#online !== online) {
			this.#online = online;
			this.listeners.forEach((listener) => {
				listener(online);
			});
		}
	}
	isOnline() {
		return this.#online;
	}
};
var onlineManager = new OnlineManager();
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/retryer.js
function canFetch(networkMode) {
	return (networkMode ?? "online") === "online" ? onlineManager.isOnline() : true;
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/query.js
function fetchState(data, options) {
	return {
		fetchFailureCount: 0,
		fetchFailureReason: null,
		fetchStatus: canFetch(options.networkMode) ? "fetching" : "paused",
		...data === void 0 && {
			error: null,
			status: "pending"
		}
	};
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/queryObserver.js
var QueryObserver = class extends Subscribable {
	constructor(client, options) {
		super();
		this.options = options;
		this.#client = client;
		this.#selectError = null;
		this.#currentThenable = pendingThenable();
		this.bindMethods();
		this.setOptions(options);
	}
	#client;
	#currentQuery = void 0;
	#currentQueryInitialState = void 0;
	#currentResult = void 0;
	#currentResultState;
	#currentResultOptions;
	#currentThenable;
	#selectError;
	#selectFn;
	#selectResult;
	#lastQueryWithDefinedData;
	#staleTimeoutId;
	#refetchIntervalId;
	#currentRefetchInterval;
	#trackedProps = /* @__PURE__ */ new Set();
	bindMethods() {
		this.refetch = this.refetch.bind(this);
	}
	onSubscribe() {
		if (this.listeners.size === 1) {
			this.#currentQuery.addObserver(this);
			if (shouldFetchOnMount(this.#currentQuery, this.options)) this.#executeFetch();
			else this.updateResult();
			this.#updateTimers();
		}
	}
	onUnsubscribe() {
		if (!this.hasListeners()) this.destroy();
	}
	shouldFetchOnReconnect() {
		return shouldFetchOn(this.#currentQuery, this.options, this.options.refetchOnReconnect);
	}
	shouldFetchOnWindowFocus() {
		return shouldFetchOn(this.#currentQuery, this.options, this.options.refetchOnWindowFocus);
	}
	destroy() {
		this.listeners = /* @__PURE__ */ new Set();
		this.#clearStaleTimeout();
		this.#clearRefetchInterval();
		this.#currentQuery.removeObserver(this);
	}
	setOptions(options) {
		const prevOptions = this.options;
		const prevQuery = this.#currentQuery;
		this.options = this.#client.defaultQueryOptions(options);
		if (this.options.enabled !== void 0 && typeof this.options.enabled !== "boolean" && typeof this.options.enabled !== "function" && typeof resolveEnabled(this.options.enabled, this.#currentQuery) !== "boolean") throw new Error("Expected enabled to be a boolean or a callback that returns a boolean");
		this.#updateQuery();
		this.#currentQuery.setOptions(this.options);
		if (prevOptions._defaulted && !shallowEqualObjects(this.options, prevOptions)) this.#client.getQueryCache().notify({
			type: "observerOptionsUpdated",
			query: this.#currentQuery,
			observer: this
		});
		const mounted = this.hasListeners();
		if (mounted && shouldFetchOptionally(this.#currentQuery, prevQuery, this.options, prevOptions)) this.#executeFetch();
		this.updateResult();
		if (mounted && (this.#currentQuery !== prevQuery || resolveEnabled(this.options.enabled, this.#currentQuery) !== resolveEnabled(prevOptions.enabled, this.#currentQuery) || resolveStaleTime(this.options.staleTime, this.#currentQuery) !== resolveStaleTime(prevOptions.staleTime, this.#currentQuery))) this.#updateStaleTimeout();
		const nextRefetchInterval = this.#computeRefetchInterval();
		if (mounted && (this.#currentQuery !== prevQuery || resolveEnabled(this.options.enabled, this.#currentQuery) !== resolveEnabled(prevOptions.enabled, this.#currentQuery) || nextRefetchInterval !== this.#currentRefetchInterval)) this.#updateRefetchInterval(nextRefetchInterval);
	}
	getOptimisticResult(options) {
		const query = this.#client.getQueryCache().build(this.#client, options);
		const result = this.createResult(query, options);
		if (shouldAssignObserverCurrentProperties(this, result)) {
			this.#currentResult = result;
			this.#currentResultOptions = this.options;
			this.#currentResultState = this.#currentQuery.state;
		}
		return result;
	}
	getCurrentResult() {
		return this.#currentResult;
	}
	trackResult(result, onPropTracked) {
		return new Proxy(result, { get: (target, key) => {
			this.trackProp(key);
			onPropTracked?.(key);
			if (key === "promise") {
				this.trackProp("data");
				if (!this.options.experimental_prefetchInRender && this.#currentThenable.status === "pending") this.#currentThenable.reject(/* @__PURE__ */ new Error("experimental_prefetchInRender feature flag is not enabled"));
			}
			return Reflect.get(target, key);
		} });
	}
	trackProp(key) {
		this.#trackedProps.add(key);
	}
	getCurrentQuery() {
		return this.#currentQuery;
	}
	refetch({ ...options } = {}) {
		return this.fetch({ ...options });
	}
	fetchOptimistic(options) {
		const defaultedOptions = this.#client.defaultQueryOptions(options);
		const query = this.#client.getQueryCache().build(this.#client, defaultedOptions);
		return query.fetch().then(() => this.createResult(query, defaultedOptions));
	}
	fetch(fetchOptions) {
		return this.#executeFetch({
			...fetchOptions,
			cancelRefetch: fetchOptions.cancelRefetch ?? true
		}).then(() => {
			this.updateResult();
			return this.#currentResult;
		});
	}
	#executeFetch(fetchOptions) {
		this.#updateQuery();
		let promise = this.#currentQuery.fetch(this.options, fetchOptions);
		if (!fetchOptions?.throwOnError) promise = promise.catch(noop);
		return promise;
	}
	#updateStaleTimeout() {
		this.#clearStaleTimeout();
		const staleTime = resolveStaleTime(this.options.staleTime, this.#currentQuery);
		if (isServer || this.#currentResult.isStale || !isValidTimeout(staleTime)) return;
		const timeout = timeUntilStale(this.#currentResult.dataUpdatedAt, staleTime) + 1;
		this.#staleTimeoutId = timeoutManager.setTimeout(() => {
			if (!this.#currentResult.isStale) this.updateResult();
		}, timeout);
	}
	#computeRefetchInterval() {
		return (typeof this.options.refetchInterval === "function" ? this.options.refetchInterval(this.#currentQuery) : this.options.refetchInterval) ?? false;
	}
	#updateRefetchInterval(nextInterval) {
		this.#clearRefetchInterval();
		this.#currentRefetchInterval = nextInterval;
		if (isServer || resolveEnabled(this.options.enabled, this.#currentQuery) === false || !isValidTimeout(this.#currentRefetchInterval) || this.#currentRefetchInterval === 0) return;
		this.#refetchIntervalId = timeoutManager.setInterval(() => {
			if (this.options.refetchIntervalInBackground || focusManager.isFocused()) this.#executeFetch();
		}, this.#currentRefetchInterval);
	}
	#updateTimers() {
		this.#updateStaleTimeout();
		this.#updateRefetchInterval(this.#computeRefetchInterval());
	}
	#clearStaleTimeout() {
		if (this.#staleTimeoutId) {
			timeoutManager.clearTimeout(this.#staleTimeoutId);
			this.#staleTimeoutId = void 0;
		}
	}
	#clearRefetchInterval() {
		if (this.#refetchIntervalId) {
			timeoutManager.clearInterval(this.#refetchIntervalId);
			this.#refetchIntervalId = void 0;
		}
	}
	createResult(query, options) {
		const prevQuery = this.#currentQuery;
		const prevOptions = this.options;
		const prevResult = this.#currentResult;
		const prevResultState = this.#currentResultState;
		const prevResultOptions = this.#currentResultOptions;
		const queryInitialState = query !== prevQuery ? query.state : this.#currentQueryInitialState;
		const { state } = query;
		let newState = { ...state };
		let isPlaceholderData = false;
		let data;
		if (options._optimisticResults) {
			const mounted = this.hasListeners();
			const fetchOnMount = !mounted && shouldFetchOnMount(query, options);
			const fetchOptionally = mounted && shouldFetchOptionally(query, prevQuery, options, prevOptions);
			if (fetchOnMount || fetchOptionally) newState = {
				...newState,
				...fetchState(state.data, query.options)
			};
			if (options._optimisticResults === "isRestoring") newState.fetchStatus = "idle";
		}
		let { error, errorUpdatedAt, status } = newState;
		data = newState.data;
		let skipSelect = false;
		if (options.placeholderData !== void 0 && data === void 0 && status === "pending") {
			let placeholderData;
			if (prevResult?.isPlaceholderData && options.placeholderData === prevResultOptions?.placeholderData) {
				placeholderData = prevResult.data;
				skipSelect = true;
			} else placeholderData = typeof options.placeholderData === "function" ? options.placeholderData(this.#lastQueryWithDefinedData?.state.data, this.#lastQueryWithDefinedData) : options.placeholderData;
			if (placeholderData !== void 0) {
				status = "success";
				data = replaceData(prevResult?.data, placeholderData, options);
				isPlaceholderData = true;
			}
		}
		if (options.select && data !== void 0 && !skipSelect) if (prevResult && data === prevResultState?.data && options.select === this.#selectFn) data = this.#selectResult;
		else try {
			this.#selectFn = options.select;
			data = options.select(data);
			data = replaceData(prevResult?.data, data, options);
			this.#selectResult = data;
			this.#selectError = null;
		} catch (selectError) {
			this.#selectError = selectError;
		}
		if (this.#selectError) {
			error = this.#selectError;
			data = this.#selectResult;
			errorUpdatedAt = Date.now();
			status = "error";
		}
		const isFetching = newState.fetchStatus === "fetching";
		const isPending = status === "pending";
		const isError = status === "error";
		const isLoading = isPending && isFetching;
		const hasData = data !== void 0;
		const nextResult = {
			status,
			fetchStatus: newState.fetchStatus,
			isPending,
			isSuccess: status === "success",
			isError,
			isInitialLoading: isLoading,
			isLoading,
			data,
			dataUpdatedAt: newState.dataUpdatedAt,
			error,
			errorUpdatedAt,
			failureCount: newState.fetchFailureCount,
			failureReason: newState.fetchFailureReason,
			errorUpdateCount: newState.errorUpdateCount,
			isFetched: newState.dataUpdateCount > 0 || newState.errorUpdateCount > 0,
			isFetchedAfterMount: newState.dataUpdateCount > queryInitialState.dataUpdateCount || newState.errorUpdateCount > queryInitialState.errorUpdateCount,
			isFetching,
			isRefetching: isFetching && !isPending,
			isLoadingError: isError && !hasData,
			isPaused: newState.fetchStatus === "paused",
			isPlaceholderData,
			isRefetchError: isError && hasData,
			isStale: isStale(query, options),
			refetch: this.refetch,
			promise: this.#currentThenable,
			isEnabled: resolveEnabled(options.enabled, query) !== false
		};
		if (this.options.experimental_prefetchInRender) {
			const finalizeThenableIfPossible = (thenable) => {
				if (nextResult.status === "error") thenable.reject(nextResult.error);
				else if (nextResult.data !== void 0) thenable.resolve(nextResult.data);
			};
			const recreateThenable = () => {
				finalizeThenableIfPossible(this.#currentThenable = nextResult.promise = pendingThenable());
			};
			const prevThenable = this.#currentThenable;
			switch (prevThenable.status) {
				case "pending":
					if (query.queryHash === prevQuery.queryHash) finalizeThenableIfPossible(prevThenable);
					break;
				case "fulfilled":
					if (nextResult.status === "error" || nextResult.data !== prevThenable.value) recreateThenable();
					break;
				case "rejected":
					if (nextResult.status !== "error" || nextResult.error !== prevThenable.reason) recreateThenable();
					break;
			}
		}
		return nextResult;
	}
	updateResult() {
		const prevResult = this.#currentResult;
		const nextResult = this.createResult(this.#currentQuery, this.options);
		this.#currentResultState = this.#currentQuery.state;
		this.#currentResultOptions = this.options;
		if (this.#currentResultState.data !== void 0) this.#lastQueryWithDefinedData = this.#currentQuery;
		if (shallowEqualObjects(nextResult, prevResult)) return;
		this.#currentResult = nextResult;
		const shouldNotifyListeners = () => {
			if (!prevResult) return true;
			const { notifyOnChangeProps } = this.options;
			const notifyOnChangePropsValue = typeof notifyOnChangeProps === "function" ? notifyOnChangeProps() : notifyOnChangeProps;
			if (notifyOnChangePropsValue === "all" || !notifyOnChangePropsValue && !this.#trackedProps.size) return true;
			const includedProps = new Set(notifyOnChangePropsValue ?? this.#trackedProps);
			if (this.options.throwOnError) includedProps.add("error");
			return Object.keys(this.#currentResult).some((key) => {
				const typedKey = key;
				return this.#currentResult[typedKey] !== prevResult[typedKey] && includedProps.has(typedKey);
			});
		};
		this.#notify({ listeners: shouldNotifyListeners() });
	}
	#updateQuery() {
		const query = this.#client.getQueryCache().build(this.#client, this.options);
		if (query === this.#currentQuery) return;
		const prevQuery = this.#currentQuery;
		this.#currentQuery = query;
		this.#currentQueryInitialState = query.state;
		if (this.hasListeners()) {
			prevQuery?.removeObserver(this);
			query.addObserver(this);
		}
	}
	onQueryUpdate() {
		this.updateResult();
		if (this.hasListeners()) this.#updateTimers();
	}
	#notify(notifyOptions) {
		notifyManager.batch(() => {
			if (notifyOptions.listeners) this.listeners.forEach((listener) => {
				listener(this.#currentResult);
			});
			this.#client.getQueryCache().notify({
				query: this.#currentQuery,
				type: "observerResultsUpdated"
			});
		});
	}
};
function shouldLoadOnMount(query, options) {
	return resolveEnabled(options.enabled, query) !== false && query.state.data === void 0 && !(query.state.status === "error" && options.retryOnMount === false);
}
function shouldFetchOnMount(query, options) {
	return shouldLoadOnMount(query, options) || query.state.data !== void 0 && shouldFetchOn(query, options, options.refetchOnMount);
}
function shouldFetchOn(query, options, field) {
	if (resolveEnabled(options.enabled, query) !== false && resolveStaleTime(options.staleTime, query) !== "static") {
		const value = typeof field === "function" ? field(query) : field;
		return value === "always" || value !== false && isStale(query, options);
	}
	return false;
}
function shouldFetchOptionally(query, prevQuery, options, prevOptions) {
	return (query !== prevQuery || resolveEnabled(prevOptions.enabled, query) === false) && (!options.suspense || query.state.status !== "error") && isStale(query, options);
}
function isStale(query, options) {
	return resolveEnabled(options.enabled, query) !== false && query.isStaleByTime(resolveStaleTime(options.staleTime, query));
}
function shouldAssignObserverCurrentProperties(observer, optimisticResult) {
	if (!shallowEqualObjects(observer.getCurrentResult(), optimisticResult)) return true;
	return false;
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/infiniteQueryBehavior.js
function infiniteQueryBehavior(pages) {
	return { onFetch: (context, query) => {
		const options = context.options;
		const direction = context.fetchOptions?.meta?.fetchMore?.direction;
		const oldPages = context.state.data?.pages || [];
		const oldPageParams = context.state.data?.pageParams || [];
		let result = {
			pages: [],
			pageParams: []
		};
		let currentPage = 0;
		const fetchFn = async () => {
			let cancelled = false;
			const addSignalProperty = (object) => {
				addConsumeAwareSignal(object, () => context.signal, () => cancelled = true);
			};
			const queryFn = ensureQueryFn(context.options, context.fetchOptions);
			const fetchPage = async (data, param, previous) => {
				if (cancelled) return Promise.reject();
				if (param == null && data.pages.length) return Promise.resolve(data);
				const createQueryFnContext = () => {
					const queryFnContext2 = {
						client: context.client,
						queryKey: context.queryKey,
						pageParam: param,
						direction: previous ? "backward" : "forward",
						meta: context.options.meta
					};
					addSignalProperty(queryFnContext2);
					return queryFnContext2;
				};
				const page = await queryFn(createQueryFnContext());
				const { maxPages } = context.options;
				const addTo = previous ? addToStart : addToEnd;
				return {
					pages: addTo(data.pages, page, maxPages),
					pageParams: addTo(data.pageParams, param, maxPages)
				};
			};
			if (direction && oldPages.length) {
				const previous = direction === "backward";
				const pageParamFn = previous ? getPreviousPageParam : getNextPageParam;
				const oldData = {
					pages: oldPages,
					pageParams: oldPageParams
				};
				result = await fetchPage(oldData, pageParamFn(options, oldData), previous);
			} else {
				const remainingPages = pages ?? oldPages.length;
				do {
					const param = currentPage === 0 ? oldPageParams[0] ?? options.initialPageParam : getNextPageParam(options, result);
					if (currentPage > 0 && param == null) break;
					result = await fetchPage(result, param);
					currentPage++;
				} while (currentPage < remainingPages);
			}
			return result;
		};
		if (context.options.persister) context.fetchFn = () => {
			return context.options.persister?.(fetchFn, {
				client: context.client,
				queryKey: context.queryKey,
				meta: context.options.meta,
				signal: context.signal
			}, query);
		};
		else context.fetchFn = fetchFn;
	} };
}
function getNextPageParam(options, { pages, pageParams }) {
	const lastIndex = pages.length - 1;
	return pages.length > 0 ? options.getNextPageParam(pages[lastIndex], pages, pageParams[lastIndex], pageParams) : void 0;
}
function getPreviousPageParam(options, { pages, pageParams }) {
	return pages.length > 0 ? options.getPreviousPageParam?.(pages[0], pages, pageParams[0], pageParams) : void 0;
}
function hasNextPage(options, data) {
	if (!data) return false;
	return getNextPageParam(options, data) != null;
}
function hasPreviousPage(options, data) {
	if (!data || !options.getPreviousPageParam) return false;
	return getPreviousPageParam(options, data) != null;
}
//#endregion
//#region node_modules/@tanstack/query-core/build/modern/infiniteQueryObserver.js
var InfiniteQueryObserver = class extends QueryObserver {
	constructor(client, options) {
		super(client, options);
	}
	bindMethods() {
		super.bindMethods();
		this.fetchNextPage = this.fetchNextPage.bind(this);
		this.fetchPreviousPage = this.fetchPreviousPage.bind(this);
	}
	setOptions(options) {
		super.setOptions({
			...options,
			behavior: infiniteQueryBehavior()
		});
	}
	getOptimisticResult(options) {
		options.behavior = infiniteQueryBehavior();
		return super.getOptimisticResult(options);
	}
	fetchNextPage(options) {
		return this.fetch({
			...options,
			meta: { fetchMore: { direction: "forward" } }
		});
	}
	fetchPreviousPage(options) {
		return this.fetch({
			...options,
			meta: { fetchMore: { direction: "backward" } }
		});
	}
	createResult(query, options) {
		const { state } = query;
		const parentResult = super.createResult(query, options);
		const { isFetching, isRefetching, isError, isRefetchError } = parentResult;
		const fetchDirection = state.fetchMeta?.fetchMore?.direction;
		const isFetchNextPageError = isError && fetchDirection === "forward";
		const isFetchingNextPage = isFetching && fetchDirection === "forward";
		const isFetchPreviousPageError = isError && fetchDirection === "backward";
		const isFetchingPreviousPage = isFetching && fetchDirection === "backward";
		return {
			...parentResult,
			fetchNextPage: this.fetchNextPage,
			fetchPreviousPage: this.fetchPreviousPage,
			hasNextPage: hasNextPage(options, state.data),
			hasPreviousPage: hasPreviousPage(options, state.data),
			isFetchNextPageError,
			isFetchingNextPage,
			isFetchPreviousPageError,
			isFetchingPreviousPage,
			isRefetchError: isRefetchError && !isFetchNextPageError && !isFetchPreviousPageError,
			isRefetching: isRefetching && !isFetchingNextPage && !isFetchingPreviousPage
		};
	}
};
//#endregion
//#region node_modules/dequal/dist/index.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var has = Object.prototype.hasOwnProperty;
function find(iter, tar, key) {
	for (key of iter.keys()) if (dequal(key, tar)) return key;
}
function dequal(foo, bar) {
	var ctor, len, tmp;
	if (foo === bar) return true;
	if (foo && bar && (ctor = foo.constructor) === bar.constructor) {
		if (ctor === Date) return foo.getTime() === bar.getTime();
		if (ctor === RegExp) return foo.toString() === bar.toString();
		if (ctor === Array) {
			if ((len = foo.length) === bar.length) while (len-- && dequal(foo[len], bar[len]));
			return len === -1;
		}
		if (ctor === Set) {
			if (foo.size !== bar.size) return false;
			for (len of foo) {
				tmp = len;
				if (tmp && typeof tmp === "object") {
					tmp = find(bar, tmp);
					if (!tmp) return false;
				}
				if (!bar.has(tmp)) return false;
			}
			return true;
		}
		if (ctor === Map) {
			if (foo.size !== bar.size) return false;
			for (len of foo) {
				tmp = len[0];
				if (tmp && typeof tmp === "object") {
					tmp = find(bar, tmp);
					if (!tmp) return false;
				}
				if (!dequal(len[1], bar.get(tmp))) return false;
			}
			return true;
		}
		if (ctor === ArrayBuffer) {
			foo = new Uint8Array(foo);
			bar = new Uint8Array(bar);
		} else if (ctor === DataView) {
			if ((len = foo.byteLength) === bar.byteLength) while (len-- && foo.getInt8(len) === bar.getInt8(len));
			return len === -1;
		}
		if (ArrayBuffer.isView(foo)) {
			if ((len = foo.byteLength) === bar.byteLength) while (len-- && foo[len] === bar[len]);
			return len === -1;
		}
		if (!ctor || typeof foo === "object") {
			len = 0;
			for (ctor in foo) {
				if (has.call(foo, ctor) && ++len && !has.call(bar, ctor)) return false;
				if (!(ctor in bar) || !dequal(foo[ctor], bar[ctor])) return false;
			}
			return Object.keys(bar).length === len;
		}
	}
	return foo !== foo && bar !== bar;
}
//#endregion
//#region node_modules/@clerk/shared/dist/runtime/react/index.mjs
/**
* Assert that the context value exists, otherwise throw an error.
*
* @internal
*/
function assertContextExists(contextVal, msgOrCtx) {
	if (!contextVal) throw typeof msgOrCtx === "string" ? new Error(msgOrCtx) : /* @__PURE__ */ new Error(`${msgOrCtx.displayName} not found`);
}
/**
* Create and return a Context and two hooks that return the context value.
* The Context type is derived from the type passed in by the user.
*
* The first hook returned guarantees that the context exists so the returned value is always `CtxValue`
* The second hook makes no guarantees, so the returned value can be `CtxValue | undefined`
*
* @internal
*/
var createContextAndHook = (displayName, options) => {
	const { assertCtxFn = assertContextExists } = options || {};
	const Ctx = import_react.createContext(void 0);
	Ctx.displayName = displayName;
	const useCtx = () => {
		const ctx = import_react.useContext(Ctx);
		assertCtxFn(ctx, `${displayName} not found`);
		return ctx.value;
	};
	const useCtxWithoutGuarantee = () => {
		const ctx = import_react.useContext(Ctx);
		return ctx ? ctx.value : {};
	};
	return [
		Ctx,
		useCtx,
		useCtxWithoutGuarantee
	];
};
var [ClerkInstanceContext, useClerkInstanceContext] = createContextAndHook("ClerkInstanceContext");
var [InitialStateContext, _useInitialStateContext] = createContextAndHook("InitialStateContext");
/**
* Provides initial Clerk state (session, user, organization data) from server-side rendering
* to child components via React context.
*
* Passing in a promise is only supported for React >= 19.
*
* The initialState is snapshotted on mount and cannot change during the component lifecycle.
*
* Note that different parts of the React tree can use separate InitialStateProvider instances
* with different initialState values if needed.
*/
function InitialStateProvider({ children, initialState }) {
	const [initialStateSnapshot] = (0, import_react.useState)(initialState);
	const initialStateCtx = import_react.useMemo(() => ({ value: initialStateSnapshot }), [initialStateSnapshot]);
	return /* @__PURE__ */ import_react.createElement(InitialStateContext.Provider, { value: initialStateCtx }, children);
}
function useInitialStateContext() {
	const initialState = _useInitialStateContext();
	if (initialState instanceof Promise) if ("use" in import_react.default && typeof import_react.use === "function") return import_react.use(initialState);
	else throw new Error("initialState cannot be a promise if React version is less than 19");
	return initialState;
}
import_react.createContext({});
var [CheckoutContext, useCheckoutContext] = createContextAndHook("CheckoutContext");
var __experimental_CheckoutProvider = ({ children, ...rest }) => {
	return /* @__PURE__ */ import_react.createElement(CheckoutContext.Provider, { value: { value: rest } }, children);
};
/**
* @internal
*/
function useAssertWrappedByClerkProvider$1(displayNameOrFn) {
	if (!import_react.useContext(ClerkInstanceContext)) {
		if (typeof displayNameOrFn === "function") {
			displayNameOrFn();
			return;
		}
		throw new Error(`${displayNameOrFn} can only be used within the <ClerkProvider /> component.

Possible fixes:
1. Ensure that the <ClerkProvider /> is correctly wrapping your application where this component is used.
2. Check for multiple versions of the \`@clerk/shared\` package in your project. Use a tool like \`npm ls @clerk/shared\` to identify multiple versions, and update your dependencies to only rely on one.

Learn more: https://clerk.com/docs/components/clerk-provider`.trim());
	}
}
var STABLE_KEYS = {
	USER_MEMBERSHIPS_KEY: "userMemberships",
	USER_INVITATIONS_KEY: "userInvitations",
	USER_SUGGESTIONS_KEY: "userSuggestions",
	DOMAINS_KEY: "domains",
	MEMBERSHIP_REQUESTS_KEY: "membershipRequests",
	MEMBERSHIPS_KEY: "memberships",
	INVITATIONS_KEY: "invitations",
	PLANS_KEY: "billing-plans",
	SUBSCRIPTION_KEY: "billing-subscription",
	PAYMENT_METHODS_KEY: "billing-payment-methods",
	PAYMENT_ATTEMPTS_KEY: "billing-payment-attempts",
	STATEMENTS_KEY: "billing-statements",
	API_KEYS_KEY: "apiKeys",
	ORGANIZATION_CREATION_DEFAULTS_KEY: "organizationCreationDefaults",
	OAUTH_CONSENT_INFO_KEY: "oauthConsentInfo"
};
/**
* @internal
*/
function createCacheKeys(params) {
	return {
		queryKey: [
			params.stablePrefix,
			params.authenticated,
			params.tracked,
			params.untracked
		],
		invalidationKey: [
			params.stablePrefix,
			params.authenticated,
			params.tracked
		],
		stableKey: params.stablePrefix,
		authenticated: params.authenticated
	};
}
/**
* @internal
*/
function defineKeepPreviousDataFn(enabled) {
	if (enabled) return function KeepPreviousDataFn(previousData) {
		return previousData;
	};
}
/**
* Creates a recursively self-referential Proxy that safely handles:
* - Arbitrary property access (e.g., obj.any.prop.path)
* - Function calls at any level (e.g., obj.a().b.c())
* - Construction (e.g., new obj.a.b())
*
* Always returns itself to allow infinite chaining without throwing.
*/
function createRecursiveProxy(label) {
	const callableTarget = function noop$1() {};
	let self;
	self = new Proxy(callableTarget, {
		get(_target, prop) {
			if (prop === "then") return;
			if (prop === "toString") return () => `[${label}]`;
			if (prop === Symbol.toPrimitive) return () => 0;
			return self;
		},
		apply() {
			return self;
		},
		construct() {
			return self;
		},
		has() {
			return false;
		},
		set() {
			return false;
		}
	});
	return self;
}
var mockQueryClient = createRecursiveProxy("ClerkMockQueryClient");
var useClerkQueryClient = () => {
	const clerk = useClerkInstanceContext();
	const queryClient = clerk.__internal_queryClient;
	const [, setQueryClientLoaded] = (0, import_react.useState)(typeof queryClient === "object" && "__tag" in queryClient && queryClient.__tag === "clerk-rq-client");
	(0, import_react.useEffect)(() => {
		const _setQueryClientLoaded = () => setQueryClientLoaded(true);
		clerk.on("queryClientStatus", _setQueryClientLoaded);
		return () => {
			clerk.off("queryClientStatus", _setQueryClientLoaded);
		};
	}, [clerk, setQueryClientLoaded]);
	const isLoaded = typeof queryClient === "object" && "__tag" in queryClient && queryClient.__tag === "clerk-rq-client";
	return [queryClient?.client || mockQueryClient, isLoaded];
};
/**
* Stripped down version of useBaseQuery from @tanstack/query-core.
* This implementation allows for an observer to be created every time a query client changes.
*/
/**
* An alternative `useBaseQuery` implementation that allows for an observer to be created every time a query client changes.
*
* @internal
*/
function useBaseQuery(options, Observer) {
	const [client, isQueryClientLoaded] = useClerkQueryClient();
	const defaultedOptions = isQueryClientLoaded ? client.defaultQueryOptions(options) : options;
	defaultedOptions._optimisticResults = "optimistic";
	const observer = import_react.useMemo(() => {
		return new Observer(client, defaultedOptions);
	}, [client]);
	const result = observer.getOptimisticResult(defaultedOptions);
	const shouldSubscribe = options.subscribed !== false;
	import_react.useSyncExternalStore(import_react.useCallback((onStoreChange) => {
		const unsubscribe = shouldSubscribe ? observer.subscribe(notifyManager.batchCalls(onStoreChange)) : noop;
		observer.updateResult();
		return unsubscribe;
	}, [observer, shouldSubscribe]), () => observer.getCurrentResult(), () => observer.getCurrentResult());
	import_react.useEffect(() => {
		observer.setOptions(defaultedOptions);
	}, [defaultedOptions, observer]);
	if (!isQueryClientLoaded) return {
		data: void 0,
		error: null,
		isLoading: false,
		isFetching: false,
		status: "pending"
	};
	return !defaultedOptions.notifyOnChangeProps ? observer.trackResult(result) : result;
}
/**
*
*/
function useClerkInfiniteQuery(options) {
	return useBaseQuery(options, InfiniteQueryObserver);
}
/**
*
*/
function useClerkQuery(options) {
	return useBaseQuery(options, QueryObserver);
}
/**
* A hook that retains the previous value of a primitive type.
* It uses a ref to prevent causing unnecessary re-renders.
*
* @internal
*
* @example
* ```
* Render 1: value = 'A' → returns null
* Render 2: value = 'B' → returns 'A'
* Render 3: value = 'B' → returns 'A'
* Render 4: value = 'B' → returns 'A'
* Render 5: value = 'C' → returns 'B'
* ```
*/
function usePreviousValue(value) {
	const currentRef = (0, import_react.useRef)(value);
	const previousRef = (0, import_react.useRef)(null);
	if (currentRef.current !== value) {
		previousRef.current = currentRef.current;
		currentRef.current = value;
	}
	return previousRef.current;
}
var withInfiniteKey = (key) => [key, `${key}-inf`];
/**
* Clears React Query caches associated with the given stable prefixes when
* the authenticated state transitions from signed-in to signed-out.
*
* @internal
*/
function useClearQueriesOnSignOut(options) {
	const { isSignedOut, stableKeys, authenticated = true, onCleanup } = options;
	const stableKeysRef = (0, import_react.useRef)(stableKeys);
	const [queryClient] = useClerkQueryClient();
	const previousIsSignedIn = usePreviousValue(!isSignedOut);
	(0, import_react.useEffect)(() => {
		if (authenticated !== true) return;
		if (previousIsSignedIn && isSignedOut === true) {
			queryClient.removeQueries({ predicate: (query) => {
				const [cachedStableKey, queryAuthenticated] = query.queryKey;
				return queryAuthenticated === true && typeof cachedStableKey === "string" && (Array.isArray(stableKeysRef.current) ? stableKeysRef.current.includes(cachedStableKey) : stableKeysRef.current === cachedStableKey);
			} });
			onCleanup?.();
		}
	}, [
		authenticated,
		isSignedOut,
		previousIsSignedIn,
		queryClient
	]);
}
/**
* A hook that safely merges user-provided pagination options with default values.
* It caches initial pagination values (page and size) until component unmount to prevent unwanted rerenders.
*
* @internal
*
* @example
* ```typescript
* // Example 1: With user-provided options
* const userOptions = { initialPage: 2, pageSize: 20, infinite: true };
* const defaults = { initialPage: 1, pageSize: 10, infinite: false };
* useWithSafeValues(userOptions, defaults);
* // Returns { initialPage: 2, pageSize: 20, infinite: true }
*
* // Example 2: With boolean true (use defaults)
* const params = true;
* const defaults = { initialPage: 1, pageSize: 10, infinite: false };
* useWithSafeValues(params, defaults);
* // Returns { initialPage: 1, pageSize: 10, infinite: false }
*
* // Example 3: With undefined options (fallback to defaults)
* const params = undefined;
* const defaults = { initialPage: 1, pageSize: 10, infinite: false };
* useWithSafeValues(params, defaults);
* // Returns { initialPage: 1, pageSize: 10, infinite: false }
* ```
*/
var useWithSafeValues = (params, defaultValues) => {
	const shouldUseDefaults = typeof params === "boolean" && params;
	const initialPageRef = (0, import_react.useRef)(shouldUseDefaults ? defaultValues.initialPage : params?.initialPage ?? defaultValues.initialPage);
	const pageSizeRef = (0, import_react.useRef)(shouldUseDefaults ? defaultValues.pageSize : params?.pageSize ?? defaultValues.pageSize);
	const newObj = {};
	for (const key of Object.keys(defaultValues)) newObj[key] = shouldUseDefaults ? defaultValues[key] : params?.[key] ?? defaultValues[key];
	return {
		...newObj,
		initialPage: initialPageRef.current,
		pageSize: pageSizeRef.current
	};
};
/**
* Calculates the offset count for pagination based on initial page and page size.
* This represents the number of items to skip before the first page.
*
* @param initialPage - The starting page number (1-based)
* @param pageSize - The number of items per page
* @returns The number of items to offset
*
* @example
* ```typescript
* calculateOffsetCount(1, 10); // Returns 0 (no offset for first page)
* calculateOffsetCount(2, 10); // Returns 10 (skip first 10 items)
* calculateOffsetCount(3, 20); // Returns 40 (skip first 40 items)
* ```
*/
function calculateOffsetCount(initialPage, pageSize) {
	return (initialPage - 1) * pageSize;
}
/**
* Calculates the total number of pages based on total count, offset, and page size.
*
* @param totalCount - The total number of items
* @param offsetCount - The number of items to offset (from calculateOffsetCount)
* @param pageSize - The number of items per page
* @returns The total number of pages
*
* @example
* ```typescript
* calculatePageCount(100, 0, 10);  // Returns 10
* calculatePageCount(95, 0, 10);   // Returns 10 (rounds up)
* calculatePageCount(100, 20, 10); // Returns 8 (100 - 20 = 80 items, 8 pages)
* ```
*/
function calculatePageCount(totalCount, offsetCount, pageSize) {
	return Math.ceil((totalCount - offsetCount) / pageSize);
}
/**
* Determines if there is a next page available in non-infinite pagination mode.
*
* @param totalCount - The total number of items
* @param offsetCount - The number of items to offset
* @param currentPage - The current page number (1-based)
* @param pageSize - The number of items per page
* @returns True if there are more items beyond the current page
*
* @example
* ```typescript
* calculateHasNextPage(100, 0, 1, 10);  // Returns true (page 1 of 10)
* calculateHasNextPage(100, 0, 10, 10); // Returns false (last page)
* calculateHasNextPage(25, 0, 2, 10);   // Returns true (page 2, 5 more items)
* calculateHasNextPage(20, 0, 2, 10);   // Returns false (exactly 2 pages)
* ```
*/
function calculateHasNextPage(totalCount, offsetCount, currentPage, pageSize) {
	return totalCount - offsetCount > currentPage * pageSize;
}
/**
* Determines if there is a previous page available in non-infinite pagination mode.
*
* @param currentPage - The current page number (1-based)
* @param pageSize - The number of items per page
* @param offsetCount - The number of items to offset
* @returns True if there are pages before the current page
*
* @example
* ```typescript
* calculateHasPreviousPage(1, 10, 0);  // Returns false (first page)
* calculateHasPreviousPage(2, 10, 0);  // Returns true (can go back to page 1)
* calculateHasPreviousPage(1, 10, 10); // Returns false (first page with offset)
* ```
*/
function calculateHasPreviousPage(currentPage, pageSize, offsetCount) {
	return (currentPage - 1) * pageSize > offsetCount;
}
var usePagesOrInfinite = (params) => {
	const { fetcher, config, keys } = params;
	const [paginatedPage, setPaginatedPage] = (0, import_react.useState)(config.initialPage ?? 1);
	const initialPageRef = (0, import_react.useRef)(config.initialPage ?? 1);
	const pageSizeRef = (0, import_react.useRef)(config.pageSize ?? 10);
	const enabled = config.enabled ?? true;
	const isSignedIn = config.isSignedIn;
	const triggerInfinite = config.infinite ?? false;
	const cacheMode = config.__experimental_mode === "cache";
	const keepPreviousData = config.keepPreviousData ?? false;
	const [queryClient] = useClerkQueryClient();
	const queriesEnabled = enabled && Boolean(fetcher) && !cacheMode && isSignedIn !== false;
	const [forceUpdateCounter, setForceUpdateCounter] = (0, import_react.useState)(0);
	const forceUpdate = (0, import_react.useCallback)((updater) => {
		setForceUpdateCounter(updater);
	}, []);
	const pagesQueryKey = (0, import_react.useMemo)(() => {
		const [stablePrefix, authenticated, tracked, untracked] = keys.queryKey;
		return [
			stablePrefix,
			authenticated,
			tracked,
			{
				...untracked,
				args: {
					...untracked.args,
					initialPage: paginatedPage,
					pageSize: pageSizeRef.current
				}
			}
		];
	}, [keys.queryKey, paginatedPage]);
	const singlePageQuery = useClerkQuery({
		queryKey: pagesQueryKey,
		queryFn: ({ queryKey }) => {
			const { args } = queryKey[3];
			if (!fetcher) return;
			return fetcher(args);
		},
		staleTime: 6e4,
		enabled: queriesEnabled && !triggerInfinite,
		placeholderData: defineKeepPreviousDataFn(keepPreviousData)
	});
	const infiniteQueryKey = (0, import_react.useMemo)(() => {
		const [stablePrefix, authenticated, tracked, untracked] = keys.queryKey;
		return [
			stablePrefix + "-inf",
			authenticated,
			tracked,
			untracked
		];
	}, [keys.queryKey]);
	const infiniteQuery = useClerkInfiniteQuery({
		queryKey: infiniteQueryKey,
		initialPageParam: config.initialPage ?? 1,
		getNextPageParam: (lastPage, allPages, lastPageParam) => {
			const total = lastPage?.total_count ?? 0;
			return (allPages.length + (config.initialPage ? config.initialPage - 1 : 0)) * (config.pageSize ?? 10) < total ? lastPageParam + 1 : void 0;
		},
		queryFn: ({ pageParam, queryKey }) => {
			const { args } = queryKey[3];
			if (!fetcher) return;
			return fetcher({
				...args,
				initialPage: pageParam,
				pageSize: pageSizeRef.current
			});
		},
		staleTime: 6e4,
		enabled: queriesEnabled && triggerInfinite
	});
	useClearQueriesOnSignOut({
		isSignedOut: isSignedIn === false,
		authenticated: keys.authenticated,
		stableKeys: withInfiniteKey(keys.stableKey),
		onCleanup: () => {
			setPaginatedPage(initialPageRef.current);
			Promise.resolve().then(() => forceUpdate((n) => n + 1));
		}
	});
	const { data, count, page } = (0, import_react.useMemo)(() => {
		if (triggerInfinite) {
			const cachedData = queryClient.getQueryData(infiniteQueryKey);
			const pages = queriesEnabled ? infiniteQuery.data?.pages ?? cachedData?.pages ?? [] : cachedData?.pages ?? [];
			const validPages = Array.isArray(pages) ? pages.filter(Boolean) : [];
			return {
				data: validPages.map((a) => a?.data).flat().filter(Boolean) ?? [],
				count: validPages[validPages.length - 1]?.total_count ?? 0,
				page: validPages.length > 0 ? validPages.length : initialPageRef.current
			};
		}
		const pageData = queriesEnabled ? singlePageQuery.data ?? queryClient.getQueryData(pagesQueryKey) : queryClient.getQueryData(pagesQueryKey);
		return {
			data: Array.isArray(pageData?.data) ? pageData.data : [],
			count: typeof pageData?.total_count === "number" ? pageData.total_count : 0,
			page: paginatedPage
		};
	}, [
		queriesEnabled,
		forceUpdateCounter,
		triggerInfinite,
		infiniteQuery.data?.pages,
		singlePageQuery.data,
		queryClient,
		infiniteQueryKey,
		pagesQueryKey,
		paginatedPage
	]);
	const fetchPage = (0, import_react.useCallback)((numberOrgFn) => {
		if (triggerInfinite) {
			const next = typeof numberOrgFn === "function" ? numberOrgFn(page) : numberOrgFn;
			const targetCount = Math.max(0, next);
			const cachedData = queryClient.getQueryData(infiniteQueryKey);
			if (targetCount - (infiniteQuery.data?.pages ?? cachedData?.pages ?? []).length > 0) infiniteQuery.fetchNextPage({ cancelRefetch: false });
			return;
		}
		return setPaginatedPage(numberOrgFn);
	}, [
		infiniteQuery,
		page,
		triggerInfinite,
		queryClient,
		infiniteQueryKey
	]);
	const isLoading = triggerInfinite ? infiniteQuery.isLoading : singlePageQuery.isLoading;
	const isFetching = triggerInfinite ? infiniteQuery.isFetching : singlePageQuery.isFetching;
	const error = (triggerInfinite ? infiniteQuery.error : singlePageQuery.error) ?? null;
	const isError = !!error;
	const fetchNext = (0, import_react.useCallback)(() => {
		if (triggerInfinite) {
			infiniteQuery.fetchNextPage({ cancelRefetch: false });
			return;
		}
		setPaginatedPage((n) => Math.max(0, n + 1));
	}, [infiniteQuery, triggerInfinite]);
	const fetchPrevious = (0, import_react.useCallback)(() => {
		if (triggerInfinite) return;
		setPaginatedPage((n) => Math.max(0, n - 1));
	}, [triggerInfinite]);
	const offsetCount = calculateOffsetCount(initialPageRef.current, pageSizeRef.current);
	const pageCount = calculatePageCount(count, offsetCount, pageSizeRef.current);
	const hasNextPage = triggerInfinite ? Boolean(infiniteQuery.hasNextPage) : calculateHasNextPage(count, offsetCount, page, pageSizeRef.current);
	const hasPreviousPage = triggerInfinite ? Boolean(infiniteQuery.hasPreviousPage) : calculateHasPreviousPage(page, pageSizeRef.current, offsetCount);
	const setData = (value) => {
		if (triggerInfinite) {
			queryClient.setQueryData(infiniteQueryKey, (prevValue = {}) => {
				const prevPages = Array.isArray(prevValue?.pages) ? prevValue.pages : [];
				const nextPages = typeof value === "function" ? value(prevPages) : value;
				return {
					...prevValue,
					pages: nextPages
				};
			});
			forceUpdate((n) => n + 1);
			return Promise.resolve();
		}
		queryClient.setQueryData(pagesQueryKey, (prevValue = {
			data: [],
			total_count: 0
		}) => {
			return typeof value === "function" ? value(prevValue) : value;
		});
		forceUpdate((n) => n + 1);
		return Promise.resolve();
	};
	const revalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: keys.invalidationKey });
		const [stablePrefix, ...rest] = keys.invalidationKey;
		return queryClient.invalidateQueries({ queryKey: [stablePrefix + "-inf", ...rest] });
	};
	return {
		data,
		count,
		error,
		isLoading,
		isFetching,
		isError,
		page,
		pageCount,
		fetchPage,
		fetchNext,
		fetchPrevious,
		hasNextPage,
		hasPreviousPage,
		revalidate,
		setData
	};
};
/**
* The `useAPIKeys()` hook provides access to paginated API keys for the current user or organization.
*
* @example
* ### Basic usage with default pagination
*
* ```tsx
* const { data, isLoading, page, pageCount, fetchNext, fetchPrevious } = useAPIKeys({
*   subject: 'user_123',
*   pageSize: 10,
*   initialPage: 1,
* });
* ```
*
* @example
* ### With search query
*
* ```tsx
* const [searchValue, setSearchValue] = useState('');
* const debouncedSearch = useDebounce(searchValue, 500);
*
* const { data, isLoading } = useAPIKeys({
*   subject: 'user_123',
*   query: debouncedSearch.trim(),
*   pageSize: 10,
* });
* ```
*
* @example
* ### Infinite scroll
*
* ```tsx
* const { data, isLoading, fetchNext, hasNextPage } = useAPIKeys({
*   subject: 'user_123',
*   infinite: true,
* });
* ```
*/
function useAPIKeys(params) {
	useAssertWrappedByClerkProvider$1("useAPIKeys");
	const safeValues = useWithSafeValues(params, {
		initialPage: 1,
		pageSize: 10,
		keepPreviousData: false,
		infinite: false,
		subject: "",
		query: "",
		enabled: true
	});
	const clerk = useClerkInstanceContext();
	clerk.telemetry?.record(eventMethodCalled("useAPIKeys"));
	const hookParams = {
		initialPage: safeValues.initialPage,
		pageSize: safeValues.pageSize,
		...safeValues.subject ? { subject: safeValues.subject } : {},
		...safeValues.query ? { query: safeValues.query } : {}
	};
	const isEnabled = (safeValues.enabled ?? true) && clerk.loaded;
	return usePagesOrInfinite({
		fetcher: clerk.apiKeys?.getAll ? (params$1) => clerk.apiKeys.getAll({
			...params$1,
			subject: safeValues.subject
		}) : void 0,
		config: {
			keepPreviousData: safeValues.keepPreviousData,
			infinite: safeValues.infinite,
			enabled: isEnabled,
			isSignedIn: clerk.user !== null,
			initialPage: safeValues.initialPage,
			pageSize: safeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.API_KEYS_KEY,
			authenticated: true,
			tracked: { subject: safeValues.subject },
			untracked: { args: hookParams }
		})
	});
}
function useUserBase() {
	const clerk = useClerkInstanceContext();
	const initialState = useInitialStateContext();
	const getInitialState = (0, import_react.useCallback)(() => initialState?.user, [initialState?.user]);
	return (0, import_react.useSyncExternalStore)((0, import_react.useCallback)((callback) => {
		return clerk.addListener(callback, { skipInitialEmit: true });
	}, [clerk]), (0, import_react.useCallback)(() => {
		if (!clerk.loaded || !clerk.__internal_lastEmittedResources) return getInitialState();
		return clerk.__internal_lastEmittedResources.user;
	}, [clerk, getInitialState]), getInitialState);
}
function useOrganizationBase() {
	const clerk = useClerkInstanceContext();
	const initialState = useInitialStateContext();
	const getInitialState = (0, import_react.useCallback)(() => initialState?.organization, [initialState?.organization]);
	return (0, import_react.useSyncExternalStore)((0, import_react.useCallback)((callback) => clerk.addListener(callback, { skipInitialEmit: true }), [clerk]), (0, import_react.useCallback)(() => {
		if (!clerk.loaded || !clerk.__internal_lastEmittedResources) return getInitialState();
		return clerk.__internal_lastEmittedResources.organization;
	}, [clerk, getInitialState]), getInitialState);
}
function useSessionBase() {
	const clerk = useClerkInstanceContext();
	const initialState = useInitialStateContext();
	const getInitialState = (0, import_react.useCallback)(() => {
		return initialState ? deriveFromSsrInitialState(initialState)?.session : void 0;
	}, [initialState]);
	return (0, import_react.useSyncExternalStore)((0, import_react.useCallback)((callback) => clerk.addListener(callback, { skipInitialEmit: true }), [clerk]), (0, import_react.useCallback)(() => {
		if (!clerk.loaded || !clerk.__internal_lastEmittedResources) return getInitialState();
		return clerk.__internal_lastEmittedResources.session;
	}, [clerk, getInitialState]), getInitialState);
}
/**
* > [!WARNING]
* > This hook should only be used for advanced use cases, such as building a completely custom OAuth flow or as an escape hatch to access to the `Clerk` object.
*
* The `useClerk()` hook provides access to the [`Clerk`](https://clerk.com/docs/reference/objects/clerk) object, allowing you to build alternatives to any Clerk Component.
*
* @function
*
* @returns The `useClerk()` hook returns the `Clerk` object, which includes all the methods and properties listed in the [`Clerk` reference](https://clerk.com/docs/reference/objects/clerk).
*
* @example
*
* The following example uses the `useClerk()` hook to access the `clerk` object. The `clerk` object is used to call the [`openSignIn()`](https://clerk.com/docs/reference/objects/clerk#sign-in) method to open the sign-in modal.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useClerk } from '@clerk/react'
*
* export default function Home() {
*   const clerk = useClerk()
*
*   return <button onClick={() => clerk.openSignIn({})}>Sign in</button>
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-clerk.md#nextjs-01}
*
* </Tab>
* </Tabs>
*/
var useClerk = () => {
	useAssertWrappedByClerkProvider$1("useClerk");
	return useClerkInstanceContext();
};
/**
* Attempts to enable the organizations environment setting for a given caller
*
* @internal
*/
function useAttemptToEnableOrganizations(caller) {
	const clerk = useClerk();
	const hasAttempted = (0, import_react.useRef)(false);
	(0, import_react.useEffect)(() => {
		if (hasAttempted.current) return;
		hasAttempted.current = true;
		clerk.__internal_attemptToEnableEnvironmentSetting?.({
			for: "organizations",
			caller
		});
	}, [clerk, caller]);
}
var undefinedPaginatedResource$1 = {
	data: void 0,
	count: void 0,
	error: void 0,
	isLoading: false,
	isFetching: false,
	isError: false,
	page: void 0,
	pageCount: void 0,
	fetchPage: void 0,
	fetchNext: void 0,
	fetchPrevious: void 0,
	hasNextPage: false,
	hasPreviousPage: false,
	revalidate: void 0,
	setData: void 0
};
/**
* The `useOrganization()` hook retrieves attributes of the currently Active Organization.
*
* @example
* ### Expand and paginate attributes
*
* To keep network usage to a minimum, developers are required to opt-in by specifying which resource they need to fetch and paginate through. By default, the `memberships`, `invitations`, `membershipRequests`, and `domains` attributes are not populated. You must pass `true` or an object with the desired properties to fetch and paginate the data.
*
* ```tsx
* // invitations.data will never be populated.
* const { invitations } = useOrganization()
*
* // Use default values to fetch invitations, such as initialPage = 1 and pageSize = 10
* const { invitations } = useOrganization({
*   invitations: true,
* })
*
* // Pass your own values to fetch invitations
* const { invitations } = useOrganization({
*   invitations: {
*     pageSize: 20,
*     initialPage: 2, // skips the first page
*   },
* })
*
* // Aggregate pages in order to render an infinite list
* const { invitations } = useOrganization({
*   invitations: {
*     infinite: true,
*   },
* })
* ```
*
* @example
* ### Infinite pagination
*
* The following example demonstrates how to use the `infinite` property to fetch and append new data to the existing list. The `memberships` attribute will be populated with the first page of the Organization's memberships. When the "Load more" button is clicked, the `fetchNext` helper function will be called to append the next page of memberships to the list.
*
* ```tsx
* import { useOrganization } from '@clerk/react'
*
* export default function MemberList() {
*   const { memberships } = useOrganization({
*     memberships: {
*       infinite: true, // Append new data to the existing list
*       keepPreviousData: true, // Persist the cached data until the new data has been fetched
*     },
*   })
*
*   if (!memberships) {
*     // Handle loading state
*     return null
*   }
*
*   return (
*     <div>
*       <h2>Organization members</h2>
*       <ul>
*         {memberships.data?.map((membership) => (
*           <li key={membership.id}>
*             {membership.publicUserData.firstName} {membership.publicUserData.lastName} <
*             {membership.publicUserData.identifier}> :: {membership.role}
*           </li>
*         ))}
*       </ul>
*
*       <button
*         disabled={!memberships.hasNextPage} // Disable the button if there are no more available pages to be fetched
*         onClick={memberships.fetchNext}
*       >
*         Load more
*       </button>
*     </div>
*   )
* }
* ```
*
* @example
* ### Simple pagination
*
* The following example demonstrates how to use the `fetchPrevious` and `fetchNext` helper functions to paginate through the data. The `memberships` attribute will be populated with the first page of the Organization's memberships. When the "Previous page" or "Next page" button is clicked, the `fetchPrevious` or `fetchNext` helper function will be called to fetch the previous or next page of memberships.
*
* Notice the difference between this example's pagination and the infinite pagination example above.
*
* ```tsx
* import { useOrganization } from '@clerk/react'
*
* export default function MemberList() {
*   const { memberships } = useOrganization({
*     memberships: {
*       keepPreviousData: true, // Persist the cached data until the new data has been fetched
*     },
*   })
*
*   if (!memberships) {
*     // Handle loading state
*     return null
*   }
*
*   return (
*     <div>
*       <h2>Organization members</h2>
*       <ul>
*         {memberships.data?.map((membership) => (
*           <li key={membership.id}>
*             {membership.publicUserData.firstName} {membership.publicUserData.lastName} <
*             {membership.publicUserData.identifier}> :: {membership.role}
*           </li>
*         ))}
*       </ul>
*
*       <button disabled={!memberships.hasPreviousPage} onClick={memberships.fetchPrevious}>
*         Previous page
*       </button>
*
*       <button disabled={!memberships.hasNextPage} onClick={memberships.fetchNext}>
*         Next page
*       </button>
*     </div>
*   )
* }
* ```
*/
function useOrganization(params) {
	const { domains: domainListParams, membershipRequests: membershipRequestsListParams, memberships: membersListParams, invitations: invitationsListParams } = params || {};
	useAssertWrappedByClerkProvider$1("useOrganization");
	useAttemptToEnableOrganizations("useOrganization");
	const organization = useOrganizationBase();
	const session = useSessionBase();
	const domainSafeValues = useWithSafeValues(domainListParams, {
		initialPage: 1,
		pageSize: 10,
		keepPreviousData: false,
		infinite: false,
		enrollmentMode: void 0
	});
	const membershipRequestSafeValues = useWithSafeValues(membershipRequestsListParams, {
		initialPage: 1,
		pageSize: 10,
		status: "pending",
		keepPreviousData: false,
		infinite: false
	});
	const membersSafeValues = useWithSafeValues(membersListParams, {
		initialPage: 1,
		pageSize: 10,
		role: void 0,
		keepPreviousData: false,
		infinite: false,
		query: void 0
	});
	const invitationsSafeValues = useWithSafeValues(invitationsListParams, {
		initialPage: 1,
		pageSize: 10,
		status: ["pending"],
		keepPreviousData: false,
		infinite: false
	});
	const clerk = useClerkInstanceContext();
	clerk.telemetry?.record(eventMethodCalled("useOrganization"));
	const domainParams = typeof domainListParams === "undefined" ? void 0 : {
		initialPage: domainSafeValues.initialPage,
		pageSize: domainSafeValues.pageSize,
		enrollmentMode: domainSafeValues.enrollmentMode
	};
	const membershipRequestParams = typeof membershipRequestsListParams === "undefined" ? void 0 : {
		initialPage: membershipRequestSafeValues.initialPage,
		pageSize: membershipRequestSafeValues.pageSize,
		status: membershipRequestSafeValues.status
	};
	const membersParams = typeof membersListParams === "undefined" ? void 0 : {
		initialPage: membersSafeValues.initialPage,
		pageSize: membersSafeValues.pageSize,
		role: membersSafeValues.role,
		query: membersSafeValues.query
	};
	const invitationsParams = typeof invitationsListParams === "undefined" ? void 0 : {
		initialPage: invitationsSafeValues.initialPage,
		pageSize: invitationsSafeValues.pageSize,
		status: invitationsSafeValues.status
	};
	const domains = usePagesOrInfinite({
		fetcher: organization?.getDomains,
		config: {
			keepPreviousData: domainSafeValues.keepPreviousData,
			infinite: domainSafeValues.infinite,
			enabled: !!domainParams,
			isSignedIn: organization !== null,
			initialPage: domainSafeValues.initialPage,
			pageSize: domainSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.DOMAINS_KEY,
			authenticated: true,
			tracked: { organizationId: organization?.id },
			untracked: { args: domainParams }
		})
	});
	const membershipRequests = usePagesOrInfinite({
		fetcher: organization?.getMembershipRequests,
		config: {
			keepPreviousData: membershipRequestSafeValues.keepPreviousData,
			infinite: membershipRequestSafeValues.infinite,
			enabled: !!membershipRequestParams,
			isSignedIn: organization !== null,
			initialPage: membershipRequestSafeValues.initialPage,
			pageSize: membershipRequestSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.MEMBERSHIP_REQUESTS_KEY,
			authenticated: true,
			tracked: { organizationId: organization?.id },
			untracked: { args: membershipRequestParams }
		})
	});
	const memberships = usePagesOrInfinite({
		fetcher: organization?.getMemberships,
		config: {
			keepPreviousData: membersSafeValues.keepPreviousData,
			infinite: membersSafeValues.infinite,
			enabled: !!membersParams,
			isSignedIn: organization !== null,
			initialPage: membersSafeValues.initialPage,
			pageSize: membersSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.MEMBERSHIPS_KEY,
			authenticated: true,
			tracked: { organizationId: organization?.id },
			untracked: { args: membersParams }
		})
	});
	const invitations = usePagesOrInfinite({
		fetcher: organization?.getInvitations,
		config: {
			keepPreviousData: invitationsSafeValues.keepPreviousData,
			infinite: invitationsSafeValues.infinite,
			enabled: !!invitationsParams,
			isSignedIn: organization !== null,
			initialPage: invitationsSafeValues.initialPage,
			pageSize: invitationsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.INVITATIONS_KEY,
			authenticated: true,
			tracked: { organizationId: organization?.id },
			untracked: { args: invitationsParams }
		})
	});
	if (organization === void 0) return {
		isLoaded: false,
		organization: void 0,
		membership: void 0,
		domains: undefinedPaginatedResource$1,
		membershipRequests: undefinedPaginatedResource$1,
		memberships: undefinedPaginatedResource$1,
		invitations: undefinedPaginatedResource$1
	};
	if (organization === null) return {
		isLoaded: true,
		organization: null,
		membership: null,
		domains: null,
		membershipRequests: null,
		memberships: null,
		invitations: null
	};
	/** In SSR context we include only the organization object when loadOrg is set to true. */
	if (!clerk.loaded && organization) return {
		isLoaded: true,
		organization,
		membership: void 0,
		domains: undefinedPaginatedResource$1,
		membershipRequests: undefinedPaginatedResource$1,
		memberships: undefinedPaginatedResource$1,
		invitations: undefinedPaginatedResource$1
	};
	return {
		isLoaded: clerk.loaded,
		organization,
		membership: getCurrentOrganizationMembership(session.user.organizationMemberships, organization.id),
		domains,
		membershipRequests,
		memberships,
		invitations
	};
}
function useOrganizationCreationDefaultsCacheKeys(params) {
	const { userId } = params;
	return (0, import_react.useMemo)(() => {
		return createCacheKeys({
			stablePrefix: STABLE_KEYS.ORGANIZATION_CREATION_DEFAULTS_KEY,
			authenticated: Boolean(userId),
			tracked: { userId: userId ?? null },
			untracked: { args: {} }
		});
	}, [userId]);
}
var HOOK_NAME$1 = "useOrganizationCreationDefaults";
/**
* The `useOrganizationCreationDefaults()` hook retrieves the organization creation defaults for the current user.
*
* @example
* ### Basic usage
*
* ```tsx
* import { useOrganizationCreationDefaults } from '@clerk/clerk-react'
*
* export default function CreateOrganizationForm() {
*   const { data, isLoading } = useOrganizationCreationDefaults()
*
*   if (isLoading) return <div>Loading...</div>
*
*   return (
*     <form>
*       <input defaultValue={data?.form.name} placeholder="Organization name" />
*       <input defaultValue={data?.form.slug} placeholder="Slug" />
*       <button type="submit">Create</button>
*     </form>
*   )
* }
* ```
*/
function useOrganizationCreationDefaults(params = {}) {
	useAssertWrappedByClerkProvider$1(HOOK_NAME$1);
	const { keepPreviousData = true, enabled = true } = params;
	const clerk = useClerkInstanceContext();
	const user = useUserBase();
	const featureEnabled = clerk.__internal_environment?.organizationSettings?.organizationCreationDefaults?.enabled ?? false;
	clerk.telemetry?.record(eventMethodCalled(HOOK_NAME$1));
	const { queryKey } = useOrganizationCreationDefaultsCacheKeys({ userId: user?.id ?? null });
	const queryEnabled = Boolean(user) && enabled && featureEnabled && clerk.loaded;
	const query = useClerkQuery({
		queryKey,
		queryFn: user?.getOrganizationCreationDefaults,
		enabled: queryEnabled,
		placeholderData: defineKeepPreviousDataFn(keepPreviousData)
	});
	return {
		data: query.data,
		error: query.error ?? null,
		isLoading: query.isLoading,
		isFetching: query.isFetching
	};
}
var undefinedPaginatedResource = {
	data: void 0,
	count: void 0,
	error: void 0,
	isLoading: false,
	isFetching: false,
	isError: false,
	page: void 0,
	pageCount: void 0,
	fetchPage: void 0,
	fetchNext: void 0,
	fetchPrevious: void 0,
	hasNextPage: false,
	hasPreviousPage: false,
	revalidate: void 0,
	setData: void 0
};
/**
* The `useOrganizationList()` hook provides access to the current user's organization memberships, invitations, and suggestions. It also includes methods for creating new organizations and managing the active organization.
*
* @example
* ### Expanding and paginating attributes
*
* To keep network usage to a minimum, developers are required to opt-in by specifying which resource they need to fetch and paginate through. So by default, the `userMemberships`, `userInvitations`, and `userSuggestions` attributes are not populated. You must pass true or an object with the desired properties to fetch and paginate the data.
*
* ```tsx
* // userMemberships.data will never be populated
* const { userMemberships } = useOrganizationList()
*
* // Use default values to fetch userMemberships, such as initialPage = 1 and pageSize = 10
* const { userMemberships } = useOrganizationList({
*   userMemberships: true,
* })
*
* // Pass your own values to fetch userMemberships
* const { userMemberships } = useOrganizationList({
*   userMemberships: {
*     pageSize: 20,
*     initialPage: 2, // skips the first page
*   },
* })
*
* // Aggregate pages in order to render an infinite list
* const { userMemberships } = useOrganizationList({
*   userMemberships: {
*     infinite: true,
*   },
* })
* ```
*
* @example
* ### Infinite pagination
*
* The following example demonstrates how to use the `infinite` property to fetch and append new data to the existing list. The `userMemberships` attribute will be populated with the first page of the user's Organization memberships. When the "Load more" button is clicked, the `fetchNext` helper function will be called to append the next page of memberships to the list.
*
* ```tsx {{ filename: 'src/components/JoinedOrganizations.tsx' }}
* import { useOrganizationList } from '@clerk/react'
* import React from 'react'
*
* const JoinedOrganizations = () => {
*   const { isLoaded, setActive, userMemberships } = useOrganizationList({
*     userMemberships: {
*       infinite: true,
*     },
*   })
*
*   if (!isLoaded) {
*     return <>Loading</>
*   }
*
*   return (
*     <>
*       <ul>
*         {userMemberships.data?.map((mem) => (
*           <li key={mem.id}>
*             <span>{mem.organization.name}</span>
*             <button onClick={() => setActive({ organization: mem.organization.id })}>Select</button>
*           </li>
*         ))}
*       </ul>
*
*       <button disabled={!userMemberships.hasNextPage} onClick={() => userMemberships.fetchNext()}>
*         Load more
*       </button>
*     </>
*   )
* }
*
* export default JoinedOrganizations
* ```
*
* @example
* ### Simple pagination
*
* The following example demonstrates how to use the `fetchPrevious` and `fetchNext` helper functions to paginate through the data. The `userInvitations` attribute will be populated with the first page of invitations. When the "Previous page" or "Next page" button is clicked, the `fetchPrevious` or `fetchNext` helper function will be called to fetch the previous or next page of invitations.
*
* Notice the difference between this example's pagination and the infinite pagination example above.
*
* ```tsx {{ filename: 'src/components/UserInvitationsTable.tsx' }}
* import { useOrganizationList } from '@clerk/react'
* import React from 'react'
*
* const UserInvitationsTable = () => {
*   const { isLoaded, userInvitations } = useOrganizationList({
*     userInvitations: {
*       infinite: true,
*       keepPreviousData: true,
*     },
*   })
*
*   if (!isLoaded || userInvitations.isLoading) {
*     return <>Loading</>
*   }
*
*   return (
*     <>
*       <table>
*         <thead>
*           <tr>
*             <th>Email</th>
*             <th>Org name</th>
*           </tr>
*         </thead>
*
*         <tbody>
*           {userInvitations.data?.map((inv) => (
*             <tr key={inv.id}>
*               <th>{inv.emailAddress}</th>
*               <th>{inv.publicOrganizationData.name}</th>
*             </tr>
*           ))}
*         </tbody>
*       </table>
*
*       <button disabled={!userInvitations.hasPreviousPage} onClick={userInvitations.fetchPrevious}>
*         Prev
*       </button>
*       <button disabled={!userInvitations.hasNextPage} onClick={userInvitations.fetchNext}>
*         Next
*       </button>
*     </>
*   )
* }
*
* export default UserInvitationsTable
* ```
*/
function useOrganizationList(params) {
	const { userMemberships, userInvitations, userSuggestions } = params || {};
	useAssertWrappedByClerkProvider$1("useOrganizationList");
	useAttemptToEnableOrganizations("useOrganizationList");
	const userMembershipsSafeValues = useWithSafeValues(userMemberships, {
		initialPage: 1,
		pageSize: 10,
		keepPreviousData: false,
		infinite: false
	});
	const userInvitationsSafeValues = useWithSafeValues(userInvitations, {
		initialPage: 1,
		pageSize: 10,
		status: "pending",
		keepPreviousData: false,
		infinite: false
	});
	const userSuggestionsSafeValues = useWithSafeValues(userSuggestions, {
		initialPage: 1,
		pageSize: 10,
		status: "pending",
		keepPreviousData: false,
		infinite: false
	});
	const clerk = useClerkInstanceContext();
	const user = useUserBase();
	clerk.telemetry?.record(eventMethodCalled("useOrganizationList"));
	const userMembershipsParams = typeof userMemberships === "undefined" ? void 0 : {
		initialPage: userMembershipsSafeValues.initialPage,
		pageSize: userMembershipsSafeValues.pageSize
	};
	const userInvitationsParams = typeof userInvitations === "undefined" ? void 0 : {
		initialPage: userInvitationsSafeValues.initialPage,
		pageSize: userInvitationsSafeValues.pageSize,
		status: userInvitationsSafeValues.status
	};
	const userSuggestionsParams = typeof userSuggestions === "undefined" ? void 0 : {
		initialPage: userSuggestionsSafeValues.initialPage,
		pageSize: userSuggestionsSafeValues.pageSize,
		status: userSuggestionsSafeValues.status
	};
	const isClerkLoaded = !!(clerk.loaded && user);
	const memberships = usePagesOrInfinite({
		fetcher: user?.getOrganizationMemberships,
		config: {
			keepPreviousData: userMembershipsSafeValues.keepPreviousData,
			infinite: userMembershipsSafeValues.infinite,
			enabled: !!userMembershipsParams,
			isSignedIn: user !== null,
			initialPage: userMembershipsSafeValues.initialPage,
			pageSize: userMembershipsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.USER_MEMBERSHIPS_KEY,
			authenticated: true,
			tracked: { userId: user?.id },
			untracked: { args: userMembershipsParams }
		})
	});
	const invitations = usePagesOrInfinite({
		fetcher: user?.getOrganizationInvitations,
		config: {
			keepPreviousData: userInvitationsSafeValues.keepPreviousData,
			infinite: userInvitationsSafeValues.infinite,
			enabled: !!userInvitationsParams,
			isSignedIn: user !== null,
			initialPage: userInvitationsSafeValues.initialPage,
			pageSize: userInvitationsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.USER_INVITATIONS_KEY,
			authenticated: true,
			tracked: { userId: user?.id },
			untracked: { args: userInvitationsParams }
		})
	});
	const suggestions = usePagesOrInfinite({
		fetcher: user?.getOrganizationSuggestions,
		config: {
			keepPreviousData: userSuggestionsSafeValues.keepPreviousData,
			infinite: userSuggestionsSafeValues.infinite,
			enabled: !!userSuggestionsParams,
			isSignedIn: user !== null,
			initialPage: userSuggestionsSafeValues.initialPage,
			pageSize: userSuggestionsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.USER_SUGGESTIONS_KEY,
			authenticated: true,
			tracked: { userId: user?.id },
			untracked: { args: userSuggestionsParams }
		})
	});
	if (!isClerkLoaded) return {
		isLoaded: false,
		createOrganization: void 0,
		setActive: void 0,
		userMemberships: undefinedPaginatedResource,
		userInvitations: undefinedPaginatedResource,
		userSuggestions: undefinedPaginatedResource
	};
	return {
		isLoaded: isClerkLoaded,
		setActive: clerk.setActive,
		createOrganization: clerk.createOrganization,
		userMemberships: memberships,
		userInvitations: invitations,
		userSuggestions: suggestions
	};
}
/**
* @internal
*/
var useSafeLayoutEffect = typeof window !== "undefined" ? import_react.useLayoutEffect : import_react.useEffect;
var hookName$2 = `useSession`;
/**
* The `useSession()` hook provides access to the current user's [`Session`](https://clerk.com/docs/reference/objects/session) object, as well as helpers for setting the active session.
*
* @unionReturnHeadings
* ["Initialization", "Signed out", "Signed in"]
*
* @function
*
* @param [options] - An object containing options for the `useSession()` hook.
* @example
* ### Access the `Session` object
*
* The following example uses the `useSession()` hook to access the `Session` object, which has the `lastActiveAt` property. The `lastActiveAt` property is a `Date` object used to show the time the session was last active.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useSession } from '@clerk/react'
*
* export default function Home() {
*   const { isLoaded, session, isSignedIn } = useSession()
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null
*   }
*   if (!isSignedIn) {
*     // Handle signed out state
*     return null
*   }
*
*   return (
*     <div>
*       <p>This session has been active since {session.lastActiveAt.toLocaleString()}</p>
*     </div>
*   )
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-session.md#nextjs-01}
*
* </Tab>
* </Tabs>
*/
var useSession = () => {
	useAssertWrappedByClerkProvider$1(hookName$2);
	const session = useSessionBase();
	const clerk = useClerkInstanceContext();
	clerk.telemetry?.record(eventMethodCalled(hookName$2));
	if (session === void 0) return {
		isLoaded: false,
		isSignedIn: void 0,
		session: void 0
	};
	if (session === null) return {
		isLoaded: true,
		isSignedIn: false,
		session: null
	};
	return {
		isLoaded: true,
		isSignedIn: clerk.isSignedIn,
		session
	};
};
var initialSnapshot = void 0;
var getInitialSnapshot = () => initialSnapshot;
function useClientBase() {
	const clerk = useClerkInstanceContext();
	return (0, import_react.useSyncExternalStore)((0, import_react.useCallback)((callback) => clerk.addListener(callback, { skipInitialEmit: true }), [clerk]), (0, import_react.useCallback)(() => {
		if (!clerk.loaded || !clerk.__internal_lastEmittedResources) return initialSnapshot;
		return clerk.__internal_lastEmittedResources.client;
	}, [clerk]), getInitialSnapshot);
}
var hookName$1 = "useSessionList";
/**
* The `useSessionList()` hook returns an array of [`Session`](https://clerk.com/docs/reference/objects/session) objects that have been registered on the client device.
*
* @unionReturnHeadings
* ["Initialization", "Loaded"]
*
* @function
*
* @example
* ### Get a list of sessions
*
* The following example uses `useSessionList()` to get a list of sessions that have been registered on the client device. The `sessions` property is used to show the number of times the user has visited the page.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useSessionList } from '@clerk/react'
*
* export default function Home() {
*   const { isLoaded, sessions } = useSessionList()
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null
*   }
*
*   return (
*     <div>
*       <p>Welcome back. You've been here {sessions.length} times before.</p>
*     </div>
*   )
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-session-list.md#nextjs-01}
*
* </Tab>
* </Tabs>
*/
var useSessionList = () => {
	useAssertWrappedByClerkProvider$1(hookName$1);
	const isomorphicClerk = useClerkInstanceContext();
	const client = useClientBase();
	useClerkInstanceContext().telemetry?.record(eventMethodCalled(hookName$1));
	if (!client) return {
		isLoaded: false,
		sessions: void 0,
		setActive: void 0
	};
	return {
		isLoaded: true,
		sessions: client.sessions,
		setActive: isomorphicClerk.setActive
	};
};
var hookName = "useUser";
/**
* The `useUser()` hook provides access to the current user's [`User`](https://clerk.com/docs/reference/objects/user) object, which contains all the data for a single user in your application and provides methods to manage their account. This hook also allows you to check if the user is signed in and if Clerk has loaded and initialized.
*
* @unionReturnHeadings
* ["Initialization", "Signed out", "Signed in"]
*
* @example
* ### Get the current user
*
* The following example uses the `useUser()` hook to access the [`User`](https://clerk.com/docs/reference/objects/user) object, which contains the current user's data such as their full name. The `isLoaded` and `isSignedIn` properties are used to handle the loading state and to check if the user is signed in, respectively.
*
* ```tsx {{ filename: 'src/Example.tsx' }}
* import { useUser } from '@clerk/react'
*
* export default function Example() {
*   const { isSignedIn, user, isLoaded } = useUser()
*
*   if (!isLoaded) {
*     return <div>Loading...</div>
*   }
*
*   if (!isSignedIn) {
*     return <div>Sign in to view this page</div>
*   }
*
*   return <div>Hello {user.firstName}!</div>
* }
* ```
*
* @example
* ### Update user data
*
* The following example uses the `useUser()` hook to access the [`User`](https://clerk.com/docs/reference/objects/user) object, which calls the [`update()`](https://clerk.com/docs/reference/objects/user#update) method to update the current user's information.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useUser } from '@clerk/react'
*
* export default function Home() {
*   const { isSignedIn, isLoaded, user } = useUser()
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null
*   }
*
*   if (!isSignedIn) return null
*
*   const updateUser = async () => {
*     await user.update({
*       firstName: 'John',
*       lastName: 'Doe',
*     })
*   }
*
*   return (
*     <>
*       <button onClick={updateUser}>Update your name</button>
*       <p>user.firstName: {user.firstName}</p>
*       <p>user.lastName: {user.lastName}</p>
*     </>
*   )
* }
* ```
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-user.md#nextjs-01}
*
* </Tab>
* </Tabs>
*
* @example
* ### Reload user data
*
* The following example uses the `useUser()` hook to access the [`User`](https://clerk.com/docs/reference/objects/user) object, which calls the [`reload()`](https://clerk.com/docs/reference/objects/user#reload) method to get the latest user's information.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useUser } from '@clerk/react'
*
* export default function Home() {
*   const { isSignedIn, isLoaded, user } = useUser();
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null;
*   }
*
*   if (!isSignedIn) return null;
*
*   const updateUser = async () => {
*     // Update data via an API endpoint
*     const updateMetadata = await fetch('/api/updateMetadata', {
*       method: 'POST',
*       body: JSON.stringify({
*         role: 'admin'
*       })
*     });
*
*     // Check if the update was successful
*     if ((await updateMetadata.json()).message !== 'success') {
*       throw new Error('Error updating');
*     }
*
*     // If the update was successful, reload the user data
*     await user.reload();
*   };
*
*   return (
*     <>
*       <button onClick={updateUser}>Update your metadata</button>
*       <p>user role: {user.publicMetadata.role}</p>
*     </>
*   );
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-user.md#nextjs-02}
*
* </Tab>
* </Tabs>
*/
function useUser() {
	useAssertWrappedByClerkProvider$1(hookName);
	const user = useUserBase();
	useClerkInstanceContext().telemetry?.record(eventMethodCalled(hookName));
	if (user === void 0) return {
		isLoaded: false,
		isSignedIn: void 0,
		user: void 0
	};
	if (user === null) return {
		isLoaded: true,
		isSignedIn: false,
		user: null
	};
	return {
		isLoaded: true,
		isSignedIn: true,
		user
	};
}
/**
* @internal
*/
var isDeeplyEqual = dequal;
var CLERK_API_REVERIFICATION_ERROR_CODE = "session_reverification_required";
/**
*
*/
async function resolveResult(result) {
	try {
		const r = await result;
		if (r instanceof Response) return r.json();
		return r;
	} catch (e) {
		if (isClerkAPIResponseError(e) && e.errors.find(({ code }) => code === CLERK_API_REVERIFICATION_ERROR_CODE)) return reverificationError();
		throw e;
	}
}
/**
*
*/
function createReverificationHandler(params) {
	/**
	*
	*/
	function assertReverification(fetcher) {
		return (async (...args) => {
			let result = await resolveResult(fetcher(...args));
			if (isReverificationHint(result)) {
				/**
				* Create a promise
				*/
				const resolvers = createDeferredPromise();
				const isValidMetadata = validateReverificationConfig(result.clerk_error.metadata?.reverification);
				const level = isValidMetadata ? isValidMetadata().level : void 0;
				const cancel = () => {
					resolvers.reject(new ClerkRuntimeError("User cancelled attempted verification", { code: "reverification_cancelled" }));
				};
				const complete = () => {
					resolvers.resolve(true);
				};
				if (params.onNeedsReverification === void 0)
 /**
				* On success resolve the pending promise
				* On cancel reject the pending promise
				*/
				params.openUIComponent?.({
					level,
					afterVerification: complete,
					afterVerificationCancelled: cancel
				});
				else params.onNeedsReverification({
					cancel,
					complete,
					level
				});
				/**
				* Wait until the promise from above have been resolved or rejected
				*/
				await resolvers.promise;
				/**
				* After the promise resolved successfully try the original request one more time
				*/
				result = await resolveResult(fetcher(...args));
			}
			return result;
		});
	}
	return assertReverification;
}
/**
* > [!WARNING]
* >
* > Depending on the SDK you're using, this feature requires `@clerk/nextjs@6.12.7` or later, `@clerk/react@5.25.1` or later, and `@clerk/clerk-js@5.57.1` or later.
*
* The `useReverification()` hook is used to handle a session's reverification flow. If a request requires reverification, a modal will display, prompting the user to verify their credentials. Upon successful verification, the original request will automatically retry.
*
* @function
*
* @returns The `useReverification()` hook returns an array with the "enhanced" fetcher.
*
* @example
* ### Handle cancellation of the reverification process
*
* The following example demonstrates how to handle scenarios where a user cancels the reverification flow, such as closing the modal, which might result in `myData` being `null`.
*
* In the following example, `myFetcher` would be a function in your backend that fetches data from the route that requires reverification. See the [guide on how to require reverification](https://clerk.com/docs/guides/secure/reverification) for more information.
*
* ```tsx {{ filename: 'src/components/MyButton.tsx' }}
* import { useReverification } from '@clerk/react'
* import { isReverificationCancelledError } from '@clerk/react/error'
*
* type MyData = {
*   balance: number
* }
*
* export function MyButton() {
*   const fetchMyData = () => fetch('/api/balance').then(res=> res.json() as Promise<MyData>)
*   const enhancedFetcher = useReverification(fetchMyData);
*
*   const handleClick = async () => {
*     try {
*       const myData = await enhancedFetcher()
*       //     ^ is types as `MyData`
*     } catch (e) {
*       // Handle error returned from the fetcher here
*
*       // You can also handle cancellation with the following
*       if (isReverificationCancelledError(err)) {
*         // Handle the cancellation error here
*       }
*     }
*   }
*
*   return <button onClick={handleClick}>Update User</button>
* }
* ```
*/
var useReverification = (fetcher, options) => {
	const { __internal_openReverification, telemetry } = useClerk();
	const fetcherRef = (0, import_react.useRef)(fetcher);
	const optionsRef = (0, import_react.useRef)(options);
	telemetry?.record(eventMethodCalled("useReverification", { onNeedsReverification: Boolean(options?.onNeedsReverification) }));
	useSafeLayoutEffect(() => {
		fetcherRef.current = fetcher;
		optionsRef.current = options;
	});
	return (0, import_react.useCallback)((...args) => {
		return createReverificationHandler({
			openUIComponent: __internal_openReverification,
			telemetry,
			...optionsRef.current
		})(fetcherRef.current)(...args);
	}, [__internal_openReverification, telemetry]);
};
/**
* @internal
*/
function useBillingIsEnabled(params) {
	const clerk = useClerkInstanceContext();
	const enabledFromParam = params?.enabled ?? true;
	const environment = clerk.__internal_environment;
	const user = useUserBase();
	const organization = useOrganizationBase();
	const userBillingEnabled = environment?.commerceSettings.billing.user.enabled;
	const orgBillingEnabled = environment?.commerceSettings.billing.organization.enabled;
	const billingEnabled = params?.for === "organization" ? orgBillingEnabled : params?.for === "user" ? userBillingEnabled : userBillingEnabled || orgBillingEnabled;
	const isOrganization = params?.for === "organization";
	const requireUserAndOrganizationWhenAuthenticated = params?.authenticated ?? true ? (isOrganization ? Boolean(organization?.id) : true) && Boolean(user?.id) : true;
	return billingEnabled && enabledFromParam && clerk.loaded && requireUserAndOrganizationWhenAuthenticated;
}
/**
* A hook factory that creates paginated data fetching hooks for commerce-related resources.
* It provides a standardized way to create hooks that can fetch either user or Organization resources
* with built-in pagination support.
*
* The generated hooks handle:
* - Clerk authentication context
* - Resource-specific data fetching
* - Pagination (both traditional and infinite scroll)
* - Telemetry tracking
* - Type safety for the specific resource.
*
* @internal
*/
function createBillingPaginatedHook({ hookName: hookName$3, resourceType, useFetcher, options }) {
	return function useBillingHook(params) {
		const { for: _for, enabled: externalEnabled, ...paginationParams } = params || {};
		const safeFor = _for || "user";
		useAssertWrappedByClerkProvider$1(hookName$3);
		const fetchFn = useFetcher(safeFor);
		const safeValues = useWithSafeValues(paginationParams, {
			initialPage: 1,
			pageSize: 10,
			keepPreviousData: false,
			infinite: false,
			__experimental_mode: void 0
		});
		const clerk = useClerkInstanceContext();
		const user = useUserBase();
		const organization = useOrganizationBase();
		clerk.telemetry?.record(eventMethodCalled(hookName$3));
		const isForOrganization = safeFor === "organization";
		const billingEnabled = useBillingIsEnabled({
			for: safeFor,
			enabled: externalEnabled,
			authenticated: !options?.unauthenticated
		});
		const hookParams = typeof paginationParams === "undefined" ? void 0 : {
			initialPage: safeValues.initialPage,
			pageSize: safeValues.pageSize,
			...options?.unauthenticated ? {} : isForOrganization ? { orgId: organization?.id } : {}
		};
		const isEnabled = !!hookParams && clerk.loaded && !!billingEnabled;
		return usePagesOrInfinite({
			fetcher: fetchFn,
			config: {
				keepPreviousData: safeValues.keepPreviousData,
				infinite: safeValues.infinite,
				enabled: isEnabled,
				...options?.unauthenticated ? {} : { isSignedIn: user !== null },
				__experimental_mode: safeValues.__experimental_mode,
				initialPage: safeValues.initialPage,
				pageSize: safeValues.pageSize
			},
			keys: createCacheKeys({
				stablePrefix: resourceType,
				authenticated: !options?.unauthenticated,
				tracked: options?.unauthenticated ? { for: safeFor } : {
					userId: user?.id,
					...isForOrganization ? { orgId: organization?.id } : {}
				},
				untracked: { args: hookParams }
			})
		});
	};
}
createBillingPaginatedHook({
	hookName: "useStatements",
	resourceType: STABLE_KEYS.STATEMENTS_KEY,
	useFetcher: () => {
		const clerk = useClerkInstanceContext();
		if (clerk.loaded) return clerk.billing.getStatements;
	}
});
createBillingPaginatedHook({
	hookName: "usePaymentAttempts",
	resourceType: STABLE_KEYS.PAYMENT_ATTEMPTS_KEY,
	useFetcher: () => {
		const clerk = useClerkInstanceContext();
		if (clerk.loaded) return clerk.billing.getPaymentAttempts;
	}
});
createBillingPaginatedHook({
	hookName: "usePaymentMethods",
	resourceType: STABLE_KEYS.PAYMENT_METHODS_KEY,
	useFetcher: (resource) => {
		const organization = useOrganizationBase();
		const user = useUserBase();
		if (resource === "organization") return organization?.getPaymentMethods;
		return user?.getPaymentMethods;
	}
});
createBillingPaginatedHook({
	hookName: "usePlans",
	resourceType: STABLE_KEYS.PLANS_KEY,
	useFetcher: (_for) => {
		const clerk = useClerkInstanceContext();
		if (!clerk.loaded) return;
		return (params) => clerk.billing.getPlans({
			...params,
			for: _for
		});
	},
	options: { unauthenticated: true }
});
/**
* @function
*
* @param [options] - An object containing the configuration for the checkout flow.
*
* **Required** if the hook is used without a `<CheckoutProvider />` wrapping the component tree.
*/
var useCheckout = (options) => {
	const contextOptions = useCheckoutContext();
	const { for: forOrganization, planId, planPeriod } = options || contextOptions;
	const organization = useOrganizationBase();
	const { isLoaded, user } = useUser();
	const clerk = useClerkInstanceContext();
	if (user === null && isLoaded) throw new Error("Clerk: Ensure that `useCheckout` is inside a component wrapped with `<Show when=\"signed-in\" />`.");
	if (isLoaded && forOrganization === "organization" && organization === null) throw new Error("Clerk: Ensure your flow checks for an active organization. Retrieve `orgId` from `useAuth()` and confirm it is defined. For SSR, see: https://clerk.com/docs/reference/backend/types/auth-object#how-to-access-the-auth-object");
	const signal = (0, import_react.useCallback)(() => {
		return clerk.__experimental_checkout({
			planId,
			planPeriod,
			for: forOrganization
		});
	}, [
		user?.id,
		organization?.id,
		planId,
		planPeriod,
		forOrganization
	]);
	const subscribe = (0, import_react.useCallback)((callback) => {
		if (!clerk.loaded) return () => {};
		return clerk.__internal_state.__internal_effect(() => {
			signal();
			callback();
		});
	}, [
		signal,
		clerk.loaded,
		clerk.__internal_state
	]);
	const getSnapshot = (0, import_react.useCallback)(() => {
		return signal();
	}, [signal]);
	return (0, import_react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
};
function assertClerkSingletonExists(clerk) {
	if (!clerk) clerkCoreErrorNoClerkSingleton();
}
function ClerkContextProvider(props) {
	const clerk = props.clerk;
	assertClerkSingletonExists(clerk);
	if (props.initialState instanceof Promise && !("use" in import_react.default && typeof import_react.use === "function")) throw new Error("initialState cannot be a promise if React version is less than 19");
	const clerkCtx = import_react.useMemo(() => ({ value: clerk }), [props.clerkStatus]);
	return /* @__PURE__ */ import_react.createElement(InitialStateProvider, { initialState: props.initialState }, /* @__PURE__ */ import_react.createElement(ClerkInstanceContext.Provider, { value: clerkCtx }, /* @__PURE__ */ import_react.createElement(__experimental_CheckoutProvider, { value: void 0 }, props.children)));
}
var usePrevious = (value) => {
	const ref = (0, import_react.useRef)(value);
	(0, import_react.useEffect)(() => {
		ref.current = value;
	}, [value]);
	return ref.current;
};
var useAttachEvent = (element, event, cb) => {
	const cbDefined = !!cb;
	const cbRef = (0, import_react.useRef)(cb);
	(0, import_react.useEffect)(() => {
		cbRef.current = cb;
	}, [cb]);
	(0, import_react.useEffect)(() => {
		if (!cbDefined || !element) return () => {};
		const decoratedCb = (...args) => {
			if (cbRef.current) cbRef.current(...args);
		};
		element.on(event, decoratedCb);
		return () => {
			element.off(event, decoratedCb);
		};
	}, [
		cbDefined,
		event,
		element,
		cbRef
	]);
};
var ElementsContext = import_react.createContext(null);
ElementsContext.displayName = "ElementsContext";
var parseElementsContext = (ctx, useCase) => {
	if (!ctx) throw new Error(`Could not find Elements context; You need to wrap the part of your app that ${useCase} in an <Elements> provider.`);
	return ctx;
};
/**
* The `Elements` provider allows you to use [Element components](https://stripe.com/docs/stripe-js/react#element-components) and access the [Stripe object](https://stripe.com/docs/js/initializing) in any nested component.
* Render an `Elements` provider at the root of your React app so that it is available everywhere you need it.
*
* To use the `Elements` provider, call `loadStripe` from `@stripe/stripe-js` with your publishable key.
* The `loadStripe` function will asynchronously load the Stripe.js script and initialize a `Stripe` object.
* Pass the returned `Promise` to `Elements`.
*
* @docs https://stripe.com/docs/stripe-js/react#elements-provider
*/
var Elements = (({ stripe: rawStripeProp, options, children }) => {
	const parsed = import_react.useMemo(() => parseStripeProp(rawStripeProp), [rawStripeProp]);
	const [ctx, setContext] = import_react.useState(() => ({
		stripe: parsed.tag === "sync" ? parsed.stripe : null,
		elements: parsed.tag === "sync" ? parsed.stripe.elements(options) : null
	}));
	import_react.useEffect(() => {
		let isMounted = true;
		const safeSetContext = (stripe) => {
			setContext((ctx$1) => {
				if (ctx$1.stripe) return ctx$1;
				return {
					stripe,
					elements: stripe.elements(options)
				};
			});
		};
		if (parsed.tag === "async" && !ctx.stripe) parsed.stripePromise.then((stripe) => {
			if (stripe && isMounted) safeSetContext(stripe);
		});
		else if (parsed.tag === "sync" && !ctx.stripe) safeSetContext(parsed.stripe);
		return () => {
			isMounted = false;
		};
	}, [
		parsed,
		ctx,
		options
	]);
	const prevStripe = usePrevious(rawStripeProp);
	import_react.useEffect(() => {
		if (prevStripe !== null && prevStripe !== rawStripeProp) console.warn("Unsupported prop change on Elements: You cannot change the `stripe` prop after setting it.");
	}, [prevStripe, rawStripeProp]);
	const prevOptions = usePrevious(options);
	import_react.useEffect(() => {
		if (!ctx.elements) return;
		const updates = extractAllowedOptionsUpdates(options, prevOptions, ["clientSecret", "fonts"]);
		if (updates) ctx.elements.update(updates);
	}, [
		options,
		prevOptions,
		ctx.elements
	]);
	return /* @__PURE__ */ import_react.createElement(ElementsContext.Provider, { value: ctx }, children);
});
var useElementsContextWithUseCase = (useCaseMessage) => {
	return parseElementsContext(import_react.useContext(ElementsContext), useCaseMessage);
};
var useElements = () => {
	const { elements } = useElementsContextWithUseCase("calls useElements()");
	return elements;
};
var INVALID_STRIPE_ERROR = "Invalid prop `stripe` supplied to `Elements`. We recommend using the `loadStripe` utility from `@stripe/stripe-js`. See https://stripe.com/docs/stripe-js/react#elements-props-stripe for details.";
var validateStripe = (maybeStripe, errorMsg = INVALID_STRIPE_ERROR) => {
	if (maybeStripe === null || isStripe(maybeStripe)) return maybeStripe;
	throw new Error(errorMsg);
};
var parseStripeProp = (raw, errorMsg = INVALID_STRIPE_ERROR) => {
	if (isPromise(raw)) return {
		tag: "async",
		stripePromise: Promise.resolve(raw).then((result) => validateStripe(result, errorMsg))
	};
	const stripe = validateStripe(raw, errorMsg);
	if (stripe === null) return { tag: "empty" };
	return {
		tag: "sync",
		stripe
	};
};
var isUnknownObject = (raw) => {
	return raw !== null && typeof raw === "object";
};
var isPromise = (raw) => {
	return isUnknownObject(raw) && typeof raw.then === "function";
};
var isStripe = (raw) => {
	return isUnknownObject(raw) && typeof raw.elements === "function" && typeof raw.createToken === "function" && typeof raw.createPaymentMethod === "function" && typeof raw.confirmCardPayment === "function";
};
var extractAllowedOptionsUpdates = (options, prevOptions, immutableKeys) => {
	if (!isUnknownObject(options)) return null;
	return Object.keys(options).reduce((newOptions, key) => {
		const isUpdated = !isUnknownObject(prevOptions) || !isEqual(options[key], prevOptions[key]);
		if (immutableKeys.includes(key)) {
			if (isUpdated) console.warn(`Unsupported prop change: options.${key} is not a mutable property.`);
			return newOptions;
		}
		if (!isUpdated) return newOptions;
		return {
			...newOptions || {},
			[key]: options[key]
		};
	}, null);
};
var PLAIN_OBJECT_STR = "[object Object]";
var isEqual = (left, right) => {
	if (!isUnknownObject(left) || !isUnknownObject(right)) return left === right;
	const leftArray = Array.isArray(left);
	if (leftArray !== Array.isArray(right)) return false;
	const leftPlainObject = Object.prototype.toString.call(left) === PLAIN_OBJECT_STR;
	if (leftPlainObject !== (Object.prototype.toString.call(right) === PLAIN_OBJECT_STR)) return false;
	if (!leftPlainObject && !leftArray) return left === right;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	const keySet = {};
	for (let i = 0; i < leftKeys.length; i += 1) keySet[leftKeys[i]] = true;
	for (let i = 0; i < rightKeys.length; i += 1) keySet[rightKeys[i]] = true;
	const allKeys = Object.keys(keySet);
	if (allKeys.length !== leftKeys.length) return false;
	const l = left;
	const r = right;
	const pred = (key) => {
		return isEqual(l[key], r[key]);
	};
	return allKeys.every(pred);
};
var useStripe = () => {
	const { stripe } = useElementsOrCheckoutSdkContextWithUseCase("calls useStripe()");
	return stripe;
};
var useElementsOrCheckoutSdkContextWithUseCase = (useCaseString) => {
	return parseElementsContext(import_react.useContext(ElementsContext), useCaseString);
};
var capitalized = (str) => str.charAt(0).toUpperCase() + str.slice(1);
var createElementComponent = (type, isServer) => {
	const displayName = `${capitalized(type)}Element`;
	const ClientElement = ({ id, className, fallback, options = {}, onBlur, onFocus, onReady, onChange, onEscape, onClick, onLoadError, onLoaderStart, onNetworksChange, onConfirm, onCancel, onShippingAddressChange, onShippingRateChange }) => {
		const ctx = useElementsOrCheckoutSdkContextWithUseCase(`mounts <${displayName}>`);
		const elements = "elements" in ctx ? ctx.elements : null;
		const [element, setElement] = import_react.useState(null);
		const elementRef = import_react.useRef(null);
		const domNode = import_react.useRef(null);
		const [isReady, setReady] = (0, import_react.useState)(false);
		useAttachEvent(element, "blur", onBlur);
		useAttachEvent(element, "focus", onFocus);
		useAttachEvent(element, "escape", onEscape);
		useAttachEvent(element, "click", onClick);
		useAttachEvent(element, "loaderror", onLoadError);
		useAttachEvent(element, "loaderstart", onLoaderStart);
		useAttachEvent(element, "networkschange", onNetworksChange);
		useAttachEvent(element, "confirm", onConfirm);
		useAttachEvent(element, "cancel", onCancel);
		useAttachEvent(element, "shippingaddresschange", onShippingAddressChange);
		useAttachEvent(element, "shippingratechange", onShippingRateChange);
		useAttachEvent(element, "change", onChange);
		let readyCallback;
		if (onReady) readyCallback = () => {
			setReady(true);
			onReady(element);
		};
		useAttachEvent(element, "ready", readyCallback);
		import_react.useLayoutEffect(() => {
			if (elementRef.current === null && domNode.current !== null && elements) {
				let newElement = null;
				if (elements) newElement = elements.create(type, options);
				elementRef.current = newElement;
				setElement(newElement);
				if (newElement) newElement.mount(domNode.current);
			}
		}, [elements, options]);
		const prevOptions = usePrevious(options);
		import_react.useEffect(() => {
			if (!elementRef.current) return;
			const updates = extractAllowedOptionsUpdates(options, prevOptions, ["paymentRequest"]);
			if (updates && "update" in elementRef.current) elementRef.current.update(updates);
		}, [options, prevOptions]);
		import_react.useLayoutEffect(() => {
			return () => {
				if (elementRef.current && typeof elementRef.current.destroy === "function") try {
					elementRef.current.destroy();
					elementRef.current = null;
				} catch {}
			};
		}, []);
		return /* @__PURE__ */ import_react.createElement(import_react.Fragment, null, !isReady && fallback, /* @__PURE__ */ import_react.createElement("div", {
			id,
			style: {
				height: isReady ? "unset" : "0px",
				visibility: isReady ? "visible" : "hidden"
			},
			className,
			ref: domNode
		}));
	};
	const ServerElement = (props) => {
		useElementsOrCheckoutSdkContextWithUseCase(`mounts <${displayName}>`);
		const { id, className } = props;
		return /* @__PURE__ */ import_react.createElement("div", {
			id,
			className
		});
	};
	const Element = isServer ? ServerElement : ClientElement;
	Element.displayName = displayName;
	Element.__elementType = type;
	return Element;
};
var PaymentElement$1 = createElementComponent("payment", typeof window === "undefined");
/**
* @internal
*/
function useInitializePaymentMethod(options) {
	const { for: forType } = options ?? {};
	const organization = useOrganizationBase();
	const user = useUserBase();
	const resource = forType === "organization" ? organization : user;
	const billingEnabled = useBillingIsEnabled(options);
	const stableKey = "billing-payment-method-initialize";
	const authenticated = true;
	const queryKey = (0, import_react.useMemo)(() => {
		return [
			stableKey,
			authenticated,
			{ resourceId: resource?.id },
			{}
		];
	}, [resource?.id]);
	const isEnabled = Boolean(resource?.id) && billingEnabled;
	useClearQueriesOnSignOut({
		isSignedOut: user === null,
		authenticated,
		stableKeys: stableKey
	});
	const query = useClerkQuery({
		queryKey,
		queryFn: async () => {
			if (!resource) return;
			return resource.initializePaymentMethod({ gateway: "stripe" });
		},
		enabled: isEnabled,
		staleTime: 1e3 * 60,
		refetchOnWindowFocus: false,
		placeholderData: defineKeepPreviousDataFn(isEnabled)
	});
	const [queryClient] = useClerkQueryClient();
	const initializePaymentMethod = (0, import_react.useCallback)(async () => {
		if (!resource) return;
		const result = await resource.initializePaymentMethod({ gateway: "stripe" });
		queryClient.setQueryData(queryKey, result);
		return result;
	}, [
		queryClient,
		queryKey,
		resource
	]);
	return {
		initializedPaymentMethod: query.data ?? void 0,
		initializePaymentMethod
	};
}
/**
* @internal
*/
function useStripeClerkLibs() {
	const clerk = useClerk();
	return useClerkQuery({
		queryKey: ["clerk-stripe-sdk"],
		queryFn: async () => {
			return { loadStripe: await clerk.__internal_loadStripeJs() };
		},
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		placeholderData: defineKeepPreviousDataFn(true)
	}).data ?? null;
}
/**
* @internal
*/
function useStripeLoader(options) {
	const { stripeClerkLibs, externalGatewayId, stripePublishableKey } = options;
	const queryKey = (0, import_react.useMemo)(() => {
		return ["stripe-sdk", {
			externalGatewayId,
			stripePublishableKey
		}];
	}, [externalGatewayId, stripePublishableKey]);
	const billingEnabled = useBillingIsEnabled({ authenticated: true });
	return useClerkQuery({
		queryKey,
		queryFn: () => {
			if (!stripeClerkLibs || !externalGatewayId || !stripePublishableKey) return null;
			return stripeClerkLibs.loadStripe(stripePublishableKey, { stripeAccount: externalGatewayId });
		},
		enabled: Boolean(stripeClerkLibs && externalGatewayId && stripePublishableKey) && billingEnabled,
		staleTime: 1e3 * 60,
		refetchOnWindowFocus: false,
		placeholderData: defineKeepPreviousDataFn(true)
	}).data;
}
var useInternalEnvironment = () => {
	return useClerk().__internal_environment;
};
var useLocalization = () => {
	const clerk = useClerk();
	let locale = "en";
	try {
		locale = clerk.__internal_getOption("localization")?.locale || "en";
	} catch {}
	return locale.split("-")[0];
};
var usePaymentSourceUtils = (forResource = "user") => {
	const stripeClerkLibs = useStripeClerkLibs();
	const environment = useInternalEnvironment();
	const { initializedPaymentMethod, initializePaymentMethod } = useInitializePaymentMethod({ for: forResource });
	const stripePublishableKey = environment?.commerceSettings.billing.stripePublishableKey ?? void 0;
	return {
		stripe: useStripeLoader({
			stripeClerkLibs,
			externalGatewayId: initializedPaymentMethod?.externalGatewayId,
			stripePublishableKey
		}),
		initializePaymentMethod,
		externalClientSecret: initializedPaymentMethod?.externalClientSecret,
		paymentMethodOrder: initializedPaymentMethod?.paymentMethodOrder
	};
};
var [PaymentElementContext, usePaymentElementContext] = createContextAndHook("PaymentElementContext");
var [StripeUtilsContext, useStripeUtilsContext] = createContextAndHook("StripeUtilsContext");
var ValidateStripeUtils = ({ children }) => {
	const stripe = useStripe();
	const elements = useElements();
	return /* @__PURE__ */ import_react.createElement(StripeUtilsContext.Provider, { value: { value: {
		stripe,
		elements
	} } }, children);
};
var DummyStripeUtils = ({ children }) => {
	return /* @__PURE__ */ import_react.createElement(StripeUtilsContext.Provider, { value: { value: {} } }, children);
};
var PropsProvider = ({ children, ...props }) => {
	const utils = usePaymentSourceUtils(props.for);
	const [isPaymentElementReady, setIsPaymentElementReady] = (0, import_react.useState)(false);
	return /* @__PURE__ */ import_react.createElement(PaymentElementContext.Provider, { value: { value: {
		...props,
		...utils,
		setIsPaymentElementReady,
		isPaymentElementReady
	} } }, children);
};
var PaymentElementProvider = ({ children, ...props }) => {
	return /* @__PURE__ */ import_react.createElement(PropsProvider, props, /* @__PURE__ */ import_react.createElement(PaymentElementInternalRoot, null, children));
};
var PaymentElementInternalRoot = (props) => {
	const { stripe, externalClientSecret, stripeAppearance } = usePaymentElementContext();
	const locale = useLocalization();
	if (stripe && externalClientSecret) return /* @__PURE__ */ import_react.createElement(Elements, {
		key: externalClientSecret,
		stripe,
		options: {
			loader: "never",
			clientSecret: externalClientSecret,
			appearance: { variables: stripeAppearance },
			locale
		}
	}, /* @__PURE__ */ import_react.createElement(ValidateStripeUtils, null, props.children));
	return /* @__PURE__ */ import_react.createElement(DummyStripeUtils, null, props.children);
};
var PaymentElement = ({ fallback }) => {
	const { setIsPaymentElementReady, paymentMethodOrder, checkout, stripe, externalClientSecret, paymentDescription, for: _for } = usePaymentElementContext();
	const environment = useInternalEnvironment();
	const applePay = (0, import_react.useMemo)(() => {
		if (!checkout || !checkout.totals || !checkout.plan) return;
		return { recurringPaymentRequest: {
			paymentDescription: paymentDescription || "",
			managementURL: _for === "organization" ? environment?.displayConfig.organizationProfileUrl || "" : environment?.displayConfig.userProfileUrl || "",
			regularBilling: {
				amount: checkout.totals.totalDueNow?.amount || checkout.totals.grandTotal.amount,
				label: checkout.plan.name,
				recurringPaymentIntervalUnit: checkout.planPeriod === "annual" ? "year" : "month"
			}
		} };
	}, [
		checkout,
		paymentDescription,
		_for,
		environment
	]);
	const options = (0, import_react.useMemo)(() => {
		return {
			layout: {
				type: "tabs",
				defaultCollapsed: false
			},
			paymentMethodOrder,
			applePay
		};
	}, [applePay, paymentMethodOrder]);
	const onReady = (0, import_react.useCallback)(() => {
		setIsPaymentElementReady(true);
	}, [setIsPaymentElementReady]);
	if (!stripe || !externalClientSecret) return /* @__PURE__ */ import_react.createElement(import_react.Fragment, null, fallback);
	return /* @__PURE__ */ import_react.createElement(PaymentElement$1, {
		fallback,
		onReady,
		options
	});
};
var throwLibsMissingError = () => {
	throw new Error("Clerk: Unable to submit, Stripe libraries are not yet loaded. Be sure to check `isFormReady` before calling `submit`.");
};
var usePaymentElement = () => {
	const { isPaymentElementReady, initializePaymentMethod } = usePaymentElementContext();
	const { stripe, elements } = useStripeUtilsContext();
	const { externalClientSecret } = usePaymentElementContext();
	const submit = (0, import_react.useCallback)(async () => {
		if (!stripe || !elements) return throwLibsMissingError();
		const { setupIntent, error } = await stripe.confirmSetup({
			elements,
			confirmParams: { return_url: window.location.href },
			redirect: "if_required"
		});
		if (error) return {
			data: null,
			error: {
				gateway: "stripe",
				error: {
					code: error.code,
					message: error.message,
					type: error.type
				}
			}
		};
		return {
			data: {
				gateway: "stripe",
				paymentToken: setupIntent.payment_method
			},
			error: null
		};
	}, [stripe, elements]);
	const reset = (0, import_react.useCallback)(async () => {
		if (!stripe || !elements) return throwLibsMissingError();
		await initializePaymentMethod();
	}, [
		stripe,
		elements,
		initializePaymentMethod
	]);
	const isProviderReady = Boolean(stripe && externalClientSecret);
	if (!isProviderReady) return {
		submit: throwLibsMissingError,
		reset: throwLibsMissingError,
		isFormReady: false,
		provider: void 0,
		isProviderReady: false
	};
	return {
		submit,
		reset,
		isFormReady: isPaymentElementReady,
		provider: { name: "stripe" },
		isProviderReady
	};
};
var [PortalContext, , usePortalContextWithoutGuarantee] = createContextAndHook("PortalProvider");
/**
* UNSAFE_PortalProvider allows you to specify a custom container for Clerk floating UI elements
* (popovers, modals, tooltips, etc.) that use portals.
*
* Only components within this provider will be affected. Components outside the provider
* will continue to use the default document.body for portals.
*
* This is particularly useful when using Clerk components inside external UI libraries
* like Radix Dialog or React Aria Components, where portaled elements need to render
* within the dialog's container to remain interactable.
*
* @example
* ```tsx
* function Example() {
*   const containerRef = useRef(null);
*   return (
*     <RadixDialog ref={containerRef}>
*       <UNSAFE_PortalProvider getContainer={() => containerRef.current}>
*         <UserButton />
*       </UNSAFE_PortalProvider>
*     </RadixDialog>
*   );
* }
* ```
*/
var UNSAFE_PortalProvider = ({ children, getContainer }) => {
	const contextValue = import_react.useMemo(() => ({ value: { getContainer } }), [getContainer]);
	return /* @__PURE__ */ import_react.createElement(PortalContext.Provider, { value: contextValue }, children);
};
UNSAFE_PortalProvider.displayName = "UNSAFE_PortalProvider";
/**
* Hook to get the current portal root container.
* Returns the getContainer function from context if inside a PortalProvider,
* otherwise returns a function that returns null (default behavior).
*/
var usePortalRoot = () => {
	const contextValue = usePortalContextWithoutGuarantee();
	if (contextValue && "getContainer" in contextValue && contextValue.getContainer) return contextValue.getContainer;
	return () => null;
};
//#endregion
//#region node_modules/@clerk/react/dist/chunk-RQWALB2R.mjs
var errorThrower = buildErrorThrower({ packageName: "@clerk/react" });
function setErrorThrowerOptions(options) {
	errorThrower.setMessages(options).setPackageName(options);
}
var useIsomorphicClerkContext = useClerkInstanceContext;
var useAssertWrappedByClerkProvider = (source) => {
	useAssertWrappedByClerkProvider$1(() => {
		errorThrower.throwMissingClerkProviderError({ source });
	});
};
//#endregion
//#region node_modules/@clerk/react/dist/chunk-E5QRIS4Z.mjs
var __typeError = (msg) => {
	throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var define_CLERK_UI_SUPPORTED_REACT_BOUNDS_default = [
	[
		18,
		0,
		-1,
		0
	],
	[
		19,
		0,
		0,
		3
	],
	[
		19,
		1,
		1,
		4
	],
	[
		19,
		2,
		2,
		3
	],
	[
		19,
		3,
		3,
		0
	]
];
//#endregion
export { useUser as A, useOrganizationCreationDefaults as C, useReverification as D, usePortalRoot as E, createDevOrStagingUrlCache as F, parsePublishableKey as I, buildErrorThrower as L, deriveState as M, createCheckAuthorization as N, useSession as O, resolveAuthState as P, ClerkRuntimeError as R, useOrganization as S, usePaymentElement as T, useCheckout as _, define_CLERK_UI_SUPPORTED_REACT_BOUNDS_default as a, useClientBase as b, useAssertWrappedByClerkProvider as c, PaymentElement as d, PaymentElementProvider as f, useAPIKeys as g, isDeeplyEqual as h, __privateSet as i, eventMethodCalled as j, useSessionList as k, useIsomorphicClerkContext as l, __experimental_CheckoutProvider as m, __privateGet as n, errorThrower as o, UNSAFE_PortalProvider as p, __privateMethod as r, setErrorThrowerOptions as s, __privateAdd as t, ClerkContextProvider as u, useClerk as v, useOrganizationList as w, useInitialStateContext as x, useClerkInstanceContext as y };

//# sourceMappingURL=chunk-E5QRIS4Z-Bf08S9Qg.js.map