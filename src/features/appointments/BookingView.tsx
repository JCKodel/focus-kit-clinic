import type { FormEvent } from "react";
import { wallTimeOf } from "./clinicTime.ts";
import {
	dayLabel,
	errorStrings,
	strings,
	summary,
	timeLabel,
} from "./strings.ts";
import { useBooking } from "./useBooking.ts";

// Full width on a phone and tall enough for a thumb.
const choice = {
	display: "block",
	width: "100%",
	maxWidth: 480,
	minHeight: 44,
	marginBottom: 8,
	fontSize: "1em",
} as const;

const list = { listStyle: "none", padding: 0, margin: 0 } as const;

const field = {
	display: "block",
	width: "100%",
	maxWidth: 320,
	boxSizing: "border-box",
	minHeight: 44,
	fontSize: "1em",
} as const;

const buttons = { display: "flex", gap: 8, flexWrap: "wrap" } as const;

const action = { minHeight: 44, minWidth: 88, fontSize: "1em" } as const;

const above = { marginBottom: 12 } as const;

const code = {
	fontFamily: "ui-monospace, monospace",
	fontSize: "2em",
	letterSpacing: "0.2em",
	margin: "8px 0",
} as const;

export function BookingView() {
	const {
		state,
		days,
		tooLateToCancel,
		pickProfessional,
		pickDay,
		pickTime,
		back,
		typeName,
		typePhone,
		submit,
		retry,
		done,
	} = useBooking();
	const { step, busy } = state;

	const messages = (
		<>
			{state.message && <p role="alert">{errorStrings[state.message]}</p>}
			{state.failed && (
				<div role="alert">
					<p>{errorStrings.ServerUnreachable}</p>
					<button type="button" style={action} disabled={busy} onClick={retry}>
						{strings.tryAgain}
					</button>
				</div>
			)}
		</>
	);

	const loading = <p role="status">{strings.loading}</p>;

	const backButton = (
		<button type="button" style={action} disabled={busy} onClick={back}>
			{strings.back}
		</button>
	);

	// Above a list of days or times, so a phone reaches it without scrolling.
	const backAbove = <div style={above}>{backButton}</div>;

	function choices(items: { key: string; label: string; pick: () => void }[]) {
		return (
			<ul style={list}>
				{items.map((item) => (
					<li key={item.key}>
						<button type="button" style={choice} onClick={item.pick}>
							{item.label}
						</button>
					</li>
				))}
			</ul>
		);
	}

	function body() {
		switch (step.kind) {
			case "professionals": {
				if (state.loading) return loading;
				if (!state.professionals) return null;
				if (state.professionals.length === 0) return <p>{strings.empty}</p>;
				return choices(
					state.professionals.map((professional) => ({
						key: String(professional.id),
						label: professional.name,
						pick: () => pickProfessional(professional),
					})),
				);
			}
			case "days": {
				let content = null;
				if (state.loading) content = loading;
				else if (!state.slots) content = null;
				else if (days.length === 0) content = <p>{strings.noFreeTimes}</p>;
				else {
					content = choices(
						days.map((day) => ({
							key: day.date,
							label: dayLabel(day.date),
							pick: () => pickDay(day.date),
						})),
					);
				}
				return (
					<>
						{backAbove}
						{content}
					</>
				);
			}
			case "times": {
				const timeZone = state.slots?.timeZone ?? "UTC";
				const starts = days.find((day) => day.date === step.date)?.starts;
				return (
					<>
						{backAbove}
						{choices(
							(starts ?? []).map((start) => ({
								key: start,
								label: timeLabel(wallTimeOf(new Date(start), timeZone).minutes),
								pick: () => pickTime(start),
							})),
						)}
					</>
				);
			}
			case "form": {
				const timeZone = state.slots?.timeZone ?? "UTC";
				const submitForm = (event: FormEvent) => {
					event.preventDefault();
					submit();
				};
				return (
					<form noValidate onSubmit={submitForm}>
						<p>{summary(step.startsAt, timeZone, step.professional.name)}</p>
						{tooLateToCancel && <p>{strings.tooLateToCancel}</p>}
						<p>
							<label htmlFor="client-name">{strings.name}</label>
							<input
								id="client-name"
								autoComplete="name"
								value={state.name}
								onChange={(event) => typeName(event.target.value)}
								style={field}
							/>
							{state.nameError && (
								<span role="alert">{errorStrings[state.nameError]}</span>
							)}
						</p>
						<p>
							<label htmlFor="client-phone">{strings.phone}</label>
							<input
								id="client-phone"
								type="tel"
								autoComplete="tel"
								value={state.phone}
								onChange={(event) => typePhone(event.target.value)}
								style={field}
							/>
							{state.phoneError && (
								<span role="alert">{errorStrings[state.phoneError]}</span>
							)}
						</p>
						<div style={buttons}>
							<button type="submit" style={action} disabled={busy}>
								{strings.book}
							</button>
							{backButton}
						</div>
					</form>
				);
			}
			case "booked": {
				const { booked, timeZone } = step;
				return (
					<>
						<h3>{strings.booked}</h3>
						<p>
							{summary(booked.startsAt, timeZone, booked.professional.name)}
						</p>
						<p>{strings.yourCode}</p>
						<p style={code}>{booked.bookingCode}</p>
						<p>{strings.keepCode(booked.clientPhone)}</p>
						<button type="button" style={action} onClick={done}>
							{strings.done}
						</button>
					</>
				);
			}
		}
	}

	const professional =
		step.kind === "days" || step.kind === "times" || step.kind === "form"
			? step.professional
			: undefined;

	return (
		<section>
			<h2>{strings.heading}</h2>
			{professional && <h3>{strings.bookWith(professional.name)}</h3>}
			{messages}
			{body()}
		</section>
	);
}
