import { type FormEvent, useState } from "react";
import { errorStrings, strings } from "./strings.ts";
import { useOwner } from "./useOwner.ts";

const field = {
	display: "block",
	width: "100%",
	maxWidth: 320,
	boxSizing: "border-box",
} as const;

export function OwnerView() {
	const { state, signIn, signOut } = useOwner();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	if (state.kind === "checking") return <p role="status">{strings.checking}</p>;

	const error = state.error && <p role="alert">{errorStrings[state.error]}</p>;

	if (state.kind === "signedIn") {
		return (
			<>
				<h1>{strings.signedInHeading}</h1>
				<p>{strings.signedInAs(state.email)}</p>
				{error}
				<button
					type="button"
					disabled={state.busy}
					onClick={() => {
						setPassword("");
						signOut(state.email);
					}}
				>
					{strings.signOut}
				</button>
			</>
		);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		signIn(email, password);
	}

	return (
		<>
			<h1>{strings.heading}</h1>
			{error}
			<form onSubmit={submit}>
				<p>
					<label htmlFor="owner-email">{strings.email}</label>
					<input
						id="owner-email"
						type="email"
						autoComplete="username"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						style={field}
					/>
				</p>
				<p>
					<label htmlFor="owner-password">{strings.password}</label>
					<input
						id="owner-password"
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						style={field}
					/>
				</p>
				<button type="submit" disabled={state.busy}>
					{state.busy ? strings.signingIn : strings.signIn}
				</button>
			</form>
		</>
	);
}
