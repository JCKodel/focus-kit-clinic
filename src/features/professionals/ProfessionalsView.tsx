import type { FormEvent } from "react";
import type { Professional } from "./rules.ts";
import { errorStrings, strings } from "./strings.ts";
import { type OpenRow, useProfessionals } from "./useProfessionals.ts";

const field = {
	display: "block",
	width: "100%",
	maxWidth: 320,
	boxSizing: "border-box",
} as const;

// The name, then its buttons on the same line when they fit.
const rowStyle = {
	display: "flex",
	flexWrap: "wrap",
	alignItems: "center",
	gap: 8,
	marginBottom: 8,
} as const;

const list = { listStyle: "none", padding: 0 } as const;

export function ProfessionalsView() {
	const {
		state,
		typeAddName,
		add,
		openRename,
		typeRename,
		save,
		openRemove,
		remove,
		close,
	} = useProfessionals();
	const { busy } = state;

	function submitAdd(event: FormEvent) {
		event.preventDefault();
		add(state.addName);
	}

	function row(professional: Professional, open: OpenRow | undefined) {
		if (open?.mode === "rename") {
			const submitRename = (event: FormEvent) => {
				event.preventDefault();
				save(open.id, open.name);
			};
			return (
				<li key={professional.id}>
					{open.error && <p role="alert">{errorStrings[open.error]}</p>}
					<form onSubmit={submitRename} style={rowStyle}>
						<input
							aria-label={strings.newName(professional.name)}
							value={open.name}
							onChange={(event) => typeRename(event.target.value)}
							style={field}
						/>
						<button type="submit" disabled={busy}>
							{strings.save}
						</button>
						<button type="button" disabled={busy} onClick={close}>
							{strings.cancel}
						</button>
					</form>
				</li>
			);
		}
		if (open?.mode === "remove") {
			return (
				<li key={professional.id} style={rowStyle}>
					<span>{strings.confirmRemove(professional.name)}</span>
					<button
						type="button"
						disabled={busy}
						onClick={() => remove(professional.id)}
					>
						{strings.remove}
					</button>
					<button type="button" disabled={busy} onClick={close}>
						{strings.keep}
					</button>
				</li>
			);
		}
		return (
			<li key={professional.id} style={rowStyle}>
				<span>{professional.name}</span>
				<button
					type="button"
					disabled={busy}
					onClick={() => openRename(professional)}
				>
					{strings.rename}
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => openRemove(professional)}
				>
					{strings.remove}
				</button>
			</li>
		);
	}

	function body() {
		if (state.loading) return <p role="status">{strings.loading}</p>;
		if (!state.list) return null;
		if (state.list.length === 0) return <p>{strings.empty}</p>;
		return (
			<ul style={list}>
				{state.list.map((professional) =>
					row(
						professional,
						state.row?.id === professional.id ? state.row : undefined,
					),
				)}
			</ul>
		);
	}

	return (
		<section>
			<h2>{strings.heading}</h2>
			{state.error && <p role="alert">{errorStrings[state.error]}</p>}
			{body()}
			<form onSubmit={submitAdd}>
				{state.addError && <p role="alert">{errorStrings[state.addError]}</p>}
				<p>
					<label htmlFor="professional-name">{strings.name}</label>
					<input
						id="professional-name"
						value={state.addName}
						onChange={(event) => typeAddName(event.target.value)}
						style={field}
					/>
				</p>
				<button type="submit" disabled={busy}>
					{strings.add}
				</button>
			</form>
		</section>
	);
}
