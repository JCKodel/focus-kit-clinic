import type { FormEvent } from "react";
import type { Professional } from "../professionals/rules.ts";
import { weekdays } from "./rules.ts";
import { refusalStrings, strings } from "./strings.ts";
import {
	type DraftPeriod,
	type HoursSection,
	useWeeklyHours,
} from "./useWeeklyHours.ts";

const day = { border: "none", padding: 0, margin: "0 0 12px" } as const;

const legend = { padding: 0, fontWeight: "bold" } as const;

// From, To and Remove period on one line when they fit, wrapping on a phone.
const periodLine = {
	display: "flex",
	flexWrap: "wrap",
	alignItems: "flex-end",
	gap: 8,
} as const;

// Each time field with its label above.
const timeLabel = { display: "flex", flexDirection: "column" } as const;

const list = {
	listStyle: "none",
	padding: 0,
	margin: "4px 0 8px",
	display: "flex",
	flexDirection: "column",
	gap: 6,
} as const;

const closed = { margin: "4px 0 8px" } as const;

const buttons = { display: "flex", flexWrap: "wrap", gap: 8 } as const;

type Props = {
	professional: Professional;
	busy: boolean;
	section: HoursSection;
};

export function WeeklyHoursView({ professional, busy, section }: Props) {
	const { state, addPeriod, typeTime, removePeriod, save } = useWeeklyHours(
		professional.id,
		section,
	);
	const label = strings.hoursOf(professional.name);

	if (state.loading) return <p role="status">{strings.loading}</p>;

	const unreachable = state.unreachable && (
		<p role="alert">{strings.unreachable}</p>
	);
	const cancel = (
		<button type="button" disabled={busy} onClick={section.close}>
			{strings.cancel}
		</button>
	);

	const { slotMinutes } = state;
	if (slotMinutes === undefined) {
		return (
			<section aria-label={label}>
				{unreachable}
				{cancel}
			</section>
		);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		save();
	}

	const period = (p: DraftPeriod) => {
		const refusal = state.refusal?.key === p.key ? state.refusal : undefined;
		return (
			<li key={p.key}>
				<div style={periodLine}>
					<label style={timeLabel}>
						{strings.from}
						<input
							type="time"
							step={300}
							value={p.start}
							disabled={busy}
							onChange={(event) => typeTime(p.key, "start", event.target.value)}
						/>
					</label>
					<label style={timeLabel}>
						{strings.to}
						<input
							type="time"
							step={300}
							value={p.end}
							disabled={busy}
							onChange={(event) => typeTime(p.key, "end", event.target.value)}
						/>
					</label>
					<button
						type="button"
						disabled={busy}
						onClick={() => removePeriod(p.key)}
					>
						{strings.removePeriod}
					</button>
				</div>
				{refusal && (
					<p role="alert">{refusalStrings[refusal.code](slotMinutes)}</p>
				)}
			</li>
		);
	};

	return (
		<section aria-label={label}>
			{unreachable}
			{/* noValidate: the rule decides, with its own message, not the browser */}
			<form noValidate onSubmit={submit}>
				{weekdays.map((weekday) => {
					const periods = state.periods.filter((p) => p.weekday === weekday);
					return (
						<fieldset key={weekday} style={day}>
							<legend style={legend}>{strings.days[weekday]}</legend>
							{periods.length === 0 ? (
								<p style={closed}>{strings.closed}</p>
							) : (
								<ul style={list}>{periods.map(period)}</ul>
							)}
							<button
								type="button"
								disabled={busy}
								onClick={() => addPeriod(weekday)}
							>
								{strings.addPeriod}
							</button>
						</fieldset>
					);
				})}
				<div style={buttons}>
					<button type="submit" disabled={busy}>
						{strings.save}
					</button>
					{cancel}
				</div>
			</form>
		</section>
	);
}
