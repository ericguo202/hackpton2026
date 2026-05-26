import { b as useClientBase, c as useAssertWrappedByClerkProvider, j as eventMethodCalled, l as useIsomorphicClerkContext } from "./chunk-E5QRIS4Z-Bf08S9Qg.js";
//#region node_modules/@clerk/react/dist/legacy.mjs
var useSignIn = () => {
	var _a;
	useAssertWrappedByClerkProvider("useSignIn");
	const isomorphicClerk = useIsomorphicClerkContext();
	const client = useClientBase();
	(_a = isomorphicClerk.telemetry) == null || _a.record(eventMethodCalled("useSignIn"));
	if (!client) return {
		isLoaded: false,
		signIn: void 0,
		setActive: void 0
	};
	return {
		isLoaded: true,
		signIn: client.signIn,
		setActive: isomorphicClerk.setActive
	};
};
var useSignUp = () => {
	var _a;
	useAssertWrappedByClerkProvider("useSignUp");
	const isomorphicClerk = useIsomorphicClerkContext();
	const client = useClientBase();
	(_a = isomorphicClerk.telemetry) == null || _a.record(eventMethodCalled("useSignUp"));
	if (!client) return {
		isLoaded: false,
		signUp: void 0,
		setActive: void 0
	};
	return {
		isLoaded: true,
		signUp: client.signUp,
		setActive: isomorphicClerk.setActive
	};
};
//#endregion
export { useSignIn, useSignUp };

//# sourceMappingURL=@clerk_react_legacy.js.map