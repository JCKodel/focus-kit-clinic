import { cancelErrorStrings, strings, summary } from "./strings.ts";
import { type RememberedLine, useRemembered } from "./useRemembered.ts";

const list = { paddingLeft: 20 } as const;

const item = { marginBottom: 8 } as const;

// Not full width, tall enough for a thumb.
const small = { minHeight: 44, fontSize: "1em" } as const;

// "Cancel", right after the line.
const inline = { ...small, marginLeft: 8 } as const;

// A question or a message with its two buttons; when they do not fit beside
// it, the pair wraps together to the left edge.
const row = {
	display: "flex",
	flexWrap: "wrap",
	alignItems: "center",
	gap: 8,
	marginTop: 4,
} as const;

const pair = { display: "flex", gap: 8 } as const;

// "Your appointments", when the phone remembers one still to come, or while
// the message of a cancellation is shown.
export function RememberedView() {
	const { lines, message, ask, keep, confirm } = useRemembered();
	if (lines.length === 0 && !message) return null;

	function after({ appointment, cancellable, state }: RememberedLine) {
		const code = appointment.bookingCode;
		const busy = state === "busy";
		switch (state) {
			case "confirm":
			case "busy":
				return (
					<div style={row}>
						<span>{strings.confirmCancel}</span>
						<span style={pair}>
							<button
								type="button"
								style={small}
								disabled={busy}
								onClick={() => confirm(appointment)}
							>
								{strings.yesCancel}
							</button>
							<button
								type="button"
								style={small}
								disabled={busy}
								onClick={() => keep(code)}
							>
								{strings.keepIt}
							</button>
						</span>
					</div>
				);
			case "tooLate":
				return <div role="alert">{cancelErrorStrings.CancellationTooLate}</div>;
			case "failed":
				return (
					<div role="alert" style={row}>
						<span>{cancelErrorStrings.ServerUnreachable}</span>
						<span style={pair}>
							<button
								type="button"
								style={small}
								onClick={() => confirm(appointment)}
							>
								{strings.tryAgain}
							</button>
							<button type="button" style={small} onClick={() => keep(code)}>
								{strings.keepIt}
							</button>
						</span>
					</div>
				);
			default:
				return cancellable ? (
					<button type="button" style={inline} onClick={() => ask(code)}>
						{strings.cancel}
					</button>
				) : (
					<div>{strings.noLongerCancellable}</div>
				);
		}
	}

	return (
		<section>
			<h2>{strings.remembered}</h2>
			{message && (
				<p role="status">
					{message.kind === "cancelled"
						? strings.cancelledLine(
								summary(
									message.cancelled.startsAt,
									message.cancelled.timeZone,
									message.cancelled.professional.name,
								),
							)
						: strings.noLongerBooked}
				</p>
			)}
			<ul style={list}>
				{lines.map((line) => (
					<li key={line.appointment.bookingCode} style={item}>
						{strings.rememberedLine(
							summary(
								line.appointment.startsAt,
								line.appointment.timeZone,
								line.appointment.professionalName,
							),
							line.appointment.bookingCode,
						)}
						{after(line)}
					</li>
				))}
			</ul>
		</section>
	);
}
